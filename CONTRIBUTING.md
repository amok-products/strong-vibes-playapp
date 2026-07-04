# Contributing to Strong Vibes Playapp

Thanks for your interest in contributing! This is a community-friendly,
Apache-2.0 project. Please read this guide before opening a pull request.

## Ground rules

- Be respectful — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- This app drives a physical motor over BLE. Treat anything that affects motor
  output, intensity, or safety with extra care and clear testing notes.
- Security issues go through the private channel in [`SECURITY.md`](SECURITY.md),
  **not** public issues.

## Development setup

```bash
npm install
npm run dev        # Vite dev server (Chrome/Edge — Web Bluetooth required)
npm run build      # tsc -b type-check + Vite production build (the CI gate)
npm run lint       # ESLint
```

There is no unit-test runner; **`npm run build` is the correctness gate** and
must pass. BLE behavior is verified manually against real hardware in Chrome/Edge.

## Pull request flow

1. Fork and branch from `main` (e.g. `feat/…`, `fix/…`, `docs/…`).
2. Keep PRs focused. Make sure `npm run build` and `npm run lint` pass.
3. Update docs when behavior changes.
4. Open a PR using the template; describe what you changed and how you tested it.

## Versioning convention

**Bump the version in `package.json` in the same commit as the change.** The app
imports the version directly (`import { version } from '../../package.json'`) and
displays it in the connection panel, so the version, the UI, and the top
[`CHANGELOG.md`](CHANGELOG.md) entry must always agree. Add a `CHANGELOG.md` entry
(Keep a Changelog style, newest first) describing user-facing changes.

## Developer Certificate of Origin (DCO)

This project uses the **DCO** instead of a CLA. By contributing, you certify the
[Developer Certificate of Origin 1.1](https://developercertificate.org/). Sign
off every commit:

```bash
git commit -s -m "your message"
```

which adds a `Signed-off-by: Your Name <you@example.com>` trailer. Use your real
name and a reachable email.

> Note: do **not** add AI co-author trailers to commits (e.g. a `Co-authored-by:`
> line crediting an AI, or "coauthored with …"). Mentioning AI vendors, tools, or
> their APIs in code and docs is fine — the rule is only about commit authorship.

## Branding & trademark constraint

The code is Apache-2.0, but the **names are trademarks** (see
[`TRADEMARK.md`](TRADEMARK.md)). Contributions must not introduce uses of the
"Strong Vibes" or "Europe Magic Wand®" names that conflict with that policy
(e.g. implying a fork is the official project, or marking "Strong Vibes" as a
registered trademark). Factual compatibility statements are fine.

## Protocol spec

`vibe-protocol-skill.md` is a **synced mirror** of the canonical Strong Vibes
Protocol spec in the umbrella repo (`amok-products/strong-vibes`). **Do not edit
the mirror here** — propose spec changes upstream; a CI check flags divergence.

## Forbidden content

Never commit secrets or internal/partner-coupled files. In particular:
`MESSAGES_TO_HUB.md`, an internal `CLAUDE.md`, `.env*`, and `*.local.*` must
never be added.
