import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { devicesApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface MonthlyEnergy {
  month: string;
  label: string;
  kwh: number;
  cost: number;
}

interface EnergyData {
  totalKwh: number;
  avgMonthlyKwh: number;
  estimatedMonthlyCost: number;
  costPerKwh: number;
  monthly: MonthlyEnergy[];
}

interface DeviceInfo {
  id: string;
  deviceType: string;
  brand: string;
  model: string;
  color: string;
  condition: string;
  description?: string;
  status?: 'on' | 'off';
  monthlyBudgetKwh?: number;
  energySavingTips?: string[];
}

interface HistoryEntry {
  deviceId: string;
  timestamp: string;
  oldValues: Record<string, string | null>;
  newValues: Record<string, string>;
  changedFields: string[];
  changedBy: string;
  changedAt: string;
}

interface DeviceManual {
  id: string;
  fileName: string;
  s3Key: string;
  size: number;
  uploadedAt: string;
}

interface DeviceNote {
  deviceId: string;
  noteId: string;
  text: string;
  createdAt: string;
}

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);

  // Budget state
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSuccess, setBudgetSuccess] = useState('');

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    deviceType: '',
    brand: '',
    model: '',
    color: '',
    condition: '',
    description: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manuals state
  const [manuals, setManuals] = useState<DeviceManual[]>([]);
  const [manualsLoading, setManualsLoading] = useState(false);
  const [uploadingManual, setUploadingManual] = useState(false);
  const [manualSuccess, setManualSuccess] = useState('');
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState<DeviceNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState('');

  // Tags state
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);

  // Copy ID state
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = useCallback(async () => {
    if (!deviceId) return;
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = deviceId;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) {
      loadEnergyData(deviceId);
      loadHistory(deviceId);
      loadManuals(deviceId);
      loadNotes(deviceId);
      loadTags(deviceId);
    }
  }, [deviceId]);

  const loadEnergyData = async (id: string) => {
    try {
      const data = await devicesApi.getEnergy(id);
      setDevice(data.device);
      setEnergy(data.energy);
      if (data.device.monthlyBudgetKwh) {
        setBudgetInput(data.device.monthlyBudgetKwh.toString());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load energy data');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (id: string) => {
    setHistoryLoading(true);
    try {
      const data = await devicesApi.getHistory(id);
      setHistory(data.history || []);
    } catch {
      // History may not exist yet, that's fine
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadManuals = async (id: string) => {
    setManualsLoading(true);
    try {
      const data = await devicesApi.getManuals(id);
      setManuals(data.manuals || []);
    } catch {
      setManuals([]);
    } finally {
      setManualsLoading(false);
    }
  };

  const loadNotes = async (id: string) => {
    setNotesLoading(true);
    try {
      const data = await devicesApi.listNotes(id);
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!deviceId || !noteText.trim()) return;
    setSavingNote(true);
    setNoteSuccess('');
    setError('');

    try {
      const data = await devicesApi.createNote(deviceId, noteText.trim());
      setNotes([data.note, ...notes]);
      setNoteText('');
      setNoteSuccess('Note added!');
      setTimeout(() => setNoteSuccess(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const loadTags = async (id: string) => {
    setTagsLoading(true);
    try {
      const data = await devicesApi.getTags(id);
      setTags(data.tags || []);
    } catch {
      setTags([]);
    } finally {
      setTagsLoading(false);
    }
  };

  const handleAddTag = async () => {
    if (!deviceId || !tagInput.trim()) return;
    setSavingTag(true);
    setError('');

    try {
      const data = await devicesApi.addTag(deviceId, tagInput.trim());
      setTags(data.tags || [...tags, tagInput.trim().toLowerCase()]);
      setTagInput('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add tag');
    } finally {
      setSavingTag(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!deviceId) return;
    try {
      await devicesApi.removeTag(deviceId, tag);
      setTags(tags.filter(t => t !== tag));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
    }
  };

  const handleUploadManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !deviceId) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are allowed');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setUploadingManual(true);
    setError('');
    setManualSuccess('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await devicesApi.uploadManual(deviceId, file.name, base64);
        setManualSuccess('Manual uploaded successfully!');
        setTimeout(() => setManualSuccess(''), 3000);
        loadManuals(deviceId);
        setUploadingManual(false);
      };
      reader.onerror = () => {
        setError('Failed to read file');
        setUploadingManual(false);
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload manual');
      setUploadingManual(false);
    }

    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDownloadManual = async (manual: DeviceManual) => {
    if (!deviceId) return;
    try {
      const data = await devicesApi.getManualUrl(deviceId, manual.id);
      window.open(data.url, '_blank');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to download manual');
    }
  };

  const handleDeleteManual = async (manualId: string) => {
    if (!deviceId) return;
    setDeletingManualId(manualId);
    try {
      await devicesApi.deleteManual(deviceId, manualId);
      setManuals(manuals.filter(m => m.id !== manualId));
      setManualSuccess('Manual deleted.');
      setTimeout(() => setManualSuccess(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete manual');
    } finally {
      setDeletingManualId(null);
    }
  };

  const handleStartEdit = () => {
    if (device) {
      setEditForm({
        deviceType: device.deviceType || '',
        brand: device.brand || '',
        model: device.model || '',
        color: device.color || '',
        condition: device.condition || '',
        description: device.description || '',
      });
      setIsEditing(true);
      setEditSuccess('');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditSuccess('');
  };

  const handleSaveEdit = async () => {
    if (!deviceId) return;
    setSavingEdit(true);
    setError('');
    setEditSuccess('');

    try {
      const result = await devicesApi.update(deviceId, editForm);
      setDevice(result.device);
      setIsEditing(false);
      setEditSuccess('Device updated successfully!');
      setTimeout(() => setEditSuccess(''), 3000);
      // Reload history
      loadHistory(deviceId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!deviceId) return;
    const value = parseFloat(budgetInput);
    if (isNaN(value) || value <= 0) {
      setError('Budget must be a positive number');
      return;
    }

    setSavingBudget(true);
    setBudgetSuccess('');
    setError('');

    try {
      await devicesApi.setBudget(deviceId, value);
      setBudgetSuccess('Budget saved!');
      if (device) {
        setDevice({ ...device, monthlyBudgetKwh: value });
      }
      setTimeout(() => setBudgetSuccess(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save budget');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleToggleStatus = async () => {
    setShowToggleConfirm(true);
  };

  const confirmToggleStatus = async () => {
    if (!deviceId || !device) return;
    const newStatus = device.status === 'on' ? 'off' : 'on';
    try {
      await devicesApi.update(deviceId, { status: newStatus });
      setDevice({ ...device, status: newStatus });
      loadHistory(deviceId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle device status');
    }
    setShowToggleConfirm(false);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <p className="loading-text">Loading energy data...</p>
      </div>
    );
  }

  if (error && !device) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-main">
          <div className="error-message">{error}</div>
          <button className="btn-secondary" onClick={() => navigate('/devices')}>← Back to Devices</button>
        </div>
      </div>
    );
  }

  const maxKwh = energy ? Math.max(...energy.monthly.map((m) => m.kwh)) : 0;

  // Budget progress for current month
  const currentMonthKwh = energy?.monthly[energy.monthly.length - 1]?.kwh || 0;
  const budgetPercentage = device?.monthlyBudgetKwh
    ? Math.round((currentMonthKwh / device.monthlyBudgetKwh) * 100)
    : null;

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <button className="btn-back" onClick={() => navigate('/devices')}>← Back to Devices</button>

        {error && <div className="error-message">{error}</div>}
        {editSuccess && <div className="success-message">{editSuccess}</div>}

        {/* Device Info */}
        <div className="device-detail-header">
          <div className="device-detail-title-row">
            <h2>{device?.brand} {device?.model !== 'Unknown' ? device?.model : device?.deviceType}</h2>
            <div className="device-detail-actions">
              <button
                className={`btn-status-toggle ${device?.status === 'on' ? 'status-on' : 'status-off'}`}
                onClick={handleToggleStatus}
                aria-label={`Turn device ${device?.status === 'on' ? 'off' : 'on'}`}
                title={`Device is ${device?.status === 'on' ? 'ON' : 'OFF'} — click to toggle`}
              >
                {device?.status === 'on' ? '🟢 ON' : '🔴 OFF'}
              </button>
              {!isEditing && (
                <button className="btn-primary btn-edit-device" onClick={handleStartEdit}>
                  ✏️ Edit
                </button>
              )}
            </div>
          </div>
          <p className="device-detail-meta">
            <span className="device-type-badge">{device?.deviceType}</span>
            <span>Color: {device?.color}</span>
            <span>Condition: {device?.condition}</span>
          </p>
          <p className="device-detail-id">
            <span className="device-id-label">ID:</span>
            <code className="device-id-value">{deviceId}</code>
            <button
              className="btn-copy-id"
              onClick={handleCopyId}
              aria-label="Copy device ID to clipboard"
              title="Copy device ID"
            >
              {copiedId ? '✓ Copied' : '📋 Copy'}
            </button>
          </p>
        </div>

        {/* Device Tags */}
        <div className="device-tags-card">
          <h3>🏷️ Tags</h3>
          <div className="device-tags-list">
            {tagsLoading ? (
              <span className="loading-text">Loading tags...</span>
            ) : tags.length === 0 ? (
              <span className="tags-empty">No tags yet</span>
            ) : (
              tags.map((tag) => (
                <span key={tag} className="device-tag-chip">
                  {tag}
                  <button
                    className="tag-remove-btn"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    title={`Remove "${tag}"`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="tag-input-section">
            <input
              type="text"
              className="tag-input"
              placeholder="Add a tag (e.g. kitchen, high-power)..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
              disabled={savingTag}
              maxLength={30}
            />
            <button
              className="btn-primary btn-add-tag"
              onClick={handleAddTag}
              disabled={savingTag || !tagInput.trim()}
            >
              {savingTag ? '...' : '+ Add'}
            </button>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <div className="edit-device-card">
            <h3>Edit Device</h3>
            <div className="edit-device-form">
              <div className="edit-field">
                <label htmlFor="edit-deviceType">Device Type</label>
                <input
                  id="edit-deviceType"
                  type="text"
                  value={editForm.deviceType}
                  onChange={(e) => setEditForm({ ...editForm, deviceType: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-brand">Brand</label>
                <input
                  id="edit-brand"
                  type="text"
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-model">Model</label>
                <input
                  id="edit-model"
                  type="text"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-color">Color</label>
                <input
                  id="edit-color"
                  type="text"
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                />
              </div>
              <div className="edit-field">
                <label htmlFor="edit-condition">Condition</label>
                <select
                  id="edit-condition"
                  value={editForm.condition}
                  onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div className="edit-field">
                <label htmlFor="edit-description">Description</label>
                <textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="edit-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Energy Stats */}
        <div className="energy-stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>Total Consumption</h3>
              <p className="stat-value">{energy?.totalKwh} kWh</p>
              <p className="stat-subtitle">Last 12 months</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>Monthly Average</h3>
              <p className="stat-value">{energy?.avgMonthlyKwh} kWh</p>
              <p className="stat-subtitle">Per month</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Estimated Cost</h3>
              <p className="stat-value">${energy?.estimatedMonthlyCost}/month</p>
              <p className="stat-subtitle">@ ${energy?.costPerKwh}/kWh</p>
            </div>
          </div>
        </div>

        {/* Budget Setting */}
        <div className="budget-card">
          <h3>⚙️ Monthly Energy Budget</h3>
          <div className="budget-form">
            <div className="input-with-unit">
              <input
                type="number"
                step="1"
                min="1"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="e.g., 50"
              />
              <span className="input-suffix">kWh / month</span>
            </div>
            <button
              className="btn-primary btn-budget-save"
              onClick={handleSaveBudget}
              disabled={savingBudget}
            >
              {savingBudget ? 'Saving...' : 'Set Budget'}
            </button>
          </div>
          {budgetSuccess && <p className="budget-success">{budgetSuccess}</p>}

          {budgetPercentage !== null && (
            <div className="budget-progress-section">
              <div className="budget-progress-header">
                <span>This month: {currentMonthKwh} / {device?.monthlyBudgetKwh} kWh</span>
                <span className={`budget-percentage ${budgetPercentage >= 80 ? 'over-budget' : ''}`}>
                  {budgetPercentage}%
                </span>
              </div>
              <div className="budget-progress-bar">
                <div
                  className={`budget-progress-fill ${budgetPercentage >= 100 ? 'exceeded' : budgetPercentage >= 80 ? 'warning' : ''}`}
                  style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                />
              </div>
              {budgetPercentage >= 80 && budgetPercentage < 100 && (
                <p className="budget-warning">⚠️ Approaching budget limit!</p>
              )}
              {budgetPercentage >= 100 && (
                <p className="budget-exceeded">🚨 Budget exceeded!</p>
              )}
            </div>
          )}
        </div>

        {/* Energy Saving Tips */}
        <div className="energy-tips-card">
          <h3>💡 AI Energy Saving Tips</h3>
          {device?.energySavingTips && device.energySavingTips.length > 0 ? (
            <ul className="energy-tips-list">
              {device.energySavingTips.map((tip, index) => (
                <li key={index} className="energy-tip-item">{tip}</li>
              ))}
            </ul>
          ) : (
            <p className="energy-tips-na">N/A</p>
          )}
        </div>

        {/* Bar Chart */}
        <div className="energy-chart-card">
          <h3>Energy Consumption (Last 12 Months)</h3>
          <div className="chart-container">
            {energy?.monthly.map((month) => (
              <div key={month.month} className="chart-bar-wrapper">
                <div className="chart-bar-value">{month.kwh}</div>
                <div className="chart-bar-track">
                  <div
                    className="chart-bar"
                    style={{ height: `${(month.kwh / maxKwh) * 100}%` }}
                    data-tooltip={`${month.kwh} kWh`}
                  />
                </div>
                <div className="chart-bar-label">{month.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Device Manuals */}
        <div className="manuals-card">
          <h3>📄 Device Manuals (PDF)</h3>
          {manualSuccess && <p className="success-message">{manualSuccess}</p>}
          <div className="manual-upload-section">
            <label className="btn-primary btn-upload-manual" htmlFor="manual-upload">
              {uploadingManual ? 'Uploading...' : '+ Upload Manual (PDF)'}
            </label>
            <input
              id="manual-upload"
              type="file"
              accept=".pdf"
              onChange={handleUploadManual}
              disabled={uploadingManual}
              style={{ display: 'none' }}
            />
          </div>
          {manualsLoading ? (
            <p className="loading-text">Loading manuals...</p>
          ) : manuals.length === 0 ? (
            <p className="manuals-empty">No manuals uploaded yet. Upload a PDF manual for this device.</p>
          ) : (
            <div className="manuals-list">
              {manuals.map((manual) => (
                <div key={manual.id} className="manual-item">
                  <div className="manual-info">
                    <span className="manual-icon">📄</span>
                    <div className="manual-details">
                      <span className="manual-name">{manual.fileName}</span>
                      <span className="manual-meta">
                        {(manual.size / 1024).toFixed(0)} KB • {new Date(manual.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="manual-actions">
                    <button
                      className="btn-secondary btn-manual-download"
                      onClick={() => handleDownloadManual(manual)}
                    >
                      ⬇️ Download
                    </button>
                    <button
                      className="btn-danger btn-manual-delete"
                      onClick={() => handleDeleteManual(manual.id)}
                      disabled={deletingManualId === manual.id}
                    >
                      {deletingManualId === manual.id ? '...' : '🗑️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Device Notes */}
        <div className="notes-card">
          <h3>📝 Device Notes</h3>
          {noteSuccess && <p className="success-message">{noteSuccess}</p>}
          <div className="note-input-section">
            <input
              type="text"
              className="note-input"
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
              disabled={savingNote}
            />
            <button
              className="btn-primary btn-add-note"
              onClick={handleAddNote}
              disabled={savingNote || !noteText.trim()}
            >
              {savingNote ? 'Adding...' : 'Add Note'}
            </button>
          </div>
          {notesLoading ? (
            <p className="loading-text">Loading notes...</p>
          ) : notes.length === 0 ? (
            <p className="notes-empty">No notes yet. Add a note above.</p>
          ) : (
            <div className="notes-list">
              {notes.map((note) => (
                <div key={note.noteId} className="note-item">
                  <p className="note-text">{note.text}</p>
                  <span className="note-date">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change History */}
        <div className="history-card">
          <h3>📋 Change History</h3>
          {historyLoading ? (
            <p className="loading-text">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="history-empty">No changes recorded yet.</p>
          ) : (
            <div className="history-timeline">
              {history.map((entry) => (
                <div key={entry.timestamp} className="history-entry">
                  <div className="history-entry-dot" />
                  <div className="history-entry-content">
                    <div className="history-entry-time">
                      {new Date(entry.changedAt).toLocaleString()}
                    </div>
                    <div className="history-entry-changes">
                      {entry.changedFields.map((field) => (
                        <div key={field} className="history-change-item">
                          <span className="history-field-name">{field}:</span>
                          <span className="history-old-value">{entry.oldValues[field] || '(empty)'}</span>
                          <span className="history-arrow">→</span>
                          <span className="history-new-value">{entry.newValues[field]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Toggle Status Confirmation */}
      <ConfirmDialog
        open={showToggleConfirm}
        title={device?.status === 'on' ? 'Turn Off Device?' : 'Turn On Device?'}
        message={device?.status === 'on'
          ? 'Are you sure you want to turn off this device?'
          : 'Are you sure you want to turn on this device?'}
        confirmLabel={device?.status === 'on' ? 'Turn Off' : 'Turn On'}
        onConfirm={confirmToggleStatus}
        onCancel={() => setShowToggleConfirm(false)}
      />
    </div>
  );
}
