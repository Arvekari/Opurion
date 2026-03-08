import { memo, useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { uiSpacingTokens, uiTypographyTokens } from './tokens';

interface LoadingDotsProps {
  text: string;
}

export const LoadingDots = memo(({ text }: LoadingDotsProps) => {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prevDotCount) => (prevDotCount + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={classNames(
        'flex justify-center items-center h-full text-bolt-elements-textSecondary',
        uiTypographyTokens.caption,
      )}
    >
      <div className={classNames('inline-flex items-center', uiSpacingTokens.gap4)}>
        <span>{text}</span>
        <span className="inline-block min-w-3">{'.'.repeat(dotCount)}</span>
      </div>
    </div>
  );
});
