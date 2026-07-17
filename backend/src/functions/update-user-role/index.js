const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

const VALID_ROLES = ['user', 'technical', 'product_manager'];

exports.handler = withAuth(async (event) => {
  try {
    // Check that the caller has role=product_manager
    const callerResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
    }));

    if (!callerResult.Item || callerResult.Item.role !== 'product_manager') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Forbidden: product_manager role required' }),
      };
    }

    const targetUserId = event.pathParameters?.userId;
    if (!targetUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'userId is required' }),
      };
    }

    const { role } = JSON.parse(event.body || '{}');

    if (!role || !VALID_ROLES.includes(role)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `role must be one of: ${VALID_ROLES.join(', ')}` }),
      };
    }

    // Verify target user exists
    const targetResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: targetUserId },
    }));

    if (!targetResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    await ddbClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id: targetUserId },
      UpdateExpression: 'SET #role = :role, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: {
        ':role': role,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'User role updated successfully',
        userId: targetUserId,
        role,
      }),
    };
  } catch (error) {
    console.error('Update user role error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to update user role' }),
    };
  }
});
