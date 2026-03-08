import React from 'react';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';
import { uiSpacingTokens, uiTypographyTokens } from './tokens';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  separator?: string;
  maxItems?: number;
  renderItem?: (item: BreadcrumbItem, index: number, isLast: boolean) => React.ReactNode;
}

export function Breadcrumbs({
  items,
  className,
  separator = 'i-ph:caret-right',
  maxItems = 0,
  renderItem,
}: BreadcrumbsProps) {
  const displayItems =
    maxItems > 0 && items.length > maxItems
      ? [
          ...items.slice(0, 1),
          { label: '...', onClick: undefined, href: undefined },
          ...items.slice(-Math.max(1, maxItems - 2)),
        ]
      : items;

  const defaultRenderItem = (item: BreadcrumbItem, index: number, isLast: boolean) => {
    const content = (
      <div className={classNames(`flex items-center ${uiSpacingTokens.gap4}`)}>
        {item.icon && <span className={classNames(item.icon, 'w-3.5 h-3.5')} />}
        <span
          className={classNames(
            isLast
              ? `${uiTypographyTokens.bodySm} text-bolt-elements-textPrimary`
              : `${uiTypographyTokens.caption} text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary`,
            item.onClick || item.href ? 'cursor-pointer' : '',
          )}
        >
          {item.label}
        </span>
      </div>
    );

    if (item.href && !isLast) {
      return (
        <motion.a href={item.href} className="hover:underline" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          {content}
        </motion.a>
      );
    }

    if (item.onClick && !isLast) {
      return (
        <motion.button
          type="button"
          onClick={item.onClick}
          className="hover:underline"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {content}
        </motion.button>
      );
    }

    return content;
  };

  return (
    <nav className={classNames('flex items-center', className)} aria-label="Breadcrumbs">
      <ol className={classNames(`flex items-center ${uiSpacingTokens.gap4}`)}>
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;

          return (
            <li key={index} className="flex items-center">
              {renderItem ? renderItem(item, index, isLast) : defaultRenderItem(item, index, isLast)}
              {!isLast && (
                <span
                  className={classNames(separator, `w-3 h-3 ${uiSpacingTokens.px8} text-bolt-elements-textTertiary`)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
