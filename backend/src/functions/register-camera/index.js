const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CAMERAS_TABLE = process.env.CAMERAS_TABLE;

if (!CAMERAS_TABLE) {
  throw new Error('Missing required environment variable: CAMERAS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { name, location, model, resolution } = body;

    if (!name || !location) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Name and location are required' }),
      };
    }

    const camera = {
      id: randomUUID(),
      userId: event.user.id,
      name: name.trim(),
      location: location.trim(),
      model: model ? model.trim() : null,
      resolution: resolution ? resolution.trim() : null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddbClient.send(new PutCommand({
      TableName: CAMERAS_TABLE,
      Item: camera,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ message: 'Camera registered successfully', camera }),
    };
  } catch (error) {
    console.error('Register camera error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to register camera' }),
    };
  }
});
