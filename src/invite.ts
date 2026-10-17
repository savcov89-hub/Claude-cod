// Invite links (?invite=CODE): the code waits in the browser until the client has signed in, then connects them.
import { safeStorage } from './transport';

const KEY = 'tl-invite';

/** Moves ?invite=CODE from the address into storage, so it survives the sign-in redirect. */
export function captureInvite() {
  try {
    const url = new URL(location.href);
    const code = (url.searchParams.get('invite') || '').trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) {
      safeStorage.set(KEY, code);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    }
  } catch {
    /* no URL API: nothing to capture */
  }
}
export const pendingInvite = () => safeStorage.get(KEY) || '';
export const clearInvite = () => safeStorage.remove(KEY);
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
/** Link a trainer sends to a client. */
export const inviteLink = (code: string) => appUrl() + '?invite=' + code;

// Sign-in links (#login=…): the email and password of a login the trainer made for a client, so the client only
// presses «Войти». They are after «#»: never sent to the server or to a messenger's link preview, and the app takes
// them out of the address as it opens.
const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
/** The sign-in link for a login made by the trainer. */
export const loginLink = (email: string, password: string) => appUrl() + '#login=' + toBase64Url(email + '\n' + password);
/** Takes #login=… out of the address: the email and password to fill in, or null. */
export function captureLogin(): { email: string; password: string } | null {
  try {
    const m = location.hash.match(/(?:^#|&)login=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    const [email, ...rest] = fromBase64Url(m[1]).split('\n');
    const password = rest.join('\n');
    return email.includes('@') && password ? { email, password } : null;
  } catch {
    return null;
  }
}
