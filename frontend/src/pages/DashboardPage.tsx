import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { DarkModeToggle } from '../components/DarkModeToggle';

interface EnergySummary {
  totalKwh: number;
  totalCost: number;
  deviceCount: number;
  costPerKwh: number;
}

interface MonthlyData {
  month: string;
  label: string;
  totalKwh: number;
  totalCost: number;
}

interface RoomBreakdown {
  room: string;
  totalKwh: number;
  totalCost: number;
  deviceCount: number;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [energySummary, setEnergySummary] = useState<EnergySummary | null>(null);
  const [currentMonthCost, setCurrentMonthCost] = useState<number | null>(null);
  const [roomBreakdown, setRoomBreakdown] = useState<RoomBreakdown[]>([]);
  const [energyLoading, setEnergyLoading] = useState(true);

  useEffect(() => {
    loadEnergySummary();
  }, []);

  const loadEnergySummary = async () => {
    try {
      const data = await reportsApi.getEnergyReport();
      setEnergySummary(data.summary);
      setRoomBreakdown(data.roomBreakdown || []);

      // Get current month's cost from monthly data
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7); // e.g. "2026-07"
      const currentMonthData = (data.monthly as MonthlyData[]).find(
        (m: MonthlyData) => m.month === currentMonth
      );
      setCurrentMonthCost(currentMonthData?.totalCost ?? 0);
    } catch {
      // Silently fail - dashboard still works without energy data
    } finally {
      setEnergyLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getTimeSinceLastLogin = (dateStr: string | null) => {
    if (!dateStr) return null;
    const last = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = now - last;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const memberSince = (dateStr: string | undefined) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>MyApp</h1>
        <nav className="header-nav">
          <button onClick={() => navigate('/dashboard')} className="btn-nav active">Dashboard</button>
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
        <div className="welcome-section">
          <h2>Welcome back, {user?.username}! 👋</h2>
          <p className="welcome-subtitle">
            {user?.lastLoginAt
              ? `Your last visit was ${getTimeSinceLastLogin(user.lastLoginAt)}`
              : "Great to see you! This is your first login."}
          </p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🕐</div>
            <div className="stat-content">
              <h3>Last Login</h3>
              <p className="stat-value">{user?.lastSeenAgo || 'This is your first login!'}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔑</div>
            <div className="stat-content">
              <h3>Total Logins</h3>
              <p className="stat-value">{user?.loginCount || 0}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <h3>Member Since</h3>
              <p className="stat-value">{memberSince(user?.createdAt)}</p>
            </div>
          </div>


        </div>

        {/* Energy Summary Card */}
        <div className="energy-summary-section">
          <h3>Energy Overview</h3>
          {energyLoading ? (
            <p className="loading-text">Loading energy data...</p>
          ) : energySummary ? (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📱</div>
                <div className="stat-content">
                  <h3>Devices Tracked</h3>
                  <p className="stat-value">{energySummary.deviceCount}</p>
                  <p className="stat-subtitle">Active devices</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <h3>This Month&apos;s Cost</h3>
                  <p className="stat-value">${currentMonthCost?.toFixed(2) ?? '0.00'}</p>
                  <p className="stat-subtitle">@ ${energySummary.costPerKwh}/kWh</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>Total Energy (12 mo)</h3>
                  <p className="stat-value">{energySummary.totalKwh} kWh</p>
                  <p className="stat-subtitle">${energySummary.totalCost} total cost</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="stat-subtitle">No energy data available. Add devices to start tracking.</p>
          )}
        </div>

        {/* Per-Room Energy Breakdown */}
        {!energyLoading && roomBreakdown.length > 0 && (
          <div className="energy-summary-section">
            <h3>Energy by Room / Zone</h3>
            <div className="room-breakdown-grid">
              {roomBreakdown.map((room) => (
                <div key={room.room} className="room-breakdown-card">
                  <div className="room-breakdown-header">
                    <span className="room-breakdown-name">{room.room}</span>
                    <span className="room-breakdown-devices">{room.deviceCount} device{room.deviceCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="room-breakdown-stats">
                    <div className="room-breakdown-stat">
                      <span className="room-stat-label">Energy (12 mo)</span>
                      <span className="room-stat-value">{room.totalKwh} kWh</span>
                    </div>
                    <div className="room-breakdown-stat">
                      <span className="room-stat-label">Cost (12 mo)</span>
                      <span className="room-stat-value">${room.totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
