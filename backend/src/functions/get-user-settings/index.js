const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

const DEFAULTS = {
  costPerKwh: 0.20,
  currency: 'AUD',
};

exports.handler = withAuth(async (event) => {
  try {
    const result = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      ProjectionExpression: 'id, costPerKwh, currency',
    }));

    const user = result.Item || {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        settings: {
          costPerKwh: user.costPerKwh ?? DEFAULTS.costPerKwh,
          currency: user.currency ?? DEFAULTS.currency,
        },
      }),
    };
  } catch (error) {
    console.error('Get user settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get settings' }),
    };
  }
});
