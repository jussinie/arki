import { useCallback, useEffect, useState } from 'react';
import type { AppLocation } from './routing';

function readWindowLocation(): AppLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function toCurrentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Lightweight Web History API location hook for `src/app/`.
 * Replaced by `react-router` once parameterized route tables arrive (see ARK-32).
 */
export function useAppLocation(): AppLocation & {
  push: (to: string) => void;
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

  const push = useCallback((to: string) => {
    if (toCurrentUrl() !== to) {
      window.history.pushState(null, '', to);
    }
    setLocation(readWindowLocation());
  }, []);

  const replace = useCallback((to: string) => {
    if (toCurrentUrl() !== to) {
      window.history.replaceState(null, '', to);
    }
    setLocation(readWindowLocation());
  }, []);

  return { ...location, push, replace };
}
