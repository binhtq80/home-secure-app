import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { featuresApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await featuresApi.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="main-content">
        <h1>Welcome{user?.username ? `, ${user.username}` : ''}!</h1>
        <p className="subtitle">This is your app platform. Submit feature requests and the orchestrator will build them automatically.</p>

        <div className="dashboard-cards">
          <div className="dashboard-card" onClick={() => navigate('/submit-feature')}>
            <h3>📝 Feature Requests</h3>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <p>{stats?.totalCount || 0} total • {stats?.deliveredCount || 0} delivered • {stats?.pendingCount || 0} pending</p>
            )}
          </div>

          <div className="dashboard-card" onClick={() => navigate('/feature-summary')}>
            <h3>📊 Feature Summary</h3>
            <p>View delivery stats and DevSpace performance</p>
          </div>

          <div className="dashboard-card" onClick={() => navigate('/settings')}>
            <h3>⚙️ Settings</h3>
            <p>Manage your preferences</p>
          </div>

          {user?.role === 'admin' && (
            <div className="dashboard-card" onClick={() => navigate('/admin')}>
              <h3>👑 Admin Panel</h3>
              <p>Manage user roles</p>
            </div>
          )}
        </div>

        <div className="dashboard-quickstart">
          <h2>🚀 Getting Started</h2>
          <ol>
            <li>Submit a feature request describing what you want to build</li>
            <li>A technical reviewer confirms the AI complexity classification</li>
            <li>A product manager approves the request</li>
            <li>The orchestrator automatically implements and deploys it</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
