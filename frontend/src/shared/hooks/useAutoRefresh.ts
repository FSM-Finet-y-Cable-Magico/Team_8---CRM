import { useEffect, useRef } from 'react';

/** Do not disturb an editor or an open customer/ticket sheet with background reads. */
export function isRefreshPaused() {
  return document.visibilityState === 'hidden'
    || Boolean(document.activeElement?.closest?.('input, select, textarea, [contenteditable="true"]'))
    || Array.from(document.querySelectorAll?.('[role="dialog"]') ?? []).some(dialog => !dialog.closest('[hidden]'));
}

/** One background read at a time; failed reads wait longer before trying again. */
export function useAutoRefresh(refresh: () => void | boolean | Promise<void | boolean>, enabled = true, intervalMs = 60000) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let lastRefresh = 0;
    let nextRefresh = 0;
    let pending = false;
    let failures = 0;
    let active = true;
    const update = () => {
      if (!active || pending || isRefreshPaused() || Date.now() < nextRefresh || Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      pending = true;
      void Promise.resolve().then(() => active ? callback.current() : undefined).then(result => {
        failures = result === false ? failures + 1 : 0;
      }, () => { failures++; }).finally(() => {
        pending = false;
        nextRefresh = Date.now() + Math.min(intervalMs * 2 ** Math.min(failures, 4), 300000);
      });
    };
    const timer = window.setInterval(update, intervalMs);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, intervalMs]);
}
