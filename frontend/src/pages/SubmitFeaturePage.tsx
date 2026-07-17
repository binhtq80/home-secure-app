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
  source?: string;
  createdBy?: string;
  complexity?: string;
  complexityJustification?: string;
}

type Tab = 'all' | 'mine' | 'pending_approval';

export function SubmitFeaturePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successTicket, setSuccessTicket] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadFeatures();
  }, [activeTab]);

  const loadFeatures = async () => {
    setLoading(true);
    try {
      const data = await featuresApi.list('all');
      let filtered = data.features;
      if (activeTab === 'mine') {
        // Re-fetch with mine scope
        const mineData = await featuresApi.list('mine');
        filtered = mineData.features;
      } else if (activeTab === 'pending_approval') {
        filtered = data.features.filter((f: FeatureRequest) => f.status === 'pending_approval');
      }
      setFeatures(filtered);
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
      // Navigate to detail page so user can confirm the complexity
      navigate(`/submit-feature/${data.id}`);
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

  const handleAdminApprove = async (featureId: string) => {
    setActionInProgress(featureId);
    setError('');
    try {
      await featuresApi.adminApprove(featureId, 'approve');
      await loadFeatures();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve feature');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAdminReject = async (featureId: string) => {
    setActionInProgress(featureId);
    setError('');
    try {
      await featuresApi.adminApprove(featureId, 'reject', rejectReason || undefined);
      setRejectId(null);
      setRejectReason('');
      await loadFeatures();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject feature');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Home Energy Management</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav">Settings</button>
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav active">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <h2>Request a Feature</h2>
        <p className="settings-subtitle">Submit your ideas to improve Home Energy Management.</p>

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

        <div className="feature-list-section">
          <div className="feature-tabs">
            <button
              className={`feature-tab ${activeTab === 'all' ? 'feature-tab-active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Requests
            </button>
            <button
              className={`feature-tab ${activeTab === 'mine' ? 'feature-tab-active' : ''}`}
              onClick={() => setActiveTab('mine')}
            >
              My Requests
            </button>
            <button
              className={`feature-tab ${activeTab === 'pending_approval' ? 'feature-tab-active' : ''}`}
              onClick={() => setActiveTab('pending_approval')}
            >
              Pending Approval
            </button>
          </div>

          {loading && <p>Loading requests...</p>}

          {!loading && features.length === 0 && (
            <p className="feature-list-hint">No feature requests found.</p>
          )}

          {!loading && features.length > 0 && (
            <>
              <p className="feature-list-hint">
                {activeTab === 'pending_approval'
                  ? 'Review and approve or reject these feature requests'
                  : 'Click on a request to view full progress history'}
              </p>
              <div className="feature-list">
                {features.map((f) => (
                  <div
                    key={f.id}
                    className={`feature-list-item ${activeTab !== 'pending_approval' ? 'feature-list-item-clickable' : ''}`}
                    onClick={activeTab !== 'pending_approval' ? () => navigate(`/submit-feature/${f.id}`) : undefined}
                    role={activeTab !== 'pending_approval' ? 'button' : undefined}
                    tabIndex={activeTab !== 'pending_approval' ? 0 : undefined}
                    onKeyDown={activeTab !== 'pending_approval' ? (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/submit-feature/${f.id}`); } : undefined}
                    aria-label={activeTab !== 'pending_approval' ? `View details for feature request ${f.id.slice(0, 8)}` : undefined}
                  >
                    <div className="feature-list-item-content">
                      <div className="feature-list-description">{f.description}</div>
                      <div className="feature-list-meta">
                        <span className="feature-ticket">#{f.id.slice(0, 8)}</span>
                        <span className={`feature-status-badge feature-badge-${f.currentStep || f.status}`}>
                          {f.currentStep || f.status}
                        </span>
                        <span className="feature-date">{new Date(f.createdAt).toLocaleDateString()}</span>
                        {activeTab === 'all' && f.source && (
                          <span className="feature-source-badge">{f.source}</span>
                        )}
                        {activeTab === 'all' && f.createdBy && (
                          <span className="feature-created-by" title={f.createdBy}>
                            by {f.createdBy.length > 12 ? f.createdBy.slice(0, 12) + '…' : f.createdBy}
                          </span>
                        )}
                      </div>
                      {activeTab === 'pending_approval' && (
                        <div className="feature-approval-inline">
                          <div className="feature-approval-details">
                            {f.complexity && (
                              <span className="feature-approval-complexity">
                                Complexity: <strong>{f.complexity}</strong>
                              </span>
                            )}
                            {f.complexityJustification && (
                              <span className="feature-approval-justification">
                                {f.complexityJustification}
                              </span>
                            )}
                          </div>
                          {rejectId === f.id ? (
                            <div className="feature-reject-inline-form">
                              <input
                                type="text"
                                className="feature-reject-inline-input"
                                placeholder="Reason for rejection (optional)"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                              />
                              <button
                                className="btn-reject btn-sm"
                                disabled={actionInProgress === f.id}
                                onClick={() => handleAdminReject(f.id)}
                              >
                                {actionInProgress === f.id ? '...' : 'Confirm Reject'}
                              </button>
                              <button
                                className="btn-cancel btn-sm"
                                onClick={() => { setRejectId(null); setRejectReason(''); }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="feature-approval-actions-inline">
                              <button
                                className="btn-approve btn-sm"
                                disabled={actionInProgress === f.id}
                                onClick={() => handleAdminApprove(f.id)}
                              >
                                {actionInProgress === f.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                className="btn-reject btn-sm"
                                disabled={actionInProgress === f.id}
                                onClick={() => setRejectId(f.id)}
                              >
                                ✗ Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {activeTab !== 'pending_approval' && (
                      <span className="feature-list-arrow" aria-hidden="true">→</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
