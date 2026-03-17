import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader(_: LoaderFunctionArgs) {
  return json({ error: 'Vercel integration has been removed. Use cPanel integration instead.' }, { status: 410 });
}

export async function action(_: ActionFunctionArgs) {
  return json({ error: 'Vercel integration has been removed. Use cPanel integration instead.' }, { status: 410 });
}
