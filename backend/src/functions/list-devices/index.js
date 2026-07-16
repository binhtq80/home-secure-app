const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_ENERGY_TABLE = process.env.DEVICE_ENERGY_TABLE;

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;

    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    }));

    const devices = (result.Items || []).filter((d) => !d.deleted);

    // If we have the energy table, enrich with current month's usage
    if (DEVICE_ENERGY_TABLE && devices.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Query current month energy for each device
      const enrichedDevices = await Promise.all(devices.map(async (device) => {
        try {
          const energyResult = await ddbClient.send(new QueryCommand({
            TableName: DEVICE_ENERGY_TABLE,
            KeyConditionExpression: 'deviceId = :deviceId AND #month = :month',
            ExpressionAttributeNames: { '#month': 'month' },
            ExpressionAttributeValues: {
              ':deviceId': device.id,
              ':month': currentMonth,
            },
          }));

          const currentUsage = energyResult.Items?.[0]?.kwh || 0;

          return {
            ...device,
            currentMonthKwh: currentUsage,
            budgetPercentage: device.monthlyBudgetKwh
              ? Math.round((currentUsage / device.monthlyBudgetKwh) * 100)
              : null,
          };
        } catch (err) {
          return { ...device, currentMonthKwh: 0, budgetPercentage: null };
        }
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          devices: enrichedDevices,
          count: enrichedDevices.length,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        devices,
        count: devices.length,
      }),
    };
  } catch (error) {
    console.error('List devices error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to list devices' }),
    };
  }
});
