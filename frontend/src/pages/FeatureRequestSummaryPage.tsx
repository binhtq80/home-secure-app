import { useState, useEffect } from 'react';
import { featuresApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

interface MonthlyStatEntry {
  month: string;
  total: number;
  delivered: number;
  pending: number;
  rejected: number;
}

interface DelivererStatEntry {
  deliverer: string;
  count: number;
}

interface FeatureStats {
  total: number;
  delivered: {
    total: number;
    today: number;
    thisMonth: number;
  };
  pending: number;
  rejected: number;
  inProgress: number;
  avgPerDay: number;
  monthlyStats: MonthlyStatEntry[];
  delivererStats: DelivererStatEntry[];
}

export function FeatureRequestSummaryPage() {
  const [stats, setStats] = useState<FeatureStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await featuresApi.getStats();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Feature Request Summary</h2>
        <p className="settings-subtitle">Key statistics and metrics for feature requests.</p>

        {error && <div className="error-message">{error}</div>}

        {loading && <p>Loading statistics...</p>}

        {!loading && stats && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Total Requests</div>
              </div>
              <div className="stat-card stat-card-success">
                <div className="stat-value">{stats.delivered.total}</div>
                <div className="stat-label">Delivered (Total)</div>
              </div>
              <div className="stat-card stat-card-info">
                <div className="stat-value">{stats.delivered.today}</div>
                <div className="stat-label">Delivered Today</div>
              </div>
              <div className="stat-card stat-card-info">
                <div className="stat-value">{stats.delivered.thisMonth}</div>
                <div className="stat-label">Delivered This Month</div>
              </div>
              <div className="stat-card stat-card-warning">
                <div className="stat-value">{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-card stat-card-progress">
                <div className="stat-value">{stats.inProgress}</div>
                <div className="stat-label">In Progress</div>
              </div>
              <div className="stat-card stat-card-danger">
                <div className="stat-value">{stats.rejected}</div>
                <div className="stat-label">Rejected</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.avgPerDay}</div>
                <div className="stat-label">Avg Delivered / Day (30d)</div>
              </div>
            </div>

            <div className="feature-summary-delivery-rate">
              <h3>Delivery Rate</h3>
              <div className="delivery-rate-bar">
                <div
                  className="delivery-rate-fill"
                  style={{ width: `${stats.total > 0 ? Math.round((stats.delivered.total / stats.total) * 100) : 0}%` }}
                />
              </div>
              <p className="delivery-rate-text">
                {stats.total > 0 ? Math.round((stats.delivered.total / stats.total) * 100) : 0}% of requests delivered
                ({stats.delivered.total} / {stats.total})
              </p>
            </div>

            {stats.monthlyStats.length > 0 && (
              <div className="feature-summary-monthly">
                <h3>Monthly Breakdown</h3>
                <div className="table-container">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Total</th>
                        <th>Delivered</th>
                        <th>Pending</th>
                        <th>Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.monthlyStats.map((entry) => (
                        <tr key={entry.month}>
                          <td>{formatMonth(entry.month)}</td>
                          <td>{entry.total}</td>
                          <td className="text-success">{entry.delivered}</td>
                          <td className="text-warning">{entry.pending}</td>
                          <td className="text-danger">{entry.rejected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stats.delivererStats.length > 0 && (
              <div className="feature-summary-deliverer-chart">
                <h3>Requests Delivered by DevSpace</h3>
                <div className="bar-chart">
                  {stats.delivererStats.map((entry) => {
                    const maxCount = stats.delivererStats[0].count;
                    const widthPercent = maxCount > 0 ? Math.round((entry.count / maxCount) * 100) : 0;
                    return (
                      <div className="bar-chart-row" key={entry.deliverer}>
                        <span className="bar-chart-label">{entry.deliverer}</span>
                        <div className="bar-chart-track">
                          <div
                            className="bar-chart-fill"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="bar-chart-value">{entry.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
