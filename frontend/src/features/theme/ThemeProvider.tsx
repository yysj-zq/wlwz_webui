/**
 * ThemeProvider —— 明暗主题切换。
 *
 *  - localStorage key: `themeMode`（'light' | 'dark'）
 *  - body class: `dark-theme`（深色时）
 *  - documentElement colorScheme 同步
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeMode } from './theme-context';

const STORAGE_KEY = 'themeMode';

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyDomTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('dark-theme', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());

  useEffect(() => {
    applyDomTheme(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage 不可用时仍保留内存态
    }
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ mode, toggleMode, setMode }), [mode, toggleMode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
