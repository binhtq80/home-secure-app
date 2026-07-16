const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
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

    // Verify ownership
    const existing = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    if (existing.Item.userId !== event.user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'You can only delete your own devices' }),
      };
    }

    if (existing.Item.deleted) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Device is already deleted' }),
      };
    }

    // Soft delete: mark as deleted instead of removing from DB
    await ddbClient.send(new UpdateCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
      UpdateExpression: 'SET deleted = :deleted, deletedAt = :deletedAt',
      ExpressionAttributeValues: {
        ':deleted': true,
        ':deletedAt': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Device removed successfully' }),
    };
  } catch (error) {
    console.error('Delete device error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to delete device' }),
    };
  }
});
