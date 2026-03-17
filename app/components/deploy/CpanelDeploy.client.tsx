import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory';
import { formatBuildFailureOutput } from './deployUtils';
import { cpanelConnection } from '~/lib/stores/cpanel';

export function useCpanelDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const conn = useStore(cpanelConnection);
  const currentChatId = useStore(chatId);

  const handleCpanelDeploy = async () => {
    if (!conn.user || !conn.token || !conn.host || !conn.username) {
      toast.error('Please connect to cPanel first in Settings.');
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      const deploymentId = `deploy-cpanel-${Date.now()}`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'cPanel Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'cpanel' as any });

      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: 'cpanel build',
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      artifact.runner.addAction(actionData);
      await artifact.runner.runAction(actionData);

      const buildOutput = artifact.runner.buildOutput;

      if (!buildOutput || buildOutput.exitCode !== 0) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: 'cpanel' as any,
        });
        throw new Error('Build failed');
      }

      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'cpanel' as any });

      const container = await webcontainer;
      const buildPath = buildOutput.path.replace('/home/project', '');
      let finalBuildPath = buildPath;
      const candidates = [buildPath, '/dist', '/build', '/out', '/output', '/public'];
      let found = false;

      for (const candidate of candidates) {
        try {
          await container.fs.readdir(candidate);
          finalBuildPath = candidate;
          found = true;
          break;
        } catch {
          continue;
        }
      }

      if (!found) {
        throw new Error('Could not find build output directory.');
      }

      async function getAllFiles(dirPath: string): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile()) {
            const content = await container.fs.readFile(fullPath, 'utf-8');
            const deployPath = fullPath.replace(finalBuildPath, '');
            files[deployPath] = content;
          } else if (entry.isDirectory()) {
            Object.assign(files, await getAllFiles(fullPath));
          }
        }

        return files;
      }

      const files = await getAllFiles(finalBuildPath);

      const response = await fetch('/api/cpanel-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: conn.host,
          username: conn.username,
          token: conn.token,
          rootPath: conn.rootPath,
          files,
          chatId: currentChatId,
        }),
      });
      const data = (await response.json()) as any;

      if (!response.ok || !data.success) {
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data?.error || 'cPanel deployment failed',
          source: 'cpanel' as any,
        });
        throw new Error(data?.error || 'cPanel deployment failed');
      }

      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: data.url,
        source: 'cpanel' as any,
      });
      toast.success('🚀 cPanel deployment completed');

      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'cPanel deployment failed');
      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleCpanelDeploy,
    isConnected: !!conn.user,
  };
}
