import { parseCookies } from '~/lib/api/cookies';
import { createSession, deleteSession, getSessionUser } from './persistence';

const SESSION_COOKIE = 'bolt_session';
const USER_ID_COOKIE = 'bolt_uid';

function shouldUseSecureCookies(env?: Record<string, any>): boolean {
  const nodeEnv = String(env?.NODE_ENV || '').toLowerCase();
  const runningInDocker = String(env?.RUNNING_IN_DOCKER || '').toLowerCase() === 'true';
  const explicitSecure = String(env?.BOLT_COOKIE_SECURE || '').toLowerCase() === 'true';

  return explicitSecure || runningInDocker || nodeEnv === 'production';
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return toHex(new Uint8Array(hashBuffer));
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(`${salt}:${password}`);
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return toHex(bytes);
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader);

  return cookies[SESSION_COOKIE] || null;
}

export async function getCurrentUserFromRequest(request: Request, env?: Record<string, any>) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    return null;
  }

  return getSessionUser(token, env);
}

export async function createAuthCookies(userId: string, env?: Record<string, any>) {
  const session = await createSession(userId, env);

  if (!session) {
    return [] as string[];
  }

  const secureDirective = shouldUseSecureCookies(env) ? '; Secure' : '';

  return [
    `${SESSION_COOKIE}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secureDirective}`,
    `${USER_ID_COOKIE}=${encodeURIComponent(userId)}; Path=/; SameSite=Lax; Max-Age=1209600${secureDirective}`,
  ];
}

export async function clearAuthCookies(request: Request, env?: Record<string, any>) {
  const token = getSessionTokenFromRequest(request);

  if (token) {
    await deleteSession(token, env);
  }

  const secureDirective = shouldUseSecureCookies(env) ? '; Secure' : '';

  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureDirective}`,
    `${USER_ID_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secureDirective}`,
  ];
}
