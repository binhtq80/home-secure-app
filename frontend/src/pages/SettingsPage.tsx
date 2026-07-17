import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { settingsApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';

export function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [costPerKwh, setCostPerKwh] = useState('0.20');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await settingsApi.get();
      setCostPerKwh(data.settings.costPerKwh.toString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    const value = parseFloat(costPerKwh);
    if (isNaN(value) || value < 0 || value > 10) {
      setError('Cost per kWh must be a number between 0 and 10');
      setSaving(false);
      return;
    }

    try {
      await settingsApi.update({ costPerKwh: value });
      setSuccess('Settings saved successfully!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading settings...</p>
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
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav active">Settings</button>
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <h2>Settings</h2>
        <p className="settings-subtitle">Configure your energy monitoring preferences.</p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="costPerKwh">Energy Cost per kWh (AUD)</label>
              <div className="input-with-unit">
                <span className="input-prefix">$</span>
                <input
                  id="costPerKwh"
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={costPerKwh}
                  onChange={(e) => setCostPerKwh(e.target.value)}
                  placeholder="0.20"
                  required
                />
                <span className="input-suffix">/ kWh</span>
              </div>
              <p className="form-help">
                Australian average is ~$0.20-0.35/kWh. This is used to calculate estimated costs on device energy pages.
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
