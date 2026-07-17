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
  suggestedComplexity?: string;
  complexityJustification?: string;
  complexity?: string;
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
  const [confirming, setConfirming] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideLevel, setOverrideLevel] = useState('');
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

  const handleAdminApproveAction = async () => {
    if (!featureId) return;
    setApproving(true);
    setError('');
    try {
      await featuresApi.adminApprove(featureId, 'approve');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve feature');
    } finally {
      setApproving(false);
    }
  };

  const handleAdminRejectAction = async () => {
    if (!featureId) return;
    setApproving(true);
    setError('');
    try {
      await featuresApi.adminApprove(featureId, 'reject', rejectFeedback || undefined);
      setShowRejectForm(false);
      setRejectFeedback('');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject feature');
    } finally {
      setApproving(false);
    }
  };

  const handleAcceptComplexity = async () => {
    if (!featureId) return;
    setConfirming(true);
    setError('');
    try {
      await featuresApi.confirm(featureId, 'accept');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm complexity');
    } finally {
      setConfirming(false);
    }
  };

  const handleOverrideComplexity = async () => {
    if (!featureId || !overrideLevel) return;
    setConfirming(true);
    setError('');
    try {
      await featuresApi.confirm(featureId, 'override', overrideLevel);
      setShowOverrideForm(false);
      setOverrideLevel('');
      await loadFeature();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to override complexity');
    } finally {
      setConfirming(false);
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
      case 'awaiting_approval':
      case 'pending_confirmation':
      case 'pending_approval': return 'warning';
      case 'classifying': return 'active';
      default: return 'pending';
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

            {(feature.currentStep === 'pending_confirmation' || feature.status === 'pending_confirmation') && feature.suggestedComplexity && (
              <div className="feature-approval-section">
                <h3>🤖 AI Complexity Classification</h3>
                <p className="feature-approval-description">
                  The AI has analyzed your feature request and suggested a complexity level. You can accept or override it.
                </p>
                <div className="feature-detail-row">
                  <span className="feature-detail-label">Suggested Complexity</span>
                  <span className={`feature-status-badge feature-badge-complexity-${feature.suggestedComplexity}`}>
                    {feature.suggestedComplexity}
                  </span>
                </div>
                <div className="feature-detail-row">
                  <span className="feature-detail-label">Justification</span>
                  <span className="feature-detail-value">{feature.complexityJustification}</span>
                </div>

                {!showOverrideForm ? (
                  <div className="feature-approval-actions">
                    <button
                      onClick={handleAcceptComplexity}
                      disabled={confirming}
                      className="btn-approve"
                    >
                      {confirming ? 'Processing...' : '✓ Accept'}
                    </button>
                    <button
                      onClick={() => setShowOverrideForm(true)}
                      disabled={confirming}
                      className="btn-reject"
                    >
                      ✎ Override
                    </button>
                  </div>
                ) : (
                  <div className="feature-reject-form">
                    <label htmlFor="override-complexity" className="feature-reject-label">
                      Select complexity level:
                    </label>
                    <select
                      id="override-complexity"
                      className="feature-override-select"
                      value={overrideLevel}
                      onChange={(e) => setOverrideLevel(e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      <option value="simple">Simple</option>
                      <option value="medium">Medium</option>
                      <option value="complex">Complex</option>
                      <option value="highly-complex">Highly Complex</option>
                    </select>
                    <div className="feature-approval-actions">
                      <button
                        onClick={handleOverrideComplexity}
                        disabled={confirming || !overrideLevel}
                        className="btn-approve"
                      >
                        {confirming ? 'Processing...' : '✓ Confirm Override'}
                      </button>
                      <button
                        onClick={() => { setShowOverrideForm(false); setOverrideLevel(''); }}
                        disabled={confirming}
                        className="btn-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {feature.complexity && (
              <div className="feature-detail-row">
                <span className="feature-detail-label">Final Complexity</span>
                <span className={`feature-status-badge feature-badge-complexity-${feature.complexity}`}>
                  {feature.complexity}
                </span>
              </div>
            )}

            {(feature.currentStep === 'awaiting_approval' || feature.status === 'awaiting_approval') && (
              <div className="feature-approval-section">
                <h3>🚀 Pipeline E2EApproval Required</h3>
                <div className="feature-pipeline-status-context">
                  <span className="feature-pipeline-status-icon">⏳</span>
                  <span className="feature-pipeline-status-text">
                    Pipeline deployed and waiting for approval — the CDK Pipeline has completed deployment and is paused at the <strong>E2EApproval</strong> manual approval step.
                  </span>
                </div>
                <p className="feature-approval-description">
                  Review the deployed changes and approve or reject the pipeline to continue.
                </p>

                {!showRejectForm ? (
                  <div className="feature-approval-actions">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="btn-approve"
                    >
                      {approving ? 'Processing...' : '✓ Approve Pipeline Deploy'}
                    </button>
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={approving}
                      className="btn-reject"
                    >
                      ✗ Reject Pipeline Deploy
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
                      placeholder="Explain why this pipeline deploy is being rejected..."
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

            {(feature.currentStep === 'pending_approval' || feature.status === 'pending_approval') && (
              <div className="feature-approval-section">
                <h3>🛡️ Admin Approval Required</h3>
                <p className="feature-approval-description">
                  This feature request has been classified and confirmed. An admin must approve it before the orchestrator picks it up.
                </p>

                {feature.complexity && (
                  <div className="feature-detail-row">
                    <span className="feature-detail-label">Complexity</span>
                    <span className={`feature-status-badge feature-badge-complexity-${feature.complexity}`}>
                      {feature.complexity}
                    </span>
                  </div>
                )}

                {!showRejectForm ? (
                  <div className="feature-approval-actions">
                    <button
                      onClick={handleAdminApproveAction}
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
                      Rejection reason (optional):
                    </label>
                    <textarea
                      id="reject-feedback"
                      className="feature-reject-textarea"
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      placeholder="Explain why this feature request is being rejected..."
                      rows={4}
                    />
                    <div className="feature-approval-actions">
                      <button
                        onClick={handleAdminRejectAction}
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
