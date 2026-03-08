import React from 'react';
import { Badge } from './Badge';
import { classNames } from '~/utils/classNames';
import { formatSize } from '~/utils/formatSize';
import { uiSpacingTokens, uiTypographyTokens } from './tokens';

interface RepositoryStatsProps {
  stats: {
    totalFiles?: number;
    totalSize?: number;
    languages?: Record<string, number>;
    hasPackageJson?: boolean;
    hasDependencies?: boolean;
  };
  className?: string;
  compact?: boolean;
}

export function RepositoryStats({ stats, className, compact = false }: RepositoryStatsProps) {
  const { totalFiles, totalSize, languages, hasPackageJson, hasDependencies } = stats;

  return (
    <div className={classNames('space-y-4', className)}>
      {!compact && (
        <p className={`${uiTypographyTokens.caption} text-bolt-elements-textPrimary`}>Repository Statistics:</p>
      )}

      <div className={classNames('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}>
        {totalFiles !== undefined && (
          <div className={`flex items-center ${uiSpacingTokens.gap8} text-bolt-elements-textPrimary`}>
            <span className="i-ph:files text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'text-xs' : 'text-sm'}>Total Files: {totalFiles.toLocaleString()}</span>
          </div>
        )}

        {totalSize !== undefined && (
          <div className={`flex items-center ${uiSpacingTokens.gap8} text-bolt-elements-textPrimary`}>
            <span className="i-ph:database text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'text-xs' : 'text-sm'}>Total Size: {formatSize(totalSize)}</span>
          </div>
        )}
      </div>

      {languages && Object.keys(languages).length > 0 && (
        <div className={compact ? 'pt-1' : 'pt-2'}>
          <div className={`flex items-center ${uiSpacingTokens.gap8} text-bolt-elements-textPrimary mb-2`}>
            <span className="i-ph:code text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'text-xs' : 'text-sm'}>Languages:</span>
          </div>
          <div className={`flex flex-wrap ${uiSpacingTokens.gap8}`}>
            {Object.entries(languages)
              .sort(([, a], [, b]) => b - a)
              .slice(0, compact ? 3 : 5)
              .map(([lang, size]) => (
                <Badge key={lang} variant="subtle" size={compact ? 'sm' : 'md'}>
                  {lang} ({formatSize(size)})
                </Badge>
              ))}
            {Object.keys(languages).length > (compact ? 3 : 5) && (
              <Badge variant="subtle" size={compact ? 'sm' : 'md'}>
                +{Object.keys(languages).length - (compact ? 3 : 5)} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {(hasPackageJson || hasDependencies) && (
        <div className={compact ? 'pt-1' : 'pt-2'}>
          <div className={`flex flex-wrap ${uiSpacingTokens.gap8}`}>
            {hasPackageJson && (
              <Badge variant="primary" size={compact ? 'sm' : 'md'} icon="i-ph:package w-3.5 h-3.5">
                package.json
              </Badge>
            )}
            {hasDependencies && (
              <Badge variant="primary" size={compact ? 'sm' : 'md'} icon="i-ph:tree-structure w-3.5 h-3.5">
                Dependencies
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
