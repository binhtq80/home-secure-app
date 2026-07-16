const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { v4: uuidv4 } = require('uuid');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({});

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_IMAGES_BUCKET = process.env.DEVICE_IMAGES_BUCKET;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'au.anthropic.claude-haiku-4-5-20251001-v1:0';

if (!DEVICES_TABLE) {
  throw new Error('Missing required environment variable: DEVICES_TABLE');
}

async function generateEnergySavingTips(deviceType, brand, model) {
  try {
    const prompt = `You are an energy efficiency expert. Generate 3-5 personalized, practical energy saving tips for a home device with the following details:
- Device type: ${deviceType}
- Brand: ${brand}
- Model: ${model || 'Unknown'}

Respond ONLY with a valid JSON array of strings. Each string should be a concise, actionable tip (max 100 characters each). Focus on practical advice specific to this device type.

Example format: ["Tip 1", "Tip 2", "Tip 3"]`;

    const invokeBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
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

    // Parse the JSON array from Claude's response
    const jsonStr = assistantMessage.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const tips = JSON.parse(jsonStr);

    if (Array.isArray(tips) && tips.length > 0) {
      return tips;
    }

    return ['Turn off when not in use to save energy'];
  } catch (error) {
    console.error('Failed to generate energy saving tips:', error);
    return ['Turn off when not in use to save energy'];
  }
}

exports.handler = withAuth(async (event) => {
  try {
    const { deviceType, brand, model, color, condition, description, features, imageBase64 } = JSON.parse(event.body);

    if (!deviceType || !brand) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'deviceType and brand are required' }),
      };
    }

    const deviceId = uuidv4();
    const now = new Date().toISOString();
    const userId = event.user.id;

    let imageKey = null;

    // Save image to S3 if provided
    if (imageBase64 && DEVICE_IMAGES_BUCKET) {
      imageKey = `${userId}/${deviceId}.jpg`;
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      await s3Client.send(new PutObjectCommand({
        Bucket: DEVICE_IMAGES_BUCKET,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      }));
    }

    // Generate AI-powered energy saving tips for this device
    const energySavingTips = await generateEnergySavingTips(deviceType, brand, model);

    const device = {
      id: deviceId,
      userId,
      deviceType,
      brand,
      model: model || 'Unknown',
      color: color || 'Unknown',
      condition: condition || 'good',
      description: description || '',
      features: features || [],
      status: 'off',
      hasImage: !!imageBase64,
      imageKey: imageKey || undefined,
      energySavingTips,
      createdAt: now,
      updatedAt: now,
    };

    // Remove undefined fields before storing
    const cleanDevice = Object.fromEntries(
      Object.entries(device).filter(([, v]) => v !== undefined)
    );

    await ddbClient.send(new PutCommand({
      TableName: DEVICES_TABLE,
      Item: cleanDevice,
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Device registered successfully',
        device: cleanDevice,
      }),
    };
  } catch (error) {
    console.error('Create device error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to create device' }),
    };
  }
});
