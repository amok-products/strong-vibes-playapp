# Strong Vibes Playapp

**Strong Vibes Playapp by europemagicwand.com** is a browser-based controller for
Bluetooth Low Energy massager devices. It runs entirely in Chrome/Edge using the
**Web Bluetooth API** — connect to a device, build and send motor patterns
(linear / sine / gaussian waveforms), adjust intensity live, read device info,
and inspect the raw BLE traffic. No install, no backend required: it's a static
web app that talks directly to the hardware from your browser.

> Adults only (18+). Hobbyist hardware — build and use at your own risk. Not a
> medical device. See [`DISCLAIMER.md`](DISCLAIMER.md).

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`) in
**Chrome or Edge**.

- **Browser:** Web Bluetooth is required. Chrome (desktop & Android) and Edge
  (desktop) are supported. Firefox and Safari are not (no Web Bluetooth).
- **Secure context:** Web Bluetooth only works in a secure context. `localhost`
  counts as secure, so local development works over plain HTTP. If you deploy to
  a remote origin, you must serve over **HTTPS**. The official build is deployed
  to GitHub Pages (see [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml));
  any static HTTPS host works too (a TLS reverse proxy, Netlify, Cloudflare
  Pages, etc.).
- **Optional integrations:** Community pattern sharing (Supabase) and the MCP
  bridge are **off by default**. The app runs fully offline with them unset. To
  enable community features, add a `.env.local` with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`; without them, community/share UI is hidden.

Build a production bundle with `npm run build` (outputs static files to `dist/`,
serve over HTTPS). There is no test runner — `npm run build` (`tsc -b`) is the
correctness gate.

## Start with your AI assistant

This repo is set up to be driven by an AI coding assistant (e.g. in Cursor or any
agent that reads repo docs). Paste this prompt to get going:

> Read `AGENTS.md`, install dependencies, and run the dev server. Then open the
> app in Chrome, connect to my device, and help me change **X**.

The assistant should read [`AGENTS.md`](AGENTS.md) first — it contains the
verified build/run commands, the Chrome/Web-Bluetooth constraint, the project
structure, and the rules it must follow.

## Project layout

- `src/ble/` — generic Web Bluetooth manager + Vibe notification parsing
- `src/protocol/` — Strong Vibes Protocol: datagrams, device info, UUIDs
- `src/components/` — React UI (Assembler / Designer / Play tabs, connection panel)
- `src/devices/` — external controllers (gamepad, MIDI, ESP32 knob)
- `src/hooks/`, `src/lib/` — device-manager/theme hooks and shared utilities
- `src/ai/`, `src/mcp/` — optional AI + MCP integration
- `vibe-protocol-skill.md` — synced mirror of the canonical protocol spec

## The Strong Vibes Protocol

The BLE protocol this app speaks is documented in
[`vibe-protocol-skill.md`](vibe-protocol-skill.md), a **synced mirror** of the
canonical spec that lives in the umbrella repo. Propose spec changes upstream,
not in the mirror.

## Related

- **Umbrella project & protocol spec:** [`amok-products/strong-vibes`](https://github.com/amok-products/strong-vibes)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) (DCO sign-off, versioning convention,
branding constraint) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Report
security issues privately per [`SECURITY.md`](SECURITY.md).

## License & branding

- **Code:** [Apache-2.0](LICENSE). Free to use, including commercially.
- **Attribution:** distributions must preserve the [`NOTICE`](NOTICE) credit.
- **Names:** "Strong Vibes" and "Europe Magic Wand®" are trademarks governed by
  [`TRADEMARK.md`](TRADEMARK.md) — the code is free, but using the names requires
  the accreditation "Strong Vibes X by europemagicwand.com".
- Third-party credits: [`ATTRIBUTION.md`](ATTRIBUTION.md).
