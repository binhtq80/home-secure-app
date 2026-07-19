const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const result = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      ProjectionExpression: 'avatarData, avatarMimeType',
    }));

    const user = result.Item;

    if (!user || !user.avatarData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'No avatar found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        image: user.avatarData,
        mimeType: user.avatarMimeType || 'image/png',
      }),
    };
  } catch (error) {
    console.error('Get avatar error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get avatar' }),
    };
  }
});
