import { useCallback, useEffect, useState } from 'react';
import {
  ALL_WIDGET_IDS,
  type WidgetConfigV1,
  type WidgetId,
} from '../api/aiObs.types';

const LS_KEY = 'opentrattos.aiObsDashboard.widgetConfig.v1';

const DEFAULT_CONFIG: WidgetConfigV1 = {
  order: [...ALL_WIDGET_IDS],
  hidden: [],
  v: 1,
};

/**
 * Per-user widget config (order + hidden flags) backed by localStorage.
 * Per ADR-WIDGET-CONFIG-LOCAL (slice #20 m3-ai-obs-ui, Wave 2.4): widget
 * config is per-user UI preference, not collaborative state. Persisting
 * it server-side would add a write path with zero observable value.
 *
 * Failure modes:
 *  - localStorage unavailable (private mode / SSR) → returns defaults;
 *    mutations are no-ops.
 *  - Corrupt entry → falls back to defaults; logs nothing (mute is OK).
 */
export function useWidgetConfig(): {
  config: WidgetConfigV1;
  setOrder: (order: WidgetId[]) => void;
  toggleHidden: (widget: WidgetId) => void;
  reset: () => void;
} {
  const [config, setConfig] = useState<WidgetConfigV1>(() => loadConfig());

  useEffect(() => {
    // Persist on every change. Use try/catch so quota-exceeded never crashes.
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(config));
    } catch {
      // Quota exceeded / disabled — silent.
    }
  }, [config]);

  const setOrder = useCallback((order: WidgetId[]) => {
    // Defensive: only accept known ids; preserve any missing ones at the end.
    const known = order.filter((w) => (ALL_WIDGET_IDS as string[]).includes(w));
    const seen = new Set(known);
    const rest = ALL_WIDGET_IDS.filter((w) => !seen.has(w));
    setConfig((prev) => ({ ...prev, order: [...known, ...rest] }));
  }, []);

  const toggleHidden = useCallback((widget: WidgetId) => {
    setConfig((prev) => {
      const hidden = prev.hidden.includes(widget)
        ? prev.hidden.filter((w) => w !== widget)
        : [...prev.hidden, widget];
      return { ...prev, hidden };
    });
  }, []);

  const reset = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG, order: [...ALL_WIDGET_IDS], hidden: [] });
  }, []);

  return { config, setOrder, toggleHidden, reset };
}

function loadConfig(): WidgetConfigV1 {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_CONFIG, order: [...ALL_WIDGET_IDS], hidden: [] };
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw == null || raw === '') {
      return { ...DEFAULT_CONFIG, order: [...ALL_WIDGET_IDS], hidden: [] };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConfig(parsed)) {
      return { ...DEFAULT_CONFIG, order: [...ALL_WIDGET_IDS], hidden: [] };
    }
    // Sanitize: drop unknown ids; pad missing ids at the end of `order`.
    const known = parsed.order.filter((w) =>
      (ALL_WIDGET_IDS as string[]).includes(w),
    );
    const seen = new Set(known);
    const rest = ALL_WIDGET_IDS.filter((w) => !seen.has(w));
    return {
      order: [...known, ...rest],
      hidden: parsed.hidden.filter((w) =>
        (ALL_WIDGET_IDS as string[]).includes(w),
      ),
      v: 1,
    };
  } catch {
    return { ...DEFAULT_CONFIG, order: [...ALL_WIDGET_IDS], hidden: [] };
  }
}

function isValidConfig(v: unknown): v is WidgetConfigV1 {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  if (c.v !== 1) return false;
  if (!Array.isArray(c.order) || !c.order.every((w) => typeof w === 'string')) {
    return false;
  }
  if (!Array.isArray(c.hidden) || !c.hidden.every((w) => typeof w === 'string')) {
    return false;
  }
  return true;
}

/** Exposed for tests. */
export const __WIDGET_CONFIG_LS_KEY = LS_KEY;
