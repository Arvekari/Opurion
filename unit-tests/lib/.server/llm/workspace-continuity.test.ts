import { describe, expect, it } from 'vitest';
import { buildWorkspaceContinuationPromptAddon } from '~/lib/.server/llm/workspace-continuity';

describe('workspace continuity prompt guard', () => {
  it('forces modify-in-place guidance for follow-up Vite error reports on an existing workspace', () => {
    const addon = buildWorkspaceContinuationPromptAddon({
      chatMode: 'build',
      summary: 'A Vite React app was already created and the user is iterating on it.',
      messages: [
        { role: 'user', content: 'Create a React Vite app with i18n support.' },
        { role: 'assistant', content: 'Created the initial project files.' },
        {
          role: 'user',
          content:
            '[plugin:vite:import-analysis] Failed to resolve import "react-i18next" from "src/App.jsx". Does the file exist?',
        },
      ],
      files: {
        '/home/project/package.json': { type: 'file', content: '{"name":"demo"}', isBinary: false },
        '/home/project/index.html': { type: 'file', content: '<!doctype html>', isBinary: false },
        '/home/project/src/App.jsx': { type: 'file', content: 'import { useTranslation } from "react-i18next";', isBinary: false },
        '/home/project/src/main.jsx': { type: 'file', content: 'import React from "react";', isBinary: false },
      },
    });

    expect(addon).toContain('continuation of that project');
    expect(addon).toContain('Treat pasted compiler, bundler, runtime, preview, or test errors as diagnostics');
    expect(addon).toContain('Do NOT recreate the whole app or scaffold a fresh starter project');
    expect(addon).toContain('- package.json');
    expect(addon).toContain('- src/App.jsx');
  });

  it('applies continuity guidance for follow-up discussion-mode requests on an existing workspace', () => {
    const addon = buildWorkspaceContinuationPromptAddon({
      chatMode: 'discuss',
      messages: [
        { role: 'user', content: 'Create a React Vite app for a nail salon.' },
        { role: 'assistant', content: 'Created the initial project files.' },
        { role: 'user', content: 'Continue the existing app and fix the current issues instead of recreating it.' },
      ],
      files: {
        '/home/project/package.json': { type: 'file', content: '{"name":"demo"}', isBinary: false },
        '/home/project/src/App.jsx': { type: 'file', content: 'export default function App() {}', isBinary: false },
      },
    });

    expect(addon).toContain('continuation of that project');
    expect(addon).toContain('Modify the existing project in place');
  });

  it('does not force continuity guidance for an explicit start-over request', () => {
    const addon = buildWorkspaceContinuationPromptAddon({
      chatMode: 'build',
      messages: [
        { role: 'assistant', content: 'Previous app exists.' },
        { role: 'user', content: 'Start over from scratch and recreate the project as a new Vue app.' },
      ],
      files: {
        '/home/project/package.json': { type: 'file', content: '{"name":"demo"}', isBinary: false },
        '/home/project/src/App.jsx': { type: 'file', content: 'export default function App() {}', isBinary: false },
      },
    });

    expect(addon).toBeUndefined();
  });

  it('does not add continuity guidance for a first-turn greenfield request without workspace files', () => {
    const addon = buildWorkspaceContinuationPromptAddon({
      chatMode: 'build',
      messages: [{ role: 'user', content: 'Create a new dashboard app.' }],
      files: {},
    });

    expect(addon).toBeUndefined();
  });
});