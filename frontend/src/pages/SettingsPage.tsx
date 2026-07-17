import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { settingsApi, avatarApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';
import { RoleBadge } from '../components/RoleBadge';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [costPerKwh, setCostPerKwh] = useState('0.20');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
    loadAvatar();
  }, []);

  const loadAvatar = async () => {
    try {
      const data = await avatarApi.get();
      setAvatarUrl(data.url);
    } catch {
      // No avatar yet — that's fine
    }
  };

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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Unsupported image type. Use JPEG, PNG, or WebP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image too large. Maximum size is 2MB.');
      return;
    }

    setError('');
    setAvatarUploading(true);

    try {
      const base64 = await fileToBase64(file);
      await avatarApi.update(base64, file.type);
      const data = await avatarApi.get();
      setAvatarUrl(data.url);
      setSuccess('Avatar updated successfully!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
        <h1>Open Home Energy Management</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav active">Settings</button>
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          {user?.role === 'admin' && <button onClick={() => navigate('/admin')} className="btn-nav">Admin</button>}
          <button onClick={() => navigate('/profile')} className="btn-nav">Profile</button>
          <RoleBadge />
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
          <h3>Profile Avatar</h3>
          <div className="avatar-section">
            <div className="avatar-preview" onClick={handleAvatarClick} role="button" tabIndex={0} aria-label="Change avatar" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAvatarClick(); }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="User avatar" className="avatar-image" />
              ) : (
                <div className="avatar-placeholder">
                  <span>📷</span>
                </div>
              )}
              {avatarUploading && <div className="avatar-uploading">Uploading...</div>}
            </div>
            <div className="avatar-info">
              <p>Click the avatar to upload a new image.</p>
              <p className="form-help">Accepted formats: JPEG, PNG, WebP. Max 2MB.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="settings-card">
          <h3>Appearance</h3>
          <div className="settings-appearance">
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <label htmlFor="darkModeToggle">Dark Mode</label>
                <p className="form-help">
                  Switch between light and dark theme. Your preference is saved locally.
                </p>
              </div>
              <button
                id="darkModeToggle"
                onClick={toggleTheme}
                className={`settings-toggle-switch ${theme === 'dark' ? 'active' : ''}`}
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label="Toggle dark mode"
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <p className="settings-current-theme">
              Current theme: <strong>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</strong>
            </p>
          </div>
        </div>

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
