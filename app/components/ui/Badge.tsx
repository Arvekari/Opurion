import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '~/utils/classNames';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

const badgeVariants = cva(
  `inline-flex items-center ${uiSpacingTokens.gap4} transition-colors focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive focus:ring-offset-2`,
  {
    variants: {
      variant: {
        default: `${uiColorRoleTokens.surface} hover:bg-bolt-elements-bg-depth-2`,
        secondary: `bg-bolt-elements-bg-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-bg-depth-3`,
        destructive:
          'bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-backgroundHover',
        outline: 'text-bolt-elements-textPrimary',
        primary:
          'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
        success:
          'bg-bolt-elements-item-backgroundActive text-bolt-elements-icon-success hover:bg-bolt-elements-bg-depth-2',
        warning:
          'bg-bolt-elements-item-backgroundActive text-bolt-elements-icon-warning hover:bg-bolt-elements-bg-depth-2',
        danger:
          'bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-backgroundHover',
        info: 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-backgroundActive',
        subtle:
          'border border-bolt-elements-borderColor/30 bg-bolt-elements-bg-depth-2/70 backdrop-blur-sm text-bolt-elements-textSecondary',
      },
      size: {
        default: `rounded-full ${uiSpacingTokens.px8} ${uiSpacingTokens.py4} ${uiTypographyTokens.bodyXs}`,
        sm: `rounded-full px-1 py-1 ${uiTypographyTokens.bodyXs}`,
        md: `rounded-md ${uiSpacingTokens.px8} ${uiSpacingTokens.py4} ${uiTypographyTokens.bodyXs}`,
        lg: `rounded-md ${uiSpacingTokens.px16} ${uiSpacingTokens.py8} ${uiTypographyTokens.bodySm}`,
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  icon?: string;
}

function Badge({ className, variant, size, icon, children, ...props }: BadgeProps) {
  return (
    <div className={classNames(badgeVariants({ variant, size }), className)} {...props}>
      {icon && <span className={icon} />}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
