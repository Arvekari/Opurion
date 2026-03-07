import { atom } from 'nanostores';
import { logStore } from './logs';

export type Theme = 'dark' | 'light';
export type ThemeMode = Theme | 'system';

export const kTheme = 'bolt_theme';

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

export const DEFAULT_THEME = 'light';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

function resolveSystemTheme(): Theme {
  if (!import.meta.env.SSR) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return DEFAULT_THEME;
}

function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? resolveSystemTheme() : mode;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

function setHtmlTheme(theme: Theme) {
  document.querySelector('html')?.setAttribute('data-theme', theme);
}

function initThemeModeStore() {
  if (!import.meta.env.SSR) {
    const persistedTheme = localStorage.getItem(kTheme);

    if (isThemeMode(persistedTheme)) {
      return persistedTheme;
    }
  }

  return DEFAULT_THEME_MODE;
}

export const themeModeStore = atom<ThemeMode>(initThemeModeStore());
export const themeStore = atom<Theme>(initStore());

function initStore() {
  if (!import.meta.env.SSR) {
    const persistedTheme = localStorage.getItem(kTheme);

    if (isThemeMode(persistedTheme)) {
      return resolveTheme(persistedTheme);
    }

    const themeAttribute = document.querySelector('html')?.getAttribute('data-theme');

    if (themeAttribute === 'dark' || themeAttribute === 'light') {
      return themeAttribute;
    }

    return resolveTheme(DEFAULT_THEME_MODE);
  }

  return DEFAULT_THEME;
}

export function setThemeMode(newThemeMode: ThemeMode) {
  const resolvedTheme = resolveTheme(newThemeMode);

  themeModeStore.set(newThemeMode);
  themeStore.set(resolvedTheme);
  localStorage.setItem(kTheme, newThemeMode);
  setHtmlTheme(resolvedTheme);

  try {
    const userProfile = localStorage.getItem('bolt_user_profile');

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = newThemeMode;
      localStorage.setItem('bolt_user_profile', JSON.stringify(profile));
    }
  } catch (error) {
    console.error('Error updating user profile theme:', error);
  }

  logStore.logSystem(`Theme changed to ${newThemeMode} mode`);
}

export function toggleTheme() {
  const currentTheme = themeStore.get();
  const newThemeMode: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';
  setThemeMode(newThemeMode);
}

if (!import.meta.env.SSR) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (themeModeStore.get() === 'system') {
      const resolvedTheme = resolveTheme('system');
      themeStore.set(resolvedTheme);
      setHtmlTheme(resolvedTheme);
    }
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  } else {
    mediaQuery.addListener(handleSystemThemeChange);
  }
}
