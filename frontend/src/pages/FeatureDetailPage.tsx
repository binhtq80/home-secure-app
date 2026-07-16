import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { featuresApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';

interface FeatureStep {
  time: string;
  detail: string;
}

interface FeatureRequest {
  id: string;
  description: string;
  status: string;
  currentStep?: string;
  steps?: FeatureStep[];
  createdAt: string;
}

export function FeatureDetailPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { featureId } = useParams<{ featureId: string }>();
  const [feature, setFeature] = useState<FeatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadFeature = useCallback(async (showRefreshing = false) => {
    if (!featureId) return;
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await featuresApi.getById(featureId);
      setFeature(data.feature || data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feature details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [featureId]);

  useEffect(() => {
    loadFeature();
  }, [loadFeature]);

  const handleRefresh = () => {
    loadFeature(true);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
        <div className="feature-detail-header">
          <button onClick={() => navigate('/submit-feature')} className="btn-back" aria-label="Back to feature requests">
            ← Back
          </button>
          <h2>Feature Request Details</h2>
          <button
            onClick={handleRefresh}
            className="btn-refresh"
            disabled={refreshing}
            aria-label="Refresh progress"
          >
            {refreshing ? '⟳ Refreshing...' : '⟳ Refresh'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading && <div className="loading-message">Loading feature details...</div>}

        {!loading && feature && (
          <div className="feature-detail-card">
            <div className="feature-detail-info">
              <div className="feature-detail-row">
                <span className="feature-detail-label">Ticket</span>
                <span className="feature-detail-value feature-ticket">#{feature.id.slice(0, 8)}</span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Status</span>
                <span className={`feature-status-badge feature-badge-${feature.currentStep || feature.status}`}>
                  {feature.currentStep || feature.status}
                </span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Submitted</span>
                <span className="feature-detail-value">{new Date(feature.createdAt).toLocaleString()}</span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Description</span>
                <span className="feature-detail-value">{feature.description}</span>
              </div>
            </div>

            <div className="feature-detail-progress">
              <h3>Progress History</h3>
              {feature.steps && feature.steps.length > 0 ? (
                <div className="feature-timeline feature-timeline-full">
                  {feature.steps.map((step, idx) => (
                    <div key={idx} className="feature-timeline-step">
                      <span className="feature-timeline-dot" />
                      <div className="feature-timeline-content">
                        <span className="feature-timeline-time">
                          {new Date(step.time).toLocaleString()}
                        </span>
                        <span className="feature-timeline-detail">{step.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="feature-no-steps">No progress updates yet. Click Refresh to check for updates.</p>
              )}
            </div>
          </div>
        )}

        {!loading && !feature && !error && (
          <div className="error-message">Feature request not found.</div>
        )}
      </main>
    </div>
  );
}
