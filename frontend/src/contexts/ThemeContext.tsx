import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { settingsApi } from '../services/api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'myapp-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [hasSyncedFromBackend, setHasSyncedFromBackend] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load theme from backend when user is authenticated
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || hasSyncedFromBackend) return;

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
  }, [hasSyncedFromBackend]);

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
