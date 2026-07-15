const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variables');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.pathParameters?.userId || event.user.id;

    const result = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: userId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    const memberDays = result.Item.createdAt
      ? Math.floor((Date.now() - new Date(result.Item.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          id: result.Item.id,
          username: result.Item.username,
          email: result.Item.email,
          createdAt: result.Item.createdAt,
          lastLoginAt: result.Item.lastLoginAt,
          previousLoginAt: result.Item.previousLoginAt,
          loginCount: result.Item.loginCount || 0,
          memberDays,
        },
      }),
    };
  } catch (error) {
    console.error('Get user error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to get user profile' }),
    };
  }
});
