# Changelog

All notable changes to Strong Vibes Playapp are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [2.14.4] - 2026-10-13

Dependency hygiene and lint cleanup (no app or device behavior changed).

### Security
- **`npm audit fix`** (non-breaking) — a fresh install reported 24 advisories
  (2 low, 4 moderate, 18 high), all in dev-only build tooling; the runtime
  dependencies in the shipped bundle had none. The non-breaking fix clears 15
  of them. It also lifts `typescript-eslint` to 8.71, which removes the
  "TypeScript 5.6.3 not officially supported" lint banner.

### Changed
- **Lint is clean (0 warnings).** The two `react-hooks/exhaustive-deps`
  exceptions in `src/App.tsx` are now documented in place instead of "fixed" by
  adding dependencies: the BLE notification wiring intentionally re-runs only
  when the slot ids/states change (the device manager object is new on every
  render), and the device-MIC sync intentionally keys on the MIC/state values
  rather than the per-notification object. The wiring effect's key is
  extracted to a variable; its value and behavior are unchanged.
- **Fast Refresh boundaries** — `loadPatternState` and the pattern-builder
  defaults moved to `src/components/assembler/patternState.ts`, and the Play
  tab's recent-pattern history to `src/components/play/recentPatterns.ts`, so
  those component files export only components.

## [2.14.3] - 2026-07-04

Doc/CI pre-launch fixes (no app behavior changed).

### Fixed
- **Spec-sync CI gate** (`.github/workflows/spec-sync-check.yml`) — pointed
  `CANONICAL_URL` at the live spec path (`amok-products/strong-vibes` →
  `protocol/strong-vibes-protocol.md`). The old `skills/vibe-protocol-public.md`
  path returned 404, so the gate silently *skipped* and never actually checked
  the mirror for divergence.

### Changed
- **`vibe-protocol-skill.md`** — re-synced the protocol-spec mirror from the
  (now-reachable) canonical source so the reactivated divergence check passes;
  the injected `Canonical source:` banner is preserved.
- **`esp32-firmware-skill.md`** — rebranded the shipped app name to **Strong
  Vibes Playapp** and the knob's advertised BLE name / handshake identifier to
  **Strong Vibes Knob** (the shipped, frozen cross-repo contract), and updated
  the illustrative firmware directory to `strong-vibes-knob-firmware/`. The
  massager `EMW` advertising prefix is unchanged.

## [2.14.2] - 2026-07-04

Pre-public-launch polish (software-only chores — no device behavior changed).

### Added
- **`public/CNAME`** — commits the `playapp.emw4u.com` custom-domain binding into
  the build output so it survives every GitHub Pages deploy instead of relying on
  the Pages UI setting (which can silently reset).
- **`engines` field** in `package.json` (`"node": ">=20"`) — declares the
  supported runtime for forks (CI pins Node 20).

### Changed
- **`AGENTS.md` frozen contracts** — refreshed the knob BLE-name bullets to the
  shipped `Strong Vibes Knob` name (the `EMW-Knob → Strong Vibes Knob` rename
  landed on both webapp and firmware). The old bullets still described the
  pre-rename state, which risked an agent "restoring" `EMW-Knob` and breaking
  detection.

### Security
- **`npm audit fix`** — cleared the high-severity `ws` DoS advisory
  (GHSA-96hv-2xvq-fx4p) and 11 other transitive advisories (18 → 6). The
  remaining 6 are dev-toolchain-only (`vite`/`esbuild`/`eslint` chain) and only
  clear via a breaking `vite@8` major, so they are intentionally left for a
  separate deliberate bump rather than force-upgraded here.

## [2.14.1] - 2026-07-03

### Changed
- **First-run safety notice** — reworded the 18+ bullet to frame the app as an
  open developer platform where you own your safety, and removed the
  "start at low intensity / keep hardware within rated limits" bullet.

## [2.14.0] - 2026-07-03

