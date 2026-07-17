import { useState, useEffect, useCallback, useRef } from 'react';
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

const TERMINAL_STATUSES = ['delivered', 'failed', 'rejected'];
const POLL_INTERVAL_MS = 5000;

function isTerminalStatus(feature: FeatureRequest | null): boolean {
  if (!feature) return false;
  const effectiveStatus = feature.currentStep || feature.status;
  return TERMINAL_STATUSES.includes(effectiveStatus);
}

export function FeatureDetailPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { featureId } = useParams<{ featureId: string }>();
  const [feature, setFeature] = useState<FeatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [approving, setApproving] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFeature = useCallback(async (showRefreshing = false) => {
    if (!featureId) return;
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await featuresApi.getById(featureId);
      setFeature(data.feature || data);
      setError('');
      setLastRefreshed(new Date());
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

  // Auto-polling: refresh every 5 seconds while status is not terminal
  useEffect(() => {
    if (loading) return;

    if (isTerminalStatus(feature)) {
      // Stop polling when terminal state is reached
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setPolling(false);
      return;
    }

    // Start polling
    setPolling(true);
    pollIntervalRef.current = setInterval(() => {
      loadFeature();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [feature, loading, loadFeature]);

  const handleRefresh = () => {
    loadFeature(true);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleApprove = async () => {
    if (!featureId) return;
    setApproving(true);
    setError('');
    try {
      await featuresApi.approve(featureId, 'approve');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve feature');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!featureId) return;
    setApproving(true);
    setError('');
    try {
      await featuresApi.approve(featureId, 'reject', rejectFeedback || undefined);
      setShowRejectForm(false);
      setRejectFeedback('');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject feature');
    } finally {
      setApproving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'deployed':
      case 'delivered': return 'success';
      case 'failed':
      case 'rejected': return 'error';
      case 'in-progress':
      case 'implementing': return 'active';
      case 'awaiting_approval': return 'warning';
      default: return 'pending';
    }
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
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <div className="feature-detail-header">
          <button onClick={() => navigate('/submit-feature')} className="btn-back" aria-label="Back to feature requests">
            ← Back to Requests
          </button>
          <h2>Feature Request Details</h2>
          <div className="feature-detail-refresh-group">
            {lastRefreshed && (
              <span className="feature-last-refreshed">
                Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className={`btn-refresh ${refreshing ? 'btn-refresh-spinning' : ''}`}
              disabled={refreshing}
              aria-label="Refresh progress"
            >
              {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading && (
          <div className="feature-detail-loading">
            <div className="feature-detail-spinner" />
            <p>Loading feature details...</p>
          </div>
        )}

        {!loading && feature && (
          <div className="feature-detail-card">
            <div className="feature-detail-info">
              <div className="feature-detail-row">
                <span className="feature-detail-label">Ticket</span>
                <span className="feature-detail-value">
                  <code className="feature-ticket-code">#{feature.id.slice(0, 8)}</code>
                </span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Status</span>
                <span className="feature-status-badge-wrapper">
                  <span className={`feature-status-badge feature-badge-${getStatusColor(feature.currentStep || feature.status)}`}>
                    {feature.currentStep || feature.status}
                  </span>
                  {polling && (
                    <span className="feature-polling-indicator" title="Live tracking active — refreshing every 5s">
                      <span className="feature-polling-dot" />
                    </span>
                  )}
                </span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Submitted</span>
                <span className="feature-detail-value">{new Date(feature.createdAt).toLocaleString()}</span>
              </div>
              <div className="feature-detail-row">
                <span className="feature-detail-label">Description</span>
                <span className="feature-detail-value feature-detail-description">{feature.description}</span>
              </div>
            </div>

            <div className="feature-detail-progress">
              <h3>📋 Progress History</h3>
              {feature.steps && feature.steps.length > 0 ? (
                <div className="feature-timeline feature-timeline-full">
                  {feature.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`feature-timeline-step ${idx === feature.steps!.length - 1 ? 'feature-timeline-step-latest' : ''}`}
                    >
                      <span className={`feature-timeline-dot ${idx === feature.steps!.length - 1 ? 'feature-timeline-dot-latest' : ''}`} />
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
                <div className="feature-no-steps">
                  <p>No progress updates yet.</p>
                  <p className="feature-no-steps-hint">Click the <strong>Refresh</strong> button to check for new updates.</p>
                </div>
              )}
            </div>

            {(feature.currentStep === 'awaiting_approval' || feature.status === 'awaiting_approval') && (
              <div className="feature-approval-section">
                <h3>🔒 Pipeline Approval Required</h3>
                <p className="feature-approval-description">
                  The deployment pipeline is waiting for manual approval. Review the changes and approve or reject.
                </p>

                {!showRejectForm ? (
                  <div className="feature-approval-actions">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="btn-approve"
                    >
                      {approving ? 'Processing...' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={approving}
                      className="btn-reject"
                    >
                      ✗ Reject
                    </button>
                  </div>
                ) : (
                  <div className="feature-reject-form">
                    <label htmlFor="reject-feedback" className="feature-reject-label">
                      Rejection feedback (optional):
                    </label>
                    <textarea
                      id="reject-feedback"
                      className="feature-reject-textarea"
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      placeholder="Explain why this feature is being rejected..."
                      rows={4}
                    />
                    <div className="feature-approval-actions">
                      <button
                        onClick={handleReject}
                        disabled={approving}
                        className="btn-reject"
                      >
                        {approving ? 'Processing...' : '✗ Confirm Rejection'}
                      </button>
                      <button
                        onClick={() => { setShowRejectForm(false); setRejectFeedback(''); }}
                        disabled={approving}
                        className="btn-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && !feature && !error && (
          <div className="error-message">Feature request not found.</div>
        )}
      </main>
    </div>
  );
}
