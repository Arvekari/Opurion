import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { cssTransition, ToastContainer } from 'react-toastify';
import { toast } from 'react-toastify';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    const storedThemeMode = localStorage.getItem('bolt_theme');
    const resolvedTheme =
      !storedThemeMode || storedThemeMode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : storedThemeMode;

    document.querySelector('html')?.setAttribute('data-theme', resolvedTheme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';
import { latestBranchStore } from './lib/stores/settings';
import { acknowledgeUpdate, checkForUpdates, requestSelfUpdate } from './lib/api/updates';

export default function App() {
  const theme = useStore(themeStore);
  const latestBranchUpdatesEnabled = useStore(latestBranchStore);

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    // Initialize debug logging with improved error handling
    import('./utils/debugLogger')
      .then(({ debugLogger }) => {
        /*
         * The debug logger initializes itself and starts disabled by default
         * It will only start capturing when enableDebugMode() is called
         */
        const status = debugLogger.getStatus();
        logStore.logSystem('Debug logging ready', {
          initialized: status.initialized,
          capturing: status.capturing,
          enabled: status.enabled,
        });
      })
      .catch((error) => {
        logStore.logError('Failed to initialize debug logging', error);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

    const runUpdateCheck = async () => {
      const notificationsEnabled = (() => {
        try {
          const raw = localStorage.getItem('settings');

          if (!raw) {
            return true;
          }

          const parsed = JSON.parse(raw) as { notifications?: boolean };

          return parsed.notifications !== false;
        } catch {
          return true;
        }
      })();

      if (!notificationsEnabled) {
        return;
      }

      const result = await checkForUpdates();

      if (cancelled || result.error || !result.available || result.version === 'unknown') {
        return;
      }

      const acknowledgedVersion = localStorage.getItem('last_acknowledged_update');
      const alreadyNotifiedVersion = sessionStorage.getItem('last_notified_update');

      if (acknowledgedVersion === result.version || alreadyNotifiedVersion === result.version) {
        return;
      }

      sessionStorage.setItem('last_notified_update', result.version);

      const olderVersionText =
        result.currentVersion && result.currentVersion !== 'unknown'
          ? `You are running ${result.currentVersion}.`
          : 'You are running an older version.';

      toast.info(
        <div className="space-y-2">
          <div className="text-sm font-medium">New version {result.version} is available</div>
          <div className="text-xs opacity-80">
            {olderVersionText} Source: {result.source}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs"
              onClick={() => {
                void acknowledgeUpdate(result.version);
                toast.dismiss();
              }}
            >
              Dismiss
            </button>
            {latestBranchUpdatesEnabled && (
              <button
                className="rounded border border-bolt-elements-borderColorActive px-2 py-1 text-xs"
                onClick={async () => {
                  const updateResult = await requestSelfUpdate(result.version);

                  if (updateResult.ok) {
                    toast.success(updateResult.message || 'Update process started.');
                  } else {
                    toast.warn(
                      updateResult.message || 'Automatic update is not available in this runtime. Update manually.',
                    );
                  }
                }}
              >
                Update now
              </button>
            )}
          </div>
        </div>,
        {
          autoClose: false,
          closeOnClick: false,
        },
      );
    };

    void runUpdateCheck();

    const intervalId = window.setInterval(() => {
      void runUpdateCheck();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [latestBranchUpdatesEnabled]);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
