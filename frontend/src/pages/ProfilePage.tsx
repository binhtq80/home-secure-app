import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setAvatarUrl(data.url);
    } catch {
      // No avatar yet
    }
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

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>My Profile</h2>

        {error && <div className="error-message">{error}</div>}

        {profile && (
          <div className="profile-layout">
            <div className="settings-card profile-avatar-card">
              <div className="profile-avatar-section">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="User avatar" className="profile-avatar-large" />
                ) : (
                  <div className="profile-avatar-placeholder">
                    <span>{profile.username.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <h3 className="profile-username">{profile.username}</h3>
                <p className="profile-email">{profile.email}</p>
                <button
                  onClick={() => navigate('/settings')}
                  className="btn-secondary profile-edit-btn"
                >
                  Edit Avatar
                </button>
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
      </main>
    </div>
  );
}
