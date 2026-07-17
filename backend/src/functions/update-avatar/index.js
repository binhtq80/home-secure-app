const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const USERS_TABLE = process.env.USERS_TABLE;
const DEVICE_IMAGES_BUCKET = process.env.DEVICE_IMAGES_BUCKET;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

if (!DEVICE_IMAGES_BUCKET) {
  throw new Error('Missing required environment variable: DEVICE_IMAGES_BUCKET');
}

exports.handler = withAuth(async (event) => {
  try {
    const { image, mimeType } = JSON.parse(event.body);

    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'image (base64) is required' }),
      };
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const resolvedMimeType = mimeType || 'image/jpeg';

    if (!allowedTypes.includes(resolvedMimeType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Unsupported image type. Allowed: jpeg, png, webp' }),
      };
    }

    // Validate image size (max 2MB base64 ≈ ~1.5MB actual)
    const imageBuffer = Buffer.from(image, 'base64');
    if (imageBuffer.length > 2 * 1024 * 1024) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Image too large. Maximum size is 2MB' }),
      };
    }

    const ext = resolvedMimeType.split('/')[1] === 'jpeg' ? 'jpg' : resolvedMimeType.split('/')[1];
    const avatarKey = `avatars/${event.user.id}/avatar.${ext}`;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: DEVICE_IMAGES_BUCKET,
      Key: avatarKey,
      Body: imageBuffer,
      ContentType: resolvedMimeType,
    }));

    // Update user record with avatar key
    await ddbClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      UpdateExpression: 'SET #avatarKey = :avatarKey, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#avatarKey': 'avatarKey',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':avatarKey': avatarKey,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Avatar updated successfully', avatarKey }),
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
