const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;
    const scope = (event.queryStringParameters && event.queryStringParameters.scope) || 'mine';

    let items;

    if (scope === 'all') {
      // Return all feature requests (scan)
      const result = await ddbClient.send(new ScanCommand({
        TableName: FEATURE_REQUESTS_TABLE,
      }));
      items = result.Items || [];
      // Sort newest first
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } else {
      // Return only the current user's requests (query on GSI)
      const result = await ddbClient.send(new QueryCommand({
        TableName: FEATURE_REQUESTS_TABLE,
        IndexName: 'createdBy-index',
        KeyConditionExpression: 'createdBy = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // newest first
      }));
      items = result.Items || [];
    }

    // Ensure steps array is always present in each item
    const features = items.map(item => ({
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
