const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_ENERGY_TABLE = process.env.DEVICE_ENERGY_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const DEFAULT_COST_PER_KWH = 0.20;

if (!DEVICES_TABLE || !DEVICE_ENERGY_TABLE || !USERS_TABLE) {
  throw new Error('Missing required environment variables');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;

    // Get user's cost setting
    const userResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: userId },
      ProjectionExpression: 'costPerKwh',
    }));
    const costPerKwh = userResult.Item?.costPerKwh ?? DEFAULT_COST_PER_KWH;

    // Get all user's devices
    const devicesResult = await ddbClient.send(new QueryCommand({
      TableName: DEVICES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }));

    const devices = devicesResult.Items || [];

    if (devices.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          summary: { totalKwh: 0, totalCost: 0, deviceCount: 0, costPerKwh },
          topDevices: [],
          monthly: [],
        }),
      };
    }

    // Get energy data for last 12 months for all devices
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 7);
    const endMonth = now.toISOString().slice(0, 7);

    const deviceEnergyMap = {}; // deviceId -> { device, months: [{month, kwh}] }

    for (const device of devices) {
      const energyResult = await ddbClient.send(new QueryCommand({
        TableName: DEVICE_ENERGY_TABLE,
        KeyConditionExpression: 'deviceId = :deviceId AND #month BETWEEN :start AND :end',
        ExpressionAttributeNames: { '#month': 'month' },
        ExpressionAttributeValues: {
          ':deviceId': device.id,
          ':start': startMonth,
          ':end': endMonth,
        },
        ScanIndexForward: true,
      }));

      const months = (energyResult.Items || []).map((item) => ({
        month: item.month,
        kwh: item.kwh || 0,
      }));

      const totalKwh = months.reduce((sum, m) => sum + m.kwh, 0);

      deviceEnergyMap[device.id] = {
        id: device.id,
        name: `${device.brand} ${device.model !== 'Unknown' ? device.model : device.deviceType}`,
        deviceType: device.deviceType,
        totalKwh: Math.round(totalKwh * 10) / 10,
        totalCost: Math.round(totalKwh * costPerKwh * 100) / 100,
        months,
      };
    }

    // Calculate totals
    const allDeviceData = Object.values(deviceEnergyMap);
    const totalKwh = Math.round(allDeviceData.reduce((sum, d) => sum + d.totalKwh, 0) * 10) / 10;
    const totalCost = Math.round(totalKwh * costPerKwh * 100) / 100;

    // Top 3 most expensive devices
    const topDevices = [...allDeviceData]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 3)
      .map((d) => ({
        id: d.id,
        name: d.name,
        deviceType: d.deviceType,
        totalKwh: d.totalKwh,
        totalCost: d.totalCost,
      }));

    // Build stacked monthly data (per device, per month)
    // Collect all unique months
    const allMonths = new Set();
    allDeviceData.forEach((d) => d.months.forEach((m) => allMonths.add(m.month)));
    const sortedMonths = [...allMonths].sort();

    const monthly = sortedMonths.map((month) => {
      const date = new Date(month + '-01');
      const label = date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });

      const devices = allDeviceData.map((d) => {
        const monthData = d.months.find((m) => m.month === month);
        return {
          id: d.id,
          name: d.name,
          kwh: monthData?.kwh || 0,
        };
      });

      const totalKwh = devices.reduce((sum, d) => sum + d.kwh, 0);

      return {
        month,
        label,
        totalKwh: Math.round(totalKwh * 10) / 10,
        totalCost: Math.round(totalKwh * costPerKwh * 100) / 100,
        devices,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: {
          totalKwh,
          totalCost,
          deviceCount: devices.length,
          costPerKwh,
        },
        topDevices,
        monthly,
      }),
    };
  } catch (error) {
    console.error('Get energy report error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to generate report' }),
    };
  }
});
