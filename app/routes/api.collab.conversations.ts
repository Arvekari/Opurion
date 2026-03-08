import { type ActionFunctionArgs, json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import {
  appendCollabMessage,
  createCollabConversation,
  listCollabConversations,
  listCollabMessages,
} from '~/lib/.server/persistence';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const conversationId = url.searchParams.get('conversationId');

  if (conversationId) {
    const limit = Number(url.searchParams.get('limit') || '200');
    const branchId = url.searchParams.get('branchId') || undefined;
    const branchMode = (url.searchParams.get('branchMode') || 'user') as 'main' | 'user';
    const messages = await listCollabMessages(conversationId, user.userId, env, Number.isFinite(limit) ? limit : 200, {
      branchId,
      branchMode: branchMode === 'main' ? 'main' : 'user',
    });

    return json({ ok: true, messages });
  }

  if (!projectId) {
    return json({ ok: false, error: 'projectId is required.' }, { status: 400 });
  }

  const conversations = await listCollabConversations(projectId, user.userId, env);

  return json({ ok: true, conversations });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json<
    | { intent: 'createConversation'; projectId?: string; title?: string }
    | {
        intent: 'addMessage';
        conversationId?: string;
        role?: string;
        content?: string;
        branchId?: string;
        branchMode?: 'main' | 'user';
      }
  >();

  if (body.intent === 'createConversation') {
    const projectId = body.projectId?.trim();
    const title = body.title?.trim() || 'Shared Conversation';

    if (!projectId) {
      return json({ ok: false, error: 'projectId is required.' }, { status: 400 });
    }

    const conversation = await createCollabConversation(
      {
        projectId,
        title,
        createdByUserId: user.userId,
      },
      env,
    );

    if (!conversation) {
      return json({ ok: false, error: 'Failed to create conversation or access denied.' }, { status: 403 });
    }

    return json({ ok: true, conversation });
  }

  if (body.intent === 'addMessage') {
    const conversationId = body.conversationId?.trim();
    const role = body.role?.trim() || 'user';
    const content = body.content?.trim() || '';

    if (!conversationId || !content) {
      return json({ ok: false, error: 'conversationId and content are required.' }, { status: 400 });
    }

    const ok = await appendCollabMessage(
      {
        conversationId,
        userId: user.userId,
        role,
        content,
        branchId: body.branchId,
        useMainBranch: body.branchMode === 'main',
      },
      env,
    );

    if (!ok) {
      return json({ ok: false, error: 'Failed to append message or access denied.' }, { status: 403 });
    }

    return json({ ok: true });
  }

  return json({ ok: false, error: 'Unsupported intent.' }, { status: 400 });
}
