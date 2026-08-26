import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientMessage(timeoutMs = 3000) {
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<number | null>(null);

  const clearMessage = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setMessage('');
  }, []);

  const showMessage = useCallback((nextMessage: string) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setMessage(nextMessage);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setMessage('');
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  return { message, showMessage, clearMessage };
}
