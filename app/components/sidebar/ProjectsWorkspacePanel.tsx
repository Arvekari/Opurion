import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import {
  formatProjectPlanRunStatus,
  PROJECT_PLAN_FILE_NAME,
  PROJECT_PLAN_KIND,
  PROJECT_PLAN_STATUS_FILE_NAME,
  PROJECT_PLAN_STATUS_KIND,
  type ProjectPlanRunStatus,
} from '~/lib/collab/project-plan';
import {
  bumpCollabRefresh,
  collabStore,
  type CollabProjectFileItem,
  setCollabConversation,
  setCollabDiscussionIndex,
  setCollabProject,
  setCollabProjectContext,
} from '~/lib/stores/collab';

type Project = { id: string; name: string; role: 'owner' | 'editor' | 'viewer' };
type Conversation = { id: string; title: string };
type ArtifactRecord = {
  id: string;
  name: string;
  description: string | null;
  artifactType: 'module' | 'component' | 'snippet' | 'asset';
  visibility: 'private' | 'project' | 'public';
  content: string;
  metadata: Record<string, any> | null;
};

type ProjectContextDraft = {
  narratives: string;
  materials: string;
  guides: string;
  plan: string;
};

const PROJECT_NARRATIVES_KIND = 'project-narratives';
const PROJECT_MATERIALS_KIND = 'project-materials';
const PROJECT_GUIDES_KIND = 'project-guides';
const PROJECT_ATTACHMENT_KIND = 'project-attachment';

function getSystemArtifactKind(artifact: ArtifactRecord) {
  return typeof artifact.metadata?.systemKind === 'string' ? artifact.metadata.systemKind : '';
}

function getStringMetadata(artifact: ArtifactRecord | undefined, key: string) {
  return typeof artifact?.metadata?.[key] === 'string' ? String(artifact.metadata?.[key]) : undefined;
}

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

function isTextReferenceFile(file: File) {
  const normalizedName = file.name.toLowerCase();
  const textExtensions = [
    '.md',
    '.txt',
    '.json',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.css',
    '.html',
    '.csv',
    '.yml',
    '.yaml',
    '.xml',
  ];
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    textExtensions.some((extension) => normalizedName.endsWith(extension))
  );
}

async function toProjectFileItems(files: FileList | File[]) {
  const accepted = Array.from(files).filter(isTextReferenceFile);
  return Promise.all(
    accepted.map(
      async (file) =>
        ({
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          content: await file.text(),
        }) satisfies CollabProjectFileItem,
    ),
  );
}

function deriveDraftFromArtifacts(artifacts: ArtifactRecord[]) {
  const narratives =
    artifacts.find((artifact) => getSystemArtifactKind(artifact) === PROJECT_NARRATIVES_KIND)?.content || '';
  const materials =
    artifacts.find((artifact) => getSystemArtifactKind(artifact) === PROJECT_MATERIALS_KIND)?.content || '';
  const guides = artifacts.find((artifact) => getSystemArtifactKind(artifact) === PROJECT_GUIDES_KIND)?.content || '';
  const planArtifact = artifacts.find((artifact) => getSystemArtifactKind(artifact) === PROJECT_PLAN_KIND);
  const planStatusArtifact = artifacts.find((artifact) => getSystemArtifactKind(artifact) === PROJECT_PLAN_STATUS_KIND);
  const plan = planArtifact?.content || '';
  const files = artifacts
    .filter((artifact) => getSystemArtifactKind(artifact) === PROJECT_ATTACHMENT_KIND)
    .map(
      (artifact) =>
        ({
          id: artifact.id,
          name: typeof artifact.metadata?.fileName === 'string' ? artifact.metadata.fileName : artifact.name,
          mimeType: typeof artifact.metadata?.mimeType === 'string' ? artifact.metadata.mimeType : undefined,
          size: typeof artifact.metadata?.size === 'number' ? artifact.metadata.size : undefined,
          content: artifact.content,
        }) satisfies CollabProjectFileItem,
    );

  return {
    draft: { narratives, materials, guides, plan } satisfies ProjectContextDraft,
    planArtifactId: planArtifact?.id,
    planUpdatedAt: getStringMetadata(planArtifact, 'updatedAt'),
    planStatusContent: planStatusArtifact?.content || '',
    planStatusArtifactId: planStatusArtifact?.id,
    planRunStatus: (getStringMetadata(planStatusArtifact, 'runStatus') as ProjectPlanRunStatus | undefined) || 'idle',
    planStatusSummary: getStringMetadata(planStatusArtifact, 'summary') || '',
    planStatusUpdatedAt: getStringMetadata(planStatusArtifact, 'updatedAt'),
    files,
  };
}

