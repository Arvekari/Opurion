import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
  instanceId: string; // Track which instance is active
}

export const webcontainerContext: WebContainerContext = (import.meta.hot?.data?.webcontainerContext as WebContainerContext) ?? {
  loaded: false,
  instanceId: generateInstanceId(),
};

if (import.meta.hot?.data) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

function generateInstanceId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Track the current instance to prevent multiple concurrent instances
let currentInstanceId = webcontainerContext.instanceId;

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

async function setupWebContainer(instance: WebContainer): Promise<WebContainer> {
  try {
    const { workbenchStore } = await import('~/lib/stores/workbench');

    const response = await fetch('/inspector-script.js');
    const inspectorScript = await response.text();
    await instance.setPreviewScript(inspectorScript);

    // Listen for preview errors
    instance.on('preview-message', (message) => {
      console.log('WebContainer preview message:', message);

      // Handle both uncaught exceptions and unhandled promise rejections
      if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
        const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
        const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
        workbenchStore.actionAlert.set({
          type: 'preview',
          title,
          description: 'message' in message ? message.message : 'Unknown error',
          content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
          source: 'preview',
        });
      }
    });

    return instance;
  } catch (error) {
    console.error('Failed to setup WebContainer:', error);
    throw error;
  }
}

async function shutdownWebContainer(instance: WebContainer | undefined): Promise<void> {
  if (!instance) {
    return;
  }

  try {
    // Gracefully shutdown the old instance
    console.log('[WebContainer] Shutting down old instance');
    
    // Remove all event listeners to prevent memory leaks
    instance.off?.('preview-message');
    instance.off?.('preview-error');
    
    // Attempt to teardown if available
    if (typeof (instance as any).teardown === 'function') {
      await (instance as any).teardown();
    }
  } catch (error) {
    console.warn('[WebContainer] Error during shutdown (non-fatal):', error);
  }
}

if (!import.meta.env.SSR) {
  const bootWebContainer = async () => {
    // Generate a new instance ID for this boot
    const bootInstanceId = generateInstanceId();
    currentInstanceId = bootInstanceId;
    webcontainerContext.instanceId = bootInstanceId;

    try {
      const instance = await WebContainer.boot({
        coep: 'credentialless',
        workdirName: WORK_DIR_NAME,
        forwardPreviewErrors: true, // Enable error forwarding from iframes
      });

      // Only proceed if this is still the current instance (not superseded by a newer boot)
      if (currentInstanceId !== bootInstanceId) {
        console.log('[WebContainer] Instance superseded, shutting down');
        await shutdownWebContainer(instance);
        // Return the current instance instead
        return webcontainer;
      }

      webcontainerContext.loaded = true;
      console.log('[WebContainer] New instance booted:', bootInstanceId);

      const setupInstance = await setupWebContainer(instance);
      return setupInstance;
    } catch (error) {
      console.error('[WebContainer] Failed to boot:', error);
      webcontainerContext.loaded = false;
      throw error;
    }
  };

  webcontainer = (import.meta.hot?.data?.webcontainer ?? bootWebContainer()) as Promise<WebContainer>;

  if (import.meta.hot?.data) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}

/**
 * Force a restart of the WebContainer instance.
 * Shuts down the current instance and boots a new one.
 * All subsequent operations will use the new instance.
 */
export async function restartWebContainer(): Promise<WebContainer> {
  try {
    // Get the old instance before creating a new one
    const oldInstance = await Promise.race([
      webcontainer,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
    ]);

    if (oldInstance) {
      await shutdownWebContainer(oldInstance);
    }

    // Generate new instance and boot it
    const newInstanceId = generateInstanceId();
    currentInstanceId = newInstanceId;
    webcontainerContext.instanceId = newInstanceId;

    console.log('[WebContainer] Restarting - shutting down old instance and booting new one');

    const newInstance = await WebContainer.boot({
      coep: 'credentialless',
      workdirName: WORK_DIR_NAME,
      forwardPreviewErrors: true,
    });

    webcontainerContext.loaded = true;
    console.log('[WebContainer] New instance started:', newInstanceId);

    // Setup the new instance
    const setupInstance = await setupWebContainer(newInstance);

    // Update the global webcontainer promise
    webcontainer = Promise.resolve(setupInstance);
    if (import.meta.hot?.data) {
      import.meta.hot.data.webcontainer = webcontainer;
    }

    return setupInstance;
  } catch (error) {
    console.error('[WebContainer] Restart failed:', error);
    webcontainerContext.loaded = false;
    throw error;
  }
}
