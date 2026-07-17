const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrockClient = new BedrockRuntimeClient({});

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'au.anthropic.claude-haiku-4-5-20251001-v1:0';

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

async function classifyComplexity(description) {
  try {
    const prompt = `You are a software project complexity classifier. Given a feature request description, classify its implementation complexity into one of these levels:

- simple: Minor UI change, text update, or config tweak. Can be done in under 30 minutes.
- medium: New component, API endpoint, or straightforward CRUD feature. Takes 1-3 hours.
- complex: Multi-layer change spanning frontend, backend, and infrastructure. Takes 3-8 hours.
- highly-complex: Major architectural change, new service integration, or multi-system coordination. Takes 1+ days.

Feature request: "${description}"

Respond ONLY with a valid JSON object with two fields:
- "complexity": one of "simple", "medium", "complex", "highly-complex"
- "justification": a brief 1-2 sentence explanation of why this complexity level was chosen

Example: {"complexity": "medium", "justification": "Requires a new API endpoint and frontend component but follows existing patterns."}`;

    const invokeBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
    });

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: invokeBody,
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const assistantMessage = responseBody.content[0].text;

    // Parse the JSON from Claude's response
    const jsonStr = assistantMessage.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr);

    const validLevels = ['simple', 'medium', 'complex', 'highly-complex'];
    if (result.complexity && validLevels.includes(result.complexity) && result.justification) {
      return result;
    }

    return { complexity: 'medium', justification: 'Unable to parse AI response; defaulting to medium.' };
  } catch (error) {
    console.error('Failed to classify complexity:', error);
    return { complexity: 'medium', justification: 'AI classification failed; defaulting to medium.' };
  }
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

    // Save initially with 'classifying' status
    const item = {
      id,
      description: description.trim(),
      status: 'classifying',
      source: 'web',
      createdAt: now,
      createdBy: userId,
      currentStep: 'classifying',
      votes: {},
      voteCount: 0,
      averageRating: 0,
      steps: [
        { time: now, detail: 'Submitted via web' },
        { time: now, detail: 'AI complexity classification in progress' },
      ],
    };

    await ddbClient.send(new PutCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Item: item,
    }));

    // Classify complexity via Bedrock
    const classification = await classifyComplexity(description.trim());

    // Update item with classification result and set status to pending_confirmation
    const classifiedAt = new Date().toISOString();
    await ddbClient.send(new UpdateCommand({
      TableName: FEATURE_REQUESTS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #s = :status, currentStep = :step, suggestedComplexity = :complexity, complexityJustification = :justification, classifiedAt = :classifiedAt, #steps = list_append(#steps, :newStep)',
      ExpressionAttributeNames: { '#s': 'status', '#steps': 'steps' },
      ExpressionAttributeValues: {
        ':status': 'pending_confirmation',
        ':step': 'pending_confirmation',
        ':complexity': classification.complexity,
        ':justification': classification.justification,
        ':classifiedAt': classifiedAt,
        ':newStep': [{ time: classifiedAt, detail: `AI classified as "${classification.complexity}": ${classification.justification}` }],
      },
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        id,
        message: 'Feature request submitted successfully',
        suggestedComplexity: classification.complexity,
        complexityJustification: classification.justification,
      }),
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
