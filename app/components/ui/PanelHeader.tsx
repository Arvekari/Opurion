import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

interface PanelHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export const PanelHeader = memo(({ className, children }: PanelHeaderProps) => {
  return (
    <div
      className={classNames(
        `flex items-center ${uiSpacingTokens.gap8} ${uiColorRoleTokens.surfaceDepth2} text-bolt-elements-textSecondary border-b border-bolt-elements-borderColor ${uiSpacingTokens.px16} ${uiSpacingTokens.py4} ${uiSpacingTokens.minH32} ${uiTypographyTokens.caption}`,
        className,
      )}
    >
      {children}
    </div>
  );
});
