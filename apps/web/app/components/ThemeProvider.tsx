'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeCtx = {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'firon:theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with whatever the pre-hydration script stamped on <html>.
  // Fall back to 'dark' during SSR so the initial React tree matches the class.
  const [theme, setTheme] = useState<Theme>('dark');

  // Sync state with what the pre-hydration script actually stamped.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);

  const set = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* private mode etc, ignore */ }
  };

  const toggle = () => set(theme === 'dark' ? 'light' : 'dark');

  return <Ctx.Provider value={{ theme, toggle, set }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
