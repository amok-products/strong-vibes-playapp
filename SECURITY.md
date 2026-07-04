# Security Policy

Strong Vibes Playapp is a browser app that drives a **physical motor over
Bluetooth Low Energy**. Because a vulnerability could affect a device acting on
a person's body, we take reports seriously and ask you to disclose privately.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use one of these private channels:

- **GitHub Security Advisories** — open a private report via the repository's
  **Security → Report a vulnerability** tab (preferred).
- If that is unavailable, contact the maintainers through the umbrella project
  `amok-products/strong-vibes`.

Please include:

- A description of the issue and its impact (especially anything that could
  cause the device to run an unintended or unsafe motor pattern / intensity).
- Steps to reproduce, affected version, browser, and OS.
- Any proof-of-concept, logs, or BLE traffic captures.

## What to expect

- We aim to acknowledge a report within a few business days.
- We will work with you on a fix and a coordinated disclosure timeline, and
  credit you if you wish.

## Scope notes

- This app requires Chrome/Edge Web Bluetooth and a **secure context** (HTTPS or
  `localhost`). Reports about running the app over plain HTTP on a remote origin
  are expected behavior, not a vulnerability.
- Optional Supabase/MCP integrations are off unless explicitly configured; issues
  in those paths should note the configuration used.
