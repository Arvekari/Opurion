import { type ActionFunctionArgs, json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import { listCollabBranches, mergeCollabBranchToMain } from '~/lib/.server/persistence';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');

  if (!conversationId) {
    return json({ ok: false, error: 'conversationId is required.' }, { status: 400 });
  }

  const branches = await listCollabBranches(conversationId, user.userId, env);

  return json({ ok: true, branches });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json<{ intent: 'mergeToMain'; conversationId?: string; sourceBranchId?: string }>();

  if (body.intent !== 'mergeToMain') {
    return json({ ok: false, error: 'Unsupported intent.' }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  const sourceBranchId = body.sourceBranchId?.trim();

  if (!conversationId || !sourceBranchId) {
    return json({ ok: false, error: 'conversationId and sourceBranchId are required.' }, { status: 400 });
  }

  const mergeResult = await mergeCollabBranchToMain(
    {
      conversationId,
      sourceBranchId,
      userId: user.userId,
    },
    env,
  );

  if (!mergeResult) {
    return json({ ok: false, error: 'Merge failed or access denied.' }, { status: 403 });
  }

  return json({ ok: true, mergedCount: mergeResult.mergedCount });
}
