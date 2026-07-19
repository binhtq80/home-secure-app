import { useState, useEffect, FormEvent } from 'react';
import { camerasApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

interface Camera {
  id: string;
  name: string;
  location: string;
  model: string | null;
  resolution: string | null;
  status: string;
  createdAt: string;
}

export function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [model, setModel] = useState('');
  const [resolution, setResolution] = useState('');

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setError('');
      const data = await camerasApi.list();
      setCameras(data.cameras);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cameras');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await camerasApi.register({
        name,
        location,
        model: model || undefined,
        resolution: resolution || undefined,
      });
      setSuccess('Camera registered successfully!');
      setName('');
      setLocation('');
      setModel('');
      setResolution('');
      setShowForm(false);
      await loadCameras();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register camera');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cameraId: string) => {
    if (!window.confirm('Are you sure you want to remove this camera?')) return;

    setDeleting(cameraId);
    setError('');
    setSuccess('');

    try {
      await camerasApi.delete(cameraId);
      setSuccess('Camera removed successfully.');
      setCameras(cameras.filter(c => c.id !== cameraId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete camera');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <AppHeader />
        <main className="dashboard-main">
          <p className="loading-text">Loading cameras...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <div className="page-header">
          <div>
            <h2>Security Cameras</h2>
            <p className="settings-subtitle">Register and manage your home security cameras.</p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowForm(!showForm)}
            aria-expanded={showForm}
          >
            {showForm ? 'Cancel' : '+ Register Camera'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="settings-card">
            <h3>Register New Camera</h3>
            <form onSubmit={handleSubmit} className="camera-form">
              <div className="form-group">
                <label htmlFor="cameraName">Camera Name *</label>
                <input
                  id="cameraName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Front Door Camera"
                  required
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cameraLocation">Location *</label>
                <input
                  id="cameraLocation"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Front porch, Backyard, Garage"
                  required
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cameraModel">Model</label>
                <input
                  id="cameraModel"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Ring Spotlight Cam"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cameraResolution">Resolution</label>
                <input
                  id="cameraResolution"
                  type="text"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="e.g. 1080p, 4K"
                  disabled={submitting}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Registering...' : 'Register Camera'}
              </button>
            </form>
          </div>
        )}

        {cameras.length === 0 ? (
          <div className="settings-card">
            <p className="empty-state">
              No cameras registered yet. Click "Register Camera" to add your first security camera.
            </p>
          </div>
        ) : (
          <div className="cameras-grid">
            {cameras.map((camera) => (
              <div key={camera.id} className="settings-card camera-card">
                <div className="camera-card-header">
                  <h3>{camera.name}</h3>
                  <span className={`camera-status camera-status-${camera.status}`}>
                    {camera.status}
                  </span>
                </div>
                <dl className="camera-details">
                  <div className="camera-detail-row">
                    <dt>Location</dt>
                    <dd>{camera.location}</dd>
                  </div>
                  {camera.model && (
                    <div className="camera-detail-row">
                      <dt>Model</dt>
                      <dd>{camera.model}</dd>
                    </div>
                  )}
                  {camera.resolution && (
                    <div className="camera-detail-row">
                      <dt>Resolution</dt>
                      <dd>{camera.resolution}</dd>
                    </div>
                  )}
                  <div className="camera-detail-row">
                    <dt>Registered</dt>
                    <dd>{formatDate(camera.createdAt)}</dd>
                  </div>
                </dl>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => handleDelete(camera.id)}
                  disabled={deleting === camera.id}
                  aria-label={`Remove ${camera.name}`}
                >
                  {deleting === camera.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
