import { createClient } from "@supabase/supabase-js";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const AUTH_REMEMBER_KEY = "fitness-ai-auth-remember";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function getProjectStoragePrefix(): string {
  try {
    const host = new URL(SUPABASE_URL).host;
    const projectRef = host.split(".")[0];
    return projectRef ? `sb-${projectRef}-` : "sb-";
  } catch {
    return "sb-";
  }
}

function hasBrowserStorage(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return Boolean(window.localStorage && window.sessionStorage);
  } catch {
    return false;
  }
}

export function shouldRememberAuthSession(): boolean {
  if (!hasBrowserStorage()) return true;
  return window.localStorage.getItem(AUTH_REMEMBER_KEY) !== "false";
}

function getAuthStorageTarget(): Storage {
  return shouldRememberAuthSession()
    ? window.localStorage
    : window.sessionStorage;
}

function getAuthStorageFallback(): Storage {
  return shouldRememberAuthSession()
    ? window.sessionStorage
    : window.localStorage;
}

function moveSupabaseAuthItems(target: Storage, fallback: Storage) {
  const prefix = getProjectStoragePrefix();
  const keys = Array.from({ length: fallback.length }, (_, index) =>
    fallback.key(index)
  ).filter((key): key is string => Boolean(key?.startsWith(prefix)));

  for (const key of keys) {
    const value = fallback.getItem(key);
    if (value !== null) target.setItem(key, value);
    fallback.removeItem(key);
  }
}

export function setAuthPersistencePreference(remember: boolean) {
  if (!hasBrowserStorage()) return;

  window.localStorage.setItem(AUTH_REMEMBER_KEY, remember ? "true" : "false");
  moveSupabaseAuthItems(
    remember ? window.localStorage : window.sessionStorage,
    remember ? window.sessionStorage : window.localStorage
  );
}

export function clearSupabaseAuthStorage() {
  if (!hasBrowserStorage()) return;

  const prefix = getProjectStoragePrefix();
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter((key): key is string => Boolean(key?.startsWith(prefix)));

    keys.forEach((key) => storage.removeItem(key));
  }
}

const authStorage = {
  getItem(key: string): string | null {
    if (!hasBrowserStorage()) return null;

    const target = getAuthStorageTarget();
    const fallback = getAuthStorageFallback();

    return target.getItem(key) ?? fallback.getItem(key);
  },
  setItem(key: string, value: string) {
    if (!hasBrowserStorage()) return;

    const target = getAuthStorageTarget();
    const fallback = getAuthStorageFallback();

    target.setItem(key, value);
    fallback.removeItem(key);
  },
  removeItem(key: string) {
    if (!hasBrowserStorage()) return;

    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: authStorage
      }
    })
  : null;

export type SupabaseSession = Session;
export type SupabaseUser = User;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }

  return supabase;
}

export function getAppOrigin(): string {
  return window.location.origin;
}
