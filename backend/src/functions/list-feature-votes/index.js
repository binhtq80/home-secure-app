const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    const featureId = event.pathParameters?.featureId;
    const userId = event.user.id;

    if (!featureId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Feature ID is required' }),
      };
    }

    const result = await ddbClient.send(new GetCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Feature request not found' }),
      };
    }

    const votes = result.Item.votes || {};
    const voteEntries = Object.entries(votes).map(([oderId, vote]) => ({
      oderId,
      rating: vote.rating,
      comment: vote.comment || null,
      createdAt: vote.createdAt,
    }));

    // Sort by most recent first
    voteEntries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Check if current user has voted
    const userVote = votes[userId] || null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        featureId,
        votes: voteEntries,
        voteCount: voteEntries.length,
        averageRating: result.Item.averageRating || 0,
        userVote: userVote ? { rating: userVote.rating, comment: userVote.comment || null } : null,
      }),
    };
  } catch (error) {
    console.error('List feature votes error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to list votes' }),
    };
  }
});
