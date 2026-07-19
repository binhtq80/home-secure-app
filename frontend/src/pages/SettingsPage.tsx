import { useTheme } from '../contexts/ThemeContext';
import { AppHeader } from '../components/AppHeader';

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Settings</h2>
        <p className="settings-subtitle">Configure your preferences.</p>

        <div className="settings-card">
          <h3>Appearance</h3>
          <div className="settings-appearance">
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <label htmlFor="darkModeToggle">Dark Mode</label>
                <p className="form-help">
                  Switch between light and dark theme. Your preference is saved locally.
                </p>
              </div>
              <button
                id="darkModeToggle"
                onClick={toggleTheme}
                className={`settings-toggle-switch ${theme === 'dark' ? 'active' : ''}`}
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label="Toggle dark mode"
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <p className="settings-current-theme">
              Current theme: <strong>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</strong>
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
