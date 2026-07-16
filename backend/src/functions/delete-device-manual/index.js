const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
    const { manualId } = JSON.parse(event.body);

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceId is required' }),
      };
    }

    if (!manualId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'manualId is required' }),
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
    const manual = manuals.find(m => m.id === manualId);

    if (!manual) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Manual not found' }),
      };
    }

    // Delete from S3
    await s3Client.send(new DeleteObjectCommand({
      Bucket: DEVICE_IMAGES_BUCKET,
      Key: manual.s3Key,
    }));

    // Remove from device record
    const updatedManuals = manuals.filter(m => m.id !== manualId);

    await ddbClient.send(new UpdateCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
      UpdateExpression: 'SET manuals = :manuals, updatedAt = :now',
      ExpressionAttributeValues: {
        ':manuals': updatedManuals,
        ':now': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Manual deleted successfully' }),
    };
  } catch (error) {
    console.error('Delete device manual error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to delete manual' }),
    };
  }
});
