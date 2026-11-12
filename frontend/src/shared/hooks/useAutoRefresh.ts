import { useEffect, useRef } from 'react';

/** Refresh visible read views without treating network traffic as user activity. */
export function useAutoRefresh(refresh: () => void, enabled = true, intervalMs = 60000) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let lastRefresh = 0;
    const update = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      callback.current();
    };
    const timer = window.setInterval(update, intervalMs);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, intervalMs]);
}
