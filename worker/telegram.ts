export type TgUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Telegram Mini App `initData` imzosini bot tokeni bilan tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(initData: string, botToken: string): Promise<TgUser | null> {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  const computed = toHex(await hmac(secret, dataCheckString));
  if (!safeEqual(computed, hash)) return null;

  // Imzo eskirgan bo'lsa (24 soat) qayta kirishni talab qilamiz
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > 86400) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;

  try {
    const user = JSON.parse(rawUser) as TgUser;
    if (!user || typeof user.id !== 'number') return null;
    return user;
  } catch {
    return null;
  }
}

/** Admin panel uchun imzolangan token (parol asosida). */
export async function signAdminToken(password: string, ttlSeconds = 60 * 60 * 12): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = toHex(await hmac(encoder.encode(`admin:${password}`), `admin-session:${exp}`));
  return `${exp}.${signature}`;
}

export async function verifyAdminToken(token: string, password?: string): Promise<boolean> {
  if (!token || !password) return false;
  const [expRaw, signature] = token.split('.');
  const exp = Number(expRaw);
  if (!exp || !signature || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = toHex(await hmac(encoder.encode(`admin:${password}`), `admin-session:${exp}`));
  return safeEqual(signature, expected);
}

export function checkPassword(input: string, expected?: string): boolean {
  if (!input || !expected) return false;
  return safeEqual(input, expected);
}
