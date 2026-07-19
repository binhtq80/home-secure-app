import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { settingsApi } from '../services/api';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'myapp-theme';

function getStorageKey(userId: string | undefined): string {
  return userId ? `${STORAGE_KEY_PREFIX}-${userId}` : STORAGE_KEY_PREFIX;
}

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(userId: string | undefined): Theme {
  const key = getStorageKey(userId);
  const saved = localStorage.getItem(key);
  if (saved === 'dark' || saved === 'light') return saved;
  return getSystemTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme(user?.id));
  const [hasSyncedFromBackend, setHasSyncedFromBackend] = useState(false);

  // When user changes (login/logout), reset theme to user-specific preference
  useEffect(() => {
    if (user?.id) {
      // User logged in — load their saved theme from localStorage
      const userTheme = getInitialTheme(user.id);
      setTheme(userTheme);
      setHasSyncedFromBackend(false); // trigger backend sync
    } else {
      // User logged out — fall back to system preference
      setTheme(getSystemTheme());
      setHasSyncedFromBackend(true); // no backend sync needed
    }
  }, [user?.id]);

  // Apply theme to DOM and persist to user-specific localStorage
  useEffect(() => {
    const key = getStorageKey(user?.id);
    localStorage.setItem(key, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme, user?.id]);

  // Load theme from backend when user is authenticated
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || hasSyncedFromBackend || !user?.id) return;

    settingsApi.get()
      .then((data) => {
        if (data.settings?.theme === 'dark' || data.settings?.theme === 'light') {
          setTheme(data.settings.theme);
        }
        setHasSyncedFromBackend(true);
      })
      .catch(() => {
        // Ignore errors — use local theme
        setHasSyncedFromBackend(true);
      });
  }, [hasSyncedFromBackend, user?.id]);

  const persistThemeToBackend = useCallback(async (newTheme: Theme) => {
    try {
      const data = await settingsApi.get();
      const merged = { ...(data.settings || {}), theme: newTheme };
      await settingsApi.update(merged);
    } catch {
      // Silently ignore — localStorage is the fallback
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';

      // Persist to backend if authenticated (merge with existing settings)
      const token = localStorage.getItem('accessToken');
      if (token) {
        persistThemeToBackend(next);
      }

      return next;
    });
  }, [persistThemeToBackend]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
