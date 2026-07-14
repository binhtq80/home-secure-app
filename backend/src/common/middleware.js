const { CognitoIdentityProviderClient, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({});

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function withAuth(handler) {
  return async (event) => {
    try {
      const token = event.headers?.Authorization?.replace('Bearer ', '') ||
                    event.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'No authorization token provided' }),
        };
      }

      const command = new GetUserCommand({ AccessToken: token });
      const user = await cognitoClient.send(command);

      const userId = user.UserAttributes.find(a => a.Name === 'sub')?.Value;
      const username = user.Username;
      const email = user.UserAttributes.find(a => a.Name === 'email')?.Value;

      event.user = { id: userId, username, email, token };

      return handler(event);
    } catch (error) {
      console.error('Auth error:', error);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Invalid or expired token' }),
      };
    }
  };
}

module.exports = { withAuth, headers };
