const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variables');
}

function formatLastSeenAgo(dateStr) {
  if (!dateStr) return null;
  const last = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = now - last;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
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

    const lastSeenAgo = formatLastSeenAgo(result.Item.lastLoginAt);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          id: result.Item.id,
          username: result.Item.username,
          email: result.Item.email,
          role: result.Item.role || 'user',
          createdAt: result.Item.createdAt,
          lastLoginAt: result.Item.lastLoginAt,
          previousLoginAt: result.Item.previousLoginAt,
          loginCount: result.Item.loginCount || 0,
          memberDays,
          lastSeenAgo,
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
