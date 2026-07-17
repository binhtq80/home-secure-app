const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_ENERGY_TABLE = process.env.DEVICE_ENERGY_TABLE;

if (!DEVICES_TABLE || !DEVICE_ENERGY_TABLE) {
  throw new Error('Missing required environment variables: DEVICES_TABLE, DEVICE_ENERGY_TABLE');
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

    // Verify device exists and belongs to user
    const deviceResult = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!deviceResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    if (deviceResult.Item.userId !== event.user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied' }),
      };
    }

    // Query the most recent energy entry (sort key is 'month' in YYYY-MM format)
    const energyResult = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_ENERGY_TABLE,
      KeyConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: { ':deviceId': deviceId },
      ScanIndexForward: false, // descending — most recent first
      Limit: 1,
    }));

    let lastActive = null;

    if (energyResult.Items && energyResult.Items.length > 0) {
      const mostRecent = energyResult.Items[0];
      // The 'month' field is in YYYY-MM format; use updatedAt if available, else month
      lastActive = mostRecent.updatedAt || mostRecent.createdAt || `${mostRecent.month}-01T00:00:00.000Z`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        deviceId,
        lastActive,
      }),
    };
  } catch (error) {
    console.error('Get device last active error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get last active data' }),
    };
  }
});
