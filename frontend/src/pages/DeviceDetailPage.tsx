import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { devicesApi } from '../services/api';

interface MonthlyEnergy {
  month: string;
  label: string;
  kwh: number;
  cost: number;
}

interface EnergyData {
  totalKwh: number;
  avgMonthlyKwh: number;
  estimatedMonthlyCost: number;
  costPerKwh: number;
  monthly: MonthlyEnergy[];
}

interface DeviceInfo {
  id: string;
  deviceType: string;
  brand: string;
  model: string;
  color: string;
  condition: string;
}

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deviceId) {
      loadEnergyData(deviceId);
    }
  }, [deviceId]);

  const loadEnergyData = async (id: string) => {
    try {
      const data = await devicesApi.getEnergy(id);
      setDevice(data.device);
      setEnergy(data.energy);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load energy data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading energy data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-main">
          <div className="error-message">{error}</div>
          <button className="btn-secondary" onClick={() => navigate('/devices')}>← Back to Devices</button>
        </div>
      </div>
    );
  }

  const maxKwh = energy ? Math.max(...energy.monthly.map((m) => m.kwh)) : 0;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>MyApp</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav">Devices</button>
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <button className="btn-back" onClick={() => navigate('/devices')}>← Back to Devices</button>

        {/* Device Info */}
        <div className="device-detail-header">
          <h2>{device?.brand} {device?.model !== 'Unknown' ? device?.model : device?.deviceType}</h2>
          <p className="device-detail-meta">
            <span className="device-type-badge">{device?.deviceType}</span>
            <span>Color: {device?.color}</span>
            <span>Condition: {device?.condition}</span>
          </p>
        </div>

        {/* Energy Stats */}
        <div className="energy-stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>Total Consumption</h3>
              <p className="stat-value">{energy?.totalKwh} kWh</p>
              <p className="stat-subtitle">Last 12 months</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>Monthly Average</h3>
              <p className="stat-value">{energy?.avgMonthlyKwh} kWh</p>
              <p className="stat-subtitle">Per month</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Estimated Cost</h3>
              <p className="stat-value">${energy?.estimatedMonthlyCost}/month</p>
              <p className="stat-subtitle">@ ${energy?.costPerKwh}/kWh</p>
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="energy-chart-card">
          <h3>Energy Consumption (Last 12 Months)</h3>
          <div className="chart-container">
            {energy?.monthly.map((month) => (
              <div key={month.month} className="chart-bar-wrapper">
                <div className="chart-bar-value">{month.kwh}</div>
                <div className="chart-bar-track">
                  <div
                    className="chart-bar"
                    style={{ height: `${(month.kwh / maxKwh) * 100}%` }}
                  />
                </div>
                <div className="chart-bar-label">{month.label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
