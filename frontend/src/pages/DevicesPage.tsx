import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { devicesApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Device {
  id: string;
  deviceType: string;
  brand: string;
  model: string;
  color: string;
  condition: string;
  description: string;
  features: string[];
  createdAt: string;
  status?: 'on' | 'off';
  monthlyBudgetKwh?: number;
  currentMonthKwh?: number;
  budgetPercentage?: number | null;
  hasImage?: boolean;
  imageKey?: string;
}

interface RecognizedDevice {
  deviceType: string;
  brand: string;
  model: string;
  color: string;
  condition: string;
  description: string;
  features: string[];
}

export function DevicesPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [recognizing, setRecognizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deviceImages, setDeviceImages] = useState<Record<string, string>>({});
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [toggleConfirm, setToggleConfirm] = useState<{ deviceId: string; currentStatus?: 'on' | 'off' } | null>(null);

  // Form fields
  const [deviceType, setDeviceType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [condition, setCondition] = useState('good');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const data = await devicesApi.list();
      setDevices(data.devices);
      // Load images for devices that have them
      const imagePromises = data.devices
        .filter((d: Device) => d.hasImage || d.imageKey)
        .map(async (d: Device) => {
          try {
            const result = await devicesApi.getImage(d.id);
            return { id: d.id, url: result.url };
          } catch {
            return null;
          }
        });
      const images = await Promise.all(imagePromises);
      const imageMap: Record<string, string> = {};
      images.forEach((img) => {
        if (img) imageMap[img.id] = img.url;
      });
      setDeviceImages(imageMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setRecognizing(true);
    setShowForm(true);

    // Show preview
    const reader = new FileReader();
    reader.onload = (evt) => {
      setPreviewImage(evt.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Convert to base64 for API
    const base64Reader = new FileReader();
    base64Reader.onload = async (evt) => {
      try {
        const base64 = (evt.target?.result as string).split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        setCapturedImageBase64(base64);

        const result = await devicesApi.recognize(base64, mimeType);
        const device: RecognizedDevice = result.device;

        // Auto-fill form
        setDeviceType(device.deviceType || '');
        setBrand(device.brand || '');
        setModel(device.model || '');
        setColor(device.color || '');
        setCondition(device.condition || 'good');
        setDescription(device.description || '');
        setFeatures(device.features?.join(', ') || '');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to recognize device');
      } finally {
        setRecognizing(false);
      }
    };
    base64Reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await devicesApi.create({
        deviceType,
        brand,
        model,
        color,
        condition,
        description,
        features: features.split(',').map((f) => f.trim()).filter(Boolean),
        imageBase64: capturedImageBase64 || undefined,
      });

      // Reset form and reload
      resetForm();
      await loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (!confirm('Are you sure you want to remove this device?')) return;
    try {
      await devicesApi.delete(deviceId);
      setDevices(devices.filter((d) => d.id !== deviceId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete device');
    }
  };

  const handleToggleStatus = async (deviceId: string, currentStatus?: 'on' | 'off') => {
    setToggleConfirm({ deviceId, currentStatus });
  };

  const confirmToggleStatus = async () => {
    if (!toggleConfirm) return;
    const { deviceId, currentStatus } = toggleConfirm;
    const newStatus = currentStatus === 'on' ? 'off' : 'on';
    try {
      await devicesApi.update(deviceId, { status: newStatus });
      setDevices(devices.map((d) =>
        d.id === deviceId ? { ...d, status: newStatus } : d
      ));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle device status');
    }
    setToggleConfirm(null);
  };

  const resetForm = () => {
    setShowForm(false);
    setPreviewImage(null);
    setCapturedImageBase64(null);
    setDeviceType('');
    setBrand('');
    setModel('');
    setColor('');
    setCondition('good');
    setDescription('');
    setFeatures('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openLightbox = (imageUrl: string, alt: string) => {
    setLightboxImage(imageUrl);
    setLightboxAlt(alt);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
    setLightboxAlt('');
  };

  const handleLightboxKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') closeLightbox();
  }, []);

  useEffect(() => {
    if (lightboxImage) {
      document.addEventListener('keydown', handleLightboxKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleLightboxKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightboxImage, handleLightboxKeyDown]);

  const filteredDevices = devices.filter((device) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = `${device.brand} ${device.model}`.toLowerCase();
    return (
      name.includes(query) ||
      device.deviceType.toLowerCase().includes(query) ||
      device.brand.toLowerCase().includes(query) ||
      (device.description && device.description.toLowerCase().includes(query))
    );
  });

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
          <button onClick={() => navigate('/devices')} className="btn-nav active">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav">Settings</button>
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <DarkModeToggle />
          <button onClick={handleLogout} className="btn-logout">Sign Out</button>
        </nav>
      </header>

      <main className="dashboard-main">
        <div className="devices-header">
          <h2>My Home Devices</h2>
          <button
            className="btn-primary btn-add"
            onClick={() => fileInputRef.current?.click()}
          >
            + Add Device (Upload Photo)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
        </div>

        {!loading && devices.length > 0 && (
          <div className="devices-search">
            <input
              type="text"
              className="devices-search-input"
              placeholder="Search devices by name, brand, type, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search devices"
            />
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {/* Add Device Form */}
        {showForm && (
          <div className="device-form-card">
            <h3>{recognizing ? '🔍 Analyzing image...' : '✅ Device recognized — review & confirm'}</h3>

            <div className="form-with-preview">
              {previewImage && (
                <div className="image-preview">
                  <img src={previewImage} alt="Device" />
                </div>
              )}

              <form onSubmit={handleSubmit} className="device-form">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="deviceType">Device Type</label>
                    <input
                      id="deviceType"
                      value={deviceType}
                      onChange={(e) => setDeviceType(e.target.value)}
                      placeholder={recognizing ? 'Detecting...' : 'e.g., Camera'}
                      required
                      disabled={recognizing}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="brand">Brand</label>
                    <input
                      id="brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder={recognizing ? 'Detecting...' : 'e.g., Samsung'}
                      required
                      disabled={recognizing}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="model">Model</label>
                    <input
                      id="model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={recognizing ? 'Detecting...' : 'e.g., SmartCam 360'}
                      disabled={recognizing}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="color">Color</label>
                    <input
                      id="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder={recognizing ? 'Detecting...' : 'e.g., White'}
                      disabled={recognizing}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="condition">Condition</label>
                    <select
                      id="condition"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      disabled={recognizing}
                    >
                      <option value="new">New</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="features">Features</label>
                    <input
                      id="features"
                      value={features}
                      onChange={(e) => setFeatures(e.target.value)}
                      placeholder={recognizing ? 'Detecting...' : 'Comma separated'}
                      disabled={recognizing}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={recognizing ? 'Detecting...' : 'Brief description'}
                    disabled={recognizing}
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={recognizing || submitting}>
                    {submitting ? 'Saving...' : 'Register Device'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Device List */}
        {loading ? (
          <p className="loading-text">Loading devices...</p>
        ) : devices.length === 0 && !showForm ? (
          <div className="empty-state">
            <p>📷 No devices registered yet.</p>
            <p>Upload a photo of a home device to get started!</p>
          </div>
        ) : filteredDevices.length === 0 && searchQuery.trim() ? (
          <div className="empty-state">
            <p>No devices match your search</p>
          </div>
        ) : (
          <div className="devices-grid">
            {filteredDevices.map((device) => (
              <div
                key={device.id}
                className="device-card clickable"
                onClick={() => navigate(`/devices/${device.id}`)}
              >
                <div className="device-card-header">
                  <span className="device-type-badge">{device.deviceType}</span>
                  <div className="device-card-actions">
                    <button
                      className={`btn-status-toggle ${device.status === 'on' ? 'status-on' : 'status-off'}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(device.id, device.status); }}
                      aria-label={`Turn device ${device.status === 'on' ? 'off' : 'on'}`}
                      title={`Device is ${device.status === 'on' ? 'ON' : 'OFF'} — click to toggle`}
                    >
                      {device.status === 'on' ? '🟢 ON' : '🔴 OFF'}
                    </button>
                    {device.budgetPercentage !== null && device.budgetPercentage !== undefined && device.budgetPercentage >= 80 && (
                      <span className={`budget-badge ${device.budgetPercentage >= 100 ? 'exceeded' : 'warning'}`}>
                        {device.budgetPercentage >= 100 ? '🚨' : '⚠️'} {device.budgetPercentage}%
                      </span>
                    )}
                    <button
                      className="btn-delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(device.id); }}
                      aria-label="Delete device"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {deviceImages[device.id] && (
                  <div
                    className="device-card-image"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightbox(deviceImages[device.id], `${device.brand} ${device.model}`);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        openLightbox(deviceImages[device.id], `${device.brand} ${device.model}`);
                      }
                    }}
                    aria-label={`View full image of ${device.brand} ${device.model}`}
                    style={{ cursor: 'zoom-in' }}
                  >
                    <img src={deviceImages[device.id]} alt={`${device.brand} ${device.model}`} />
                  </div>
                )}
                <h4>{device.brand} {device.model !== 'Unknown' ? device.model : ''}</h4>
                <p className="device-description">{device.description}</p>
                <div className="device-meta">
                  <span>Color: {device.color}</span>
                  <span>Condition: {device.condition}</span>
                </div>
                {device.budgetPercentage !== null && device.budgetPercentage !== undefined && (
                  <div className="device-card-budget">
                    <div className="mini-progress-bar">
                      <div
                        className={`mini-progress-fill ${device.budgetPercentage >= 100 ? 'exceeded' : device.budgetPercentage >= 80 ? 'warning' : ''}`}
                        style={{ width: `${Math.min(device.budgetPercentage, 100)}%` }}
                      />
                    </div>
                    <span className="mini-progress-label">{device.currentMonthKwh} / {device.monthlyBudgetKwh} kWh</span>
                  </div>
                )}
                {device.features?.length > 0 && (
                  <div className="device-features">
                    {device.features.map((f, i) => (
                      <span key={i} className="feature-tag">{f}</span>
                    ))}
                  </div>
                )}
                <p className="device-date">Added {new Date(device.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={closeLightbox} role="dialog" aria-modal="true" aria-label="Image lightbox">
          <button className="lightbox-close" onClick={closeLightbox} aria-label="Close lightbox">✕</button>
          <img
            className="lightbox-image"
            src={lightboxImage}
            alt={lightboxAlt}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Toggle Status Confirmation */}
      <ConfirmDialog
        open={toggleConfirm !== null}
        title={toggleConfirm?.currentStatus === 'on' ? 'Turn Off Device?' : 'Turn On Device?'}
        message={toggleConfirm?.currentStatus === 'on'
          ? 'Are you sure you want to turn off this device?'
          : 'Are you sure you want to turn on this device?'}
        confirmLabel={toggleConfirm?.currentStatus === 'on' ? 'Turn Off' : 'Turn On'}
        onConfirm={confirmToggleStatus}
        onCancel={() => setToggleConfirm(null)}
      />
    </div>
  );
}
