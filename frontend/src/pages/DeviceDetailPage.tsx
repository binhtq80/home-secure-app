import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { devicesApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';

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
  monthlyBudgetKwh?: number;
}

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Budget state
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSuccess, setBudgetSuccess] = useState('');

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
      if (data.device.monthlyBudgetKwh) {
        setBudgetInput(data.device.monthlyBudgetKwh.toString());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load energy data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!deviceId) return;
    const value = parseFloat(budgetInput);
    if (isNaN(value) || value <= 0) {
      setError('Budget must be a positive number');
      return;
    }

    setSavingBudget(true);
    setBudgetSuccess('');
    setError('');

    try {
      await devicesApi.setBudget(deviceId, value);
      setBudgetSuccess('Budget saved!');
      if (device) {
        setDevice({ ...device, monthlyBudgetKwh: value });
      }
      setTimeout(() => setBudgetSuccess(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save budget');
    } finally {
      setSavingBudget(false);
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

  if (error && !device) {
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

  // Budget progress for current month
  const currentMonthKwh = energy?.monthly[energy.monthly.length - 1]?.kwh || 0;
  const budgetPercentage = device?.monthlyBudgetKwh
    ? Math.round((currentMonthKwh / device.monthlyBudgetKwh) * 100)
    : null;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>MyApp</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav">Settings</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <button className="btn-back" onClick={() => navigate('/devices')}>← Back to Devices</button>

        {error && <div className="error-message">{error}</div>}

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

        {/* Budget Setting */}
        <div className="budget-card">
          <h3>⚙️ Monthly Energy Budget</h3>
          <div className="budget-form">
            <div className="input-with-unit">
              <input
                type="number"
                step="1"
                min="1"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="e.g., 50"
              />
              <span className="input-suffix">kWh / month</span>
            </div>
            <button
              className="btn-primary btn-budget-save"
              onClick={handleSaveBudget}
              disabled={savingBudget}
            >
              {savingBudget ? 'Saving...' : 'Set Budget'}
            </button>
          </div>
          {budgetSuccess && <p className="budget-success">{budgetSuccess}</p>}

          {budgetPercentage !== null && (
            <div className="budget-progress-section">
              <div className="budget-progress-header">
                <span>This month: {currentMonthKwh} / {device?.monthlyBudgetKwh} kWh</span>
                <span className={`budget-percentage ${budgetPercentage >= 80 ? 'over-budget' : ''}`}>
                  {budgetPercentage}%
                </span>
              </div>
              <div className="budget-progress-bar">
                <div
                  className={`budget-progress-fill ${budgetPercentage >= 100 ? 'exceeded' : budgetPercentage >= 80 ? 'warning' : ''}`}
                  style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                />
              </div>
              {budgetPercentage >= 80 && budgetPercentage < 100 && (
                <p className="budget-warning">⚠️ Approaching budget limit!</p>
              )}
              {budgetPercentage >= 100 && (
                <p className="budget-exceeded">🚨 Budget exceeded!</p>
              )}
            </div>
          )}
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
