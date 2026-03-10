import { type ActionFunctionArgs, json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import {
  createArtifact,
  deleteArtifact,
  getArtifact,
  listArtifactsByProject,
  listArtifactsByUser,
  updateArtifact,
} from '~/lib/.server/persistence';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const artifactId = url.searchParams.get('artifactId');
  const projectId = url.searchParams.get('projectId');

  // Get single artifact by ID
  if (artifactId) {
    const artifact = await getArtifact(artifactId, user.userId, env);

    if (!artifact) {
      return json({ ok: false, error: 'Artifact not found or access denied.' }, { status: 404 });
    }

    return json({ ok: true, artifact });
  }

  // List artifacts by project
  if (projectId) {
    const artifacts = await listArtifactsByProject(projectId, user.userId, env);
    return json({ ok: true, artifacts });
  }

  // List artifacts by user
  const artifacts = await listArtifactsByUser(user.userId, env);

  return json({ ok: true, artifacts });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json<
    | {
        intent: 'create';
        projectId?: string | null;
        name?: string;
        description?: string | null;
        artifactType?: 'module' | 'component' | 'snippet' | 'asset';
        visibility?: 'private' | 'project' | 'public';
        content?: string;
        metadata?: Record<string, any> | null;
      }
    | {
        intent: 'update';
        artifactId?: string;
        name?: string;
        description?: string | null;
        artifactType?: 'module' | 'component' | 'snippet' | 'asset';
        visibility?: 'private' | 'project' | 'public';
        content?: string;
        metadata?: Record<string, any> | null;
      }
    | {
        intent: 'delete';
        artifactId?: string;
      }
  >();

  if (body.intent === 'create') {
    const name = body.name?.trim();
    const artifactType = body.artifactType || 'snippet';

    if (!name) {
      return json({ ok: false, error: 'Artifact name is required.' }, { status: 400 });
    }

    if (!body.content) {
      return json({ ok: false, error: 'Artifact content is required.' }, { status: 400 });
    }

    const artifact = await createArtifact(
      {
        ownerUserId: user.userId,
        projectId: body.projectId,
        name,
        description: body.description,
        artifactType,
        visibility: body.visibility,
        content: body.content,
        metadata: body.metadata,
      },
      env,
    );

    if (!artifact) {
      return json({ ok: false, error: 'Failed to create artifact or access denied.' }, { status: 500 });
    }

    return json({ ok: true, artifact });
  }

  if (body.intent === 'update') {
    const artifactId = body.artifactId?.trim();

    if (!artifactId) {
      return json({ ok: false, error: 'artifactId is required.' }, { status: 400 });
    }

    const artifact = await updateArtifact(
      artifactId,
      {
        userId: user.userId,
        name: body.name,
        description: body.description,
        artifactType: body.artifactType,
        visibility: body.visibility,
        content: body.content,
        metadata: body.metadata,
      },
      env,
    );

    if (!artifact) {
      return json({ ok: false, error: 'Failed to update artifact or access denied.' }, { status: 403 });
    }

    return json({ ok: true, artifact });
  }

  if (body.intent === 'delete') {
    const artifactId = body.artifactId?.trim();

    if (!artifactId) {
      return json({ ok: false, error: 'artifactId is required.' }, { status: 400 });
    }

    const ok = await deleteArtifact(artifactId, user.userId, env);

    if (!ok) {
      return json({ ok: false, error: 'Failed to delete artifact or access denied.' }, { status: 403 });
    }

    return json({ ok: true });
  }

  return json({ ok: false, error: 'Unsupported intent.' }, { status: 400 });
}
