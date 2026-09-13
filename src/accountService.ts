const SERVICE_URL = 'https://drop.szlk.ai';

export interface AccountStatus {
  user: { id: string; email: string; name?: string } | null;
  pro: boolean;
  maxFileBytes: number;
  expiryDays: number[];
  features: string[];
}

export async function readAccount(token?: string): Promise<AccountStatus> {
  const response = await fetch(`${SERVICE_URL}/api/account`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load your account. Please try again.');
  return await response.json() as AccountStatus;
}

export async function startDeviceLogin(locale: string): Promise<{ code: string; secret: string; expiresAt: number; url: string }> {
  const response = await fetch(`${SERVICE_URL}/api/device/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error('Could not start login. Please try again.');
  const data = await response.json() as { code: string; secret: string; expiresAt: number };
  if (!/^[a-f0-9-]{36}$/.test(data.code) || !data.secret || !Number.isFinite(data.expiresAt)) throw new Error('Could not start login. Please try again.');
  return { ...data, url: `${SERVICE_URL}${locale === 'en' ? '/en' : ''}/connect?code=${encodeURIComponent(data.code)}` };
}

export async function pollDeviceLogin(code: string, secret: string): Promise<string | null> {
  const response = await fetch(`${SERVICE_URL}/api/device/poll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, secret }) });
  if (response.status === 202) return null;
  if (!response.ok) throw new Error('Login expired or could not be completed. Please try again.');
  const data = await response.json() as { token?: string };
  if (!data.token) throw new Error('Login could not be completed. Please try again.');
  return data.token;
}

export async function logoutAccount(token: string): Promise<void> {
  const response = await fetch(`${SERVICE_URL}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
  if (response.status !== 303 && !response.ok) throw new Error('Could not log out. Please try again.');
}
