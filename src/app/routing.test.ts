import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  FOOD_PATH,
  SETTINGS_PATH,
  SIGN_IN_PATH,
  TODAY_PATH,
  buildSignInUrl,
  getGuardRedirect,
  resolveAppTab,
  resolvePostSignInPath,
  sanitizeReturnPath,
} from './routing';

describe('sanitizeReturnPath', () => {
  it('accepts safe same-origin relative paths with query strings and hashes', () => {
    expect(sanitizeReturnPath('/')).toBe('/');
    expect(sanitizeReturnPath('/days/2026-11-19')).toBe('/days/2026-11-19');
    expect(sanitizeReturnPath('/library?q=oats&page=2')).toBe(
      '/library?q=oats&page=2'
    );
    expect(sanitizeReturnPath('/days/2026-11-19#water')).toBe(
      '/days/2026-11-19#water'
    );
  });

  it('rejects empty, external, protocol-relative, backslash, control-char, and sign-in loop targets', () => {
    const unsafeTargets = [
      null,
      undefined,
      '',
      '   ',
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example/phish',
      '///evil.example',
      '/.//evil.example',
      '/..//evil.example',
      '/a/..//evil.example',
      '/\\evil.example',
      '\\evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'relative/path',
      '/sign-in',
      '/sign-in?redirect=/library',
      '/sign-in/callback',
      '/days/2026-11-19\nSet-Cookie: a=b',
      '/days/2026-11-19\t',
      '/days/2026-11-19\u0000',
      '/days/2026-11-19\u007f',
    ];

    for (const target of unsafeTargets) {
      expect(sanitizeReturnPath(target)).toBeNull();
    }
  });

  it('never returns an external origin, protocol-relative URL, or /sign-in loop for arbitrary strings or dot-segment combinations', () => {
    const segmentArb = fc.constantFrom(
      '',
      '.',
      '..',
      '/',
      '//',
      '\\',
      'sign-in',
      'days',
      'evil.example',
      '?redirect=/days',
      '#water'
    );
    const craftedPathArb = fc
      .array(segmentArb, { minLength: 1, maxLength: 6 })
      .map((parts) => `/${parts.join('/')}`);

    fc.assert(
      fc.property(fc.oneof(fc.string(), craftedPathArb), (raw) => {
        const result = sanitizeReturnPath(raw);
        if (result !== null) {
          expect(result.startsWith('/')).toBe(true);
          expect(result.startsWith('//')).toBe(false);
          expect(result.includes('\\')).toBe(false);
          const parsed = new URL(result, 'https://arki.local');
          expect(parsed.origin).toBe('https://arki.local');
          expect(parsed.pathname.startsWith('/')).toBe(true);
          expect(parsed.pathname.startsWith('//')).toBe(false);
          expect(parsed.pathname).not.toBe(SIGN_IN_PATH);
          expect(parsed.pathname.startsWith(`${SIGN_IN_PATH}/`)).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });
});

describe('buildSignInUrl', () => {
  it('returns plain /sign-in for the root Today path and unsafe targets', () => {
    expect(buildSignInUrl(TODAY_PATH)).toBe(SIGN_IN_PATH);
    expect(buildSignInUrl('/sign-in')).toBe(SIGN_IN_PATH);
    expect(buildSignInUrl('https://evil.example')).toBe(SIGN_IN_PATH);
  });

  it('encodes deep links into the redirect query parameter', () => {
    expect(buildSignInUrl('/days/2026-11-19?tab=water')).toBe(
      '/sign-in?redirect=%2Fdays%2F2026-11-19%3Ftab%3Dwater'
    );
    expect(buildSignInUrl('/days/2026-11-19#water')).toBe(
      '/sign-in?redirect=%2Fdays%2F2026-11-19%23water'
    );
  });
});

describe('resolvePostSignInPath', () => {
  it('returns the sanitized redirect path when present and valid', () => {
    expect(
      resolvePostSignInPath('?redirect=%2Fdays%2F2026-11-19%3Ftab%3Dwater')
    ).toBe('/days/2026-11-19?tab=water');
  });

  it('falls back to / when redirect is absent or unsafe', () => {
    expect(resolvePostSignInPath('')).toBe(TODAY_PATH);
    expect(resolvePostSignInPath('?redirect=https%3A%2F%2Fevil.example')).toBe(
      TODAY_PATH
    );
    expect(resolvePostSignInPath('?redirect=%2F%2Fevil.example')).toBe(
      TODAY_PATH
    );
    expect(resolvePostSignInPath('?redirect=%2Fsign-in')).toBe(TODAY_PATH);
  });
});

describe('getGuardRedirect', () => {
  it('redirects signed-out users on / to /sign-in', () => {
    expect(
      getGuardRedirect({ pathname: '/', search: '', hash: '' }, false)
    ).toBe('/sign-in');
  });

  it('redirects signed-out users on deep links to /sign-in with redirect param', () => {
    expect(
      getGuardRedirect(
        { pathname: '/days/2026-11-19', search: '?tab=water', hash: '' },
        false
      )
    ).toBe('/sign-in?redirect=%2Fdays%2F2026-11-19%3Ftab%3Dwater');
    expect(
      getGuardRedirect(
        { pathname: '/days/2026-11-19', search: '', hash: '#water' },
        false
      )
    ).toBe('/sign-in?redirect=%2Fdays%2F2026-11-19%23water');
  });

  it('sends signed-out users on nested /sign-in paths to /sign-in without a redirect loop', () => {
    expect(
      getGuardRedirect({ pathname: '/sign-in/', search: '', hash: '' }, false)
    ).toBe('/sign-in');
    expect(
      getGuardRedirect(
        { pathname: '/sign-in/callback', search: '?code=abc', hash: '' },
        false
      )
    ).toBe('/sign-in');
  });

  it('keeps signed-out users on /sign-in without redirecting', () => {
    expect(
      getGuardRedirect(
        { pathname: '/sign-in', search: '?redirect=%2Flibrary', hash: '' },
        false
      )
    ).toBeNull();
  });

  it('redirects signed-in users away from /sign-in to the requested deep link or /', () => {
    expect(
      getGuardRedirect(
        {
          pathname: '/sign-in',
          search: '?redirect=%2Fdays%2F2026-11-19',
          hash: '',
        },
        true
      )
    ).toBe('/days/2026-11-19');
    expect(
      getGuardRedirect({ pathname: '/sign-in', search: '', hash: '' }, true)
    ).toBe('/');
    expect(
      getGuardRedirect({ pathname: '/sign-in/', search: '', hash: '' }, true)
    ).toBe('/');
    expect(
      getGuardRedirect(
        {
          pathname: '/sign-in',
          search: '?redirect=https%3A%2F%2Fevil.example',
          hash: '',
        },
        true
      )
    ).toBe('/');
  });

  it('keeps signed-in users on app routes without redirecting', () => {
    expect(getGuardRedirect({ pathname: '/', search: '', hash: '' }, true)).toBeNull();
    expect(
      getGuardRedirect(
        { pathname: '/days/2026-11-19', search: '', hash: '' },
        true
      )
    ).toBeNull();
  });
});

describe('app tab paths', () => {
  it('keeps the water tab at the Today root and adds Food and Settings paths', () => {
    expect(TODAY_PATH).toBe('/');
    expect(FOOD_PATH).toBe('/food');
    expect(SETTINGS_PATH).toBe('/settings');
  });
});

describe('resolveAppTab', () => {
  it('maps the Today root and day deep links to the water tab', () => {
    expect(resolveAppTab('/')).toBe('water');
    expect(resolveAppTab('/days/2026-11-19')).toBe('water');
    expect(resolveAppTab('/days/2026-11-19?tab=water')).toBe('water');
  });

  it('maps /food and nested food paths to the food tab', () => {
    expect(resolveAppTab('/food')).toBe('food');
    expect(resolveAppTab('/food/2026-11-19')).toBe('food');
  });

  it('maps /settings and nested settings paths to the settings tab', () => {
    expect(resolveAppTab('/settings')).toBe('settings');
    expect(resolveAppTab('/settings/profile')).toBe('settings');
  });

  it('falls back to the water tab for unknown paths', () => {
    expect(resolveAppTab('/library')).toBe('water');
    expect(resolveAppTab('/recipes/123')).toBe('water');
  });
});
