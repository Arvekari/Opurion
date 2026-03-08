export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  version: string;
  source: string;
  releaseNotes?: string;
  error?: {
    type: 'rate_limit' | 'network' | 'auth' | 'unknown';
    message: string;
  };
}

export interface SelfUpdateResult {
  ok: boolean;
  message?: string;
  canAutoUpdate?: boolean;
  instructions?: string[];
}

interface PackageJson {
  version: string;
  name: string;
  [key: string]: unknown;
}

function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const version1 = v1.replace(/^v/, '');
  const version2 = v2.replace(/^v/, '');

  const parts1 = version1.split('.').map(Number);
  const parts2 = version2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 !== part2) {
      return part1 - part2;
    }
  }

  return 0;
}

export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  try {
    // Get the current version from local package.json
    const packageResponse = await fetch('/package.json');

    if (!packageResponse.ok) {
      throw new Error('Failed to fetch local package.json');
    }

    const packageData = (await packageResponse.json()) as PackageJson;

    if (!packageData.version || typeof packageData.version !== 'string') {
      throw new Error('Invalid package.json format: missing or invalid version');
    }

    const currentVersion = packageData.version;

    const source = 'Arvekari/Bolt2.dyi';

    /*
     * Get the latest version from GitHub's main branch package.json
     * Using raw.githubusercontent.com which doesn't require authentication
     */
    const latestPackageResponse = await fetch('https://raw.githubusercontent.com/Arvekari/Bolt2.dyi/main/package.json');

    if (!latestPackageResponse.ok) {
      throw new Error(`Failed to fetch latest package.json: ${latestPackageResponse.status}`);
    }

    const latestPackageData = (await latestPackageResponse.json()) as PackageJson;

    if (!latestPackageData.version || typeof latestPackageData.version !== 'string') {
      throw new Error('Invalid remote package.json format: missing or invalid version');
    }

    const latestVersion = latestPackageData.version;

    // Compare versions semantically
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      available: hasUpdate,
      currentVersion,
      version: latestVersion,
      source,
      releaseNotes: hasUpdate ? 'Update available. Check GitHub for release notes.' : undefined,
    };
  } catch (error) {
    console.error('Error checking for updates:', error);

    // Determine error type
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const isNetworkError =
      errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch');

    return {
      available: false,
      currentVersion: 'unknown',
      version: 'unknown',
      source: 'Arvekari/Bolt2.dyi',
      error: {
        type: isNetworkError ? 'network' : 'unknown',
        message: `Failed to check for updates: ${errorMessage}`,
      },
    };
  }
};

export const acknowledgeUpdate = async (version: string): Promise<void> => {
  // Store the acknowledged version in localStorage
  try {
    localStorage.setItem('last_acknowledged_update', version);
  } catch (error) {
    console.error('Failed to store acknowledged version:', error);
  }
};

export const requestSelfUpdate = async (targetVersion: string): Promise<SelfUpdateResult> => {
  try {
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'auto',
        targetVersion,
      }),
    });

    const data = (await response.json()) as SelfUpdateResult;

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || data.instructions?.[0] || data.message || 'Failed to trigger update',
        canAutoUpdate: data.canAutoUpdate,
        instructions: data.instructions,
      };
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      ok: false,
      message: `Failed to request self-update: ${message}`,
      canAutoUpdate: false,
    };
  }
};
