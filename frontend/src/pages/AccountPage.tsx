import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usersApi, avatarApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  previousLoginAt: string | null;
  loginCount: number;
  memberDays: number;
  lastSeenAgo: string | null;
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadProfile();
    loadAvatar();
  }, []);

  const loadProfile = async () => {
    try {
      if (!user?.id) return;
      const data = await usersApi.getProfile(user.id);
      setProfile(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadAvatar = async () => {
    try {
      const data = await avatarApi.get();
      setAvatarUrl(`data:${data.mimeType};base64,${data.image}`);
    } catch {
      // No avatar yet
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setAvatarUploading(true);
      setError('');
      setSuccess('');
      try {
        await avatarApi.update(base64, file.type);
        const data = await avatarApi.get();
        setAvatarUrl(`data:${data.mimeType};base64,${data.image}`);
        setSuccess('Avatar updated successfully!');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to upload avatar');
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading account...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Account</h2>
        <p className="settings-subtitle">Your profile, avatar, and session information.</p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {profile && (
          <div className="profile-layout">
            <div className="settings-card profile-avatar-card">
              <div className="profile-avatar-section">
                <div className="avatar-preview" onClick={handleAvatarClick} role="button" tabIndex={0} aria-label="Change avatar" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAvatarClick(); }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="User avatar" className="profile-avatar-large" />
                  ) : (
                    <div className="profile-avatar-placeholder">
                      <span>{profile.username.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  {avatarUploading && <div className="avatar-uploading">Uploading...</div>}
                </div>
                <h3 className="profile-username">{profile.username}</h3>
                <p className="profile-email">{profile.email}</p>
                <p className="form-help">Click avatar to change. JPEG, PNG, WebP. Max 2MB.</p>
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

            <div className="settings-card profile-details-card">
              <h3>Account Details</h3>
              <dl className="profile-details-list">
                <div className="profile-detail-row">
                  <dt>Username</dt>
                  <dd>{profile.username}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Email</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Role</dt>
                  <dd>{user?.role ?? '—'}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Member Since</dt>
                  <dd>{formatDate(profile.createdAt)}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Membership Duration</dt>
                  <dd>{profile.memberDays} day{profile.memberDays !== 1 ? 's' : ''}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Last Login</dt>
                  <dd>{profile.lastSeenAgo || formatDate(profile.lastLoginAt)}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Previous Login</dt>
                  <dd>{formatDate(profile.previousLoginAt)}</dd>
                </div>
                <div className="profile-detail-row">
                  <dt>Total Logins</dt>
                  <dd>{profile.loginCount}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        <div className="settings-card">
          <h3>Appearance</h3>
          <div className="settings-appearance">
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <label htmlFor="darkModeToggle">Dark Mode</label>
                <p className="form-help">
                  Switch between light and dark theme.
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
          </div>
        </div>

        <div className="settings-card">
          <h3>Session</h3>
          <p className="form-help">
            You are currently signed in. Click below to end your session.
          </p>
          <button onClick={handleLogout} className="btn-danger" style={{ marginTop: '1rem' }}>
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
