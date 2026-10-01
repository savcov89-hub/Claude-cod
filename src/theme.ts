// Light / dark theme: follows the phone by default, or fixed by the user (kept on this device).
export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'tl-theme';
const BG = { light: '#f3f2ef', dark: '#121110' };

export function getTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(mode: ThemeMode = getTheme()) {
  const html = document.documentElement;
  if (mode === 'auto') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', mode);
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  // The browser bar and status bar follow the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BG.dark : BG.light);
}

export function setTheme(mode: ThemeMode) {
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* not kept; still applied for now */
  }
  applyTheme(mode);
}

/** Auto → light → dark → auto. */
export const nextTheme = (mode: ThemeMode): ThemeMode => (mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto');
export const themeLabel: Record<ThemeMode, string> = { auto: 'Тема: как на телефоне', light: 'Тема: светлая', dark: 'Тема: тёмная' };

if (typeof window !== 'undefined') window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
