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

    // If we have the energy table, enrich with current month's usage and last active
    if (DEVICE_ENERGY_TABLE && devices.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Query current month energy and most recent entry for each device
      const enrichedDevices = await Promise.all(devices.map(async (device) => {
        try {
          const [energyResult, lastActiveResult] = await Promise.all([
            ddbClient.send(new QueryCommand({
              TableName: DEVICE_ENERGY_TABLE,
              KeyConditionExpression: 'deviceId = :deviceId AND #month = :month',
              ExpressionAttributeNames: { '#month': 'month' },
              ExpressionAttributeValues: {
                ':deviceId': device.id,
                ':month': currentMonth,
              },
            })),
            ddbClient.send(new QueryCommand({
              TableName: DEVICE_ENERGY_TABLE,
              KeyConditionExpression: 'deviceId = :deviceId',
              ExpressionAttributeValues: { ':deviceId': device.id },
              ScanIndexForward: false,
              Limit: 1,
            })),
          ]);

          const currentUsage = energyResult.Items?.[0]?.kwh || 0;

          // Determine last active timestamp from most recent energy entry
          let lastActive = null;
          if (lastActiveResult.Items && lastActiveResult.Items.length > 0) {
            const mostRecent = lastActiveResult.Items[0];
            lastActive = mostRecent.updatedAt || mostRecent.createdAt || `${mostRecent.month}-01T00:00:00.000Z`;
          }

          return {
            ...device,
            currentMonthKwh: currentUsage,
            budgetPercentage: device.monthlyBudgetKwh
              ? Math.round((currentUsage / device.monthlyBudgetKwh) * 100)
              : null,
            lastActive,
          };
        } catch (err) {
          return { ...device, currentMonthKwh: 0, budgetPercentage: null, lastActive: null };
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
