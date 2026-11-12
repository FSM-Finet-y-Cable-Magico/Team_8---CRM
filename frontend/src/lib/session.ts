import type { AuthUser } from '../api';
import { normalizeAuthUser } from './auth';

export const SESSION_IDLE_MS = 60 * 60 * 1000;
const ACTIVITY_KEY = 'finet_last_activity';

export function sessionHasExpired(token: string | null, lastActivity: number, now = Date.now()) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return !Number.isFinite(payload.exp) || payload.exp! * 1000 <= now
      || !Number.isFinite(lastActivity) || lastActivity <= 0 || now - lastActivity >= SESSION_IDLE_MS;
  } catch { return true; }
}

export function clearSession() {
  localStorage.removeItem('finet_token');
  localStorage.removeItem('finet_user');
  localStorage.removeItem(ACTIVITY_KEY);
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem('finet_token', token);
  localStorage.setItem('finet_user', JSON.stringify(user));
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

export function currentSessionExpired() {
  return sessionHasExpired(localStorage.getItem('finet_token'), Number(localStorage.getItem(ACTIVITY_KEY)));
}

export function restoreSession(): AuthUser | null {
  try {
    // Existing sessions created before the inactivity policy keep their JWT deadline.
    if (localStorage.getItem('finet_token') && !localStorage.getItem(ACTIVITY_KEY)) {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    }
    if (currentSessionExpired()) { clearSession(); return null; }
    const stored = localStorage.getItem('finet_user');
    if (!stored) { clearSession(); return null; }
    return normalizeAuthUser(JSON.parse(stored) as AuthUser);
  } catch { clearSession(); return null; }
}

export function monitorSession(onExpired: () => void) {
  let expired = false;
  let lastWrite = 0;
  const check = () => {
    if (expired) return false;
    if (!currentSessionExpired()) return true;
    expired = true;
    clearSession();
    onExpired();
    return false;
  };
  const activity = () => {
    // Check the old deadline before accepting activity after sleep or a background tab.
    if (!check() || document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastWrite < 15000) return;
    localStorage.setItem(ACTIVITY_KEY, String(now));
    lastWrite = now;
  };
  const visibility = () => { if (document.visibilityState === 'visible') check(); };
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
  events.forEach(event => window.addEventListener(event, activity, { passive: true, capture: true }));
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('storage', check);
  document.addEventListener('visibilitychange', visibility);
  const timer = window.setInterval(check, 15000);
  check();
  return () => {
    events.forEach(event => window.removeEventListener(event, activity, true));
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('storage', check);
    document.removeEventListener('visibilitychange', visibility);
    window.clearInterval(timer);
  };
}
