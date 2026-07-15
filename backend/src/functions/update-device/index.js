const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_HISTORY_TABLE = process.env.DEVICE_HISTORY_TABLE;

if (!DEVICES_TABLE || !DEVICE_HISTORY_TABLE) {
  throw new Error('Missing required environment variables: DEVICES_TABLE, DEVICE_HISTORY_TABLE');
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
    const body = JSON.parse(event.body || '{}');

    const allowedFields = ['deviceType', 'brand', 'model', 'color', 'condition', 'description'];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No valid fields to update' }),
      };
    }

    // Get current device
    const getResult = await ddbClient.send(new GetCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
    }));

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Device not found' }),
      };
    }

    const currentDevice = getResult.Item;

    // Verify ownership
    if (currentDevice.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to update this device' }),
      };
    }

    // Determine which fields actually changed
    const changedFields = [];
    const oldValues = {};
    for (const field of Object.keys(updates)) {
      if (currentDevice[field] !== updates[field]) {
        changedFields.push(field);
        oldValues[field] = currentDevice[field] || null;
      }
    }

    if (changedFields.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No changes detected', device: currentDevice }),
      };
    }

    const now = new Date().toISOString();

    // Save history record
    await ddbClient.send(new PutCommand({
      TableName: DEVICE_HISTORY_TABLE,
      Item: {
        deviceId,
        timestamp: now,
        oldValues,
        newValues: Object.fromEntries(changedFields.map(f => [f, updates[f]])),
        changedFields,
        changedBy: userId,
        changedAt: now,
      },
    }));

    // Build update expression
    const expressionParts = [];
    const expressionNames = {};
    const expressionValues = {};

    for (const field of Object.keys(updates)) {
      expressionParts.push(`#${field} = :${field}`);
      expressionNames[`#${field}`] = field;
      expressionValues[`:${field}`] = updates[field];
    }

    expressionParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = now;

    await ddbClient.send(new UpdateCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    }));

    const updatedDevice = { ...currentDevice, ...updates, updatedAt: now };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Device updated successfully',
        device: updatedDevice,
        changedFields,
      }),
    };
  } catch (error) {
    console.error('Update device error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update device' }),
    };
  }
});
