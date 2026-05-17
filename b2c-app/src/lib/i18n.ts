/**
 * Tiny dependency-free i18n helper for the Smart Trip app.
 *
 * We hold the active locale in a Zustand-backed store so screens can subscribe
 * to changes without prop-drilling. The catalogues are bundled at build time
 * (`require()`-ed) so there is no runtime fetch and Expo Go still works.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import enJson from "../../i18n/en.json";
import viJson from "../../i18n/vi.json";

export type Locale = "vi" | "en";

const STORAGE_KEY = "roadpulse:locale";
const CATALOGUES: Record<Locale, Record<string, string>> = {
  vi: viJson as Record<string, string>,
  en: enJson as Record<string, string>,
};

type Listener = (locale: Locale) => void;

let currentLocale: Locale = "vi";
const listeners: Set<Listener> = new Set();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  void AsyncStorage.setItem(STORAGE_KEY, next);
  for (const fn of listeners) fn(next);
}

export async function rehydrateLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "vi" || stored === "en") {
      currentLocale = stored;
      for (const fn of listeners) fn(stored);
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Synchronous translation. Falls back to the key itself when missing.
 *
 * Note: when used inside React components prefer the `useT` hook below so the
 * component re-renders when the user changes language at runtime.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const catalogue = CATALOGUES[currentLocale];
  const fallback = CATALOGUES.vi;
  const template = catalogue[key] ?? fallback[key] ?? key;
  return format(template, vars);
}

/** React hook that re-renders the caller whenever the locale changes. */
export function useT(): {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (next: Locale) => void;
} {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);
  useEffect(() => {
    const listener: Listener = (next) => setLocaleState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    t: (key, vars) => {
      // Read straight from the active catalogue so the hook stays in sync.
      const catalogue = CATALOGUES[locale];
      const fallback = CATALOGUES.vi;
      const template = catalogue[key] ?? fallback[key] ?? key;
      return format(template, vars);
    },
    locale,
    setLocale,
  };
}
