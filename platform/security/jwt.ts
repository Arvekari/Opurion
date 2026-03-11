import type { PlatformRole } from './authz';

type JwtPayload = {
  sub: string;
  role: PlatformRole;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(content: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
  const bytes = new Uint8Array(signature);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function issueJwtToken(
  input: { sub: string; role: PlatformRole },
  options: { jwtSecret: string; ttlSeconds: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: input.sub,
    role: input.role,
    iat: now,
    exp: now + options.ttlSeconds,
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const content = `${headerPart}.${payloadPart}`;
  const signature = await sign(content, options.jwtSecret);

  return `${content}.${signature}`;
}

export async function verifyJwtToken(
  token: string,
  options: { jwtSecret: string },
): Promise<(JwtPayload & Record<string, unknown>) | null> {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const [headerPart, payloadPart, signature] = parts;
    const content = `${headerPart}.${payloadPart}`;
    const expected = await sign(content, options.jwtSecret);

    if (expected !== signature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadPart)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
