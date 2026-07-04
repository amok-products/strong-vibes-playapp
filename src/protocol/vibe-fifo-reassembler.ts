// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// Reassembles fragmented Vibe datagrams on characteristic 1227.
//
// The Vibe spec claims a 121-byte ATT payload (PB-03 L2CAP_MTU=128), but
// PB-03 V208-XMYY in the field emits notifications in ~8-byte chunks for
// any datagram larger than its actual MTU. The browser presents each chunk
// as a separate `characteristicvaluechanged` event, so the application
// must stitch them back together.
//
// Algorithm:
//   - A datagram starts with [0x10, SIZE, ...PAYLOAD(SIZE bytes)]; total = SIZE + 2.
//   - The first fragment of a datagram is identified by leading 0x10.
//   - Subsequent fragments are raw payload bytes (no header).
//   - Continuation is implicit: while buffer < expected, append.
//   - Non-datagram notifications (raw opcode responses, error replies) pass through.
//   - A header arriving truncated (just one byte) is dropped, not buffered — the
//     recovery path was a footgun (a fresh 0x10 byte arriving on the next notify
//     would be mis-read as the SIZE of the previous header).
//   - Stale buffer recovery: if more than STALE_MS elapses since the last
//     fragment, the buffer is discarded so a lost fragment can't corrupt the
//     next unrelated datagram. 200 ms is ~25-200x the observed inter-fragment
//     cadence on PB-03 V208-XMYY but well below any user-visible interaction.

const STALE_MS = 200;
const DATAGRAM_VER = 0x10;
const MAX_PAYLOAD = 119;

export class VibeFifoReassembler {
  private buffer: Uint8Array | null = null;
  private expected = 0;
  private lastNotifyAt = 0;

  push(notify: Uint8Array, now: number = Date.now()): Uint8Array[] {
    const completed: Uint8Array[] = [];

    if (notify.length === 0) return completed;

    if (this.buffer && now - this.lastNotifyAt > STALE_MS) {
      this.buffer = null;
      this.expected = 0;
    }
    this.lastNotifyAt = now;

    let input = notify;
    while (input.length > 0) {
      if (!this.buffer) {
        if (input[0] !== DATAGRAM_VER) {
          // Non-datagram (raw opcode response, error reply, future protocol).
          // Pass through as a single emit; downstream parsers handle or reject.
          completed.push(input.slice());
          return completed;
        }
        if (input.length < 2) {
          // Truncated header. Drop, do not attempt recovery (the recovery
          // path would mis-interpret the next notify's first byte as SIZE).
          return completed;
        }
        const size = input[1];
        if (size > MAX_PAYLOAD) {
          // Out-of-spec SIZE. Treat as non-datagram passthrough so a wire
          // glitch on SIZE can't pin the buffer waiting for hundreds of bytes.
          completed.push(input.slice());
          return completed;
        }
        const expected = size + 2;
        if (input.length >= expected) {
          completed.push(input.slice(0, expected));
          input = input.subarray(expected);
          continue;
        }
        this.buffer = new Uint8Array(input);
        this.expected = expected;
        return completed;
      }

      // Buffer non-empty: continuation bytes
      const needed = this.expected - this.buffer.length;
      const take = Math.min(needed, input.length);
      const merged = new Uint8Array(this.buffer.length + take);
      merged.set(this.buffer);
      merged.set(input.subarray(0, take), this.buffer.length);
      this.buffer = merged;
      input = input.subarray(take);

      if (this.buffer.length === this.expected) {
        completed.push(this.buffer);
        this.buffer = null;
        this.expected = 0;
      }
    }

    return completed;
  }
}
