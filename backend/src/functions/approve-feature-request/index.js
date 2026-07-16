const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { CodePipelineClient, GetPipelineStateCommand, PutApprovalResultCommand } = require('@aws-sdk/client-codepipeline');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const pipelineClient = new CodePipelineClient({});

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;
const PIPELINE_NAME = process.env.PIPELINE_NAME;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

if (!PIPELINE_NAME) {
  throw new Error('Missing required environment variable: PIPELINE_NAME');
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

    const { action, feedback } = JSON.parse(event.body || '{}');

    if (!action || !['approve', 'reject'].includes(action)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'action must be "approve" or "reject"' }),
      };
    }

    // Get the feature request to verify it exists and is awaiting approval
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

    if (featureResult.Item.status !== 'awaiting_approval') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Feature is not awaiting approval (current status: ${featureResult.Item.status})` }),
      };
    }

    // Get the pipeline state to find the E2EApproval token
    const pipelineState = await pipelineClient.send(new GetPipelineStateCommand({
      name: PIPELINE_NAME,
    }));

    let approvalToken = null;
    let stageName = null;
    let actionName = null;

    for (const stage of pipelineState.stageStates || []) {
      for (const actionState of stage.actionStates || []) {
        if (actionState.actionName === 'E2EApproval' && actionState.latestExecution?.token) {
          approvalToken = actionState.latestExecution.token;
          stageName = stage.stageName;
          actionName = actionState.actionName;
          break;
        }
      }
      if (approvalToken) break;
    }

    if (!approvalToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No pending approval found in pipeline. The pipeline may not be at the approval stage.' }),
      };
    }

    // Submit approval/rejection to CodePipeline
    const approvalStatus = action === 'approve' ? 'Approved' : 'Rejected';
    const summary = action === 'approve'
      ? `Approved by ${event.user.username} via MyApp`
      : `Rejected by ${event.user.username}: ${feedback || 'No reason provided'}`;

    await pipelineClient.send(new PutApprovalResultCommand({
      pipelineName: PIPELINE_NAME,
      stageName,
      actionName,
      result: {
        summary: summary.slice(0, 512),
        status: approvalStatus,
      },
      token: approvalToken,
    }));

    // Update the feature request status in DynamoDB
    const now = new Date().toISOString();
    const newStatus = action === 'approve' ? 'delivered' : 'rejected';
    const stepDetail = action === 'approve'
      ? `Approved by ${event.user.username}`
      : `Rejected by ${event.user.username}: ${feedback || 'No reason provided'}`;

    const updateExpression = action === 'reject' && feedback
      ? 'SET #s = :status, currentStep = :step, completedAt = :now, rejectionFeedback = :feedback, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)'
      : 'SET #s = :status, currentStep = :step, completedAt = :now, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)';

    const expressionValues = {
      ':status': newStatus,
      ':step': newStatus,
      ':now': now,
      ':emptyList': [],
      ':newStep': [{ time: now, detail: stepDetail }],
    };

    if (action === 'reject' && feedback) {
      expressionValues[':feedback'] = feedback;
    }

    await ddbClient.send(new UpdateCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { '#s': 'status', '#steps': 'steps' },
      ExpressionAttributeValues: expressionValues,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `Feature request ${newStatus} successfully`,
        status: newStatus,
        pipelineAction: approvalStatus,
      }),
    };
  } catch (error) {
    console.error('Approve feature request error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to process approval' }),
    };
  }
});
