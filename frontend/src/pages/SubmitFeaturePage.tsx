import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
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

export function SubmitFeaturePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successTicket, setSuccessTicket] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      const data = await featuresApi.list();
      setFeatures(data.features);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessTicket(null);

    if (!description.trim()) {
      setError('Please enter a feature description.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await featuresApi.create(description);
      setSuccessTicket(data.id);
      setDescription('');
      loadFeatures();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit feature request');
    } finally {
      setSubmitting(false);
    }
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
          <button onClick={() => navigate('/submit-feature')} className="btn-nav active">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <h2>Request a Feature</h2>
        <p className="settings-subtitle">Submit your ideas to improve MyApp.</p>

        {error && <div className="error-message">{error}</div>}
        {successTicket && (
          <div className="success-message">
            ✅ Feature request submitted! Your ticket number: <strong>{successTicket}</strong>
          </div>
        )}

        <div className="feature-form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="feature-description">Describe the feature you'd like</label>
              <textarea
                id="feature-description"
                className="feature-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="I'd like to be able to..."
                rows={5}
              />
            </div>
            <button type="submit" className="btn-primary btn-submit-feature" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>

        {!loading && features.length > 0 && (
          <div className="feature-list-section">
            <h3>Your Previous Requests</h3>
            <p className="feature-list-hint">Click on a request to view full progress history</p>
            <div className="feature-list">
              {features.map((f) => (
                <div
                  key={f.id}
                  className="feature-list-item feature-list-item-clickable"
                  onClick={() => navigate(`/submit-feature/${f.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/submit-feature/${f.id}`); }}
                  aria-label={`View details for feature request ${f.id.slice(0, 8)}`}
                >
                  <div className="feature-list-item-content">
                    <div className="feature-list-description">{f.description}</div>
                    <div className="feature-list-meta">
                      <span className="feature-ticket">#{f.id.slice(0, 8)}</span>
                      <span className={`feature-status-badge feature-badge-${f.currentStep || f.status}`}>
                        {f.currentStep || f.status}
                      </span>
                      <span className="feature-date">{new Date(f.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="feature-list-arrow" aria-hidden="true">→</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
