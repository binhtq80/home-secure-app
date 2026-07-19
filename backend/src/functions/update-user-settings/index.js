const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const settings = JSON.parse(event.body || '{}');

    if (!settings || Object.keys(settings).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Request body must contain at least one setting' }),
      };
    }

    await ddbClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      UpdateExpression: 'SET settings = :settings, updatedAt = :now',
      ExpressionAttributeValues: {
        ':settings': settings,
        ':now': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Settings updated', settings }),
    };
  } catch (error) {
    console.error('Update user settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update settings' }),
    };
  }
});
