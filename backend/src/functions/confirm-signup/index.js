const { CognitoIdentityProviderClient, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({});

const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

if (!USER_POOL_CLIENT_ID) {
  throw new Error('Missing required environment variables');
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
};

exports.handler = async (event) => {
  try {
    const { username, confirmationCode } = JSON.parse(event.body);

    if (!username || !confirmationCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'username and confirmationCode are required' }),
      };
    }

    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: username,
      ConfirmationCode: confirmationCode,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Email confirmed successfully. You can now sign in.' }),
    };
  } catch (error) {
    console.error('Confirm signup error:', error);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: error.message || 'Confirmation failed' }),
    };
  }
};
