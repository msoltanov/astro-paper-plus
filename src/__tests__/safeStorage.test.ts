import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  safeLocal,
  safeSession,
  __resetSafeStorageCacheForTesting,
} from "@/utils/safeStorage";

/**
 * Behavioural tests for `safeStorage` — the wrappers around
 * `localStorage` / `sessionStorage` that gracefully degrade when
 * storage is blocked (private browsing, third-party-context blocks,
 * cookies disabled, etc.).
 *
 * The unit under test throws `SecurityError` from `getItem` /
 * `setItem`; we stub `window.localStorage` and `window.sessionStorage`
 * with mocks that throw on access and assert the wrappers swallow
 * the error instead of letting it bubble up.
 *
 * P2-38: each case ends with `vi.unstubAllGlobals()` + the
 * memoised-storage cache reset (the cached reference would otherwise
 * survive across cases and pin a previous stub). The original test
 * suite relied on Vitest's `restoreAllMocks` semantics, which don't
 * cover `stubGlobal`; that's the leak in P2-16 of the issues list.
 */

describe("safeLocal.get", () => {
  beforeEach(() => {
    __resetSafeStorageCacheForTesting();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSafeStorageCacheForTesting();
  });

  it("returns the stored value when storage is accessible", () => {
    const stub = {
      getItem: vi.fn(() => "hello"),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    expect(safeLocal.get("foo")).toBe("hello");
  });

  it("returns null when getItem throws SecurityError", () => {
    const stub = {
      getItem: vi.fn(() => {
        throw new Error("SecurityError: storage disabled");
      }),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    expect(safeLocal.get("foo")).toBeNull();
  });

  it("returns null when window.localStorage access itself throws", () => {
    // Some browsers throw just touching the `localStorage` property.
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("SecurityError");
      },
      get sessionStorage() {
        throw new Error("SecurityError");
      },
    });

    expect(safeLocal.get("foo")).toBeNull();
  });
});

