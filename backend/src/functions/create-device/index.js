const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_IMAGES_BUCKET = process.env.DEVICE_IMAGES_BUCKET;

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const { deviceType, brand, model, color, condition, description, features, imageBase64 } = JSON.parse(event.body);

    if (!deviceType || !brand) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceType and brand are required' }),
      };
    }

    const deviceId = uuidv4();
    const now = new Date().toISOString();
    const userId = event.user.id;

    let imageKey = null;

    // Save image to S3 if provided
    if (imageBase64 && DEVICE_IMAGES_BUCKET) {
      imageKey = `${userId}/${deviceId}.jpg`;
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      await s3Client.send(new PutObjectCommand({
        Bucket: DEVICE_IMAGES_BUCKET,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      }));
    }

    const device = {
      id: deviceId,
      userId,
      deviceType,
      brand,
      model: model || 'Unknown',
      color: color || 'Unknown',
      condition: condition || 'good',
      description: description || '',
      features: features || [],
      status: 'off',
      hasImage: !!imageBase64,
      imageKey: imageKey || undefined,
      createdAt: now,
      updatedAt: now,
    };

    // Remove undefined fields before storing
    const cleanDevice = Object.fromEntries(
      Object.entries(device).filter(([, v]) => v !== undefined)
    );

    await ddbClient.send(new PutCommand({
      TableName: DEVICES_TABLE,
      Item: cleanDevice,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Device registered successfully',
        device: cleanDevice,
      }),
    };
  } catch (error) {
    console.error('Create device error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to create device' }),
    };
  }
});
