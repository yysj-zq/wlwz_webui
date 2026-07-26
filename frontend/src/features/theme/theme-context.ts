/**
 * Theme context + hook（与 ThemeProvider 组件分文件，满足 react-refresh）。
 */
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
  readonly mode: ThemeMode;
  readonly toggleMode: () => void;
  readonly setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
