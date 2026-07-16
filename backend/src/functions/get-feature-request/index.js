const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;
    const featureId = event.pathParameters?.featureId;

    if (!featureId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Feature ID is required' }),
      };
    }

    const result = await ddbClient.send(new GetCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Feature request not found' }),
      };
    }

    // Ensure the feature belongs to the requesting user
    if (result.Item.createdBy !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied' }),
      };
    }

    const feature = {
      ...result.Item,
      steps: result.Item.steps || [],
      currentStep: result.Item.currentStep || result.Item.status,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ feature }),
    };
  } catch (error) {
    console.error('Get feature request error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to get feature request' }),
    };
  }
});
