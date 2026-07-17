const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('Missing required environment variable: USERS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    // Check that the caller has role=product_manager
    const userResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
    }));

    if (!userResult.Item || userResult.Item.role !== 'product_manager') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Forbidden: product_manager role required' }),
      };
    }

    const result = await ddbClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'id, username, email, #r',
      ExpressionAttributeNames: { '#r': 'role' },
    }));

    const users = (result.Items || []).map((item) => ({
      id: item.id,
      username: item.username,
      email: item.email,
      role: item.role || 'user',
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ users }),
    };
  } catch (error) {
    console.error('List users error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to list users' }),
    };
  }
});
