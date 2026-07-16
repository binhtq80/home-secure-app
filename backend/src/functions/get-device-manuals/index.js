const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_IMAGES_BUCKET = process.env.DEVICE_IMAGES_BUCKET;

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

if (!DEVICE_IMAGES_BUCKET) {
  throw new Error('Missing required environment variable: DEVICE_IMAGES_BUCKET');
}

exports.handler = withAuth(async (event) => {
  try {
    const deviceId = event.pathParameters?.deviceId;
    const manualId = event.queryStringParameters?.manualId;

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceId is required' }),
      };
    }

    // Get device and verify ownership
    const result = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    const device = result.Item;

    if (!device) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    if (device.userId !== event.user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied' }),
      };
    }

    const manuals = device.manuals || [];

    // If manualId is provided, return presigned URL for that specific manual
    if (manualId) {
      const manual = manuals.find(m => m.id === manualId);

      if (!manual) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Manual not found' }),
        };
      }

      const command = new GetObjectCommand({
        Bucket: DEVICE_IMAGES_BUCKET,
        Key: manual.s3Key,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url: presignedUrl, manual }),
      };
    }

    // Otherwise, return list of all manuals for this device
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ manuals }),
    };
  } catch (error) {
    console.error('Get device manuals error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to get manuals' }),
    };
  }
});
