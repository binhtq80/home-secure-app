const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sesClient = new SESClient({});

const DEVICES_TABLE = process.env.DEVICES_TABLE;
const DEVICE_ENERGY_TABLE = process.env.DEVICE_ENERGY_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

if (!DEVICES_TABLE || !DEVICE_ENERGY_TABLE || !USERS_TABLE || !SENDER_EMAIL) {
  throw new Error('Missing required environment variables: DEVICES_TABLE, DEVICE_ENERGY_TABLE, USERS_TABLE, SENDER_EMAIL');
}

exports.handler = async (event) => {
  console.log('Budget alert job started', { time: new Date().toISOString() });

  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Step 1: Scan all devices that have a monthly budget set
    const devicesWithBudget = [];
    let lastEvaluatedKey = undefined;

    do {
      const scanResult = await ddbClient.send(new ScanCommand({
        TableName: DEVICES_TABLE,
        FilterExpression: 'attribute_exists(monthlyBudgetKwh) AND monthlyBudgetKwh > :zero AND (attribute_not_exists(deleted) OR deleted = :false)',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':false': false,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      devicesWithBudget.push(...(scanResult.Items || []));
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Found ${devicesWithBudget.length} devices with budget set`);

    if (devicesWithBudget.length === 0) {
      console.log('No devices with budgets found, exiting');
      return { statusCode: 200, body: 'No devices with budgets' };
    }

    // Step 2: Check current month energy for each device
    const overBudgetByUser = {}; // userId -> [{ device, usage, budget, overBy }]

    for (const device of devicesWithBudget) {
      const energyResult = await ddbClient.send(new QueryCommand({
        TableName: DEVICE_ENERGY_TABLE,
        KeyConditionExpression: 'deviceId = :deviceId AND #month = :month',
        ExpressionAttributeNames: { '#month': 'month' },
        ExpressionAttributeValues: {
          ':deviceId': device.id,
          ':month': currentMonth,
        },
      }));

      const currentUsage = energyResult.Items?.[0]?.kwh || 0;

      if (currentUsage > device.monthlyBudgetKwh) {
        const overBy = Math.round((currentUsage - device.monthlyBudgetKwh) * 10) / 10;
        const deviceName = `${device.brand || 'Unknown'} ${device.model && device.model !== 'Unknown' ? device.model : device.deviceType || 'Device'}`;

        if (!overBudgetByUser[device.userId]) {
          overBudgetByUser[device.userId] = [];
        }

        overBudgetByUser[device.userId].push({
          deviceName,
          usage: Math.round(currentUsage * 10) / 10,
          budget: device.monthlyBudgetKwh,
          overBy,
        });
      }
    }

    const affectedUsers = Object.keys(overBudgetByUser);
    console.log(`${affectedUsers.length} users have over-budget devices`);

    if (affectedUsers.length === 0) {
      console.log('No over-budget devices found, exiting');
      return { statusCode: 200, body: 'No over-budget devices' };
    }

    // Step 3: Send email to each affected user
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const userId of affectedUsers) {
      try {
        // Get user email
        const userResult = await ddbClient.send(new GetCommand({
          TableName: USERS_TABLE,
          Key: { id: userId },
          ProjectionExpression: 'email, username',
        }));

        const userEmail = userResult.Item?.email;
        const username = userResult.Item?.username || 'User';

        if (!userEmail) {
          console.warn(`No email found for user ${userId}, skipping`);
          continue;
        }

        const devices = overBudgetByUser[userId];
        const emailBody = buildEmailBody(username, devices, currentMonth);
        const emailHtml = buildEmailHtml(username, devices, currentMonth);

        await sesClient.send(new SendEmailCommand({
          Source: SENDER_EMAIL,
          Destination: { ToAddresses: [userEmail] },
          Message: {
            Subject: {
              Data: `⚡ Energy Budget Alert: ${devices.length} device${devices.length > 1 ? 's' : ''} over budget`,
              Charset: 'UTF-8',
            },
            Body: {
              Text: { Data: emailBody, Charset: 'UTF-8' },
              Html: { Data: emailHtml, Charset: 'UTF-8' },
            },
          },
        }));

        emailsSent++;
        console.log(`Email sent to ${userEmail} (${devices.length} over-budget devices)`);
      } catch (err) {
        emailsFailed++;
        console.error(`Failed to send email to user ${userId}:`, err.message);
      }
    }

    const summary = `Budget alert complete: ${emailsSent} emails sent, ${emailsFailed} failed`;
    console.log(summary);

    return { statusCode: 200, body: summary };
  } catch (error) {
    console.error('Budget alert job failed:', error);
    throw error;
  }
};

function buildEmailBody(username, devices, month) {
  let body = `Hi ${username},\n\n`;
  body += `This is your daily energy budget alert for ${month}.\n\n`;
  body += `The following device${devices.length > 1 ? 's have' : ' has'} exceeded ${devices.length > 1 ? 'their' : 'its'} monthly energy budget:\n\n`;

  for (const d of devices) {
    body += `• ${d.deviceName}\n`;
    body += `  Usage: ${d.usage} kWh / Budget: ${d.budget} kWh (over by ${d.overBy} kWh)\n\n`;
  }

  body += `Consider reducing usage or adjusting your budgets in the MyApp dashboard.\n\n`;
  body += `— MyApp Energy Monitor`;

  return body;
}

function buildEmailHtml(username, devices, month) {
  const rows = devices.map((d) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${d.deviceName}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${d.usage} kWh</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${d.budget} kWh</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #e53e3e; font-weight: bold;">+${d.overBy} kWh</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e53e3e;">⚡ Energy Budget Alert</h2>
      <p>Hi ${username},</p>
      <p>This is your daily energy budget alert for <strong>${month}</strong>.</p>
      <p>The following device${devices.length > 1 ? 's have' : ' has'} exceeded ${devices.length > 1 ? 'their' : 'its'} monthly energy budget:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="background: #f7f7f7;">
            <th style="padding: 8px; text-align: left;">Device</th>
            <th style="padding: 8px; text-align: right;">Usage</th>
            <th style="padding: 8px; text-align: right;">Budget</th>
            <th style="padding: 8px; text-align: right;">Over By</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Consider reducing usage or adjusting your budgets in the MyApp dashboard.</p>
      <p style="color: #666; font-size: 14px;">— MyApp Energy Monitor</p>
    </div>
  `;
}
