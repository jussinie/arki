import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppLocation } from './useAppLocation';

describe('useAppLocation', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reads the current path, search, and hash', () => {
    window.history.replaceState(null, '', '/days/2026-11-19?tab=water#log');
    const { result } = renderHook(() => useAppLocation());

    expect(result.current.pathname).toBe('/days/2026-11-19');
    expect(result.current.search).toBe('?tab=water');
    expect(result.current.hash).toBe('#log');
  });

  it('replace updates history and the returned location', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useAppLocation());

    act(() => {
      result.current.replace('/sign-in?redirect=%2Flibrary');
    });

    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('?redirect=%2Flibrary');
    expect(result.current.pathname).toBe('/sign-in');
    expect(result.current.search).toBe('?redirect=%2Flibrary');
  });

  it('does not call replaceState when the URL is already the target', () => {
    window.history.replaceState(null, '', '/sign-in');
    const { result } = renderHook(() => useAppLocation());
    const replaceState = vi.spyOn(window.history, 'replaceState');

    act(() => {
      result.current.replace('/sign-in');
    });

    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('updates after a popstate event', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useAppLocation());

    act(() => {
      window.history.pushState(null, '', '/library?q=oats');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.pathname).toBe('/library');
    expect(result.current.search).toBe('?q=oats');
  });

  it('push adds a new history entry and updates the returned location', () => {
    window.history.replaceState(null, '', '/food');
    const { result } = renderHook(() => useAppLocation());
    const pushState = vi.spyOn(window.history, 'pushState');

    act(() => {
      result.current.push('/settings?tab=profile');
    });

    expect(pushState).toHaveBeenCalledWith(null, '', '/settings?tab=profile');
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?tab=profile');
    expect(result.current.pathname).toBe('/settings');
    expect(result.current.search).toBe('?tab=profile');
    pushState.mockRestore();
  });

  it('push does not add a duplicate history entry for the current URL', () => {
    window.history.replaceState(null, '', '/food');
    const { result } = renderHook(() => useAppLocation());
    const pushState = vi.spyOn(window.history, 'pushState');

    act(() => {
      result.current.push('/food');
    });

    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('push does not add a duplicate history entry when search and hash also match', () => {
    window.history.replaceState(null, '', '/food?tab=log#top');
    const { result } = renderHook(() => useAppLocation());
    const pushState = vi.spyOn(window.history, 'pushState');

    act(() => {
      result.current.push('/food?tab=log#top');
    });

    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('push adds a history entry when the path matches but hash differs', () => {
    window.history.replaceState(null, '', '/food#top');
    const { result } = renderHook(() => useAppLocation());
    const pushState = vi.spyOn(window.history, 'pushState');

    act(() => {
      result.current.push('/food');
    });

    expect(pushState).toHaveBeenCalledWith(null, '', '/food');
    expect(window.location.pathname).toBe('/food');
    expect(window.location.hash).toBe('');
    pushState.mockRestore();
  });
});
