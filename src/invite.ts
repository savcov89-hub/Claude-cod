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
/** Link a trainer sends to a client. */
export const inviteLink = (code: string) => location.origin + location.pathname.replace(/index\.html$/, '') + '?invite=' + code;
