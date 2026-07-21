# Security policy

## Supported versions

Only the **latest tagged release** of AstroPaper+ receives security
updates. Older versions are not patched.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | ✅ Active          |
| Tags    | Only the latest    |
| Older   | ❌ Not maintained  |

## Reporting a vulnerability

**Please do not file a public issue for security bugs.**

Use one of these private channels instead:

1. **GitHub private security advisory** (preferred):
   <https://github.com/msoltanov/astro-paper-plus/security/advisories/new>
2. **Email**: `msoltanov@users.noreply.github.com`

Include as much of the following as you can:

- A clear description of the vulnerability and the impact you observe.
- Reproduction steps (smallest case that demonstrates the bug).
- Environment details (Node version, pnpm version, OS, browser if
  client-side).
- If known, suggested remediation or a draft patch.

### What to expect

- **Acknowledgement** within **3 business days**.
- **Triage & severity assessment** within **7 business days**.
- A fix (or a coordinated disclosure timeline) once a patch is
  available — typically within **30 days** for high-severity issues,
  longer for complex problems. We will keep you informed.

We follow a **responsible disclosure** model: please give us a
reasonable amount of time to address the issue before publishing
details.

## Scope

AstroPaper+ vulnerabilities include (but are not limited to):

- **Build-time issues**: anything that causes `pnpm build` to fail or
  emit broken HTML/CSS/JS, including improper handling of user content.
- **Content security**: HTML injection vectors in Markdown / MDX
  components, XSS in default pages, unsafe handling of remote `og:` images.
- **Dependency vulnerabilities** reported via `pnpm audit`. Critical /
  high issues get a same-week patch; lower severities are batched into
  the next regular release.
- **Privilege / access** issues with the project bots or release
  workflow (e.g. compromised npm publish token).

Out of scope:

- Vulnerabilities in **upstream AstroPaper**
  ([satnaing/astro-paper](https://github.com/satnaing/astro-paper)) or
  in **Astro itself** ([withastro/astro](https://github.com/withastro/astro)).
  Report those upstream, then open a fork issue if a fix is needed in
  this repo.
- Issues requiring physical access to a user's device.
- Social-engineering attacks.

## Acknowledgements

We appreciate responsible disclosure. Reporters who follow this policy
will be credited in the fix release notes (unless they prefer to
remain anonymous).
