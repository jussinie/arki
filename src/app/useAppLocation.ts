import { useCallback, useEffect, useState } from 'react';
import type { AppLocation } from './routing';

function readWindowLocation(): AppLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

/**
 * Lightweight Web History API location hook for `src/app/`.
 * Replaced by `react-router` once multi-screen navigation arrives (see ARK-32).
 */
export function useAppLocation(): AppLocation & {
  replace: (to: string) => void;
} {
  const [location, setLocation] = useState<AppLocation>(readWindowLocation);

  useEffect(() => {
    function handlePopState() {
      setLocation(readWindowLocation());
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const replace = useCallback((to: string) => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== to) {
      window.history.replaceState(null, '', to);
    }
    setLocation(readWindowLocation());
  }, []);

  return { ...location, replace };
}