describe("safeLocal.set", () => {
  beforeEach(() => {
    __resetSafeStorageCacheForTesting();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSafeStorageCacheForTesting();
  });

  it("writes the value when storage is accessible", () => {
    const stub = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    safeLocal.set("foo", "bar");
    expect(stub.setItem).toHaveBeenCalledWith("foo", "bar");
  });

  it("silently swallows SecurityError on setItem", () => {
    const stub = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("SecurityError");
      }),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    // Must not throw.
    expect(() => safeLocal.set("foo", "bar")).not.toThrow();
  });

  it("silently swallows QuotaExceededError on setItem", () => {
    const stub = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    expect(() => safeLocal.set("foo", "bar")).not.toThrow();
  });

  // H — `safeLocal.set` failure must invalidate the cached storage
  // handle so subsequent `safeLocal.get` calls re-resolve. Otherwise
  // a transient `QuotaExceededError` strands the cache on a stale ref
  // for the rest of the tab.
  it("H: a failed setItem invalidates the cache; the next get re-resolves", () => {
    const phase1 = {
      getItem: vi.fn(() => "phase1-value"),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    } as unknown as Storage;
    const phase2 = {
      getItem: vi.fn(() => "phase2-value"),
      setItem: vi.fn(),
    } as unknown as Storage;
    // The same `window` shape means `__resetSafeStorageCacheForTesting`
    // can clear and re-resolve to the new `localStorage` getter.
    let current: Storage = phase1;
    vi.stubGlobal("window", {
      get localStorage() {
        return current;
      },
      sessionStorage: phase1,
    });

    // First prime the cache with `phase1` (the failing one).
    expect(safeLocal.get("foo")).toBe("phase1-value");
    // First set fails — should invalidate the cache.
    expect(() => safeLocal.set("foo", "v1")).not.toThrow();
    expect(phase1.setItem).toHaveBeenCalledWith("foo", "v1");

    // Switch to `phase2` (now accessible). The next get must re-
    // resolve through the cache-invalidation path, NOT return a
    // cached `null` for the previous failure.
    current = phase2;
    expect(safeLocal.get("foo")).toBe("phase2-value");
    // And the next set must land on `phase2` (proves the cache
    // invalidation actually retried on the resolved handle).
    safeLocal.set("foo", "v2");
    expect(phase2.setItem).toHaveBeenCalledWith("foo", "v2");
  });

  // #5 MAINT — `safeLocal.set` failure must NOT invalidate the
  // `sessionStorage` cache (only the failing store's cache). A
  // working `sessionStorage` should not pay a re-resolve cost on
  // every subsequent read just because `localStorage` is blocked.
  it("#5: a failed safeLocal.set leaves the safeSession cache intact", () => {
    const failingLocal = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    } as unknown as Storage;
    const workingSession = {
      getItem: vi.fn(() => "session-value"),
      setItem: vi.fn(),
    } as unknown as Storage;
    // Track how many times each store's getter is invoked — a
    // healthy `sessionStorage` should only resolve once even after
    // a `localStorage` failure forces a re-resolve of that store.
    let localGetterCalls = 0;
    let sessionGetterCalls = 0;
    vi.stubGlobal("window", {
      get localStorage() {
        localGetterCalls += 1;
        return failingLocal;
      },
      get sessionStorage() {
        sessionGetterCalls += 1;
        return workingSession;
      },
    });

    // Prime BOTH caches (each getter fires once).
    expect(safeSession.get("foo")).toBe("session-value");
    const sessionGetterCallsAfterPrime = sessionGetterCalls;
    const localGetterCallsAfterPrime = localGetterCalls;

    // Trigger a `localStorage` failure. This must invalidate ONLY
    // `cachedLocal`, leaving `cachedSession` (and its getter call
    // count) untouched.
    expect(() => safeLocal.set("foo", "bar")).not.toThrow();

    // Symmetric assertions: the `localStorage` getter fires again
    // (cache was invalidated by the failed set), the
    // `sessionStorage` getter does NOT (cache is intact).
    expect(localGetterCalls).toBeGreaterThan(localGetterCallsAfterPrime);
    // Reading session storage again must NOT invoke the
    // `sessionStorage` getter a second time — the cache is intact.
    expect(safeSession.get("foo")).toBe("session-value");
    expect(sessionGetterCalls).toBe(sessionGetterCallsAfterPrime);
  });

  it("re-probes a previously-null safeSession cache after a failed safeLocal.set", () => {
    const failingLocal = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    } as unknown as Storage;
    const recoveredSession = {
      getItem: vi.fn(() => "session-value"),
      setItem: vi.fn(),
    } as unknown as Storage;
    let currentSession: Storage | undefined;
    let sessionGetterCalls = 0;
    vi.stubGlobal("window", {
      get localStorage() {
        return failingLocal;
      },
      get sessionStorage() {
        sessionGetterCalls += 1;
        if (!currentSession) throw new Error("SecurityError");
        return currentSession;
      },
    });

    // Prime the session cache with a null sentinel.
    expect(safeSession.get("foo")).toBeNull();
    const sessionGetterCallsAfterNull = sessionGetterCalls;

    // A localStorage write failure should clear that null sentinel
    // so the next session read can re-probe a recovered store.
    expect(() => safeLocal.set("foo", "bar")).not.toThrow();
    expect(sessionGetterCalls).toBe(sessionGetterCallsAfterNull);

    currentSession = recoveredSession;
    expect(safeSession.get("foo")).toBe("session-value");
    expect(sessionGetterCalls).toBeGreaterThan(sessionGetterCallsAfterNull);
  });
});

describe("safeSession", () => {
  beforeEach(() => {
    __resetSafeStorageCacheForTesting();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSafeStorageCacheForTesting();
  });

  it("round-trips through sessionStorage when accessible", () => {
    const stub = {
      getItem: vi.fn(() => "session-value"),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub });

    expect(safeSession.get("foo")).toBe("session-value");
    safeSession.set("foo", "new");
    expect(stub.setItem).toHaveBeenCalledWith("foo", "new");
  });

  it("returns null when sessionStorage access throws", () => {
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("SecurityError");
      },
      localStorage: undefined,
    });

    expect(safeSession.get("foo")).toBeNull();
    expect(() => safeSession.set("foo", "bar")).not.toThrow();
  });
});

describe("safeStorage when window is undefined (SSR safety)", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    __resetSafeStorageCacheForTesting();
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    __resetSafeStorageCacheForTesting();
  });

  it("safeLocal.get returns null when window is undefined", () => {
    expect(safeLocal.get("foo")).toBeNull();
  });

  it("safeLocal.set is a no-op when window is undefined", () => {
    expect(() => safeLocal.set("foo", "bar")).not.toThrow();
  });

  it("safeSession.get returns null when window is undefined", () => {
    expect(safeSession.get("foo")).toBeNull();
  });

  it("safeSession.set is a no-op when window is undefined", () => {
    expect(() => safeSession.set("foo", "bar")).not.toThrow();
  });
});
