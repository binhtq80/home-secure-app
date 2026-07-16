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
  description?: string;
  status?: 'on' | 'off';
  monthlyBudgetKwh?: number;
}

interface HistoryEntry {
  deviceId: string;
  timestamp: string;
  oldValues: Record<string, string | null>;
  newValues: Record<string, string>;
  changedFields: string[];
  changedBy: string;
  changedAt: string;
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

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    deviceType: '',
    brand: '',
    model: '',
    color: '',
    condition: '',
    description: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (deviceId) {
      loadEnergyData(deviceId);
      loadHistory(deviceId);
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

  const loadHistory = async (id: string) => {
    setHistoryLoading(true);
    try {
      const data = await devicesApi.getHistory(id);
      setHistory(data.history || []);
    } catch {
      // History may not exist yet, that's fine
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStartEdit = () => {
    if (device) {
      setEditForm({
        deviceType: device.deviceType || '',
        brand: device.brand || '',
        model: device.model || '',
        color: device.color || '',
        condition: device.condition || '',
        description: device.description || '',
      });
      setIsEditing(true);
      setEditSuccess('');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditSuccess('');
  };

  const handleSaveEdit = async () => {
    if (!deviceId) return;
    setSavingEdit(true);
    setError('');
    setEditSuccess('');

    try {
      const result = await devicesApi.update(deviceId, editForm);
      setDevice(result.device);
      setIsEditing(false);
      setEditSuccess('Device updated successfully!');
      setTimeout(() => setEditSuccess(''), 3000);
      // Reload history
      loadHistory(deviceId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSavingEdit(false);
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

  const handleToggleStatus = async () => {
    if (!deviceId || !device) return;
    const newStatus = device.status === 'on' ? 'off' : 'on';
    try {
      await devicesApi.update(deviceId, { status: newStatus });
      setDevice({ ...device, status: newStatus });
      loadHistory(deviceId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle device status');
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
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <button className="btn-back" onClick={() => navigate('/devices')}>← Back to Devices</button>

        {error && <div className="error-message">{error}</div>}
        {editSuccess && <div className="success-message">{editSuccess}</div>}

        {/* Device Info */}
        <div className="device-detail-header">
          <div className="device-detail-title-row">
            <h2>{device?.brand} {device?.model !== 'Unknown' ? device?.model : device?.deviceType}</h2>
            <div className="device-detail-actions">
              <button
                className={`btn-status-toggle ${device?.status === 'on' ? 'status-on' : 'status-off'}`}
                onClick={handleToggleStatus}
                aria-label={`Turn device ${device?.status === 'on' ? 'off' : 'on'}`}
                title={`Device is ${device?.status === 'on' ? 'ON' : 'OFF'} — click to toggle`}
              >
                {device?.status === 'on' ? '🟢 ON' : '🔴 OFF'}
              </button>
              {!isEditing && (
                <button className="btn-primary btn-edit-device" onClick={handleStartEdit}>
                  ✏️ Edit
                </button>
              )}
            </div>
          </div>
          <p className="device-detail-meta">
            <span className="device-type-badge">{device?.deviceType}</span>
            <span>Color: {device?.color}</span>
            <span>Condition: {device?.condition}</span>
          </p>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <div className="edit-device-card">
            <h3>Edit Device</h3>
            <div className="edit-device-form">
              <div className="edit-field">
                <label htmlFor="edit-deviceType">Device Type</label>
                <input
                  id="edit-deviceType"
                  type="text"
                  value={editForm.deviceType}
                  onChange={(e) => setEditForm({ ...editForm, deviceType: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-brand">Brand</label>
                <input
                  id="edit-brand"
                  type="text"
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-model">Model</label>
                <input
                  id="edit-model"
                  type="text"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-color">Color</label>
                <input
                  id="edit-color"
                  type="text"
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-condition">Condition</label>
                <select
                  id="edit-condition"
                  value={editForm.condition}
                  onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div className="edit-field">
                <label htmlFor="edit-description">Description</label>
                <textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="edit-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Change History */}
        <div className="history-card">
          <h3>📋 Change History</h3>
          {historyLoading ? (
            <p className="loading-text">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="history-empty">No changes recorded yet.</p>
          ) : (
            <div className="history-timeline">
              {history.map((entry) => (
                <div key={entry.timestamp} className="history-entry">
                  <div className="history-entry-dot" />
                  <div className="history-entry-content">
                    <div className="history-entry-time">
                      {new Date(entry.changedAt).toLocaleString()}
                    </div>
                    <div className="history-entry-changes">
                      {entry.changedFields.map((field) => (
                        <div key={field} className="history-change-item">
                          <span className="history-field-name">{field}:</span>
                          <span className="history-old-value">{entry.oldValues[field] || '(empty)'}</span>
                          <span className="history-arrow">→</span>
                          <span className="history-new-value">{entry.newValues[field]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
