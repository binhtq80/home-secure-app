const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_ENERGY_TABLE = process.env.DEVICE_ENERGY_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const DEFAULT_COST_PER_KWH = 0.20; // AUD per kWh

if (!DEVICES_TABLE || !DEVICE_ENERGY_TABLE || !USERS_TABLE) {
  throw new Error('Missing required environment variables: DEVICES_TABLE, DEVICE_ENERGY_TABLE, USERS_TABLE');
}

// Fallback: generate simulated data if no real data exists
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(Math.sin(hash) * 10000) % 1;
}

function getBaseConsumption(deviceType) {
  const type = (deviceType || '').toLowerCase();
  const ranges = {
    'camera': { min: 5, max: 15 },
    'security camera': { min: 5, max: 15 },
    'washing machine': { min: 30, max: 60 },
    'dryer': { min: 40, max: 80 },
    'dishwasher': { min: 25, max: 50 },
    'refrigerator': { min: 30, max: 50 },
    'fridge': { min: 30, max: 50 },
    'television': { min: 15, max: 40 },
    'tv': { min: 15, max: 40 },
    'air conditioner': { min: 60, max: 150 },
    'heater': { min: 50, max: 120 },
    'robot vacuum': { min: 3, max: 8 },
    'smart speaker': { min: 2, max: 5 },
    'microwave': { min: 10, max: 25 },
    'oven': { min: 40, max: 80 },
  };
  for (const [key, range] of Object.entries(ranges)) {
    if (type.includes(key)) return range;
  }
  return { min: 10, max: 40 };
}

function generateSimulatedData(deviceId, deviceType, costPerKwh) {
  const baseRange = getBaseConsumption(deviceType);
  const baseKwh = baseRange.min + (seededRandom(deviceId) * (baseRange.max - baseRange.min));
  const months = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7);
    const month = date.getMonth();
    let seasonalFactor = 1.0;
    if (month === 0 || month === 1 || month === 11) seasonalFactor = 1.2;
    if (month === 5 || month === 6 || month === 7) seasonalFactor = 1.15;
    const noise = 0.8 + (seededRandom(deviceId + monthKey) * 0.4);
    const kwh = Math.round(baseKwh * seasonalFactor * noise * 10) / 10;

    months.push({
      month: monthKey,
      label: date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
      kwh,
      cost: Math.round(kwh * costPerKwh * 100) / 100,
    });
  }
  return months;
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

    // Get device from DynamoDB
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

    const device = deviceResult.Item;

    // Get user's cost per kWh setting
    const userResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      ProjectionExpression: 'costPerKwh',
    }));
    const COST_PER_KWH = userResult.Item?.costPerKwh ?? DEFAULT_COST_PER_KWH;

    // Query energy data from DynamoDB (last 12 months)
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 7);
    const endMonth = now.toISOString().slice(0, 7);

    const energyResult = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_ENERGY_TABLE,
      KeyConditionExpression: 'deviceId = :deviceId AND #month BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#month': 'month' },
      ExpressionAttributeValues: {
        ':deviceId': deviceId,
        ':start': startMonth,
        ':end': endMonth,
      },
      ScanIndexForward: true, // oldest first
    }));

    let monthly;
    let dataSource;

    if (energyResult.Items && energyResult.Items.length > 0) {
      // Real data exists — use it
      dataSource = 'measured';
      monthly = energyResult.Items.map((item) => {
        const date = new Date(item.month + '-01');
        return {
          month: item.month,
          label: date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
          kwh: item.kwh,
          cost: item.cost || Math.round(item.kwh * COST_PER_KWH * 100) / 100,
          readings: item.readings || 0,
          peakKwh: item.peakKwh || null,
          lowKwh: item.lowKwh || null,
        };
      });
    } else {
      // No real data — fall back to simulation
      dataSource = 'simulated';
      monthly = generateSimulatedData(deviceId, device.deviceType, COST_PER_KWH);
    }

    const totalKwh = Math.round(monthly.reduce((sum, m) => sum + m.kwh, 0) * 10) / 10;
    const avgMonthlyKwh = Math.round((totalKwh / monthly.length) * 10) / 10;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        device: {
          id: device.id,
          deviceType: device.deviceType,
          brand: device.brand,
          model: device.model,
          color: device.color,
          condition: device.condition,
          energySavingTips: device.energySavingTips || [],
        },
        energy: {
          dataSource,
          totalKwh,
          avgMonthlyKwh,
          estimatedMonthlyCost: Math.round(avgMonthlyKwh * COST_PER_KWH * 100) / 100,
          costPerKwh: COST_PER_KWH,
          monthly,
        },
      }),
    };
  } catch (error) {
    console.error('Get device energy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get energy data' }),
    };
  }
});
