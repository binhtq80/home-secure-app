import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'This is your first login!';
    const date = new Date(dateStr);
    return date.toLocaleString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSinceLastLogin = (dateStr: string | null) => {
    if (!dateStr) return null;
    const last = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = now - last;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const memberSince = (dateStr: string | undefined) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>MyApp</h1>
        <button onClick={handleLogout} className="btn-logout">
          Sign Out
        </button>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Welcome back, {user?.username}! 👋</h2>
          <p className="welcome-subtitle">
            {user?.lastLoginAt
              ? `Your last visit was ${getTimeSinceLastLogin(user.lastLoginAt)}`
              : "Great to see you! This is your first login."}
          </p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🕐</div>
            <div className="stat-content">
              <h3>Last Login</h3>
              <p className="stat-value">{formatDate(user?.lastLoginAt || null)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔑</div>
            <div className="stat-content">
              <h3>Total Logins</h3>
              <p className="stat-value">{user?.loginCount || 0}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <h3>Member Since</h3>
              <p className="stat-value">{memberSince(user?.createdAt)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📧</div>
            <div className="stat-content">
              <h3>Email</h3>
              <p className="stat-value">{user?.email}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
