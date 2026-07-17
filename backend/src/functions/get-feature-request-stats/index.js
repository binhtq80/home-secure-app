const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { withAuth, headers } = require('./common/middleware');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FEATURE_REQUESTS_TABLE = process.env.FEATURE_REQUESTS_TABLE;

if (!FEATURE_REQUESTS_TABLE) {
  throw new Error('Missing required environment variable: FEATURE_REQUESTS_TABLE');
}

exports.handler = withAuth(async (event) => {
  try {
    // Scan all feature requests (for summary stats)
    let allItems = [];
    let lastKey = undefined;

    do {
      const params = {
        TableName: FEATURE_REQUESTS_TABLE,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      };
      const result = await ddbClient.send(new ScanCommand(params));
      allItems = allItems.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentMonth = todayStr.substring(0, 7); // YYYY-MM

    // Compute statistics
    const total = allItems.length;
    let deliveredTotal = 0;
    let deliveredToday = 0;
    let deliveredThisMonth = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let inProgressCount = 0;

    const monthlyBreakdown = {};
    const delivererCounts = {};

    for (const item of allItems) {
      const status = item.status || 'pending';
      const createdAt = item.createdAt || '';
      const createdDate = createdAt.split('T')[0];
      const createdMonth = createdAt.substring(0, 7);

      if (status === 'delivered' || status === 'approved' || status === 'completed') {
        deliveredTotal++;
        if (createdDate === todayStr) {
          deliveredToday++;
        }
        if (createdMonth === currentMonth) {
          deliveredThisMonth++;
        }
        // Track deliveries by DevSpace (claimedBy)
        const deliverer = item.claimedBy || 'Unknown';
        delivererCounts[deliverer] = (delivererCounts[deliverer] || 0) + 1;
      } else if (status === 'pending') {
        pendingCount++;
      } else if (status === 'rejected') {
        rejectedCount++;
      } else if (status === 'in-progress' || status === 'implementing') {
        inProgressCount++;
      }

      // Monthly breakdown (all statuses)
      if (createdMonth) {
        if (!monthlyBreakdown[createdMonth]) {
          monthlyBreakdown[createdMonth] = { total: 0, delivered: 0, pending: 0, rejected: 0 };
        }
        monthlyBreakdown[createdMonth].total++;
        if (status === 'delivered' || status === 'approved' || status === 'completed') {
          monthlyBreakdown[createdMonth].delivered++;
        } else if (status === 'pending') {
          monthlyBreakdown[createdMonth].pending++;
        } else if (status === 'rejected') {
          monthlyBreakdown[createdMonth].rejected++;
        }
      }
    }

    // Sort monthly breakdown by month (newest first)
    const sortedMonths = Object.keys(monthlyBreakdown).sort().reverse();
    const monthlyStats = sortedMonths.map(month => ({
      month,
      ...monthlyBreakdown[month],
    }));

    // Build deliverer stats (sorted by count descending)
    const delivererStats = Object.entries(delivererCounts)
      .map(([deliverer, count]) => ({ deliverer, count }))
      .sort((a, b) => b.count - a.count);

    // Average per day (over last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentItems = allItems.filter(item => {
      const d = new Date(item.createdAt);
      return d >= thirtyDaysAgo;
    });
    const avgPerDay = recentItems.length > 0 ? (recentItems.length / 30).toFixed(1) : '0';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        total,
        delivered: {
          total: deliveredTotal,
          today: deliveredToday,
          thisMonth: deliveredThisMonth,
        },
        pending: pendingCount,
        rejected: rejectedCount,
        inProgress: inProgressCount,
        avgPerDay: parseFloat(avgPerDay),
        monthlyStats,
        delivererStats,
      }),
    };
  } catch (error) {
    console.error('Get feature request stats error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to get feature request statistics' }),
    };
  }
});
