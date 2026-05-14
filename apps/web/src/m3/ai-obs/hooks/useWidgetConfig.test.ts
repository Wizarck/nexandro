import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  __WIDGET_CONFIG_LS_KEY,
  useWidgetConfig,
} from './useWidgetConfig';
import { ALL_WIDGET_IDS } from '../api/aiObs.types';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('useWidgetConfig', () => {
  it('returns canonical defaults on first visit (empty localStorage)', () => {
    const { result } = renderHook(() => useWidgetConfig());
    expect(result.current.config.order).toEqual(ALL_WIDGET_IDS);
    expect(result.current.config.hidden).toEqual([]);
    expect(result.current.config.v).toBe(1);
  });

  it('hydrates from localStorage when a valid v=1 config is present', () => {
    window.localStorage.setItem(
      __WIDGET_CONFIG_LS_KEY,
      JSON.stringify({
        order: ['costByTag', 'errorRate'],
        hidden: ['top5Failures'],
        v: 1,
      }),
    );
    const { result } = renderHook(() => useWidgetConfig());
    // Known ids preserved at the start of `order`; remaining ids appended.
    expect(result.current.config.order[0]).toBe('costByTag');
    expect(result.current.config.order[1]).toBe('errorRate');
    expect(result.current.config.order).toContain('top5Failures');
    expect(result.current.config.hidden).toContain('top5Failures');
  });

  it('falls back to defaults when stored entry is corrupt', () => {
    window.localStorage.setItem(__WIDGET_CONFIG_LS_KEY, '{not-json');
    const { result } = renderHook(() => useWidgetConfig());
    expect(result.current.config.order).toEqual(ALL_WIDGET_IDS);
    expect(result.current.config.hidden).toEqual([]);
  });

  it('falls back to defaults when version is unknown', () => {
    window.localStorage.setItem(
      __WIDGET_CONFIG_LS_KEY,
      JSON.stringify({ v: 99, order: [], hidden: [] }),
    );
    const { result } = renderHook(() => useWidgetConfig());
    expect(result.current.config.order).toEqual(ALL_WIDGET_IDS);
  });

  it('toggleHidden adds + removes the widget id', () => {
    const { result } = renderHook(() => useWidgetConfig());
    act(() => result.current.toggleHidden('costByTag'));
    expect(result.current.config.hidden).toContain('costByTag');
    act(() => result.current.toggleHidden('costByTag'));
    expect(result.current.config.hidden).not.toContain('costByTag');
  });

  it('setOrder reorders the known widgets and pads missing ones at the end', () => {
    const { result } = renderHook(() => useWidgetConfig());
    act(() => result.current.setOrder(['top5Failures', 'errorRate']));
    expect(result.current.config.order[0]).toBe('top5Failures');
    expect(result.current.config.order[1]).toBe('errorRate');
    // Remaining ids appended in canonical order.
    expect(result.current.config.order).toContain('costTotal');
    expect(result.current.config.order).toContain('budgetStatus');
  });

  it('reset restores defaults', () => {
    const { result } = renderHook(() => useWidgetConfig());
    act(() => result.current.toggleHidden('costByTag'));
    expect(result.current.config.hidden).toContain('costByTag');
    act(() => result.current.reset());
    expect(result.current.config.hidden).toEqual([]);
    expect(result.current.config.order).toEqual(ALL_WIDGET_IDS);
  });

  it('persists changes through localStorage', () => {
    const { result } = renderHook(() => useWidgetConfig());
    act(() => result.current.toggleHidden('top5Failures'));
    const stored = window.localStorage.getItem(__WIDGET_CONFIG_LS_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { hidden: string[] };
    expect(parsed.hidden).toContain('top5Failures');
  });
});
