const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const USERS_TABLE = process.env.USERS_TABLE;
const ASSETS_BUCKET = process.env.ASSETS_BUCKET;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

if (!ASSETS_BUCKET) {
  throw new Error('Missing required environment variable: ASSETS_BUCKET');
}

exports.handler = withAuth(async (event) => {
  try {
    // Get user from DynamoDB to find avatar key
    const result = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
    }));

    const user = result.Item;

    if (!user || !user.avatarKey) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'No avatar found' }),
      };
    }

    // Generate presigned URL (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: ASSETS_BUCKET,
      Key: user.avatarKey,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: presignedUrl }),
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
