#!/usr/bin/env node

/**
 * Seed Energy Data Script
 * 
 * Reads all devices from the devices table and writes 12 months of
 * simulated energy consumption data to the device-energy table.
 *
 * Usage:
 *   node scripts/seed-energy-data.js --profile dev-admin --region ap-southeast-2
 *
 * Options:
 *   --profile   AWS profile (default: dev-admin)
 *   --region    AWS region (default: ap-southeast-2)
 *   --months    Number of months to generate (default: 12)
 *   --dry-run   Show what would be written without writing
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}
const dryRun = args.includes('--dry-run');

const PROFILE = getArg('profile', 'dev-admin');
const REGION = getArg('region', 'ap-southeast-2');
const MONTHS = parseInt(getArg('months', '12'), 10);
const DEVICES_TABLE = getArg('devices-table', 'myapp-test-devices');
const ENERGY_TABLE = getArg('energy-table', 'myapp-test-device-energy');
const COST_PER_KWH = 0.20;

// ─── AWS Client Setup ────────────────────────────────────────────────────────
const client = new DynamoDBClient({
  region: REGION,
  ...(PROFILE ? { profile: PROFILE } : {}),
});
const ddb = DynamoDBDocumentClient.from(client);

// ─── Simulation Logic ────────────────────────────────────────────────────────
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(Math.sin(hash) * 10000) % 1;
}

function getBaseConsumption(deviceType) {
  const type = (deviceType || '').toLowerCase();
  const ranges = {
    'camera': { min: 5, max: 15 },
    'security camera': { min: 5, max: 15 },
    'washing machine': { min: 30, max: 60 },
    'dryer': { min: 40, max: 80 },
    'dishwasher': { min: 25, max: 50 },
    'refrigerator': { min: 30, max: 50 },
    'fridge': { min: 30, max: 50 },
    'television': { min: 15, max: 40 },
    'tv': { min: 15, max: 40 },
    'air conditioner': { min: 60, max: 150 },
    'heater': { min: 50, max: 120 },
    'robot vacuum': { min: 3, max: 8 },
    'smart speaker': { min: 2, max: 5 },
    'microwave': { min: 10, max: 25 },
    'oven': { min: 40, max: 80 },
    'cooktop': { min: 30, max: 70 },
  };
  for (const [key, range] of Object.entries(ranges)) {
    if (type.includes(key)) return range;
  }
  return { min: 10, max: 40 };
}

function generateEnergyRecords(deviceId, deviceType, months) {
  const baseRange = getBaseConsumption(deviceType);
  const baseKwh = baseRange.min + (seededRandom(deviceId) * (baseRange.max - baseRange.min));
  const records = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7);
    const monthNum = date.getMonth();

    // Seasonal variation (Australian climate)
    let seasonalFactor = 1.0;
    if (monthNum === 0 || monthNum === 1 || monthNum === 11) seasonalFactor = 1.2; // summer
    if (monthNum === 5 || monthNum === 6 || monthNum === 7) seasonalFactor = 1.15; // winter

    // Random noise (deterministic)
    const noise = 0.8 + (seededRandom(deviceId + monthKey) * 0.4);
    const kwh = Math.round(baseKwh * seasonalFactor * noise * 10) / 10;

    // Simulate daily peak/low
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const avgDaily = kwh / daysInMonth;
    const peakKwh = Math.round(avgDaily * (1.3 + seededRandom(deviceId + monthKey + 'peak') * 0.4) * 10) / 10;
    const lowKwh = Math.round(avgDaily * (0.4 + seededRandom(deviceId + monthKey + 'low') * 0.3) * 10) / 10;

    records.push({
      deviceId,
      month: monthKey,
      kwh,
      cost: Math.round(kwh * COST_PER_KWH * 100) / 100,
      readings: daysInMonth,
      peakKwh,
      lowKwh,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return records;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚡ Seed Energy Data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Region:       ${REGION}`);
  console.log(`   Devices table: ${DEVICES_TABLE}`);
  console.log(`   Energy table:  ${ENERGY_TABLE}`);
  console.log(`   Months:        ${MONTHS}`);
  console.log(`   Dry run:       ${dryRun}`);
  console.log('');

  // Step 1: Scan all devices
  console.log('📋 Scanning devices table...');
  let devices = [];
  let lastKey = undefined;

  do {
    const scanResult = await ddb.send(new DocScanCommand({
      TableName: DEVICES_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    devices = devices.concat(scanResult.Items || []);
    lastKey = scanResult.LastEvaluatedKey;
  } while (lastKey);

  console.log(`   Found ${devices.length} device(s)`);

  if (devices.length === 0) {
    console.log('');
    console.log('⚠️  No devices found. Register some devices first!');
    process.exit(0);
  }

  // Step 2: Generate and write energy data for each device
  let totalRecords = 0;

  for (const device of devices) {
    const records = generateEnergyRecords(device.id, device.deviceType, MONTHS);
    totalRecords += records.length;

    console.log(`   ⚡ ${device.brand || 'Unknown'} ${device.deviceType || 'device'} (${device.id.slice(0, 8)}...) → ${records.length} months`);

    if (dryRun) {
      console.log(`      Sample: ${records[0].month} = ${records[0].kwh} kWh ($${records[0].cost})`);
      continue;
    }

    // BatchWrite in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < records.length; i += 25) {
      const batch = records.slice(i, i + 25);
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [ENERGY_TABLE]: batch.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      }));
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) {
    console.log(`📊 Dry run complete: would write ${totalRecords} records for ${devices.length} devices`);
  } else {
    console.log(`✅ Seeded ${totalRecords} energy records for ${devices.length} devices`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
