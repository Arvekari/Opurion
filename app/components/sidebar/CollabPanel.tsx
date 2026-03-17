import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import {
  bumpCollabRefresh,
  collabStore,
  setCollabBranchMode,
  setCollabConversation,
  setCollabProject,
} from '~/lib/stores/collab';

type Project = { id: string; name: string; role: 'owner' | 'editor' | 'viewer' };
type Conversation = { id: string; title: string };
type Branch = { id: string; name: string; isMain: boolean; status: 'active' | 'merged' };

function dedupeConversations(conversations: Conversation[]): Conversation[] {
  const byId = new Map<string, Conversation>();

  for (const conversation of conversations) {
    const id = String(conversation.id || '').trim();

    if (!id) {
      continue;
    }

    if (!byId.has(id)) {
      byId.set(id, conversation);
    }
  }

  return Array.from(byId.values());
}

export function CollabPanel() {
  const collab = useStore(collabStore);
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [newProjectName, setNewProjectName] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor');
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [mergeBranchId, setMergeBranchId] = useState('');

  const loadProjects = useCallback(async () => {
    const response = await fetch('/api/collab/projects');
    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Failed to load projects');
    }

    setProjects(data.projects || []);
  }, []);

  const loadConversations = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/collab/conversations?projectId=${encodeURIComponent(projectId)}`);
    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Failed to load conversations');
    }

    setConversations(dedupeConversations((data.conversations || []) as Conversation[]));
  }, []);

  const loadBranches = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/collab/branches?conversationId=${encodeURIComponent(conversationId)}`);
    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Failed to load branches');
    }

    setBranches(data.branches || []);
  }, []);

  useEffect(() => {
    loadProjects().catch((error) => {
      console.error(error);
      toast.error('Failed to load collaboration projects');
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!collab.selectedProjectId) {
      setConversations([]);
      return;
    }

    loadConversations(collab.selectedProjectId).catch((error) => {
      console.error(error);
      toast.error('Failed to load conversations');
    });
  }, [collab.selectedProjectId, loadConversations]);

  useEffect(() => {
    if (!collab.selectedConversationId) {
      setBranches([]);
      return;
    }

    loadBranches(collab.selectedConversationId).catch((error) => {
      console.error(error);
      toast.error('Failed to load branches');
    });
  }, [collab.selectedConversationId, loadBranches]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === collab.selectedProjectId),
    [projects, collab.selectedProjectId],
  );

  const createProject = async () => {
    const name = newProjectName.trim();

    if (!name) {
      return;
    }

    const response = await fetch('/api/collab/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'create', name }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      toast.error(data?.error || 'Project creation failed');
      return;
    }

    setNewProjectName('');
    await loadProjects();
    setCollabProject(data.project?.id);
    toast.success('Shared project created');
  };

  const shareProject = async () => {
    const email = shareEmail.trim().toLowerCase();

    if (!collab.selectedProjectId || !email) {
      return;
    }

    const response = await fetch('/api/collab/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'share',
        projectId: collab.selectedProjectId,
        email,
        role: shareRole,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      toast.error(data?.error || 'Project share failed');
      return;
    }

    setShareEmail('');
    toast.success('Project shared');
  };

  const createConversation = async () => {
    if (!collab.selectedProjectId) {
      return;
    }

    const title = newConversationTitle.trim() || 'Shared Conversation';

    const response = await fetch('/api/collab/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'createConversation',
        projectId: collab.selectedProjectId,
        title,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      toast.error(data?.error || 'Conversation creation failed');
      return;
    }

    setNewConversationTitle('');
    await loadConversations(collab.selectedProjectId);
    setCollabConversation(data.conversation?.id);
    bumpCollabRefresh();
    toast.success('Shared conversation created');
  };

  const mergeBranch = async () => {
    if (!collab.selectedConversationId || !mergeBranchId) {
      return;
    }

    const response = await fetch('/api/collab/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'mergeToMain',
        conversationId: collab.selectedConversationId,
        sourceBranchId: mergeBranchId,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      toast.error(data?.error || 'Merge failed');
      return;
    }

    bumpCollabRefresh();
    setMergeBranchId('');
    await loadBranches(collab.selectedConversationId);
    toast.success(`Merged ${data.mergedCount ?? 0} messages to main`);
  };

  const mergeCandidates = branches.filter((branch) => !branch.isMain && branch.status === 'active');
  const canCreateProject = newProjectName.trim().length > 0;
  const canShareProject = Boolean(collab.selectedProjectId && shareEmail.trim().length > 0);
  const canCreateConversation = Boolean(collab.selectedProjectId);

  const fieldClassName =
    'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive';
  const selectClassName =
    'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive';

  return (
    <div className="space-y-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
      <div className="text-xs font-semibold text-bolt-elements-textSecondary">Project Collaboration</div>

      <div className="flex gap-2">
        <input
          className={fieldClassName}
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder="New project name"
        />
        <Button size="sm" variant="secondary" onClick={createProject} disabled={!canCreateProject}>
          Create
        </Button>
      </div>

      <select
        className={selectClassName}
        value={collab.selectedProjectId || ''}
        onChange={(event) => {
          const projectId = event.target.value || undefined;
          setCollabProject(projectId);
          setCollabConversation(undefined);
          bumpCollabRefresh();
        }}
      >
        <option value="">Select shared project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ({project.role})
          </option>
        ))}
      </select>

      {collab.selectedProjectId && (
        <div className="flex gap-2">
          <input
            className={fieldClassName}
            value={shareEmail}
            onChange={(event) => setShareEmail(event.target.value)}
            placeholder="email to share"
          />
          <select
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
            value={shareRole}
            onChange={(event) => setShareRole(event.target.value as 'editor' | 'viewer')}
          >
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <Button size="sm" variant="secondary" onClick={shareProject} disabled={!canShareProject}>
            Share
          </Button>
        </div>
      )}

      {collab.selectedProjectId && (
        <div className="flex gap-2">
          <input
            className={fieldClassName}
            value={newConversationTitle}
            onChange={(event) => setNewConversationTitle(event.target.value)}
            placeholder="New shared conversation"
          />
          <Button size="sm" variant="secondary" onClick={createConversation} disabled={!canCreateConversation}>
            New
          </Button>
        </div>
      )}

      {collab.selectedProjectId && (
        <select
          className={selectClassName}
          value={collab.selectedConversationId || ''}
          onChange={(event) => {
            const conversationId = event.target.value || undefined;
            setCollabConversation(conversationId);
            bumpCollabRefresh();
          }}
        >
          <option value="">Select shared conversation</option>
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
      )}

      {collab.selectedConversationId && (
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-bolt-elements-textSecondary">Branch:</span>
          <select
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
            value={collab.branchMode}
            onChange={(event) => {
              setCollabBranchMode(event.target.value as 'user' | 'main');
              bumpCollabRefresh();
            }}
          >
            <option value="user">My branch</option>
            <option value="main">Main branch</option>
          </select>
          <Button
            size="sm"
            variant={collab.selectedConversationId ? 'outline' : 'secondary'}
            onClick={() => {
              setCollabConversation(undefined);
              bumpCollabRefresh();
            }}
          >
            Leave
          </Button>
        </div>
      )}

      {collab.selectedConversationId && activeProject?.role !== 'viewer' && (
        <div className="flex gap-2">
          <select
            className={selectClassName}
            value={mergeBranchId}
            onChange={(event) => setMergeBranchId(event.target.value)}
          >
            <option value="">Select branch to merge</option>
            {mergeCandidates.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={mergeBranch} disabled={!mergeBranchId}>
            Merge to main
          </Button>
        </div>
      )}
    </div>
  );
}
