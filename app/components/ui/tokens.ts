export const uiTypographyTokens = {
  headingMd: 'text-xl font-semibold leading-6 tracking-tight',
  bodySm: 'text-sm font-medium',
  bodyXs: 'text-xs font-medium',
  caption: 'text-sm',
} as const;

export const uiColorRoleTokens = {
  primary:
    'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
  secondary:
    'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover',
  danger:
    'bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-backgroundHover',
  surface: 'bg-bolt-elements-bg-depth-1 text-bolt-elements-textPrimary',
  surfaceDepth2: 'bg-bolt-elements-bg-depth-2 text-bolt-elements-textPrimary',
  borderDefault: 'border border-bolt-elements-borderColor',
} as const;

export const uiSpacingTokens = {
  gap4: 'gap-1',
  gap8: 'gap-2',
  gap16: 'gap-4',
  pad4: 'p-1',
  pad8: 'p-2',
  pad16: 'p-4',
  pad24: 'p-6',
  px8: 'px-2',
  px16: 'px-4',
  px24: 'px-6',
  py4: 'py-1',
  py8: 'py-2',
  py16: 'py-4',
  minH32: 'min-h-8',
} as const;

export const uiButtonClassTokens = {
  primaryActionCompact:
    'items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex',
  primaryIconCompact:
    'items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex',
} as const;

export const uiStateClassTokens = {
  toggleActive: 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
  toggleInactive: 'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault',
} as const;
