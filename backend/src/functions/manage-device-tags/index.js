const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICE_TAGS_TABLE = process.env.DEVICE_TAGS_TABLE;
const DEVICES_TABLE = process.env.DEVICES_TABLE;

if (!DEVICE_TAGS_TABLE) {
  throw new Error('Missing required environment variable: DEVICE_TAGS_TABLE');
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

    const method = event.httpMethod || event.requestContext?.http?.method;

    // GET — list tags for device
    if (method === 'GET') {
      const result = await ddbClient.send(new QueryCommand({
        TableName: DEVICE_TAGS_TABLE,
        KeyConditionExpression: 'deviceId = :deviceId',
        ExpressionAttributeValues: { ':deviceId': deviceId },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          tags: (result.Items || []).map(item => item.tag),
          count: result.Items?.length || 0,
        }),
      };
    }

    // POST — add or remove a tag
    const { action, tag } = JSON.parse(event.body);

    if (!tag || !tag.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'tag is required' }),
      };
    }

    const normalizedTag = tag.trim().toLowerCase();

    if (normalizedTag.length > 30) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Tag must be 30 characters or less' }),
      };
    }

    if (action === 'remove') {
      await ddbClient.send(new DeleteCommand({
        TableName: DEVICE_TAGS_TABLE,
        Key: { deviceId, tag: normalizedTag },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Tag removed', tag: normalizedTag }),
      };
    }

    // Default action: add
    const now = new Date().toISOString();

    await ddbClient.send(new PutCommand({
      TableName: DEVICE_TAGS_TABLE,
      Item: {
        deviceId,
        tag: normalizedTag,
        userId,
        createdAt: now,
      },
    }));

    // Return all tags after add
    const result = await ddbClient.send(new QueryCommand({
      TableName: DEVICE_TAGS_TABLE,
      KeyConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: { ':deviceId': deviceId },
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Tag added',
        tag: normalizedTag,
        tags: (result.Items || []).map(item => item.tag),
      }),
    };
  } catch (error) {
    console.error('Manage device tags error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to manage tags' }),
    };
  }
});
