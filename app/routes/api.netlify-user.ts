import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader(_: LoaderFunctionArgs) {
  return json({ error: 'Netlify integration has been removed. Use Plesk integration instead.' }, { status: 410 });
}

export async function action(_: ActionFunctionArgs) {
  return json({ error: 'Netlify integration has been removed. Use Plesk integration instead.' }, { status: 410 });
}
