import { map } from 'nanostores';

export type CollabBranchMode = 'user' | 'main';

export type CollabDiscussionIndexItem = {
  id: string;
  title: string;
};

export type CollabProjectFileItem = {
  id?: string;
  name: string;
  mimeType?: string;
  content: string;
  size?: number;
};

export const collabStore = map<{
  selectedProjectId?: string;
  selectedConversationId?: string;
  branchMode: CollabBranchMode;
  projectNarratives: string;
  projectMaterials: string;
  projectGuides: string;
  projectPlan: string;
  projectPlanArtifactId?: string;
  projectPlanUpdatedAt?: string;
  projectPlanStatusContent: string;
  projectPlanStatusArtifactId?: string;
  projectPlanRunStatus: 'idle' | 'in_progress' | 'completed' | 'failed' | 'aborted';
  projectPlanStatusSummary: string;
  projectPlanStatusUpdatedAt?: string;
  projectFiles: CollabProjectFileItem[];
  discussionIndex: CollabDiscussionIndexItem[];
  refreshToken: number;
}>({
  selectedProjectId: undefined,
  selectedConversationId: undefined,
  branchMode: 'user',
  projectNarratives: '',
  projectMaterials: '',
  projectGuides: '',
  projectPlan: '',
  projectPlanArtifactId: undefined,
  projectPlanUpdatedAt: undefined,
  projectPlanStatusContent: '',
  projectPlanStatusArtifactId: undefined,
  projectPlanRunStatus: 'idle',
  projectPlanStatusSummary: '',
  projectPlanStatusUpdatedAt: undefined,
  projectFiles: [],
  discussionIndex: [],
  refreshToken: 0,
});

export function setCollabProject(projectId?: string) {
  collabStore.setKey('selectedProjectId', projectId);
}

export function setCollabConversation(conversationId?: string) {
  collabStore.setKey('selectedConversationId', conversationId);
}

export function setCollabBranchMode(mode: CollabBranchMode) {
  collabStore.setKey('branchMode', mode);
}

export function setCollabProjectContext(context: {
  narratives?: string;
  materials?: string;
  guides?: string;
  plan?: string;
  planArtifactId?: string;
  planUpdatedAt?: string;
  planStatusContent?: string;
  planStatusArtifactId?: string;
  planRunStatus?: 'idle' | 'in_progress' | 'completed' | 'failed' | 'aborted';
  planStatusSummary?: string;
  planStatusUpdatedAt?: string;
  files?: CollabProjectFileItem[];
}) {
  if (context.narratives !== undefined) {
    collabStore.setKey('projectNarratives', context.narratives);
  }

  if (context.materials !== undefined) {
    collabStore.setKey('projectMaterials', context.materials);
  }

  if (context.guides !== undefined) {
    collabStore.setKey('projectGuides', context.guides);
  }

  if (context.plan !== undefined) {
    collabStore.setKey('projectPlan', context.plan);
  }

  if (context.planArtifactId !== undefined) {
    collabStore.setKey('projectPlanArtifactId', context.planArtifactId);
  }

  if (context.planUpdatedAt !== undefined) {
    collabStore.setKey('projectPlanUpdatedAt', context.planUpdatedAt);
  }

  if (context.planStatusContent !== undefined) {
    collabStore.setKey('projectPlanStatusContent', context.planStatusContent);
  }

  if (context.planStatusArtifactId !== undefined) {
    collabStore.setKey('projectPlanStatusArtifactId', context.planStatusArtifactId);
  }

  if (context.planRunStatus !== undefined) {
    collabStore.setKey('projectPlanRunStatus', context.planRunStatus);
  }

  if (context.planStatusSummary !== undefined) {
    collabStore.setKey('projectPlanStatusSummary', context.planStatusSummary);
  }

  if (context.planStatusUpdatedAt !== undefined) {
    collabStore.setKey('projectPlanStatusUpdatedAt', context.planStatusUpdatedAt);
  }

  if (context.files !== undefined) {
    collabStore.setKey('projectFiles', context.files);
  }
}

export function setCollabDiscussionIndex(items: CollabDiscussionIndexItem[]) {
  collabStore.setKey('discussionIndex', items);
}

export function bumpCollabRefresh() {
  collabStore.setKey('refreshToken', Date.now());
}
