const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICE_NOTES_TABLE = process.env.DEVICE_NOTES_TABLE;
const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICE_NOTES_TABLE) {
  throw new Error('Missing required environment variable: DEVICE_NOTES_TABLE');
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

    const { text } = JSON.parse(event.body);
    if (!text || !text.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'text is required' }),
      };
    }

    const userId = event.user.id;

    // Verify device belongs to user
    if (DEVICES_TABLE) {
      const deviceResult = await ddbClient.send(new GetCommand({
        TableName: DEVICES_TABLE,
        Key: { id: deviceId },
      }));

      if (!deviceResult.Item || deviceResult.Item.userId !== userId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Device not found' }),
        };
      }
    }

    const noteId = uuidv4();
    const now = new Date().toISOString();

    const note = {
      deviceId,
      noteId,
      userId,
      text: text.trim(),
      createdAt: now,
    };

    await ddbClient.send(new PutCommand({
      TableName: DEVICE_NOTES_TABLE,
      Item: note,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ message: 'Note created', note }),
    };
  } catch (error) {
    console.error('Create device note error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to create note' }),
    };
  }
});
