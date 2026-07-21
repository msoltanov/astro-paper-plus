/**
 * Safe wrappers around `localStorage` and `sessionStorage` for browsers
 * that block site-data access (private browsing modes in some browsers,
 * third-party-context blocking, cookies-disabled configurations). Those
 * contexts throw `SecurityError` on every `localStorage` / `sessionStorage`
 * access — uncaught, the call kills whatever script was running
 * (the inline FOUC script in `Layout.astro`, `theme.ts`'s module body,
 * `BackButton.astro`, `index.astro`, etc.).
 *
 * Each helper returns `null` on failure so callers can fall back to a
 * non-storage default (matchMedia, an empty string, etc.) without
 * crashing the page. We deliberately do NOT log on failure — that
 * would spam the console for every visitor with strict storage
 * settings.
 */
function safeGet(
  store: Storage | null | undefined,
  key: string
): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(
  store: Storage | null | undefined,
  key: string,
  value: string,
  revalidate: () => Storage | null,
  invalidateThisCache: () => void,
  invalidateSiblingNullCache: () => void
): void {
  if (!store) return;
  // T3-2 (documented): the cache-reset sequence on a write failure
  // is six lines, but it carries the entire "block-once, recover-
  // next-read" contract. Sequence at a glance:
  //
  //   1. Outer `setItem(key, value)` → throws (quota / SecurityError).
  //      We invalidate the failing store's cache so the next read
  //      does a fresh resolve; we also clear a sibling cached `null`
  //      sentinel so a previously-unreachable sibling has a chance
  //      to recover without inheriting the cached `null`.
  //   2. Inner retry on a re-resolved handle → throws again (the
  //      failure is permanent, e.g. quota or storage-blocks-all).
  //      We invalidate the failing store's cache AGAIN so the next
  //      read does another fresh resolve. The "second cache reset"
  //      is the load-bearing step: without it, a permanent failure
  //      leaves a stale, broken `Storage` cached, and every
  //      subsequent read returns that broken handle.
  //   3. Inner try catches the second failure and drops it silently;
  //      callers see "set did not persist" but no exception bubbles
  //      up (matching the outer-wrapper contract).
  try {
    store.setItem(key, value);
  } catch {
    invalidateThisCache();
    invalidateSiblingNullCache();
    try {
      const fresh = revalidate();
      fresh?.setItem(key, value);
    } catch {
      invalidateThisCache();
      invalidateSiblingNullCache();
    }
  }
}

/**
 * Returns `localStorage` if it is accessible, otherwise `null`.
 *
 * P2-38 — caching strategy:
 *
 *   - First read / write → resolves `window.localStorage` once and
 *     memoises at module scope (`cachedLocal`). Every subsequent
 *     access is a single property read on the cached reference.
 *   - `safeSet` failure → invalidates the failing store's cache
 *     (`cachedLocal` for `safeLocal.set`, `cachedSession` for
 *     `safeSession.set`) and clears a sibling cached `null`
 *     sentinel if one exists. That preserves the "working sibling
 *     stays cached" fast path while still letting a previously
 *     unreachable store recover on the next read. A second
 *     failure drops silently.
 *   - Read-time failures persist as "storage unreachable" (cached
 *     `null`) for the rest of the tab lifetime. That mirrors the
 *     pessimistic "if the first access failed, the tab stays
 *     read-less" contract browsers enforce for blocked site-data.
 *
 * Reset via `__resetSafeStorageCacheForTesting()` so vitest can
 * drive multiple storage shapes in one file without residual state.
 */
const localCache: { value: Storage | null | undefined } = { value: undefined };
function getLocalStorage(): Storage | null {
  if (localCache.value !== undefined) return localCache.value;
  try {
    // Touching `window.localStorage` can itself throw in some
    // configurations (e.g. Safari private mode pre-iOS 11). The
    // existence check + the access together cover both
    // SecurityError and ReferenceError.
    if (typeof window === "undefined") {
      localCache.value = null;
    } else {
      localCache.value = window.localStorage;
    }
  } catch {
    localCache.value = null;
  }
  return localCache.value;
}

const sessionCache: { value: Storage | null | undefined } = {
  value: undefined,
};
function getSessionStorage(): Storage | null {
  if (sessionCache.value !== undefined) return sessionCache.value;
  try {
    if (typeof window === "undefined") {
      sessionCache.value = null;
    } else {
      sessionCache.value = window.sessionStorage;
    }
  } catch {
    sessionCache.value = null;
  }
  return sessionCache.value;
}

/**
 * Test-only escape hatch. Vitest exercises storage failure paths by
 * stubbing `window.localStorage` to throw; the memoised
 * `cachedLocal` then produces stale results. Resetting via
 * `__resetSafeStorageCacheForTesting()` lets each test re-resolve.
 */
export function __resetSafeStorageCacheForTesting(): void {
  localCache.value = undefined;
  sessionCache.value = undefined;
}

type StorageCache = { value: Storage | null | undefined };

function makeSafeStore(
  getStorage: () => Storage | null,
  cache: StorageCache,
  siblingCache: StorageCache
) {
  return {
    get: (key: string) => safeGet(getStorage(), key),
    set: (key: string, value: string) =>
      safeSet(
        getStorage(),
        key,
        value,
        getStorage,
        () => {
          cache.value = undefined;
        },
        () => {
          if (siblingCache.value === null) siblingCache.value = undefined;
        }
      ),
  };
}

export const safeLocal = makeSafeStore(
  getLocalStorage,
  localCache,
  sessionCache
);

export const safeSession = makeSafeStore(
  getSessionStorage,
  sessionCache,
  localCache
);
