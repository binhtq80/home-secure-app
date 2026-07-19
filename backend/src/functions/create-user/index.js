const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityProviderClient({});

const USERS_TABLE = process.env.USERS_TABLE;
const USER_POOL_ID = process.env.USER_POOL_ID;

if (!USERS_TABLE || !USER_POOL_ID) {
  throw new Error('Missing required environment variables: USERS_TABLE, USER_POOL_ID');
}

const VALID_ROLES = ['user', 'technical', 'product_manager', 'admin'];

exports.handler = withAuth(async (event) => {
  try {
    // Check that the caller has role=admin
    const callerResult = await ddbClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { id: event.user.id },
    }));

    if (!callerResult.Item || callerResult.Item.role !== 'admin') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Forbidden: admin role required' }),
      };
    }

    const { username, email, password, role } = JSON.parse(event.body || '{}');

    if (!username || !email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'username, email, and password are required' }),
      };
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `role must be one of: ${VALID_ROLES.join(', ')}` }),
      };
    }

    // Create user in Cognito
    const createUserResult = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }));

    const cognitoUserId = createUserResult.User.Attributes.find(a => a.Name === 'sub')?.Value;

    // Set permanent password
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: password,
      Permanent: true,
    }));

    // Create DynamoDB record
    const now = new Date().toISOString();
    await ddbClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        id: cognitoUserId,
        username,
        email,
        role,
        createdAt: now,
        updatedAt: now,
      },
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'User created successfully',
        user: { id: cognitoUserId, username, email, role },
      }),
    };
  } catch (error) {
    console.error('Create user error:', error);

    // Handle Cognito-specific errors
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'Username already exists' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to create user' }),
    };
  }
});
