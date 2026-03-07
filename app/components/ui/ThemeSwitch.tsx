import { useStore } from '@nanostores/react';
import { memo, useEffect, useState, type ChangeEvent } from 'react';
import { setThemeMode, themeModeStore, type ThemeMode } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch = memo(({ className }: ThemeSwitchProps) => {
  const themeMode = useStore(themeModeStore);
  const [domLoaded, setDomLoaded] = useState(false);

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setThemeMode(event.target.value as ThemeMode);
  };

  return (
    domLoaded && (
      <div className={classNames('flex items-center gap-2', className)}>
        <div className="i-ph:palette-duotone text-bolt-elements-textSecondary text-lg" />
        <select
          value={themeMode}
          onChange={handleThemeChange}
          aria-label="Theme Mode"
          title="Theme Mode"
          className={classNames(
            'px-2 py-1 rounded-md text-xs',
            'bg-bolt-elements-bg-depth-2 text-bolt-elements-textPrimary',
            'border border-bolt-elements-borderColor',
            'focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive',
          )}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </div>
    )
  );
});
