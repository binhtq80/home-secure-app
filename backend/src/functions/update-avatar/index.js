const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

// Max avatar size: 400KB base64 (DynamoDB item limit is 400KB total)
const MAX_AVATAR_SIZE = 400 * 1024;

exports.handler = withAuth(async (event) => {
  try {
    const { image, mimeType } = JSON.parse(event.body || '{}');

    if (!image || !mimeType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'image (base64) and mimeType are required' }),
      };
    }

    // Validate mime type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(mimeType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Invalid mimeType. Accepted: ${validTypes.join(', ')}` }),
      };
    }

    // Validate size
    if (image.length > MAX_AVATAR_SIZE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Avatar image too large. Max 400KB.' }),
      };
    }

    await ddbClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      UpdateExpression: 'SET avatarData = :data, avatarMimeType = :mime, avatarUpdatedAt = :now',
      ExpressionAttributeValues: {
        ':data': image,
        ':mime': mimeType,
        ':now': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Avatar updated successfully' }),
    };
  } catch (error) {
    console.error('Update avatar error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update avatar' }),
    };
  }
});
