const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICE_FAVORITES_TABLE = process.env.DEVICE_FAVORITES_TABLE;

if (!DEVICE_FAVORITES_TABLE) {
  throw new Error('Missing required environment variable: DEVICE_FAVORITES_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;

    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_FAVORITES_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    }));

    const favoriteDeviceIds = (result.Items || []).map((item) => item.deviceId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ favorites: favoriteDeviceIds }),
    };
  } catch (error) {
    console.error('List device favorites error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to list favorites' }),
    };
  }
});
