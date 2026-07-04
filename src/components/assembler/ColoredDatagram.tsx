// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import {
  MODULE_MOTOR, MSG_MOTOR_REPEATING, MSG_MOTOR_NON_REPEATING,
  MSG_MOTOR_MIC, MIC_LOCK_100, MIC_UNCHANGED,
} from '../../protocol/vibe-datagram';

export const DGRM_COLOR_HEADER = 'text-surface-500 dark:text-surface-500';
export const DGRM_COLOR_MODULE = 'text-cyan-700 dark:text-cyan-400';
export const DGRM_COLOR_TIMBRE = 'text-blue-600 dark:text-blue-400';
export const DGRM_COLOR_PATTERN_ID = 'text-emerald-600 dark:text-emerald-400';
export const DGRM_COLOR_MIC = 'text-amber-600 dark:text-accent-400';
export const DGRM_COLOR_SEG_A = 'text-sky-700 dark:text-sky-300';
export const DGRM_COLOR_SEG_B = 'text-teal-700 dark:text-teal-300';

function byteHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

function micLabel(b: number): string | null {
  if (b === MIC_LOCK_100) return 'LOCK';
  if (b === MIC_UNCHANGED) return 'UNCH';
  return null;
}

interface ColoredDatagramProps {
  data: Uint8Array;
}

export default function ColoredDatagram({ data }: ColoredDatagramProps) {
  if (data.length < 2) {
    return <span className="text-surface-500 font-mono text-xs">{Array.from(data).map(byteHex).join(' ')}</span>;
  }

  const spans: { hex: string; color: string; label?: string }[] = [];

  spans.push({ hex: byteHex(data[0]), color: DGRM_COLOR_HEADER, label: 'VER' });
  spans.push({ hex: byteHex(data[1]), color: DGRM_COLOR_HEADER, label: 'SIZE' });

  if (data.length <= 2) return <SpanRow spans={spans} />;

  spans.push({ hex: byteHex(data[2]), color: DGRM_COLOR_MODULE, label: 'MOD' });
  if (data.length > 3) {
    spans.push({ hex: byteHex(data[3]), color: DGRM_COLOR_MODULE, label: 'MSG' });
  }

  const isMotorPattern = data.length > 4 && data[2] === MODULE_MOTOR &&
    (data[3] === MSG_MOTOR_REPEATING || data[3] === MSG_MOTOR_NON_REPEATING);

  const isMotorMic = data.length > 4 && data[2] === MODULE_MOTOR && data[3] === MSG_MOTOR_MIC;

  if (isMotorPattern && data.length > 6) {
    spans.push({ hex: byteHex(data[4]), color: DGRM_COLOR_TIMBRE, label: 'TIM' });
    spans.push({ hex: byteHex(data[5]), color: DGRM_COLOR_PATTERN_ID, label: 'PID' });
    const ml = micLabel(data[6]);
    spans.push({ hex: byteHex(data[6]), color: DGRM_COLOR_MIC, label: ml ? `MIC:${ml}` : 'MIC' });

    const timbre = data[4];
    const segSize = timbre === 0x02 ? 5 : 4;
    let segIdx = 0;
    for (let i = 7; i < data.length; i++) {
      const offset = i - 7;
      if (offset % segSize === 0) segIdx++;
      const color = (segIdx - 1) % 2 === 0 ? DGRM_COLOR_SEG_A : DGRM_COLOR_SEG_B;
      spans.push({
        hex: byteHex(data[i]),
        color,
        label: offset % segSize === 0 ? `S${segIdx}` : undefined,
      });
    }
  } else if (isMotorMic && data.length > 4) {
    const ml = micLabel(data[4]);
    spans.push({ hex: byteHex(data[4]), color: DGRM_COLOR_MIC, label: ml ? `MIC:${ml}` : 'MIC' });
    for (let i = 5; i < data.length; i++) {
      spans.push({ hex: byteHex(data[i]), color: 'text-surface-400' });
    }
  } else {
    for (let i = 4; i < data.length; i++) {
      spans.push({ hex: byteHex(data[i]), color: 'text-surface-500' });
    }
  }

  return <SpanRow spans={spans} showLegend />;
}

function SpanRow({ spans, showLegend }: {
  spans: { hex: string; color: string; label?: string }[];
  showLegend?: boolean;
}) {
  return (
    <div className="font-mono text-xs leading-relaxed">
      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
        {spans.map((s, i) => (
          <span key={i} className={`${s.color} relative group cursor-default`}>
            {s.hex}
            {s.label && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] opacity-0 group-hover:opacity-100
                             transition-opacity whitespace-nowrap pointer-events-none text-surface-400">
                {s.label}
              </span>
            )}
          </span>
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 mt-1.5 text-[9px]">
          <span className={DGRM_COLOR_HEADER}>VER/SIZE</span>
          <span className={DGRM_COLOR_MODULE}>module/msg</span>
          <span className={DGRM_COLOR_TIMBRE}>timbre</span>
          <span className={DGRM_COLOR_PATTERN_ID}>patternId</span>
          <span className={DGRM_COLOR_MIC}>MIC</span>
          <span className={DGRM_COLOR_SEG_A}>segments</span>
        </div>
      )}
    </div>
  );
}
