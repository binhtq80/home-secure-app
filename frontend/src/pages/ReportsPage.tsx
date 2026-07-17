import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { reportsApi, devicesApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';
import { RoleBadge } from '../components/RoleBadge';

interface DeviceMonth {
  id: string;
  name: string;
  kwh: number;
}

interface MonthlyData {
  month: string;
  label: string;
  totalKwh: number;
  totalCost: number;
  devices: DeviceMonth[];
}

interface TopDevice {
  id: string;
  name: string;
  deviceType: string;
  totalKwh: number;
  totalCost: number;
}

interface Summary {
  totalKwh: number;
  totalCost: number;
  deviceCount: number;
  costPerKwh: number;
}

interface DeviceInfo {
  id: string;
  deviceType: string;
  brand: string;
  model: string;
  monthlyBudgetKwh?: number;
}

interface ComparisonRow {
  id: string;
  name: string;
  deviceType: string;
  monthlyAvgKwh: number;
  monthlyAvgCost: number;
  budgetStatus: 'over' | 'under' | 'no-budget';
}

// Generate consistent colors for devices
const DEVICE_COLORS = [
  '#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export function ReportsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [topDevices, setTopDevices] = useState<TopDevice[]>([]);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      const [reportData, devicesData] = await Promise.all([
        reportsApi.getEnergyReport(),
        devicesApi.list(),
      ]);

      setSummary(reportData.summary);
      setTopDevices(reportData.topDevices);
      setMonthly(reportData.monthly);

      // Build comparison data
      const devices: DeviceInfo[] = devicesData.devices || [];
      const monthlyArr: MonthlyData[] = reportData.monthly || [];
      const costPerKwh = reportData.summary?.costPerKwh || 0.20;
      const monthCount = monthlyArr.length || 1;

      // Build device totals from monthly data
      const deviceTotals: Record<string, { totalKwh: number; name: string }> = {};
      for (const month of monthlyArr) {
        for (const d of month.devices) {
          if (!deviceTotals[d.id]) {
            deviceTotals[d.id] = { totalKwh: 0, name: d.name };
          }
          deviceTotals[d.id].totalKwh += d.kwh;
        }
      }

      // Build comparison rows
      const rows: ComparisonRow[] = Object.entries(deviceTotals).map(([id, data]) => {
        const device = devices.find((d) => d.id === id);
        const monthlyAvgKwh = Math.round((data.totalKwh / monthCount) * 10) / 10;
        const monthlyAvgCost = Math.round(monthlyAvgKwh * costPerKwh * 100) / 100;

        let budgetStatus: 'over' | 'under' | 'no-budget' = 'no-budget';
        if (device?.monthlyBudgetKwh) {
          budgetStatus = monthlyAvgKwh > device.monthlyBudgetKwh ? 'over' : 'under';
        }

        return {
          id,
          name: data.name,
          deviceType: device?.deviceType || 'unknown',
          monthlyAvgKwh,
          monthlyAvgCost,
          budgetStatus,
        };
      });

      // Sort by highest cost first
      rows.sort((a, b) => b.monthlyAvgCost - a.monthlyAvgCost);
      setComparisonData(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get max total for chart scaling
  const maxTotal = monthly.length > 0
    ? Math.max(...monthly.map((m) => m.totalKwh))
    : 0;

  // Build a color map for devices
  const deviceColorMap: Record<string, string> = {};
  if (monthly.length > 0 && monthly[0].devices) {
    monthly[0].devices.forEach((d, i) => {
      deviceColorMap[d.id] = DEVICE_COLORS[i % DEVICE_COLORS.length];
    });
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading energy report...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Home Energy Management</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav active">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav">Settings</button>
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <button onClick={() => navigate('/profile')} className="btn-nav">Profile</button>
          <RoleBadge />
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <h2>Monthly Energy Report</h2>
        <p className="report-subtitle">Summary across all {summary?.deviceCount} devices (last 12 months)</p>

        {error && <div className="error-message">{error}</div>}

        {/* Summary Cards */}
        <div className="energy-stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>Total Consumption</h3>
              <p className="stat-value">{summary?.totalKwh} kWh</p>
              <p className="stat-subtitle">All devices, 12 months</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Total Cost</h3>
              <p className="stat-value">${summary?.totalCost}</p>
              <p className="stat-subtitle">@ ${summary?.costPerKwh}/kWh</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📱</div>
            <div className="stat-content">
              <h3>Devices Tracked</h3>
              <p className="stat-value">{summary?.deviceCount}</p>
              <p className="stat-subtitle">Active devices</p>
            </div>
          </div>
        </div>

        {/* Top 3 Most Expensive */}
        {topDevices.length > 0 && (
          <div className="report-section">
            <h3>🏆 Top 3 Most Expensive Devices</h3>
            <div className="top-devices-list">
              {topDevices.map((device, index) => (
                <div
                  key={device.id}
                  className="top-device-item"
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  <span className="top-device-rank">#{index + 1}</span>
                  <div className="top-device-info">
                    <span className="top-device-name">{device.name}</span>
                    <span className="top-device-type">{device.deviceType}</span>
                  </div>
                  <div className="top-device-stats">
                    <span className="top-device-kwh">{device.totalKwh} kWh</span>
                    <span className="top-device-cost">${device.totalCost}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stacked Bar Chart */}
        {monthly.length > 0 && (
          <div className="report-section">
            <h3>Energy Consumption by Device (Monthly)</h3>

            {/* Legend */}
            <div className="chart-legend">
              {monthly[0].devices.map((d) => (
                <div key={d.id} className="legend-item">
                  <span
                    className="legend-color"
                    style={{ backgroundColor: deviceColorMap[d.id] }}
                  />
                  <span className="legend-label">{d.name}</span>
                </div>
              ))}
            </div>

            {/* Stacked Bar Chart */}
            <div className="stacked-chart-container">
              {monthly.map((month) => (
                <div key={month.month} className="stacked-bar-wrapper">
                  <div className="stacked-bar-value">{month.totalKwh}</div>
                  <div className="stacked-bar-track">
                    {month.devices.map((d) => (
                      <div
                        key={d.id}
                        className="stacked-bar-segment"
                        style={{
                          height: `${maxTotal > 0 ? (d.kwh / maxTotal) * 100 : 0}%`,
                          backgroundColor: deviceColorMap[d.id],
                        }}
                        title={`${d.name}: ${d.kwh} kWh`}
                      />
                    ))}
                  </div>
                  <div className="stacked-bar-label">{month.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compare Devices Table */}
        {comparisonData.length > 0 && (
          <div className="report-section">
            <h3>📊 Compare Devices</h3>
            <div className="comparison-table-wrapper">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Device Name</th>
                    <th>Type</th>
                    <th>Monthly Avg kWh</th>
                    <th>Monthly Avg Cost</th>
                    <th>Budget Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr
                      key={row.id}
                      className={row.budgetStatus === 'over' ? 'over-budget-row' : ''}
                    >
                      <td className="comparison-device-name">{row.name}</td>
                      <td className="comparison-device-type">{row.deviceType}</td>
                      <td>{row.monthlyAvgKwh} kWh</td>
                      <td>${row.monthlyAvgCost}</td>
                      <td>
                        <span className={`budget-status-badge ${row.budgetStatus}`}>
                          {row.budgetStatus === 'over' && '🔴 Over Budget'}
                          {row.budgetStatus === 'under' && '🟢 Under Budget'}
                          {row.budgetStatus === 'no-budget' && '⚪ No Budget'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
