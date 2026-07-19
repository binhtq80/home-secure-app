const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CAMERAS_TABLE = process.env.CAMERAS_TABLE;

if (!CAMERAS_TABLE) {
  throw new Error('Missing required environment variable: CAMERAS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const result = await ddbClient.send(new QueryCommand({
      TableName: CAMERAS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': event.user.id,
      },
      ScanIndexForward: false,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ cameras: result.Items || [] }),
    };
  } catch (error) {
    console.error('List cameras error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to list cameras' }),
    };
  }
});
