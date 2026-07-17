const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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

    const { rating, comment } = JSON.parse(event.body);

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'rating is required and must be an integer between 1 and 5' }),
      };
    }

    if (comment !== undefined && typeof comment !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'comment must be a string' }),
      };
    }

    // Get the feature request
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

    // Check if user is the creator (cannot vote on own request)
    if (result.Item.createdBy === userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'You cannot vote on your own feature request' }),
      };
    }

    // Check if user already voted
    const votes = result.Item.votes || {};
    if (votes[userId]) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'You have already voted on this feature request. Votes cannot be changed.' }),
      };
    }

    // Build the vote entry
    const now = new Date().toISOString();
    const voteEntry = { rating, createdAt: now };
    if (comment && comment.trim()) {
      voteEntry.comment = comment.trim();
    }

    // Calculate new average rating
    const existingVotes = Object.values(votes);
    const totalRatings = existingVotes.reduce((sum, v) => sum + v.rating, 0) + rating;
    const voteCount = existingVotes.length + 1;
    const averageRating = Math.round((totalRatings / voteCount) * 10) / 10;

    // Update the feature request with the new vote
    await ddbClient.send(new UpdateCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
      UpdateExpression: 'SET #votes = if_not_exists(#votes, :emptyMap), #avgRating = :avgRating, #voteCount = :voteCount',
      ExpressionAttributeNames: {
        '#votes': 'votes',
        '#avgRating': 'averageRating',
        '#voteCount': 'voteCount',
      },
      ExpressionAttributeValues: {
        ':emptyMap': {},
        ':avgRating': averageRating,
        ':voteCount': voteCount,
      },
      ConditionExpression: 'attribute_exists(id)',
    }));

    // Now set the individual vote entry
    await ddbClient.send(new UpdateCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id: featureId },
      UpdateExpression: 'SET #votes.#userId = :voteEntry',
      ExpressionAttributeNames: {
        '#votes': 'votes',
        '#userId': userId,
      },
      ExpressionAttributeValues: {
        ':voteEntry': voteEntry,
      },
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Vote submitted successfully',
        vote: { rating, comment: voteEntry.comment || null },
        averageRating,
        voteCount,
      }),
    };
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Feature request not found' }),
      };
    }
    console.error('Vote feature request error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to submit vote' }),
    };
  }
});
