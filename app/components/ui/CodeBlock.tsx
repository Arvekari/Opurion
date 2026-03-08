import React, { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';
import { FileIcon } from './FileIcon';
import { Tooltip } from './Tooltip';
import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  maxHeight?: string;
  className?: string;
  onCopy?: () => void;
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = true,
  highlightLines = [],
  maxHeight = '400px',
  className,
  onCopy,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  const lines = code.split('\n');

  return (
    <div
      className={classNames(
        `rounded-lg overflow-hidden ${uiColorRoleTokens.borderDefault}`,
        'bg-bolt-elements-bg-depth-2',
        className,
      )}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between ${uiSpacingTokens.px16} ${uiSpacingTokens.py8} bg-bolt-elements-bg-depth-3 border-b border-bolt-elements-borderColor`}
      >
        <div className={`flex items-center ${uiSpacingTokens.gap8}`}>
          {filename && (
            <>
              <FileIcon filename={filename} size="sm" />
              <span className={`${uiTypographyTokens.bodyXs} text-bolt-elements-textSecondary`}>{filename}</span>
            </>
          )}
          {language && !filename && (
            <span className={`${uiTypographyTokens.bodyXs} text-bolt-elements-textSecondary uppercase`}>
              {language}
            </span>
          )}
        </div>
        <Tooltip content={copied ? 'Copied!' : 'Copy code'}>
          <motion.button
            onClick={handleCopy}
            className={`${uiSpacingTokens.py4} ${uiSpacingTokens.px8} rounded-md text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary hover:bg-bolt-elements-bg-depth-2 transition-colors`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {copied ? <span className="i-ph:check w-4 h-4 text-green-500" /> : <span className="i-ph:copy w-4 h-4" />}
          </motion.button>
        </Tooltip>
      </div>

      {/* Code content */}
      <div
        className={classNames('overflow-auto', `font-mono ${uiTypographyTokens.caption}`, 'custom-scrollbar')}
        style={{ maxHeight }}
      >
        <table className="min-w-full border-collapse">
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={index}
                className={classNames(
                  highlightLines.includes(index + 1) ? 'bg-bolt-elements-button-primary-background' : '',
                  'hover:bg-bolt-elements-bg-depth-3',
                )}
              >
                {showLineNumbers && (
                  <td
                    className={`py-1 ${uiSpacingTokens.px16} ${uiSpacingTokens.py4} text-right select-none text-bolt-elements-textTertiary border-r border-bolt-elements-borderColor`}
                  >
                    <span className="inline-block min-w-[1.5rem] text-xs">{index + 1}</span>
                  </td>
                )}
                <td className={`py-1 ${uiSpacingTokens.px16} text-bolt-elements-textPrimary whitespace-pre`}>
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
