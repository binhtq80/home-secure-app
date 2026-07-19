const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CAMERAS_TABLE = process.env.CAMERAS_TABLE;

if (!CAMERAS_TABLE) {
  throw new Error('Missing required environment variable: CAMERAS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const cameraId = event.pathParameters?.cameraId;

    if (!cameraId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Camera ID is required' }),
      };
    }

    // Verify ownership before deleting
    const existing = await ddbClient.send(new GetCommand({
      TableName: CAMERAS_TABLE,
      Key: { id: cameraId },
    }));

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Camera not found' }),
      };
    }

    if (existing.Item.userId !== event.user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this camera' }),
      };
    }

    await ddbClient.send(new DeleteCommand({
      TableName: CAMERAS_TABLE,
      Key: { id: cameraId },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Camera deleted successfully' }),
    };
  } catch (error) {
    console.error('Delete camera error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to delete camera' }),
    };
  }
});
