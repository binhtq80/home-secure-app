const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const cognitoClient = new CognitoIdentityProviderClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;
const DEVICES_TABLE = process.env.DEVICES_TABLE;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

if (!USERS_TABLE || !DEVICES_TABLE || !USER_POOL_CLIENT_ID) {
  throw new Error('Missing required environment variables');
}

function formatLastSeenAgo(dateStr) {
  if (!dateStr) return null;
  const last = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = now - last;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
};

exports.handler = async (event) => {
  try {
    const { username, password } = JSON.parse(event.body);

    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'username and password are required' }),
      };
    }

    // Authenticate with Cognito
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    const authResult = await cognitoClient.send(authCommand);
    const tokens = authResult.AuthenticationResult;

    // Get user from DynamoDB by username index
    const queryResult = await ddbClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :username',
      ExpressionAttributeValues: { ':username': username },
    }));

    const user = queryResult.Items?.[0];
    const now = new Date().toISOString();
    const previousLoginAt = user?.lastLoginAt || null;

    // Update last login time and increment login count
    if (user) {
      await ddbClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { id: user.id },
        UpdateExpression: 'SET lastLoginAt = :now, previousLoginAt = :prev, loginCount = if_not_exists(loginCount, :zero) + :one',
        ExpressionAttributeValues: {
          ':now': now,
          ':prev': previousLoginAt,
          ':zero': 0,
          ':one': 1,
        },
      }));
    }

    // Query devices table to get user's device count
    let deviceCount = 0;
    if (user) {
      const devicesResult = await ddbClient.send(new QueryCommand({
        TableName: DEVICES_TABLE,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': user.id },
        Select: 'COUNT',
      }));
      deviceCount = devicesResult.Count || 0;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Login successful',
        tokens: {
          accessToken: tokens.AccessToken,
          idToken: tokens.IdToken,
          refreshToken: tokens.RefreshToken,
          expiresIn: tokens.ExpiresIn,
        },
        user: {
          id: user?.id,
          username: user?.username,
          email: user?.email,
          lastLoginAt: previousLoginAt,
          loginCount: (user?.loginCount || 0) + 1,
          createdAt: user?.createdAt,
          deviceCount,
          lastSeenAgo: formatLastSeenAgo(previousLoginAt),
        },
      }),
    };
  } catch (error) {
    console.error('Signin error:', error);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: error.message || 'Authentication failed' }),
    };
  }
};
