const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const cognitoClient = new CognitoIdentityProviderClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = process.env.USERS_TABLE;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

if (!USERS_TABLE || !USER_POOL_CLIENT_ID) {
  throw new Error('Missing required environment variables');
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
