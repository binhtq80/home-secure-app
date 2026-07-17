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
    const featureId = event.pathParameters?.featureId;

    if (!featureId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'featureId is required' }),
      };
    }

    const { action, overrideComplexity } = JSON.parse(event.body);

    if (!action || !['accept', 'override'].includes(action)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'action must be "accept" or "override"' }),
      };
    }

    // Only users with role=technical can override complexity
    if (action === 'override') {
      const userResult = await ddbClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { id: event.user.id },
        ProjectionExpression: '#r',
        ExpressionAttributeNames: { '#r': 'role' },
      }));
      const userRole = userResult.Item?.role || 'user';
      if (userRole !== 'technical') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Only technical users can override complexity' }),
        };
      }
    }

    const validLevels = ['simple', 'medium', 'complex', 'highly-complex'];
    if (action === 'override' && (!overrideComplexity || !validLevels.includes(overrideComplexity))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'overrideComplexity must be one of: simple, medium, complex, highly-complex' }),
      };
    }

    const now = new Date().toISOString();
    const stepDetail = action === 'accept'
      ? 'User accepted AI complexity classification'
      : `User overrode complexity to "${overrideComplexity}"`;

    // Build update expression — after confirmation, go to pending_approval for admin review
    let updateExpression = 'SET #s = :status, currentStep = :step, confirmedAt = :now, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep), complexity = :finalComplexity';
    const expressionAttributeNames = { '#s': 'status', '#steps': 'steps' };
    const expressionAttributeValues = {
      ':status': 'pending_approval',
      ':step': 'pending_approval',
      ':now': now,
      ':emptyList': [],
      ':newStep': [
        { time: now, detail: stepDetail },
        { time: now, detail: 'Awaiting admin approval' },
      ],
      ':pendingConfirmation': 'pending_confirmation',
      ':finalComplexity': action === 'override' ? overrideComplexity : null,
    };

    // For accept, we need to first get the item to copy suggestedComplexity
    if (action === 'accept') {
      const getResult = await ddbClient.send(new GetCommand({
        TableName: FEATURE_REQUESTS_TABLE,
        Key: { id: featureId },
        ProjectionExpression: 'suggestedComplexity',
      }));
      expressionAttributeValues[':finalComplexity'] = getResult.Item?.suggestedComplexity || 'medium';
    } else {
      expressionAttributeValues[':finalComplexity'] = overrideComplexity;
    }

    await ddbClient.send(new UpdateCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
      UpdateExpression: updateExpression,
      ConditionExpression: '#s = :pendingConfirmation',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Feature request confirmed — awaiting admin approval', status: 'pending_approval' }),
    };
  } catch (error) {
    console.error('Confirm feature request error:', error);

    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'Feature request is not in pending_confirmation status' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to confirm feature request' }),
    };
  }
});
