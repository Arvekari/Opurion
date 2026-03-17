import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';

export async function action(_: ActionFunctionArgs) {
  return json(
    {
      error: 'Vercel deployment has been removed. Use /api/plesk-deploy or /api/cpanel-deploy instead.',
    },
    { status: 410 },
  );
}
