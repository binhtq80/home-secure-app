const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICE_FAVORITES_TABLE = process.env.DEVICE_FAVORITES_TABLE;
const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICE_FAVORITES_TABLE) {
  throw new Error('Missing required environment variable: DEVICE_FAVORITES_TABLE');
}

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const deviceId = event.pathParameters?.deviceId;

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceId is required' }),
      };
    }

    const userId = event.user.id;

    // Verify device exists and belongs to user
    const device = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!device.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    if (device.Item.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'You can only favorite your own devices' }),
      };
    }

    // Check if already favorited
    const existing = await ddbClient.send(new GetCommand({
      TableName: DEVICE_FAVORITES_TABLE,
      Key: { userId, deviceId },
    }));

    if (existing.Item) {
      // Remove favorite
      await ddbClient.send(new DeleteCommand({
        TableName: DEVICE_FAVORITES_TABLE,
        Key: { userId, deviceId },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Device removed from favorites', isFavorite: false }),
      };
    } else {
      // Add favorite
      await ddbClient.send(new PutCommand({
        TableName: DEVICE_FAVORITES_TABLE,
        Item: {
          userId,
          deviceId,
          createdAt: new Date().toISOString(),
        },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Device added to favorites', isFavorite: true }),
      };
    }
  } catch (error) {
    console.error('Toggle device favorite error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to toggle favorite' }),
    };
  }
});
