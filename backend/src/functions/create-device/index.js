const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;

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

    const device = {
      id: deviceId,
      userId: event.user.id,
      deviceType,
      brand,
      model: model || 'Unknown',
      color: color || 'Unknown',
      condition: condition || 'good',
      description: description || '',
      features: features || [],
      hasImage: !!imageBase64,
      createdAt: now,
      updatedAt: now,
    };

    await ddbClient.send(new PutCommand({
      TableName: DEVICES_TABLE,
      Item: device,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Device registered successfully',
        device,
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