Pre-open-source hardening pass (security, physical-device safety, correctness).

### Security
- **Community sharing (Supabase)** — removed the anonymous UPDATE/DELETE row
  policies that let any visitor overwrite or delete *every* shared community
  pattern (they were scoped only by `user_id IS NULL`, which matched all
  anonymous rows). Anonymous access is now read + community-share INSERT only,
  with bounded fields; the app only ever reads and inserts, so nothing is lost.
- **MCP server bridge** — the generated Node server now binds to `127.0.0.1`
  only and enforces an `Origin` allowlist, so it isn't reachable on the local
  network and arbitrary web pages can't drive the device over `ws://localhost`.

### Safety
- **Authoritative intensity/period clamp at the wire** — the datagram builders
  now clamp intensity to 0–100 and period to 100–65535 ms (NaN-safe) instead of
  bit-masking, so no source (community/saved/pasted/AI/MCP/gamepad/MIDI) can
  drive out-of-range values onto the device. Device minimum period is now 100 ms.
- **Stop on disconnect & tab-close** — Disconnect now sends a device reset
  (delivery-confirmed, with fallback) before dropping the link, and closing/
  navigating away while playing sends a best-effort stop. A top-level error
  boundary also stops the device if the UI crashes.
- **Gamepad** — starting playback from the controller no longer jumps intensity
  to 100%; it keeps the on-screen value.
- **In-app safety notice** — a first-run 18+/at-your-own-risk acknowledgement and
  a reopenable Safety link now surface the DISCLAIMER inside the app.
- AI/MCP patterns now respect the on-screen amplitude ceiling; NaN/garbage
  values from AI/MCP tool calls are rejected.

### Fixed
- BLE read notifications could be subscribed multiple times on multi-device use
  or reconnect, corrupting reassembly/motor-state — subscriptions are now
  idempotent.
- The downloadable MCP server template was non-functional against its pinned SDK
  (string request-handler keys) — now uses the correct request schemas.
- MIDI CC re-mapping now takes effect live; MIDI speed uses the standard
  0.2×–5.0× range; continuous voice input no longer double-starts or fires
  overlapping AI requests; the app no longer crashes when storage is blocked
  (private mode).
- Assembler "Send" no longer silently truncates over-long saved shapes.

### Changed / hygiene
- ESP32 knob mapping settings are retained but clearly marked "not yet
  implemented" and persisted locally.
- Custom intensity range slider is now keyboard/ARIA accessible.
- Added a CI workflow (lint + typecheck + build); stopped tracking generated
  `*.tsbuildinfo`; added `repository`/`homepage`/`bugs` to `package.json`.

## [2.13.0] - 2026-07-02

### Fixed
- **Play → AI** — the assistant can now actually **turn on / play / resume** an
  idle device. MIC (master intensity) is a global pre-gain that only scales a
  pattern that is *already running*, so on an idle motor "turn on" via MIC did
  nothing. A new **play** action re-sends the current pattern (which is what
  actually starts the motor), and the AI skill now documents the MIC-vs-start
  distinction so the model stops trying to start the device with MIC. "turn on",
  "resume", "start", "play", "go", "on" all resume the loaded pattern (honoring
  its repeat mode); when nothing is loaded the assistant asks for a description.
- **Play → AI** — the assistant now defaults to **repeating** patterns and won't
  silently flip a loop into a one-shot when modifying it, and the pattern preview
  loops (or plays once) to match the pattern's actual repeat mode. Previously the
  AI mixed one-shots into looping sessions and the visualizer always looped, so
  the on-screen playback drifted out of sync with the device. One-shots are still
  available when explicitly requested ("play it once", "don't loop").
- **Play → AI** — "faster" / "slower" now apply **immediately** (they re-send the
  current pattern at the new speed as soon as you're connected, instead of
  deferring to the next play).
