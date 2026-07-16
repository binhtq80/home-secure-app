const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const userId = event.user.id;
    const roomName = decodeURIComponent(event.pathParameters?.roomName || '');

    if (!roomName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Room name is required' }),
      };
    }

    // Prevent deletion of "Unassigned"
    if (roomName.toLowerCase() === 'unassigned') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Cannot remove the Unassigned room' }),
      };
    }

    // Find all devices belonging to this user in the specified room
    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }));

    const devices = (result.Items || []).filter(
      (d) => !d.deleted && d.room === roomName
    );

    // Reassign all devices in this room to Unassigned (set room to null)
    const updatePromises = devices.map((device) =>
      ddbClient.send(new UpdateCommand({
        TableName: DEVICES_TABLE,
        Key: { id: device.id },
        UpdateExpression: 'SET #room = :room, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#room': 'room',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':room': null,
          ':updatedAt': new Date().toISOString(),
        },
      }))
    );

    await Promise.all(updatePromises);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `Room "${roomName}" removed successfully. ${devices.length} device(s) moved to Unassigned.`,
        devicesReassigned: devices.length,
      }),
    };
  } catch (error) {
    console.error('Delete room error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to remove room' }),
    };
  }
});
