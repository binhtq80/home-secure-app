const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const { description } = JSON.parse(event.body);

    if (!description || !description.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'description is required' }),
      };
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const userId = event.user.id;

    const item = {
      id,
      description: description.trim(),
      status: 'pending',
      createdAt: now,
      createdBy: userId,
    };

    await ddbClient.send(new PutCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Item: item,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id, message: 'Feature request submitted successfully' }),
    };
  } catch (error) {
    console.error('Create feature request error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to submit feature request' }),
    };
  }
});
