const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICE_NOTES_TABLE = process.env.DEVICE_NOTES_TABLE;
const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICE_NOTES_TABLE) {
  throw new Error('Missing required environment variable: DEVICE_NOTES_TABLE');
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

    // Verify device belongs to user
    if (DEVICES_TABLE) {
      const deviceResult = await ddbClient.send(new GetCommand({
        TableName: DEVICES_TABLE,
        Key: { id: deviceId },
      }));

      if (!deviceResult.Item || deviceResult.Item.userId !== userId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Device not found' }),
        };
      }
    }

    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_NOTES_TABLE,
      KeyConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: { ':deviceId': deviceId },
      ScanIndexForward: false, // newest first
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        notes: result.Items || [],
        count: result.Items?.length || 0,
      }),
    };
  } catch (error) {
    console.error('List device notes error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to list notes' }),
    };
  }
});
