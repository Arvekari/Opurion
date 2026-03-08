import { forwardRef } from 'react';
import { classNames } from '~/utils/classNames';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={classNames(
        `flex w-full rounded-md ${uiColorRoleTokens.borderDefault} ${uiColorRoleTokens.surface} ${uiSpacingTokens.minH32} ${uiSpacingTokens.px16} ${uiSpacingTokens.py8} ${uiTypographyTokens.caption} ring-offset-bolt-elements-bg-depth-1 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-bolt-elements-textSecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`,
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export { Input };
