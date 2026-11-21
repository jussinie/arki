export const TODAY_PATH = '/';
export const SIGN_IN_PATH = '/sign-in';
export const REDIRECT_QUERY_PARAM = 'redirect';

export type AppLocation = {
  pathname: string;
  search: string;
  hash: string;
};

const DUMMY_ORIGIN = 'https://arki.local';

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isSignInPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);
}

/**
 * Validates and normalizes an internal post-sign-in return path.
 * Rejects external origins, protocol-relative URLs, backslashes, control
 * characters, and `/sign-in` redirect loops (OWASP A01 open-redirect defense).
 */
export function sanitizeReturnPath(
  candidate: string | null | undefined
): string | null {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }
  if (candidate.includes('\\') || hasControlChar(candidate)) {
    return null;
  }

  try {
    const parsed = new URL(candidate, DUMMY_ORIGIN);
    if (
      parsed.origin !== DUMMY_ORIGIN ||
      !parsed.pathname.startsWith('/') ||
      parsed.pathname.startsWith('//') ||
      isSignInPath(parsed.pathname)
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function buildSignInUrl(fromPath: string): string {
  const safeTarget = sanitizeReturnPath(fromPath);
  if (!safeTarget || safeTarget === TODAY_PATH) {
    return SIGN_IN_PATH;
  }
  return `${SIGN_IN_PATH}?${REDIRECT_QUERY_PARAM}=${encodeURIComponent(safeTarget)}`;
}

export function resolvePostSignInPath(search: string): string {
  const params = new URLSearchParams(search);
  return sanitizeReturnPath(params.get(REDIRECT_QUERY_PARAM)) ?? TODAY_PATH;
}

/**
 * Pure route guard (ADR 2): determines whether the current location must
 * redirect based on authentication state.
 */
export function getGuardRedirect(
  location: AppLocation,
  isAuthenticated: boolean
): string | null {
  if (!isAuthenticated) {
    if (location.pathname === SIGN_IN_PATH) {
      return null;
    }
    return buildSignInUrl(
      `${location.pathname}${location.search}${location.hash}`
    );
  }

  if (isSignInPath(location.pathname)) {
    return resolvePostSignInPath(location.search);
  }

  return null;
}
