const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const COST_PER_KWH = 0.20; // AUD per kWh (Australian average)

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

// Simple seeded random number generator (deterministic per device + month)
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to 0-1 range
  return Math.abs(Math.sin(hash) * 10000) % 1;
}

// Base monthly consumption ranges by device type (kWh)
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
    'cooktop': { min: 30, max: 70 },
    'cooking machine': { min: 20, max: 50 },
  };

  // Find matching type or use default
  for (const [key, range] of Object.entries(ranges)) {
    if (type.includes(key)) return range;
  }
  return { min: 10, max: 40 }; // default
}

function generateMonthlyData(deviceId, deviceType) {
  const baseRange = getBaseConsumption(deviceType);
  const baseKwh = baseRange.min + (seededRandom(deviceId) * (baseRange.max - baseRange.min));

  const months = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7); // YYYY-MM

    // Seasonal variation: higher in summer (Dec-Feb in AU) and winter (Jun-Aug)
    const month = date.getMonth();
    let seasonalFactor = 1.0;
    if (month === 0 || month === 1 || month === 11) seasonalFactor = 1.2; // summer
    if (month === 5 || month === 6 || month === 7) seasonalFactor = 1.15; // winter

    // Random noise seeded by deviceId + month
    const noise = 0.8 + (seededRandom(deviceId + monthKey) * 0.4); // 0.8 to 1.2

    const kwh = Math.round(baseKwh * seasonalFactor * noise * 10) / 10;

    months.push({
      month: monthKey,
      label: date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
      kwh,
      cost: Math.round(kwh * COST_PER_KWH * 100) / 100,
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
    const result = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    // Verify ownership
    if (result.Item.userId !== event.user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied' }),
      };
    }

    const device = result.Item;
    const monthly = generateMonthlyData(deviceId, device.deviceType);
    const totalKwh = Math.round(monthly.reduce((sum, m) => sum + m.kwh, 0) * 10) / 10;
    const avgMonthlyKwh = Math.round((totalKwh / 12) * 10) / 10;

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
        },
        energy: {
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
