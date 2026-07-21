# `astro:env` schema — variables + introspection

The `astro.config.ts` `env.schema` block declares every environment
variable the project reads at SSR or ships to the client. This doc
captures the **why** behind each entry; the source carries the
**what** (type, optionality).

## `GOOGLE_SITE_VERIFICATION`

```ts
GOOGLE_SITE_VERIFICATION: envField.string({
  access: "public",
  context: "server",
  optional: true,
}),
```

**Why no `PUBLIC_` prefix.** Astro 7 splits `astro:env` into a
`client` virtual module (shipped to the browser) and a `server`
virtual module (consumed at SSR). `context: "server"` already makes
the var SSR-only — the legacy `PUBLIC_` prefix is reserved for
vars you want to ship to the client. We never prefix it.

**Why `access: "public"` on a server-only var.** Under Astro 7,
`access: "public"` on a `server`-context var means "Astro 7 may
inline the resolved value into the SSR-emitted HTML for the client
to read at runtime". The verification meta tag in
`src/layouts/Layout.astro` only reads the value at SSR — the
client never touches it — but Astro 7 accepts both `private` and
`public` access on `server` vars, and we standardised on `public`
to leave the door open for any future script that needs to read
the value at runtime without re-running SSR.

**Why `optional: true`.** Without a `GOOGLE_SITE_VERIFICATION` env
var the site still renders — the `<meta name="google-site-verification">`
tag is simply omitted from `<head>`. Forcing the var would break
local builds on a contributor's machine.

## Adding a new env var

1. Add an entry to the `env.schema` block in `astro.config.ts`.
   Match the prefix convention (no `PUBLIC_` unless you want it on
   the client; SSR-only vars stay prefix-less but use
   `context: "server"`).
2. Read the var via `import { MY_VAR } from "astro:env/server"` (for
   SSR-only) or `"astro:env/client"` (for client-shipped). The
   `setup.ts` vitest mock mirrors both modules so utility tests can
   import the consuming modules without crashing on the virtual
   modules.
3. Add an inline JSDoc comment on the schema entry that follows the
   structure above: **why no prefix**, **why this access level**,
   **why optional**. A future contributor refactoring env vars will
   find these comments adjacent to the code that needed them.
