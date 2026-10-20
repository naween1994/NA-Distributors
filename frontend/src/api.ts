let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export function backendUrl() {
  return (localStorage.getItem('na_backend_url') || '').replace(/\/$/, '');
}
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(backendUrl() + '/api' + path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('na-session-expired'));
    let message = 'The server could not complete the request.';
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      /* response was not JSON */
    }
    throw new Error(message);
  }
  return res.json();
}
export const post = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const remove = (path: string, body: unknown) =>
  api(path, { method: 'DELETE', body: JSON.stringify(body) });
export async function download(path: string, name: string) {
  const res = await fetch(backendUrl() + '/api' + path, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Download failed.');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (value = 0) =>
  'Rs. ' +
  new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
export const compactMoney = (value = 0) =>
  value >= 1000000
    ? 'Rs. ' + (value / 1000000).toFixed(1) + 'm'
    : value >= 100000
      ? 'Rs. ' + (value / 1000).toFixed(1) + 'k'
      : money(value);
export const count = (value = 0) => new Intl.NumberFormat('en-LK').format(value);
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function addDays(value: string, days: number) {
  const d = new Date(value + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  }).format(
    new Date(
      value.length === 10
        ? value + 'T00:00:00Z'
        : value.includes('T')
          ? value
          : value.replace(' ', 'T') + 'Z',
    ),
  );
}
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
export const paymentMethods = ['Cash', 'Bank transfer', 'Cheque', 'Card', 'Credit', 'Other'];
export function unitPrice(
  product: object,
  tier: { id: string; priceKey?: string; multiplier?: number } | undefined,
) {
  return (
    Math.round(
      Number((product as Record<string, unknown>)[tier?.priceKey || tier?.id || 'mrp'] || 0) *
        100 *
        (tier?.multiplier ?? 1),
    ) / 100
  );
}
