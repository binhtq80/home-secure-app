import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AppHeader } from '../components/AppHeader';

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Account</h2>
        <p className="settings-subtitle">Your login details and session information.</p>

        <div className="settings-card">
          <h3>Login Information</h3>
          <div className="account-info">
            <div className="account-info-row">
              <span className="account-info-label">Username</span>
              <span className="account-info-value">{user?.username ?? '—'}</span>
            </div>
            <div className="account-info-row">
              <span className="account-info-label">Email</span>
              <span className="account-info-value">{user?.email ?? '—'}</span>
            </div>
            <div className="account-info-row">
              <span className="account-info-label">Role</span>
              <span className="account-info-value">{user?.role ?? '—'}</span>
            </div>
            <div className="account-info-row">
              <span className="account-info-label">Last Login</span>
              <span className="account-info-value">{user?.lastSeenAgo ?? 'First session'}</span>
            </div>
            <div className="account-info-row">
              <span className="account-info-label">Login Count</span>
              <span className="account-info-value">{user?.loginCount ?? 0}</span>
            </div>
            <div className="account-info-row">
              <span className="account-info-label">Account Created</span>
              <span className="account-info-value">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
              </span>
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
