#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `clean-dist-pagefind.mjs` — wipe `dist/pagefind/` between
 * `astro build` and `pagefind --site dist`.
 *
 * Why this exists (R14)
 * ---------------------
 * `pnpm dev` ships the previously-built Pagefind index from
 * `public/pagefind/` (maintained by `scripts/copy-pagefind.mjs`
 * after each build). On the *next* build, `astro build` copies
 * that previous-build index from `public/` into `dist/pagefind/`
 * BEFORE `pagefind --site dist` runs. If `pagefind` doesn't fully
 * clear its output directory — for example when a post slug
 * changed and the previous fragment no longer has a counterpart
 * in the new build — hash-named fragments from the old build
 * linger in the deployed `dist/pagefind/`.
 *
 * The served search stays correct (the `pagefind-entry.json`
 * manifest is overwritten), but the deploy ships dead bytes that
 * are served with a 1-hour cache. Inserting one deterministic
 * `rm -rf` between `astro build` and `pagefind` removes the
 * question entirely, regardless of what `pagefind` chooses to
 * preserve.
 *
 * Idempotent: missing `dist/pagefind` is fine (clean already
 * happened) — exit 0 with a one-liner and move on.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = resolve(process.cwd(), "dist", "pagefind");

if (!existsSync(TARGET)) {
  console.log(`[clean-dist-pagefind] ${TARGET} already absent — nothing to do`);
  process.exit(0);
}

try {
  rmSync(TARGET, { recursive: true, force: true });
  console.log(`[clean-dist-pagefind] removed ${TARGET}`);
} catch (err) {
  console.error(
    `[clean-dist-pagefind] failed to remove ${TARGET}: ${err.message}`,
  );
  process.exit(1);
}
