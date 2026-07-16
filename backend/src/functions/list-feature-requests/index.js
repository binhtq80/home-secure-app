const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;

    const result = await ddbClient.send(new QueryCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      IndexName: 'createdBy-index',
      KeyConditionExpression: 'createdBy = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // newest first
    }));

    // Ensure steps array is always present in each item
    const features = (result.Items || []).map(item => ({
      ...item,
      steps: item.steps || [],
      currentStep: item.currentStep || item.status,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ features }),
    };
  } catch (error) {
    console.error('List feature requests error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to list feature requests' }),
    };
  }
});
