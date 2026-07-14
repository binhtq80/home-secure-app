const { CognitoIdentityProviderClient, SignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

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
    const { username, email, password } = JSON.parse(event.body);

    if (!username || !email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'username, email, and password are required' }),
      };
    }

    // Register with Cognito
    const signUpCommand = new SignUpCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
      ],
    });

    const cognitoResponse = await cognitoClient.send(signUpCommand);

    // Create user record in DynamoDB
    const userId = cognitoResponse.UserSub;
    const now = new Date().toISOString();

    await ddbClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        id: userId,
        username,
        email,
        createdAt: now,
        lastLoginAt: null,
        loginCount: 0,
      },
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'User registered successfully. Please check your email for verification code.',
        userId,
        username,
      }),
    };
  } catch (error) {
    console.error('Signup error:', error);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: error.message || 'Signup failed' }),
    };
  }
};
