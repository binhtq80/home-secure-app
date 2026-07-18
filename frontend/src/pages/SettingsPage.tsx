import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { settingsApi, avatarApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  const [loading, setLoading] = useState(true);
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
      await settingsApi.get();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Settings</h2>
        <p className="settings-subtitle">Configure your preferences.</p>

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

      </main>
    </div>
  );
}
