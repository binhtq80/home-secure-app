const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { withAuth, headers } = require('./common/middleware');

const bedrockClient = new BedrockRuntimeClient({});

const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

exports.handler = withAuth(async (event) => {
  try {
    const { image, mimeType } = JSON.parse(event.body);

    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'image (base64) is required' }),
      };
    }

    const mediaType = mimeType || 'image/jpeg';

    // Call Bedrock Claude Vision to analyze the device image
    const prompt = `Analyze this image of a home device/appliance. Extract the following information and respond ONLY with a valid JSON object (no markdown, no explanation):

{
  "deviceType": "the type of device (e.g., camera, washing machine, television, refrigerator, air conditioner, robot vacuum, smart speaker, etc.)",
  "brand": "the brand/manufacturer name if visible, otherwise best guess or 'Unknown'",
  "model": "the model name/number if visible, otherwise 'Unknown'",
  "color": "the primary color of the device",
  "condition": "new, good, fair, or poor based on appearance",
  "description": "a brief one-sentence description of the device",
  "features": ["list", "of", "notable", "features", "if", "identifiable"]
}

If the image is not a home device/appliance, set deviceType to "unknown" and description to explain what you see instead.`;

    const invokeBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
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

    // Parse the JSON response from Claude
    let deviceInfo;
    try {
      // Handle case where Claude might wrap in markdown code blocks
      const jsonStr = assistantMessage.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      deviceInfo = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse Bedrock response:', assistantMessage);
      deviceInfo = {
        deviceType: 'unknown',
        brand: 'Unknown',
        model: 'Unknown',
        color: 'Unknown',
        condition: 'unknown',
        description: 'Could not analyze the image',
        features: [],
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Device recognized successfully',
        device: deviceInfo,
      }),
    };
  } catch (error) {
    console.error('Recognize device error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Failed to recognize device' }),
    };
  }
});
