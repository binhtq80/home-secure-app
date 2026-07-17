import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { devicesApi, roomsApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';
import { RoleBadge } from '../components/RoleBadge';
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
  room?: string | null;
  lastActive?: string | null;
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

const DEFAULT_ROOMS = ['Kitchen', 'Living Room', 'Bedroom', 'Office', 'Bathroom', 'Garage', 'Garden'];

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ deviceId: string; deviceName: string } | null>(null);
  const [roomDeleteConfirm, setRoomDeleteConfirm] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Room state
  const [rooms, setRooms] = useState<string[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>('all');

  // Form fields
  const [deviceType, setDeviceType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [condition, setCondition] = useState('good');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');

  useEffect(() => {
    loadDevices();
    loadFavorites();
  }, []);

  // Derive rooms from devices
  useEffect(() => {
    const deviceRooms = devices
      .map((d) => d.room)
      .filter((r): r is string => !!r);
    const uniqueRooms = Array.from(new Set([...deviceRooms]));
    // Merge with any saved rooms from localStorage
    const savedRooms: string[] = JSON.parse(localStorage.getItem('userRooms') || '[]');
    const allRooms = Array.from(new Set([...uniqueRooms, ...savedRooms]));
    setRooms(allRooms.sort());
  }, [devices]);

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

  const loadFavorites = async () => {
    try {
      const data = await devicesApi.listFavorites();
      setFavorites(new Set(data.favorites));
    } catch {
      // Non-critical — don't block page load
    }
  };

  const handleToggleFavorite = async (deviceId: string) => {
    try {
      const data = await devicesApi.toggleFavorite(deviceId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (data.isFavorite) {
          next.add(deviceId);
        } else {
          next.delete(deviceId);
        }
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle favorite');
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
        room: selectedRoom || undefined,
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

  const handleDelete = async (deviceId: string, deviceName: string) => {
    setDeleteConfirm({ deviceId, deviceName });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await devicesApi.delete(deleteConfirm.deviceId);
      setDevices(devices.filter((d) => d.id !== deleteConfirm.deviceId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
    }
    setDeleteConfirm(null);
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

  const handleRoomChange = async (deviceId: string, room: string) => {
    const roomValue = room === '' ? null : room;
    try {
      await devicesApi.update(deviceId, { room: roomValue });
      setDevices(devices.map((d) =>
        d.id === deviceId ? { ...d, room: roomValue } : d
      ));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign room');
    }
  };

  const handleAddRoom = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    if (rooms.includes(trimmed)) {
      setError('Room already exists');
      return;
    }
    const updatedRooms = [...rooms, trimmed].sort();
    setRooms(updatedRooms);
    // Persist custom rooms to localStorage
    const savedRooms: string[] = JSON.parse(localStorage.getItem('userRooms') || '[]');
    if (!savedRooms.includes(trimmed)) {
      localStorage.setItem('userRooms', JSON.stringify([...savedRooms, trimmed]));
    }
    setNewRoomName('');
    setShowRoomForm(false);
    setError('');
  };

  const handleRemoveRoom = (roomName: string) => {
    setRoomDeleteConfirm(roomName);
  };

  const confirmRemoveRoom = async () => {
    if (!roomDeleteConfirm) return;
    try {
      await roomsApi.delete(roomDeleteConfirm);
      // Update local state: move devices to unassigned
      setDevices(devices.map((d) =>
        d.room === roomDeleteConfirm ? { ...d, room: null } : d
      ));
      // Remove room from localStorage
      const savedRooms: string[] = JSON.parse(localStorage.getItem('userRooms') || '[]');
      localStorage.setItem('userRooms', JSON.stringify(savedRooms.filter((r) => r !== roomDeleteConfirm)));
      // Reset room filter if it was filtering by the deleted room
      if (roomFilter === roomDeleteConfirm) {
        setRoomFilter('all');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove room');
    }
    setRoomDeleteConfirm(null);
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
    setSelectedRoom('');
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
    // Room filter
    if (roomFilter === 'unassigned' && device.room) return false;
    if (roomFilter !== 'all' && roomFilter !== 'unassigned' && device.room !== roomFilter) return false;

    // Search filter
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

  // Group devices by room for visual section headers
  const groupedDevices = filteredDevices.reduce<Record<string, Device[]>>((groups, device) => {
    const roomName = device.room || 'Unassigned';
    if (!groups[roomName]) groups[roomName] = [];
    groups[roomName].push(device);
    return groups;
  }, {});

  // Sort room groups: named rooms first (alphabetical), then "Unassigned" last
  const sortedRoomGroups = Object.keys(groupedDevices).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get available rooms for dropdowns (merge defaults with custom)
  const availableRooms = Array.from(new Set([...DEFAULT_ROOMS, ...rooms])).sort();

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Home Energy Management</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav">Dashboard</button>
          <button onClick={() => navigate('/devices')} className="btn-nav active">Devices</button>
          <button onClick={() => navigate('/reports')} className="btn-nav">Reports</button>
          <button onClick={() => navigate('/settings')} className="btn-nav">Settings</button>
          <span className="nav-divider" />
          <button onClick={() => navigate('/submit-feature')} className="btn-nav">Request Feature</button>
          <button onClick={() => navigate('/feature-summary')} className="btn-nav">Feature Summary</button>
          <button onClick={() => navigate('/profile')} className="btn-nav">Profile</button>
          <RoleBadge />
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

        {/* Room Management Section */}
        <div className="room-management-section">
          <div className="room-management-header">
            <h3>Rooms / Zones</h3>
            <button
              className="btn-secondary btn-small"
              onClick={() => setShowRoomForm(!showRoomForm)}
            >
              {showRoomForm ? 'Cancel' : '+ Add Room'}
            </button>
          </div>

          {showRoomForm && (
            <form onSubmit={handleAddRoom} className="room-add-form">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Enter room name (e.g., Kitchen, Office)"
                className="room-input"
                aria-label="New room name"
                autoFocus
              />
              <button type="submit" className="btn-primary btn-small">Add</button>
            </form>
          )}

          {rooms.length > 0 && (
            <div className="room-tags">
              {rooms.map((room) => (
                <span key={room} className="room-tag">
                  {room}
                  <button
                    className="btn-room-delete"
                    onClick={() => handleRemoveRoom(room)}
                    aria-label={`Remove room ${room}`}
                    title={`Remove ${room}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Filter and Search */}
        {!loading && devices.length > 0 && (
          <div className="devices-filter-bar">
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
            <div className="room-filter">
              <label htmlFor="room-filter-select">Filter by room:</label>
              <select
                id="room-filter-select"
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="room-filter-select"
              >
                <option value="all">All Rooms</option>
                <option value="unassigned">Unassigned</option>
                {rooms.map((room) => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>
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

                <div className="form-row">
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
                  <div className="form-group">
                    <label htmlFor="room">Room / Zone</label>
                    <select
                      id="room"
                      value={selectedRoom}
                      onChange={(e) => setSelectedRoom(e.target.value)}
                      disabled={recognizing}
                    >
                      <option value="">No room assigned</option>
                      {availableRooms.map((room) => (
                        <option key={room} value={room}>{room}</option>
                      ))}
                    </select>
                  </div>
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

        {/* Device List — Grouped by Room */}
        {loading ? (
          <p className="loading-text">Loading devices...</p>
        ) : devices.length === 0 && !showForm ? (
          <div className="empty-state">
            <p>📷 No devices registered yet.</p>
            <p>Upload a photo of a home device to get started!</p>
          </div>
        ) : filteredDevices.length === 0 && (searchQuery.trim() || roomFilter !== 'all') ? (
          <div className="empty-state">
            <p>No devices match your {roomFilter !== 'all' ? 'room filter' : 'search'}</p>
          </div>
        ) : (
          <div className="devices-grouped">
            {sortedRoomGroups.map((roomName) => (
              <div key={roomName} className="room-group">
                <div className="room-group-header">
                  <h3 className="room-group-title">
                    {roomName === 'Unassigned' ? '📦 Unassigned' : `🏠 ${roomName}`}
                  </h3>
                  <span className="room-group-count">
                    {groupedDevices[roomName].length} device{groupedDevices[roomName].length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="devices-grid">
                  {groupedDevices[roomName].map((device) => (
                    <div
                      key={device.id}
                      className="device-card clickable"
                      onClick={() => navigate(`/devices/${device.id}`)}
                    >
                      <div className="device-card-header">
                        <span className="device-type-badge">{device.deviceType}</span>
                        <div className="device-card-actions">
                          <button
                            className={`btn-favorite ${favorites.has(device.id) ? 'is-favorite' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(device.id); }}
                            aria-label={favorites.has(device.id) ? 'Remove from favorites' : 'Add to favorites'}
                            title={favorites.has(device.id) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {favorites.has(device.id) ? '★' : '☆'}
                          </button>
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
                            onClick={(e) => { e.stopPropagation(); handleDelete(device.id, `${device.brand} ${device.model}`); }}
                            aria-label="Remove device"
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
                      <p className="device-last-seen">Last seen: {formatRelativeTime(device.lastActive)}</p>
                      <p className="device-description">{device.description}</p>
                      <div className="device-meta">
                        <span>Color: {device.color}</span>
                        <span>Condition: {device.condition}</span>
                      </div>
                      {/* Room assignment dropdown */}
                      <div className="device-room-assign" onClick={(e) => e.stopPropagation()}>
                        <label htmlFor={`room-${device.id}`} className="room-assign-label">Room:</label>
                        <select
                          id={`room-${device.id}`}
                          value={device.room || ''}
                          onChange={(e) => handleRoomChange(device.id, e.target.value)}
                          className="room-assign-select"
                        >
                          <option value="">Unassigned</option>
                          {availableRooms.map((room) => (
                            <option key={room} value={room}>{room}</option>
                          ))}
                        </select>
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

      {/* Delete Device Confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Remove Device?"
        message={`Are you sure you want to remove "${deleteConfirm?.deviceName || ''}"? The device will no longer appear in your list, but its data will be preserved for recovery.`}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Remove Room Confirmation */}
      <ConfirmDialog
        open={roomDeleteConfirm !== null}
        title="Remove Room?"
        message="Are you sure you want to remove this room? All devices in this room will be moved to Unassigned."
        confirmLabel="Remove"
        onConfirm={confirmRemoveRoom}
        onCancel={() => setRoomDeleteConfirm(null)}
      />

      {/* Last Updated Timestamp */}
      <p style={{ textAlign: 'center', color: 'var(--text-secondary, #888)', fontSize: '0.85rem', marginTop: '2rem', paddingBottom: '1rem' }}>
        Last updated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
