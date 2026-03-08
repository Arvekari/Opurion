import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '~/utils/classNames';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

const buttonVariants = cva(
  `inline-flex items-center justify-center whitespace-nowrap rounded-md ${uiTypographyTokens.bodySm} transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bolt-elements-borderColor disabled:pointer-events-none disabled:opacity-50`,
  {
    variants: {
      variant: {
        default: uiColorRoleTokens.primary,
        destructive: uiColorRoleTokens.danger,
        outline: `${uiColorRoleTokens.borderDefault} bg-transparent hover:bg-bolt-elements-bg-depth-2 hover:text-bolt-elements-textPrimary text-bolt-elements-textPrimary`,
        secondary: uiColorRoleTokens.secondary,
        ghost: 'hover:bg-bolt-elements-bg-depth-2 hover:text-bolt-elements-textPrimary',
        link: 'text-bolt-elements-textPrimary underline-offset-4 hover:underline',
      },
      size: {
        default: `${uiSpacingTokens.minH32} ${uiSpacingTokens.px16} ${uiSpacingTokens.py8}`,
        sm: `rounded-md ${uiSpacingTokens.px8} ${uiSpacingTokens.py4} ${uiTypographyTokens.bodyXs}`,
        lg: `rounded-md ${uiSpacingTokens.px24} ${uiSpacingTokens.py8}`,
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, ...props }, ref) => {
    return <button className={classNames(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
