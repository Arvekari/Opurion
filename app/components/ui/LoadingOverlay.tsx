import { uiColorRoleTokens, uiSpacingTokens, uiTypographyTokens } from './tokens';

export const LoadingOverlay = ({
  message = 'Loading...',
  progress,
  progressText,
}: {
  message?: string;
  progress?: number;
  progressText?: string;
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50 backdrop-blur-sm">
      <div
        className={`${uiColorRoleTokens.surfaceDepth2} relative flex flex-col items-center ${uiSpacingTokens.gap16} p-8 rounded-lg shadow-lg`}
      >
        <div
          className={'i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress'}
          style={{ fontSize: '2rem' }}
        ></div>
        <p className={`${uiTypographyTokens.headingMd} text-bolt-elements-textTertiary`}>{message}</p>
        {progress !== undefined && (
          <div className={`w-64 flex flex-col ${uiSpacingTokens.gap8}`}>
            <div className="w-full h-2 bg-bolt-elements-bg-depth-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-bolt-elements-loader-progress transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {progressText && (
              <p className={`${uiTypographyTokens.caption} text-bolt-elements-textTertiary text-center`}>
                {progressText}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
