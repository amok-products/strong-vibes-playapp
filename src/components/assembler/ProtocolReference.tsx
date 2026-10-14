// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import {
  DGRM_COLOR_HEADER,
  DGRM_COLOR_MODULE,
  DGRM_COLOR_TIMBRE,
  DGRM_COLOR_PATTERN_ID,
  DGRM_COLOR_MIC,
  DGRM_COLOR_SEG_A,
  DGRM_COLOR_SEG_B,
} from './ColoredDatagram';

function B({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`${color} font-mono font-medium`}>{children}</span>;
}

function ByteBox({ color, label, bytes }: { color: string; label: string; bytes?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono border border-current/20 ${color}`}>
      {bytes && <span className="opacity-60">{bytes}</span>}
      {bytes && <span className="opacity-40 mx-0.5">|</span>}
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-surface-700 dark:text-surface-200 uppercase tracking-wider">{title}</h4>
      <div className="text-xs text-surface-600 dark:text-surface-300 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function ProtocolReference() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left
                   hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <BookOpen className="w-3.5 h-3.5 text-surface-500" />
        <span className="text-sm font-medium flex-1">Vibe Protocol Reference</span>
      </button>

      {isOpen && (
        <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-4 space-y-5">
          <Section title="Datagram Format">
            <p>All Vibe messages are wrapped in a datagram envelope. Max datagram = 121 bytes (PB-03: L2CAP MTU=128, ATT payload=121).</p>
            <div className="flex flex-wrap items-center gap-1.5 my-2">
              <ByteBox color={DGRM_COLOR_HEADER} label="VER" bytes="0x10" />
              <ByteBox color={DGRM_COLOR_HEADER} label="SIZE" bytes="N" />
              <span className="text-[10px] text-surface-400">|</span>
              <span className="text-[11px] text-surface-500 font-mono">PAYLOAD (0..119 bytes)</span>
            </div>
            <p>
              <B color={DGRM_COLOR_HEADER}>VER</B> = protocol version (always 0x10).{' '}
              <B color={DGRM_COLOR_HEADER}>SIZE</B> = payload length (excludes VER and SIZE).
            </p>
          </Section>

          <Section title="Motor Pattern Payload">
            <div className="flex flex-wrap items-center gap-1.5 my-2">
              <ByteBox color={DGRM_COLOR_MODULE} label="MOD" bytes="0x01" />
              <ByteBox color={DGRM_COLOR_MODULE} label="MSG" bytes="0x00/01" />
              <ByteBox color={DGRM_COLOR_TIMBRE} label="TIM" bytes="0x00-02" />
              <ByteBox color={DGRM_COLOR_PATTERN_ID} label="PID" bytes="0-255" />
              <ByteBox color={DGRM_COLOR_MIC} label="MIC" bytes="0-100" />
              <span className="text-[10px] text-surface-400">|</span>
              <ByteBox color={DGRM_COLOR_SEG_A} label="seg 1..." />
              <ByteBox color={DGRM_COLOR_SEG_B} label="seg 2..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
              <div><B color={DGRM_COLOR_MODULE}>MOD</B> = 0x01 (Motor)</div>
              <div><B color={DGRM_COLOR_MODULE}>MSG</B> = 0x00 (repeating) / 0x01 (non-repeating)</div>
              <div><B color={DGRM_COLOR_TIMBRE}>TIM</B> = 0x00 Linear / 0x01 Sine / 0x02 Gaussian</div>
              <div><B color={DGRM_COLOR_PATTERN_ID}>PID</B> = pattern identifier (1-254 user)</div>
              <div><B color={DGRM_COLOR_MIC}>MIC</B> = 0-100% (0xEE/0xFF: see MIC Special Values)</div>
            </div>
          </Section>

          <Section title="Waveform Segment Layouts">
            <div className="space-y-3">
              <div>
                <p className="font-medium mb-1">Linear (TIM=0x00) -- 4 bytes/segment, up to 28 segments:</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ByteBox color={DGRM_COLOR_SEG_A} label="begin%" bytes="B0" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="end%" bytes="B1" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="periodHi" bytes="B2" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="periodLo" bytes="B3" />
                </div>
                <p className="text-[10px] text-surface-400 mt-0.5">Period = (B2 &lt;&lt; 8) | B3, in milliseconds (100-65535)</p>
              </div>

              <div>
                <p className="font-medium mb-1">Sine (TIM=0x01) -- exactly 4 bytes:</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ByteBox color={DGRM_COLOR_SEG_A} label="ampl" bytes="B0" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="center" bytes="B1" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="periodHi" bytes="B2" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="periodLo" bytes="B3" />
                </div>
              </div>

              <div>
                <p className="font-medium mb-1">Gaussian (TIM=0x02) -- 5 bytes/segment, up to 22 segments:</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ByteBox color={DGRM_COLOR_SEG_A} label="start%" bytes="B0" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="end%" bytes="B1" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="durHi" bytes="B2" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="durLo" bytes="B3" />
                  <ByteBox color={DGRM_COLOR_SEG_A} label="steep" bytes="B4" />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Pattern Interaction Rules">
            <div className="panel-inset p-3 text-[11px] space-y-1">
              <div className="flex gap-2"><span className="text-success-500 shrink-0">1.</span> New repeating replaces current repeating pattern</div>
              <div className="flex gap-2"><span className="text-accent-500 shrink-0">2.</span> Non-repeating interrupts repeating, then repeating resumes</div>
              <div className="flex gap-2"><span className="text-danger-500 shrink-0">3.</span> Cannot send non-repeating during another non-repeating (rejected)</div>
              <div className="flex gap-2"><span className="text-surface-400 shrink-0">4.</span> Control.Reset (0x00, 0x00) stops all motor activity</div>
            </div>
          </Section>

          <Section title="Other Motor Messages">
            <div className="space-y-1 text-[11px]">
              <div>
                <B color={DGRM_COLOR_MODULE}>Motor.State</B> (0x01, 0x02): server notification{' '}
                <span className="font-mono text-surface-400">[state, patternId, MIC]</span>
              </div>
              <div>
                <B color={DGRM_COLOR_MODULE}>Motor.ErrorEvent</B> (0x01, 0x03): server notification{' '}
                <span className="font-mono text-surface-400">[errorCode]</span>
              </div>
              <div>
                <B color={DGRM_COLOR_MIC}>Motor.MIC</B> (0x01, 0x04): adjust intensity{' '}
                <span className="font-mono text-surface-400">[MIC]</span> without changing pattern
              </div>
              <div>
                <span className="font-mono text-surface-500">Control.Reset</span> (0x00, 0x00): stop motor, clear patterns
              </div>
            </div>
          </Section>

          <Section title="MIC Special Values">
            <p className="text-[11px] mb-2">
              Defined by the protocol but <em>not supported</em> by the reference firmware. This app never sends
              them and clamps every MIC it sends to 0-100.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="panel-inset p-2">
                <B color={DGRM_COLOR_MIC}>0xEE (238)</B> = "Lock at 100%" in the protocol
                <p className="text-[10px] text-surface-400 mt-0.5">Not supported by the reference firmware; never sent by this app</p>
              </div>
              <div className="panel-inset p-2">
                <B color={DGRM_COLOR_MIC}>0xFF (255)</B> = "Unchanged" in the protocol
                <p className="text-[10px] text-surface-400 mt-0.5">Not supported by the reference firmware; never sent by this app</p>
              </div>
            </div>
          </Section>

          <Section title="Device.Info Module (0x03)">
            <p>
              Read-only telemetry (plus one writable settings slot). Query a slot by writing{' '}
              <span className="font-mono">[0x10, 0x02, 0x03, slot]</span> to 1225; the device replies on 1227 with{' '}
              <span className="font-mono">[0x10, SIZE, 0x03, slot, SCHEMA_VER, ...body]</span>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono mt-1">
              <div><span className="text-surface-400">0x01</span> Battery — <span className="text-surface-400 italic">NA (not used)</span></div>
              <div><span className="text-surface-400">0x02</span> Fault — active, last, count</div>
              <div><span className="text-surface-400">0x03</span> HW Rev — pcb, motor, features</div>
              <div><span className="text-surface-400">0x04</span> Usage — <span className="text-surface-400 italic">NA (not used)</span></div>
              <div><span className="text-accent-500">0x05</span> FW Version — maj.min.patch.build (git)</div>
              <div><span className="text-surface-400">0x06</span> Settings — byte; bit0 = classic-mode default (writable)</div>
              <div><span className="text-surface-400">0xFE</span> Ext SN — 32-bit serial number</div>
              <div><span className="text-success-500">0xFF</span> Bundle — all slots as TLV sub-records</div>
            </div>
            <p className="text-[10px] text-surface-400 mt-1">
              Bundle (0xFF) packs each slot as <span className="font-mono">[sub-slot, sub-len, schema-ver, ...body]</span>.
              Settings (0x06) is written as <span className="font-mono">[0x10, 0x04, 0x03, 0x06, SCHEMA_VER, byte]</span> and echoed back on success.
              The Device Info panel's <span className="font-mono">FW Version</span> row is read from slot 0x05.
            </p>
          </Section>

          <Section title="Raw First Bytes (Reserved — Not Vibe)">
            <p>
              Every Vibe message starts with <span className="font-mono">0x10</span>. The byte range{' '}
              <span className="font-mono">0x01..0x0F</span> (and <span className="font-mono">0x80</span>/<span className="font-mono">0x81</span>)
              is reserved for the device's separate private protocol — do not send these as a Vibe first byte.
              Legacy raw opcodes (<span className="font-mono">0x0A</span> sync, <span className="font-mono">0x0B</span> status,{' '}
              <span className="font-mono">0x0F</span> version) are <em>not implemented</em> on current device firmware.
            </p>
            <p className="mt-1">
              Read the firmware version from <span className="font-mono">Device.Info Module 0x03 slot 0x05</span> instead
              (see the Device Info panel).
            </p>
            <div className="space-y-1 text-[11px] font-mono mt-1">
              <div><span className="text-danger-500">0xFF</span> Error response from server: <span className="text-surface-400">[0xFF, errorCode, originalOpcode]</span></div>
            </div>
          </Section>

          <Section title="BLE Characteristics (Service 1221)">
            <p className="text-[11px]">
              Only <span className="font-mono text-accent-500">1225</span> (all writes) and{' '}
              <span className="font-mono text-success-500">1227</span> (all reads/notifications) are active on current
              firmware; the 2-characteristic design discriminates by the first byte. All others are legacy/unused.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono mt-1">
              <div><span className="text-surface-400">1222</span> <span className="line-through opacity-50">Version</span> legacy</div>
              <div><span className="text-surface-400">1223</span> <span className="line-through opacity-50">CC/CR auth</span> legacy</div>
              <div><span className="text-surface-400">1224</span> <span className="line-through opacity-50">SR/SC auth</span> legacy</div>
              <div><span className="text-accent-500">1225</span> Vibe Write (Write)</div>
              <div><span className="text-surface-400">1226</span> <span className="line-through opacity-50">Write Last</span> legacy</div>
              <div><span className="text-success-500">1227</span> Vibe Read (Notify)</div>
              <div><span className="text-surface-400">1228</span> <span className="line-through opacity-50">Read Last</span> legacy</div>
              <div><span className="text-surface-400">1229</span> <span className="line-through opacity-50">Client Command</span> legacy</div>
              <div><span className="text-surface-400">1230</span> <span className="line-through opacity-50">Server State</span> legacy</div>
            </div>
          </Section>

          <Section title="Motor States (1227 Notifications)">
            <div className="space-y-0.5 text-[11px]">
              <div><span className="inline-block w-2 h-2 rounded-full bg-surface-400 mr-1.5 align-middle" />0 = Idle</div>
              <div><span className="inline-block w-2 h-2 rounded-full bg-success-500 mr-1.5 align-middle" />1 = Running (repeating)</div>
              <div><span className="inline-block w-2 h-2 rounded-full bg-accent-500 mr-1.5 align-middle" />2 = Running (non-repeating)</div>
              <div><span className="inline-block w-2 h-2 rounded-full bg-danger-500 mr-1.5 align-middle" />3 = Error</div>
            </div>
          </Section>

          <Section title="Pattern ID Ranges">
            <div className="space-y-1 text-[11px]">
              <div><span className="font-mono text-accent-500">0</span> — Play only (don't save to knob)</div>
              <div><span className="font-mono text-success-500">1–10</span> — Save to Strong Vibes Knob custom pattern slot</div>
              <div><span className="font-mono text-surface-400">11–99</span> — Reserved</div>
              <div><span className="font-mono text-cyan-500">100–199</span> — Multi-datagram chunks (client-side sequencing). Firmware applies 300ms motor hold after NonRepeatingPattern completion for seamless chunk transitions.</div>
              <div><span className="font-mono text-surface-400">200–255</span> — Reserved</div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
