const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const { costPerKwh, currency } = JSON.parse(event.body);

    if (costPerKwh === undefined && currency === undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'At least one setting (costPerKwh, currency) is required' }),
      };
    }

    if (costPerKwh !== undefined && (typeof costPerKwh !== 'number' || costPerKwh < 0 || costPerKwh > 10)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'costPerKwh must be a number between 0 and 10' }),
      };
    }

    const updateExpressions = [];
    const expressionValues = {};
    const expressionNames = {};

    if (costPerKwh !== undefined) {
      updateExpressions.push('#costPerKwh = :costPerKwh');
      expressionValues[':costPerKwh'] = costPerKwh;
      expressionNames['#costPerKwh'] = 'costPerKwh';
    }

    if (currency !== undefined) {
      updateExpressions.push('#currency = :currency');
      expressionValues[':currency'] = currency;
      expressionNames['#currency'] = 'currency';
    }

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionValues[':updatedAt'] = new Date().toISOString();
    expressionNames['#updatedAt'] = 'updatedAt';

    await ddbClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Settings updated successfully',
        settings: {
          costPerKwh: costPerKwh ?? undefined,
          currency: currency ?? undefined,
        },
      }),
    };
  } catch (error) {
    console.error('Update user settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update settings' }),
    };
  }
});
