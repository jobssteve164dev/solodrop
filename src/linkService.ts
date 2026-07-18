export const LINK_SERVICE_URL = 'https://drop.szlk.ai';

interface CreateLinkInput {
  url: string;
  title: string;
  temporary: boolean;
  expiresAt?: string;
}

interface CreateLinkResponse {
  shortUrl: string;
  slug: string;
  expiresAt?: string | null;
  managementToken: string;
  error?: string;
}

export async function getManagedLinkStats(shortUrl: string, managementToken: string, fetcher: typeof fetch = fetch): Promise<number> {
  const url = new URL(shortUrl);
  const slug = url.pathname.slice(1);
  const response = await fetcher(`${LINK_SERVICE_URL}/api/links/${encodeURIComponent(slug)}/stats`, {
    headers: { authorization: `Bearer ${managementToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Short-link stats returned HTTP ${response.status}.`);
  const result = await response.json() as { clicks?: number };
  if (!Number.isInteger(result.clicks) || (result.clicks || 0) < 0) throw new Error('Short-link stats response is invalid.');
  return result.clicks || 0;
}

export async function createManagedLink(input: CreateLinkInput, fetcher: typeof fetch = fetch): Promise<CreateLinkResponse> {
  const response = await fetcher(`${LINK_SERVICE_URL}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000)
  });
  let result: CreateLinkResponse;
  try { result = await response.json() as CreateLinkResponse; } catch { throw new Error(`Short-link service returned HTTP ${response.status}.`); }
  if (!response.ok) throw new Error(result.error || `Short-link service returned HTTP ${response.status}.`);
  const shortUrl = new URL(result.shortUrl);
  if (shortUrl.origin !== LINK_SERVICE_URL || !/^\/[A-Za-z0-9]{6,12}$/.test(shortUrl.pathname)) {
    throw new Error('Short-link service returned an invalid URL.');
  }
  return result;
}

export async function verifyManagedLink(shortUrl: string, expectedTarget: string, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(shortUrl, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (response.status < 300 || response.status >= 400) throw new Error(`Short link returned HTTP ${response.status}.`);
  const location = response.headers.get('location');
  if (!location) throw new Error('Short link did not return a destination.');
  const actual = new URL(location);
  const expected = new URL(expectedTarget);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || !actual.searchParams.get('sd')) {
    throw new Error('Short link returned an unexpected destination.');
  }
}
