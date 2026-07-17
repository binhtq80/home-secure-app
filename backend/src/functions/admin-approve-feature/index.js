const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    // Check that the caller has role=product_manager
    const userResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
    }));

    if (!userResult.Item || userResult.Item.role !== 'product_manager') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Only product managers can approve or reject feature requests' }),
      };
    }

    const featureId = event.pathParameters?.featureId;
    if (!featureId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'featureId is required' }),
      };
    }

    const { action, reason } = JSON.parse(event.body || '{}');

    if (!action || !['approve', 'reject'].includes(action)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'action must be "approve" or "reject"' }),
      };
    }

    // Verify the feature exists and is in pending_approval status
    const featureResult = await ddbClient.send(new GetCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
    }));

    if (!featureResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Feature request not found' }),
      };
    }

    if (featureResult.Item.status !== 'pending_approval') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Feature is not pending approval (current status: ${featureResult.Item.status})` }),
      };
    }

    const now = new Date().toISOString();
    const approvedBy = event.user.username;

    if (action === 'approve') {
      await ddbClient.send(new UpdateCommand({
        TableName: FEATURE_REQUESTS_TABLE,
        Key: { id: featureId },
        UpdateExpression: 'SET #s = :status, currentStep = :step, approvedAt = :now, approvedBy = :approvedBy, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)',
        ExpressionAttributeNames: { '#s': 'status', '#steps': 'steps' },
        ExpressionAttributeValues: {
          ':status': 'pending',
          ':step': 'pending',
          ':now': now,
          ':approvedBy': approvedBy,
          ':emptyList': [],
          ':newStep': [{ time: now, detail: `Approved by admin ${approvedBy}` }],
        },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Feature request approved and queued for implementation', status: 'pending' }),
      };
    } else {
      // Reject
      const rejectReason = reason || 'No reason provided';

      await ddbClient.send(new UpdateCommand({
        TableName: FEATURE_REQUESTS_TABLE,
        Key: { id: featureId },
        UpdateExpression: 'SET #s = :status, currentStep = :step, rejectedAt = :now, rejectedBy = :rejectedBy, rejectionReason = :reason, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)',
        ExpressionAttributeNames: { '#s': 'status', '#steps': 'steps' },
        ExpressionAttributeValues: {
          ':status': 'rejected',
          ':step': 'rejected',
          ':now': now,
          ':rejectedBy': approvedBy,
          ':reason': rejectReason,
          ':emptyList': [],
          ':newStep': [{ time: now, detail: `Rejected by admin ${approvedBy}: ${rejectReason}` }],
        },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Feature request rejected', status: 'rejected' }),
      };
    }
  } catch (error) {
    console.error('Admin approve feature error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to process admin approval' }),
    };
  }
});
