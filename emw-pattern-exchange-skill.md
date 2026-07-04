# EMW Pattern Exchange Format — Skill Reference

**Skill version:** 1.0.0
**Format version:** 2

## Overview

The EMW Pattern Exchange Format is a JSON-based clipboard/text protocol for sharing vibration patterns between EMW apps, devices, and integrations. It is designed to be human-readable, copy-paste friendly, and unambiguous across different clients.

A single exchange payload contains two sections:

1. **`pattern`** — the canonical pattern definition at standard reference values
2. **`playback`** — the sender's current playback settings (optional, informational)

## JSON Schema

```json
{
  "emw_pattern": {
    "version": 2,
    "name": "<string>",
    "created": "<ISO 8601 timestamp>",
    "pattern": {
      "segments": [
        {
          "intensityBegin": <0-100>,
          "intensityEnd": <0-100>,
          "periodMs": <200-65535>
        }
      ]
    },
    "playback": {
      "mic": <0-100>,
      "speed": <0.25-4.0>,
      "amplitudeMin": <0-100>,
      "amplitudeMax": <0-100>,
      "loop": <boolean>
    }
  }
}
```

## Canonical Pattern (the `pattern` section)

The `pattern.segments` array defines the waveform at **standard reference values**:

| Parameter | Reference Value | Meaning |
|-----------|----------------|---------|
| MIC (power) | 100 | Full intensity — the segment values represent the intended shape at max power |
| Speed | 1.0 | Original timing — `periodMs` values are unscaled |
| Amplitude range | 0–100% | Full range — `intensityBegin` and `intensityEnd` are unscaled |

This means the canonical pattern describes the **shape** of the waveform independent of how any particular user chooses to play it. Two users sharing the same canonical pattern will get identical waveforms when they both play at MIC=100, speed=1.0, range 0–100%.

### Segment Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `intensityBegin` | integer | 0–100 | Start intensity of the linear ramp (percentage of MIC) |
| `intensityEnd` | integer | 0–100 | End intensity of the linear ramp (percentage of MIC) |
| `periodMs` | integer | 200–65535 | Duration of this segment in milliseconds |

Each segment is a linear ramp from `intensityBegin` to `intensityEnd` over `periodMs` milliseconds. The actual motor output is `intensity * (MIC / 100)`.

### Rules for Canonical Segments

- Segments MUST NOT have speed, amplitude range, or MIC baked into their values
- Segments represent the raw pattern as designed, before any playback adjustments
- Per-part tags (staccato, build, tease, etc.) and per-part amplitude/speed ARE included, as they define the pattern's shape
- Global speed, global amplitude range, and MIC are NOT included — those are playback settings

## Playback Settings (the `playback` section)

The `playback` object captures the sender's current playback configuration at the time of copy. This is **informational** — the receiver may use these values as defaults or ignore them.

| Field | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `mic` | integer | 0–100 | 100 | Motor Intensity Control — scales all segment intensities |
| `speed` | number | 0.25–4.0 | 1.0 | Speed multiplier — divides all `periodMs` values |
| `amplitudeMin` | integer | 0–100 | 0 | Low end of the intensity range mapping |
| `amplitudeMax` | integer | 0–100 | 100 | High end of the intensity range mapping |
| `loop` | boolean | — | true | Whether the pattern repeats after completion |

### Applying Playback Settings

To go from canonical segments to device-ready segments:

```
effectivePeriodMs = clamp(round(segment.periodMs / speed), 200, 65535)
effectiveIntensity = amplitudeMin + (segment.intensity / 100) * (amplitudeMax - amplitudeMin)
motorOutput = effectiveIntensity * (mic / 100)
```

## Versioning

The `version` field identifies the exchange format version:

| Version | Description |
|---------|-------------|
| 1 | Legacy — segments have speed/amplitude baked in, no `playback` section |
| 2 | Current — canonical segments at reference values + separate `playback` settings |

Receivers SHOULD accept both versions. When receiving version 1, treat segments as already having playback settings applied (no further transformation needed, but the original shape is lost).

## Transport

The exchange format is transported as a JSON text string via:

- **Clipboard** (primary) — copy/paste between apps on the same device or via clipboard sync (iCloud, Google, etc.)
- **Text message** — paste into chat, email, or SMS
- **File** — save as `.json` file
- **URL parameter** — base64-encoded in a URL query string (future)

The JSON is pretty-printed (`JSON.stringify(payload, null, 2)`) for human readability when pasted into text fields.

## Detection

To identify an EMW Pattern Exchange payload in arbitrary text:

1. Parse as JSON
2. Check for the `emw_pattern` top-level key
3. Check `emw_pattern.version` is a known version (1 or 2)
4. Validate `emw_pattern.pattern.segments` is a non-empty array

## Example

```json
{
  "emw_pattern": {
    "version": 2,
    "name": "Gentle Wave",
    "created": "2026-04-02T14:30:00.000Z",
    "pattern": {
      "segments": [
        { "intensityBegin": 20, "intensityEnd": 80, "periodMs": 1000 },
        { "intensityBegin": 80, "intensityEnd": 20, "periodMs": 1000 },
        { "intensityBegin": 20, "intensityEnd": 60, "periodMs": 800 },
        { "intensityBegin": 60, "intensityEnd": 20, "periodMs": 800 }
      ]
    },
    "playback": {
      "mic": 75,
      "speed": 1.2,
      "amplitudeMin": 10,
      "amplitudeMax": 90,
      "loop": true
    }
  }
}
```

This pattern describes a gentle wave shape. The sender was playing it at 75% power, 1.2x speed, with intensity clamped to 10–90%. A receiver could load the canonical segments and apply their own preferred settings.
