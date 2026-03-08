import React from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

interface FilterChipProps {
  /** The label text to display */
  label: string;

  /** Optional value to display after the label */
  value?: string | number;

  /** Function to call when the remove button is clicked */
  onRemove?: () => void;

  /** Whether the chip is active/selected */
  active?: boolean;

  /** Optional icon to display before the label */
  icon?: string;

  /** Additional class name */
  className?: string;
}

/**
 * FilterChip component
 *
 * A chip component for displaying filters with optional remove button.
 */
export function FilterChip({ label, value, onRemove, active = false, icon, className }: FilterChipProps) {
  // Animation variants
  const variants = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ duration: 0.2 }}
      className={classNames(
        `inline-flex items-center ${uiSpacingTokens.gap4} ${uiSpacingTokens.px8} ${uiSpacingTokens.py4} rounded-lg ${uiTypographyTokens.bodyXs} transition-all`,
        active
          ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text border border-bolt-elements-borderColorActive/30'
          : `bg-bolt-elements-bg-depth-2 text-bolt-elements-textSecondary ${uiColorRoleTokens.borderDefault}`,
        onRemove && 'pr-1',
        className,
      )}
    >
      {/* Icon */}
      {icon && <span className={classNames(icon, 'text-inherit')} />}

      {/* Label and value */}
      <span>
        {label}
        {value !== undefined && ': '}
        {value !== undefined && (
          <span
            className={
              active ? 'text-bolt-elements-button-primary-text font-semibold' : 'text-bolt-elements-textPrimary'
            }
          >
            {value}
          </span>
        )}
      </span>

      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={classNames(
            'ml-1 p-0.5 rounded-full hover:bg-bolt-elements-bg-depth-3 transition-colors',
            active ? 'text-bolt-elements-button-primary-text' : 'text-bolt-elements-textTertiary',
          )}
          aria-label={`Remove ${label} filter`}
        >
          <span className="i-ph:x w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}