- **Play → AI** — asking the assistant to **bring back an earlier pattern** ("play
  the gentle wave again", "go back to the first one") now actually reloads it and
  updates the on-screen visualizer, instead of leaving the last pattern on screen.
  The assistant is given the segments of recent patterns so it can reproduce a
  specific one exactly.

## [2.12.0] - 2026-07-02

### Fixed
- **Play → AI** — the pattern visualizer now reflects live **MIC** and **speed**
  changes (it was pinned to the pattern's original values), so tweaks show up
  immediately, and its playhead no longer resets on every MIC nudge.
- **Play → AI** — "faster" / "slower" now actually change the playing pattern's
  speed on the device (the command previously only moved the number without
  resending). Speed commands are relative and compound, clamp cleanly at the
  0.25×–4× rails, and the chat reply is honest about whether the change is live
  or applies on the next play.
- **Play → AI** — the prompt field keeps focus after you press Enter, so you can
  fire off commands back-to-back without re-clicking.

### Changed
- **Play → AI** — the assistant is given the current pattern's exact segments as
  context, so it can reliably **modify, extend, or build on** the pattern it just
  made ("make the middle more intense", "add a build-up at the end") instead of
  starting from scratch. The last-made pattern is restored from browser-local
  chat history on reload, and the remembered history window is widened. All AI
  memory stays in the browser (localStorage) — nothing is sent to a server.

## [2.11.0] - 2026-07-02

### Added
- **Assembler → Saved Shapes** — the Assembler's bottom list now shows the shapes
  saved via **Save to Shapes** (it reads the shape store), with load-into-builder,
  send-to-device, and delete actions.
- **Gamepad Controller** — a visible setup note: pair the controller in your
  computer's Bluetooth settings first (the app only sees OS-paired controllers),
  plus DualShock 4 pairing steps (**Share + PS** ~3–5s → light bar double-flashes
  white).

### Changed
- **Taxonomy: Shape → Part → Pattern.** The data model is realigned so the whole
  UI speaks one vocabulary: a **Shape** is one atomic waveform (store `sv-shapes`),
  a **Part** is a shape placed on the Designer timeline, and a **Pattern** is the
  composed, playable timeline (store `sv-patterns`). A one-time, lossless migration
  copies existing data forward from the old `sv-designer-parts` / `sv-saved-patterns`
  keys. Designer labels change **My Parts → Shapes**, **Saved Patterns → Patterns**,
  and **Build Your Parts → Build Shapes** (timeline pieces stay "parts"). Pasting a
  copied pattern now imports a **Pattern** (playable, listed under Patterns / Play),
  not a lone shape.
- **Assembler** layout reordered to **Segments → Visualizer → MIC → Save to
  Shapes**, and the duplicate inline datagram preview was removed — the bottom
  **Raw Hex** panel is now the single datagram display.
- **Header** — the centered Strong Vibes wordmark is enlarged 2× to `h-24`
  (~96px), with the header row growing so it never clips.

### Removed
- The Assembler's saved-**pattern** list and its community browse/publish control
  (the Assembler is now a shape factory). Pattern sharing remains in the Designer
  **Patterns** tab and the Play **Community** source.

## [2.10.0] - 2026-07-02

### Added
- **Draw → Smooth Undo** — a single-level undo restores the pre-Smooth curve in the
  Designer's Draw canvas (invalidated by any manual point edit or Clear).
- **Beta** markers on the Play tab's experimental features: the AI sub-tab, the MIDI
  Controller panel, and the Integrations sub-tab.

### Changed
- **Header** — the Europe Magic Wand "E" mark returns as the small leading app icon
  and the Strong Vibes logo is enlarged and horizontally centered as the header
  wordmark; the first-connect button now reads **Connect Strong Vibes Device**.
- **Play → Player** — the saved-pattern chooser now renders above the visualization
  (choose → see → play).
- **Assembler** — MIC, Pattern ID, Send to Device, and Reset are consolidated into a
  single Designer-style control section, and **Query Status** moved into the Device
  Info header. **Save Pattern** is now **Save to Shapes**: it stores the pattern as a
  Designer shape (Part Sources → **My Parts**) instead of the Play-tab pattern list.
  The "Auto-query after send" option was removed.
- **Designer → Save as Pattern** is now a prominent primary button (shown disabled
  when the timeline is empty).
- Copy-to-clipboard help text now clarifies that in-app import on iOS/Android isn't
  available yet and that the copied text is a portable, editor-friendly format.

### Removed
- The Designer's **Studio** builder mode (Shapes and Draw remain). Parts previously
  saved from Studio still load and play.

## [2.9.0] - 2026-07-02

### Changed
- **Assembler → Device Info** now renders **HW revision** and **motor revision**
  as `X.Y` (e.g. `3.0` / `1.0`) — decoded from the nibble-packed Device.Info slot
  `0x03` bytes — instead of the raw decimal byte values.
- Added a **Serial no.** row showing the 9-digit serial parsed from the connected
  device's `EMW…` BLE name (renders `—` for devices without one, e.g. a knob).

### Removed
- **Battery** (Device.Info slot `0x01`) and **Usage** (slot `0x04`) rows — neither
  is populated on this product. Both are now marked **NA** in the in-app protocol
  reference, and the parser silently skips the slots, so a device that still emits
  them produces no anomaly.
- The Assembler's **Authentication**, **Server State**, and **Server State Log**
  sections, plus their now-dead plumbing (legacy `1230` / challenge-response
  paths). Live motor state already arrives on the `1227` read path and is
  unaffected.

## [2.8.9] - 2026-07-02

### Fixed
- The **Connect device** chooser now lists the **Strong Vibes Knob**. Bridge-mode
  discovery filtered only on the massager's `EMW` name prefix, so a knob
  advertising `Strong Vibes Knob` (renamed alongside the rebrand) was excluded
  from the browser device picker and could never connect — even though the
  post-connect detection already recognised the new name. Discovery now accepts
  both device families (`EMW…` massager and `Strong Vibes Knob`).

## [2.8.8] - 2026-07-02

### Fixed
- Restore the GitHub Pages deploy workflow that publishes the site (removed in
  error during open-source prep as a "Jekyll" workflow — it was actually the
  Vite → Pages deployer), so pushes to `main` publish again.

### Changed
- Broaden `.gitignore` to cover all `.env.*` files in addition to `.env`.
- Bump the version so the deployed build is distinguishable from the pre-rebrand `2.8.7`.

## [2.8.7] - 2026-07-01

Initial public release of **Strong Vibes Playapp by europemagicwand.com**.

### Added
- Public open-source layer: Apache-2.0 `LICENSE`, `NOTICE`, `TRADEMARK.md`,
  `ATTRIBUTION.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`,
  `DISCLAIMER.md`, GitHub issue/PR templates, and this changelog.
- Public builder-facing `README.md` and an `AGENTS.md` operating manual for AI
  assistants, plus a thin `.cursorrules` pointer.
- Synced mirror header on `vibe-protocol-skill.md` pointing at the canonical
  Strong Vibes Protocol spec, with a CI divergence check.

### Notes
- Baseline version retained at `2.8.7` (internal continuity) for the public debut.
- Web Bluetooth controller for BLE massager devices (Chrome/Edge). Optional
  Supabase (community sharing) and MCP integrations are off unless configured.

[2.14.3]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.14.3
[2.14.2]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.14.2
[2.14.1]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.14.1
[2.14.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.14.0
[2.13.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.13.0
[2.12.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.12.0
[2.11.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.11.0
[2.10.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.10.0
[2.9.0]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.9.0
[2.8.9]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.8.9
[2.8.8]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.8.8
[2.8.7]: https://github.com/amok-products/strong-vibes-playapp/releases/tag/v2.8.7
