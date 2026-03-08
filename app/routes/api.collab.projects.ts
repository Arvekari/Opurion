import { type ActionFunctionArgs, json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import {
  addCollabProjectMember,
  createCollabProject,
  findUserByUsername,
  listCollabProjectMembers,
  listCollabProjectsForUser,
} from '~/lib/.server/persistence';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (projectId) {
    const members = await listCollabProjectMembers(projectId, user.userId, env);
    return json({ ok: true, members });
  }

  const projects = await listCollabProjectsForUser(user.userId, env);

  return json({ ok: true, projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json<
    | { intent: 'create'; name?: string }
    | { intent: 'share'; projectId?: string; username?: string; role?: 'editor' | 'viewer' }
  >();

  if (body.intent === 'create') {
    const name = body.name?.trim();

    if (!name) {
      return json({ ok: false, error: 'Project name is required.' }, { status: 400 });
    }

    const project = await createCollabProject({ ownerUserId: user.userId, name }, env);

    if (!project) {
      return json({ ok: false, error: 'Failed to create project.' }, { status: 500 });
    }

    return json({ ok: true, project });
  }

  if (body.intent === 'share') {
    const projectId = body.projectId?.trim();
    const username = body.username?.trim().toLowerCase();

    if (!projectId || !username) {
      return json({ ok: false, error: 'projectId and username are required.' }, { status: 400 });
    }

    const target = await findUserByUsername(username, env);

    if (!target) {
      return json({ ok: false, error: 'Target user not found.' }, { status: 404 });
    }

    const ok = await addCollabProjectMember(
      {
        projectId,
        targetUserId: target.id,
        invitedByUserId: user.userId,
        role: body.role || 'editor',
      },
      env,
    );

    if (!ok) {
      return json({ ok: false, error: 'Failed to share project or access denied.' }, { status: 403 });
    }

    return json({ ok: true });
  }

  return json({ ok: false, error: 'Unsupported intent.' }, { status: 400 });
}
