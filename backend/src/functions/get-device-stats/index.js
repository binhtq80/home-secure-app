const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;

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

    const devices = result.Items || [];
    const totalCount = devices.length;

    // Find most common device type
    let mostCommonType = null;
    if (totalCount > 0) {
      const typeCounts = {};
      for (const device of devices) {
        const type = device.type || 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
      mostCommonType = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }

    // Find newest device added date (items sorted desc by createdAt from GSI)
    const newestDeviceDate = totalCount > 0 ? devices[0].createdAt : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalCount,
        mostCommonType,
        newestDeviceDate,
      }),
    };
  } catch (error) {
    console.error('Get device stats error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get device stats' }),
    };
  }
});