export function ProjectsWorkspacePanel() {
  const collab = useStore(collabStore);
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projectArtifacts, setProjectArtifacts] = useState<ArtifactRecord[]>([]);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectGuides, setNewProjectGuides] = useState('');
  const [newProjectFiles, setNewProjectFiles] = useState<CollabProjectFileItem[]>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor');
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [draft, setDraft] = useState<ProjectContextDraft>({ narratives: '', materials: '', guides: '', plan: '' });
  const [attachedFiles, setAttachedFiles] = useState<CollabProjectFileItem[]>([]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === collab.selectedProjectId),
    [projects, collab.selectedProjectId],
  );

  const canEditProject = activeProject?.role === 'owner' || activeProject?.role === 'editor';
  const planUpdatedLabel = useMemo(() => {
    if (!collab.projectPlanUpdatedAt) {
      return 'Not synced yet';
    }

    return new Date(collab.projectPlanUpdatedAt).toLocaleString();
  }, [collab.projectPlanUpdatedAt]);

  const planStatusUpdatedLabel = useMemo(() => {
    if (!collab.projectPlanStatusUpdatedAt) {
      return 'No run tracked yet';
    }

    return new Date(collab.projectPlanStatusUpdatedAt).toLocaleString();
  }, [collab.projectPlanStatusUpdatedAt]);

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
      throw new Error(data?.error || 'Failed to load discussions');
    }

    const nextConversations = dedupeConversations((data.conversations || []) as Conversation[]);
    setConversations(nextConversations);
    setCollabDiscussionIndex(
      nextConversations.map((conversation) => ({ id: conversation.id, title: conversation.title })),
    );
  }, []);

  const loadProjectArtifacts = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/collab/artifacts?projectId=${encodeURIComponent(projectId)}`);
    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Failed to load project references');
    }

    const artifacts = (data.artifacts || []) as ArtifactRecord[];
    setProjectArtifacts(artifacts);

    const derived = deriveDraftFromArtifacts(artifacts);
    setDraft(derived.draft);
    setAttachedFiles(derived.files);
    setCollabProjectContext({
      narratives: derived.draft.narratives,
      materials: derived.draft.materials,
      guides: derived.draft.guides,
      plan: derived.draft.plan,
      planArtifactId: derived.planArtifactId,
      planUpdatedAt: derived.planUpdatedAt,
      planStatusContent: derived.planStatusContent,
      planStatusArtifactId: derived.planStatusArtifactId,
      planRunStatus: derived.planRunStatus,
      planStatusSummary: derived.planStatusSummary,
      planStatusUpdatedAt: derived.planStatusUpdatedAt,
      files: derived.files,
    });
  }, []);

  const createSystemArtifact = useCallback(
    async (
      projectId: string,
      name: string,
      content: string,
      metadata: Record<string, any>,
      artifactType: 'snippet' | 'asset' = 'snippet',
    ) => {
      const response = await fetch('/api/collab/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'create',
          projectId,
          name,
          description: metadata.description || null,
          artifactType,
          visibility: 'project',
          content,
          metadata,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to create ${name}`);
      }

      return data.artifact as ArtifactRecord;
    },
    [],
  );

  const updateSystemArtifact = useCallback(
    async (artifactId: string, content: string, metadata: Record<string, any>) => {
      const response = await fetch('/api/collab/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'update',
          artifactId,
          content,
          metadata,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to update project reference');
      }
    },
    [],
  );

  const deleteArtifact = useCallback(async (artifactId: string) => {
    const response = await fetch('/api/collab/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'delete', artifactId }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Failed to delete project reference');
    }
  }, []);

  const syncTextArtifact = useCallback(
    async (projectId: string, kind: string, name: string, content: string, description: string) => {
      const existing = projectArtifacts.find((artifact) => getSystemArtifactKind(artifact) === kind);
      const normalized = content.trim();

      if (!normalized) {
        if (existing) {
          await deleteArtifact(existing.id);
        }
        return;
      }

      const metadata = { systemKind: kind, description };

      if (existing) {
        await updateSystemArtifact(existing.id, normalized, metadata);
        return;
      }

      await createSystemArtifact(projectId, name, normalized, metadata);
    },
    [createSystemArtifact, deleteArtifact, projectArtifacts, updateSystemArtifact],
  );

  useEffect(() => {
    loadProjects().catch((error) => {
      console.error(error);
      toast.error('Failed to load projects');
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!collab.selectedProjectId) {
      setConversations([]);
      setProjectArtifacts([]);
      setDraft({ narratives: '', materials: '', guides: '', plan: '' });
      setAttachedFiles([]);
      setCollabProjectContext({
        narratives: '',
        materials: '',
        guides: '',
        plan: '',
        planUpdatedAt: '',
        planStatusContent: '',
        planStatusArtifactId: '',
        planRunStatus: 'idle',
        planStatusSummary: '',
        planStatusUpdatedAt: '',
        files: [],
      });
      setCollabDiscussionIndex([]);
      return;
    }

    Promise.all([loadConversations(collab.selectedProjectId), loadProjectArtifacts(collab.selectedProjectId)]).catch(
      (error) => {
        console.error(error);
        toast.error('Failed to load project workspace');
      },
    );
  }, [collab.refreshToken, collab.selectedProjectId, loadConversations, loadProjectArtifacts]);

  const handleCreateFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (!files?.length) {
      return;
    }

    const acceptedFiles = await toProjectFileItems(files);
    const skippedCount = files.length - acceptedFiles.length;

    if (skippedCount > 0) {
      toast.warning(
        `Skipped ${skippedCount} non-text file(s). Use text/markdown/code/spec files for shared project references.`,
      );
    }

    setNewProjectFiles((current) => [...current, ...acceptedFiles]);
    event.target.value = '';
  };

  const handleProjectFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (!files?.length) {
      return;
    }

    const acceptedFiles = await toProjectFileItems(files);
    const skippedCount = files.length - acceptedFiles.length;

    if (skippedCount > 0) {
      toast.warning(
        `Skipped ${skippedCount} non-text file(s). Use text/markdown/code/spec files for shared project references.`,
      );
    }

    setAttachedFiles((current) => [...current, ...acceptedFiles]);
    event.target.value = '';
  };

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

    if (!response.ok || !data?.ok || !data.project?.id) {
      toast.error(data?.error || 'Project creation failed');
      return;
    }

    const projectId = String(data.project.id);

    try {
      if (newProjectGuides.trim()) {
        await createSystemArtifact(projectId, `${name} Guides`, newProjectGuides.trim(), {
          systemKind: PROJECT_GUIDES_KIND,
          description: 'Project-level onboarding and implementation guide',
        });
      }

      for (const file of newProjectFiles) {
        await createSystemArtifact(
          projectId,
          file.name,
          file.content,
          {
            systemKind: PROJECT_ATTACHMENT_KIND,
            fileName: file.name,
            mimeType: file.mimeType,
            size: file.size,
            description: 'Project reference attachment',
          },
          'asset',
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to store project guides/files');
    }

    setNewProjectName('');
    setNewProjectGuides('');
    setNewProjectFiles([]);
    await loadProjects();
    setCollabProject(projectId);
    setCollabConversation(undefined);
    bumpCollabRefresh();
    toast.success('Project created with shared references');
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
      toast.error(data?.error || 'Project sharing failed');
      return;
    }

    setShareEmail('');
    toast.success('Project shared');
  };

  const createConversation = async () => {
    if (!collab.selectedProjectId) {
      return;
    }

    const title = newConversationTitle.trim() || `Discussion ${conversations.length + 1}`;

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
      toast.error(data?.error || 'Discussion creation failed');
      return;
    }

    setNewConversationTitle('');
    await loadConversations(collab.selectedProjectId);
    setCollabConversation(data.conversation?.id);
    bumpCollabRefresh();
    toast.success('Discussion created');
  };

  const saveProjectContext = async () => {
    if (!collab.selectedProjectId || !canEditProject) {
      return;
    }

    try {
      await syncTextArtifact(
        collab.selectedProjectId,
        PROJECT_NARRATIVES_KIND,
        `${activeProject?.name || 'Project'} Narratives`,
        draft.narratives,
        'Shared narratives and business background for all discussions',
      );
      await syncTextArtifact(
        collab.selectedProjectId,
        PROJECT_MATERIALS_KIND,
        `${activeProject?.name || 'Project'} Materials`,
        draft.materials,
        'Shared materials, specifications, and reference constraints',
      );
      await syncTextArtifact(
        collab.selectedProjectId,
        PROJECT_GUIDES_KIND,
        `${activeProject?.name || 'Project'} Guides`,
        draft.guides,
        'Shared implementation guides and onboarding notes',
      );
      await syncTextArtifact(
        collab.selectedProjectId,
        PROJECT_PLAN_KIND,
        PROJECT_PLAN_FILE_NAME,
        draft.plan,
        'Shared active project plan synchronized from planning-oriented chat replies',
      );

      const existingAttachmentArtifacts = projectArtifacts.filter(
        (artifact) => getSystemArtifactKind(artifact) === PROJECT_ATTACHMENT_KIND,
      );
      const existingById = new Map(existingAttachmentArtifacts.map((artifact) => [artifact.id, artifact]));

      for (const file of attachedFiles) {
        const metadata = {
          systemKind: PROJECT_ATTACHMENT_KIND,
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          description: 'Project reference attachment',
        };

        if (file.id && existingById.has(file.id)) {
          await updateSystemArtifact(file.id, file.content, metadata);
          existingById.delete(file.id);
        } else {
          await createSystemArtifact(collab.selectedProjectId, file.name, file.content, metadata, 'asset');
        }
      }

      for (const staleArtifact of existingById.values()) {
        await deleteArtifact(staleArtifact.id);
      }

      await loadProjectArtifacts(collab.selectedProjectId);
      toast.success('Project guides and references saved to database');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to save project context');
    }
  };

  const removeDraftFile = (targetName: string, mode: 'create' | 'project') => {
    if (mode === 'create') {
      setNewProjectFiles((current) => current.filter((file) => file.name !== targetName));
      return;
    }

    setAttachedFiles((current) => current.filter((file) => !(file.name === targetName && !file.id)));
  };

  const removeSavedFile = (targetId?: string, targetName?: string) => {
    setAttachedFiles((current) =>
      current.filter((file) => (targetId ? file.id !== targetId : file.name !== targetName)),
    );
  };

  const fieldClassName =
    'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive';

  return (
    <div className="space-y-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
      <div className="text-xs font-semibold text-bolt-elements-textSecondary">Projects Workspace</div>

      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
        <div className="mb-2 text-[11px] font-semibold text-bolt-elements-textSecondary">
          Create project folder with guides and attachments
        </div>
        <div className="space-y-2">
          <input
            className={fieldClassName}
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="Create project folder"
          />
          <textarea
            className={`${fieldClassName} min-h-[72px] resize-y`}
            value={newProjectGuides}
            onChange={(event) => setNewProjectGuides(event.target.value)}
            placeholder="Attach project guides, onboarding notes, implementation rules..."
          />
          <div className="space-y-2 rounded-md border border-dashed border-bolt-elements-borderColor p-2">
            <div className="text-[11px] text-bolt-elements-textSecondary">
              Attach shared text/code/spec files for all project discussions
            </div>
            <input
              type="file"
              multiple
              onChange={handleCreateFilesSelected}
              className="text-xs text-bolt-elements-textSecondary"
            />
            {newProjectFiles.length > 0 && (
              <div className="space-y-1">
                {newProjectFiles.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between rounded bg-bolt-elements-background-depth-2 px-2 py-1 text-[11px]"
                  >
                    <span className="truncate text-bolt-elements-textSecondary">{file.name}</span>
                    <Button size="sm" variant="outline" onClick={() => removeDraftFile(file.name, 'create')}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={createProject} disabled={!newProjectName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </div>

      <select
        className={fieldClassName}
        value={collab.selectedProjectId || ''}
        onChange={(event) => {
          const projectId = event.target.value || undefined;
          setCollabProject(projectId);
          setCollabConversation(undefined);
          bumpCollabRefresh();
        }}
      >
        <option value="">Select project folder</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ({project.role})
          </option>
        ))}
      </select>

      {collab.selectedProjectId && (
        <>
          <div className="flex gap-2">
            <input
              className={fieldClassName}
              value={shareEmail}
              onChange={(event) => setShareEmail(event.target.value)}
              placeholder="Share project with email"
            />
            <select
              className={fieldClassName}
              value={shareRole}
              onChange={(event) => setShareRole(event.target.value as 'editor' | 'viewer')}
            >
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <Button size="sm" variant="secondary" onClick={shareProject} disabled={!shareEmail.trim()}>
              Share
            </Button>
          </div>

          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
            <div className="mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">
              Shared narratives (available in all discussions)
            </div>
            <textarea
              className={`${fieldClassName} min-h-[78px] resize-y`}
              value={draft.narratives}
              onChange={(event) => setDraft((prev) => ({ ...prev, narratives: event.target.value }))}
              placeholder="Business goals, architecture principles, domain storyline..."
              disabled={!canEditProject}
            />

            <div className="mt-2 mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">Shared materials</div>
            <textarea
              className={`${fieldClassName} min-h-[78px] resize-y`}
              value={draft.materials}
              onChange={(event) => setDraft((prev) => ({ ...prev, materials: event.target.value }))}
              placeholder="API endpoints, naming conventions, reusable snippets, decision records..."
              disabled={!canEditProject}
            />

            <div className="mt-2 mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">Shared guides</div>
            <textarea
              className={`${fieldClassName} min-h-[78px] resize-y`}
              value={draft.guides}
              onChange={(event) => setDraft((prev) => ({ ...prev, guides: event.target.value }))}
              placeholder="How this project should be built, maintained, and extended..."
              disabled={!canEditProject}
            />

            <div className="mt-2 mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">Active plan (.plan.md)</div>
            <div className="mb-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-2 text-[11px] text-bolt-elements-textSecondary">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-bolt-elements-item-backgroundAccent px-2 py-0.5 text-[10px] font-semibold text-bolt-elements-textPrimary">
                  Auto-sync active
                </span>
                <span>Plan updated: {planUpdatedLabel}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5 text-[10px] font-semibold text-bolt-elements-textPrimary">
                  {formatProjectPlanRunStatus(collab.projectPlanRunStatus)}
                </span>
                <span>Tracking updated: {planStatusUpdatedLabel}</span>
              </div>
              <div className="mt-2 text-bolt-elements-textTertiary">
                {collab.projectPlanStatusSummary || `${PROJECT_PLAN_STATUS_FILE_NAME} keeps execution tracking separate from ${PROJECT_PLAN_FILE_NAME}.`}
              </div>
            </div>
            <textarea
              className={`${fieldClassName} min-h-[110px] resize-y font-mono text-[11px]`}
              value={draft.plan}
              onChange={(event) => setDraft((prev) => ({ ...prev, plan: event.target.value }))}
              placeholder="Discussion-mode objectives, file structure, and execution plan will sync here."
              disabled={!canEditProject}
            />

            <div className="mt-2 mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">Execution tracking (.plan-status.md)</div>
            <textarea
              className={`${fieldClassName} min-h-[96px] resize-y font-mono text-[11px]`}
              value={collab.projectPlanStatusContent}
              readOnly
              placeholder="Execution tracking updates automatically as requests start, complete, fail, or are aborted."
            />

            <div className="mt-2 rounded-md border border-dashed border-bolt-elements-borderColor p-2">
              <div className="mb-1 text-[11px] font-semibold text-bolt-elements-textSecondary">
                Attached project files
              </div>
              {canEditProject && (
                <input
                  type="file"
                  multiple
                  onChange={handleProjectFilesSelected}
                  className="text-xs text-bolt-elements-textSecondary"
                />
              )}
              <div className="mt-2 space-y-1">
                {attachedFiles.length === 0 && (
                  <div className="text-[11px] text-bolt-elements-textTertiary">No shared files attached.</div>
                )}
                {attachedFiles.map((file) => (
                  <div
                    key={file.id || file.name}
                    className="flex items-center justify-between rounded bg-bolt-elements-background-depth-2 px-2 py-1 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-bolt-elements-textSecondary">{file.name}</div>
                      {file.mimeType && <div className="text-bolt-elements-textTertiary">{file.mimeType}</div>}
                    </div>
                    {canEditProject && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => (file.id ? removeSavedFile(file.id) : removeDraftFile(file.name, 'project'))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {canEditProject && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => void saveProjectContext()}>
                  Save project context
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              className={fieldClassName}
              value={newConversationTitle}
              onChange={(event) => setNewConversationTitle(event.target.value)}
              placeholder="Create discussion under this project"
            />
            <Button size="sm" variant="secondary" onClick={createConversation}>
              New
            </Button>
          </div>

          <select
            className={fieldClassName}
            value={collab.selectedConversationId || ''}
            onChange={(event) => {
              const conversationId = event.target.value || undefined;
              setCollabConversation(conversationId);
              bumpCollabRefresh();
            }}
          >
            <option value="">Select discussion</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </select>

          {conversations.length > 0 && (
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2">
              <div className="mb-2 text-[11px] font-semibold text-bolt-elements-textSecondary">
                Cross-discussion references
              </div>
              <div className="space-y-1">
                {conversations.map((conversation, index) => {
                  const selected = conversation.id === collab.selectedConversationId;

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        setCollabConversation(conversation.id);
                        bumpCollabRefresh();
                      }}
                      className={`w-full rounded-md border px-2 py-1 text-left text-xs transition ${
                        selected
                          ? 'border-bolt-elements-borderColorActive bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                      }`}
                    >
                      <span className="font-semibold">Discussion {index + 1}:</span> {conversation.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-[11px] text-bolt-elements-textTertiary">
            Active project: <span className="text-bolt-elements-textSecondary">{activeProject?.name || 'None'}</span>
          </div>
        </>
      )}
    </div>
  );
}
