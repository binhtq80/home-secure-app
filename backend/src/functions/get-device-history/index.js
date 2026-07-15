const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_HISTORY_TABLE = process.env.DEVICE_HISTORY_TABLE;

if (!DEVICES_TABLE || !DEVICE_HISTORY_TABLE) {
  throw new Error('Missing required environment variables: DEVICES_TABLE, DEVICE_HISTORY_TABLE');
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

    // Verify device ownership
    const getResult = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    if (getResult.Item.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to view this device history' }),
      };
    }

    // Query history sorted newest first
    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_HISTORY_TABLE,
      KeyConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: {
        ':deviceId': deviceId,
      },
      ScanIndexForward: false, // newest first
      Limit: 50,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        history: result.Items || [],
        count: result.Items?.length || 0,
      }),
    };
  } catch (error) {
    console.error('Get device history error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get device history' }),
    };
  }
});
