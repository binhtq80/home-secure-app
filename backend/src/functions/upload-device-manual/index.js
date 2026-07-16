const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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

if (!DEVICE_IMAGES_BUCKET) {
  throw new Error('Missing required environment variable: DEVICE_IMAGES_BUCKET');
}

exports.handler = withAuth(async (event) => {
  try {
    const deviceId = event.pathParameters?.deviceId;

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceId is required' }),
      };
    }

    const { fileName, fileBase64 } = JSON.parse(event.body);

    if (!fileName || !fileBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'fileName and fileBase64 are required' }),
      };
    }

    // Validate file is PDF
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Only PDF files are allowed' }),
      };
    }

    // Validate file size (max 10MB base64 ≈ ~7.5MB file)
    if (fileBase64.length > 10 * 1024 * 1024) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'File size must be less than 10MB' }),
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

    // Upload PDF to S3
    const manualId = uuidv4();
    const s3Key = `${event.user.id}/${deviceId}/manuals/${manualId}.pdf`;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    await s3Client.send(new PutObjectCommand({
      Bucket: DEVICE_IMAGES_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'application/pdf',
    }));

    // Add manual metadata to device record
    const manual = {
      id: manualId,
      fileName,
      s3Key,
      size: fileBuffer.length,
      uploadedAt: new Date().toISOString(),
    };

    const existingManuals = device.manuals || [];
    const updatedManuals = [...existingManuals, manual];

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
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Manual uploaded successfully',
        manual,
      }),
    };
  } catch (error) {
    console.error('Upload device manual error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to upload manual' }),
    };
  }
});
