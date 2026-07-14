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
    const { monthlyBudgetKwh } = JSON.parse(event.body);

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceId is required' }),
      };
    }

    if (monthlyBudgetKwh === undefined || typeof monthlyBudgetKwh !== 'number' || monthlyBudgetKwh < 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'monthlyBudgetKwh must be a positive number' }),
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
        body: JSON.stringify({ message: 'Access denied' }),
      };
    }

    await ddbClient.send(new UpdateCommand({
      TableName: DEVICES_TABLE,
      Key: { id: deviceId },
      UpdateExpression: 'SET monthlyBudgetKwh = :budget, updatedAt = :now',
      ExpressionAttributeValues: {
        ':budget': monthlyBudgetKwh,
        ':now': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Budget updated successfully',
        monthlyBudgetKwh,
      }),
    };
  } catch (error) {
    console.error('Update device budget error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update budget' }),
    };
  }
});
