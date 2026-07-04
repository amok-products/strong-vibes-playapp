# AGENTS.md

Operating manual for AI coding assistants and agents working in this repository.
Tool-agnostic: applies to Cursor or any assistant that reads repo docs. Read this
before making changes.

## What this project is

**Strong Vibes Playapp by europemagicwand.com** — a React + TypeScript + Vite web
app that controls BLE massager devices from the browser via the
**Web Bluetooth API**. It speaks the **Strong Vibes Protocol** (a compact,
datagram-based BLE GATT protocol). It is a static front-end: no server is
required; optional Supabase (community sharing) and MCP integrations are off
unless configured.

## Build & run (verified commands)

```bash
npm install        # install dependencies
npm run dev        # Vite dev server with HMR (open in Chrome/Edge)
npm run build      # tsc -b type-check + Vite production build  ← the correctness gate
npm run lint       # ESLint
npm run preview    # preview a production build
npm run typecheck  # tsc --noEmit (type-check only)
```

There is **no unit-test runner**. `npm run build` (which runs `tsc -b` under
strict settings) is the automated correctness gate — it must pass. BLE behavior
is verified **manually** against real hardware in Chrome/Edge.

## Hard constraints

- **Chrome/Edge + Web Bluetooth only.** Firefox and Safari have no Web Bluetooth.
- **Secure context required.** Works on `localhost` over HTTP; any remote origin
  must be HTTPS or the browser blocks Web Bluetooth.
- **TypeScript is strict:** `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax` (use `import type` for type-only imports). The build
  will fail on unused symbols and value/type import mixing.

## Frozen contracts — do NOT rename these

These identifiers are **compatibility contracts**, not branding. Renaming them
breaks real device/interop behavior. Leave them as-is unless you are doing the
specific coordinated change noted:

- **`'Strong Vibes Knob'`** — the knob's BLE-advertised name, used by the
  bridge-mode detection literal (`deviceName?.startsWith('Strong Vibes Knob')` in
  `src/components/play/PlayTab.tsx`) and the connect scan filter
  (`src/hooks/useDeviceManager.ts`). This is a **byte-identical cross-repo
  contract** with the knob firmware's `VIBE_DEVICE_NAME` macro
  (`main/vibe_protocol.h` in the Strong Vibes Knob Control firmware). The
  `EMW-Knob → Strong Vibes Knob` rename already shipped on both sides in
  lockstep — do not change one side without the other or knob detection breaks.
- **`requestDevice(['EMW', 'Strong Vibes Knob'], …)`** (in
  `src/hooks/useDeviceManager.ts`) — the connect scan filter. The massager
  advertises as `EMWxxxx…` and that prefix is **permanent — it will not
  change**, so `'EMW'` must stay; the `'Strong Vibes Knob'` entry mirrors the
  knob firmware name above. Do not rebrand `'EMW'`.
- **`emw_pattern`** JSON key (in `src/components/designer/CopyToMobile.tsx`) — the
  reserved clipboard "pattern exchange" wire format for a **planned companion
  mobile app that is not yet implemented**. Help text may be rebranded, but the
  key must stay `emw_pattern` so it stays interop-compatible when the mobile side
  ships.

## Project structure

- `src/ble/` — generic Web Bluetooth manager (`BleManager`, `useBle`) and Vibe
  notification parsing (`vibeTransport.ts`).
- `src/protocol/` — Strong Vibes Protocol: `vibe-datagram.ts` (datagram build/parse),
  `vibe-device-info.ts` (Device.Info module 0x03), `vibe-uuids.ts` (BLE UUIDs;
  only 1225 Write and 1227 Read are active).
- `src/components/` — React UI: connection panel + Assembler / Designer / Play tabs.
- `src/ai/`, `src/mcp/` — optional AI and MCP bridge integrations.
- `vibe-protocol-skill.md` — **synced mirror** of the canonical protocol spec in
  the umbrella repo `amok-products/strong-vibes`. Do not edit the mirror here;
  propose spec changes upstream.

## Conventions

- **Bump `version` in `package.json` in the same commit as the change** — the app
  displays it (`import { version } from '../../package.json'` in
  `ConnectionPanel.tsx`), and it must match the top `CHANGELOG.md` entry.
- Sign off commits for the DCO: `git commit -s` (see `CONTRIBUTING.md`).
- Respect the branding/trademark policy in `TRADEMARK.md`.

## Never commit

- Secrets or environment files: `.env*`, `*.local.*`.
- Internal / partner-coupled files: `MESSAGES_TO_HUB.md`, an internal `CLAUDE.md`,
  or any hub-coupled operating notes. These do not belong in this public repo.
- Do not add AI co-author trailers to commits (e.g. a `Co-authored-by:` line
  crediting an AI, or "coauthored with …"). Referencing AI vendors, tools, or
  their APIs in code and docs is fine — the rule is only about commit authorship.
