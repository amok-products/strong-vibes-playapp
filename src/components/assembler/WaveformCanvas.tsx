// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useRef, useEffect, useCallback } from 'react';
import type { LinearSegment, SineParams, GaussianParams } from '../../protocol/vibe-datagram';
import { TIMBRE_LINEAR, TIMBRE_GAUSSIAN, TIMBRE_LABELS } from '../../protocol/vibe-datagram';
import { sampleRawIntensity, getTotalCycleMs, formatTimeSeconds } from '../../ble/waveformUtils';

interface WaveformCanvasProps {
  timbre: number;
  linearSegments: LinearSegment[];
  sineParams: SineParams;
  gaussianSegments: GaussianParams[];
  mic: number;
  isRepeating: boolean;
}

const PADDING = { top: 44, right: 60, bottom: 40, left: 50 };

const DARK = {
  bg: '#131210',
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.25)',
  label: 'rgba(255,255,255,0.5)',
  repeat: 'rgba(255,255,255,0.3)',
};

const LIGHT = {
  bg: '#F0EDE6',
  grid: 'rgba(0,0,0,0.06)',
  axis: 'rgba(0,0,0,0.2)',
  label: 'rgba(0,0,0,0.45)',
  repeat: 'rgba(0,0,0,0.25)',
};

const RAW_COLOR = '#06b6d4';
const EFF_COLOR = '#22d3ee';
const EFF_FILL = 'rgba(6,182,212,0.15)';
const MIC_COLOR = '#C49A3A';

export default function WaveformCanvas({ timbre, linearSegments, sineParams, gaussianSegments, mic, isRepeating }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const segmentCount = timbre === TIMBRE_LINEAR ? linearSegments.length
    : timbre === TIMBRE_GAUSSIAN ? gaussianSegments.length : 1;

  const cycleMs = getTotalCycleMs(timbre, linearSegments, sineParams, gaussianSegments);
  const displayMs = isRepeating ? cycleMs * 2 : cycleMs;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const isDark = document.documentElement.classList.contains('dark');
    const palette = isDark ? DARK : LIGHT;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = palette.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    const toX = (ms: number) => PADDING.left + (ms / displayMs) * plotW;
    const toY = (pct: number) => PADDING.top + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let pct = 0; pct <= 100; pct += 25) {
      const y = toY(pct);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();
    }

    const timeStepMs = cycleMs <= 500 ? 100 : cycleMs <= 2000 ? 200 : cycleMs <= 5000 ? 500 : cycleMs <= 20000 ? 2000 : 5000;
    for (let ms = 0; ms <= displayMs; ms += timeStepMs) {
      const x = toX(ms);
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotH);
    ctx.lineTo(PADDING.left + plotW, PADDING.top + plotH);
    ctx.stroke();

    ctx.fillStyle = palette.label;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let pct = 0; pct <= 100; pct += 25) {
      ctx.fillText(`${pct}%`, PADDING.left - 6, toY(pct));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let ms = 0; ms <= displayMs; ms += timeStepMs) {
      ctx.fillText(formatTimeSeconds(ms), toX(ms), PADDING.top + plotH + 6);
    }

    ctx.textAlign = 'center';
    ctx.fillText('time', PADDING.left + plotW / 2, PADDING.top + plotH + 22);

    const micPct = mic > 100 ? 100 : mic;
    const micY = toY(micPct);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = MIC_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, micY);
    ctx.lineTo(PADDING.left + plotW, micY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isRepeating) {
      const repeatX = toX(cycleMs);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = palette.repeat;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(repeatX, PADDING.top);
      ctx.lineTo(repeatX, PADDING.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = palette.repeat;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('repeat', repeatX, PADDING.top - 4);
    }

    const numSamples = Math.max(200, Math.ceil(plotW));
    const rawPoints: [number, number][] = [];
    const effPoints: [number, number][] = [];

    for (let i = 0; i <= numSamples; i++) {
      const ms = (i / numSamples) * displayMs;
      const raw = sampleRawIntensity(ms, cycleMs, timbre, linearSegments, sineParams, gaussianSegments);
      const eff = raw * (micPct / 100);
      rawPoints.push([toX(ms), toY(raw)]);
      effPoints.push([toX(ms), toY(eff)]);
    }

    ctx.beginPath();
    ctx.moveTo(effPoints[0][0], toY(0));
    for (const [x, y] of effPoints) ctx.lineTo(x, y);
    ctx.lineTo(effPoints[effPoints.length - 1][0], toY(0));
    ctx.closePath();
    ctx.fillStyle = EFF_FILL;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < effPoints.length; i++) {
      const [x, y] = effPoints[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = EFF_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < rawPoints.length; i++) {
      const [x, y] = rawPoints[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = RAW_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    const legendX = w - PADDING.right + 10;
    const legendY = PADDING.top + 20;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    ctx.strokeStyle = RAW_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(legendX, legendY);
    ctx.lineTo(legendX + 20, legendY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = RAW_COLOR;
    ctx.fillText('raw', legendX + 24, legendY + 3);

    ctx.strokeStyle = EFF_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 16);
    ctx.lineTo(legendX + 20, legendY + 16);
    ctx.stroke();
    ctx.fillStyle = EFF_COLOR;
    ctx.fillText('eff.', legendX + 24, legendY + 19);

    ctx.strokeStyle = MIC_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 32);
    ctx.lineTo(legendX + 20, legendY + 32);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MIC_COLOR;
    ctx.fillText('MIC', legendX + 24, legendY + 35);

    const timbreLabel = TIMBRE_LABELS[timbre] ?? 'Unknown';
    const repeatLabel = isRepeating ? 'Repeating' : 'Non-repeating';
    ctx.fillStyle = EFF_COLOR;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${timbreLabel} ${repeatLabel} \u2014 ${segmentCount} segment(s), ${formatTimeSeconds(cycleMs)} cycle`,
      PADDING.left + plotW / 2,
      PADDING.top - 20,
    );
  }, [timbre, linearSegments, sineParams, gaussianSegments, mic, isRepeating, cycleMs, displayMs, segmentCount]);

  useEffect(() => {
    draw();

    // ResizeObserver fires when container goes from hidden (0x0) to visible,
    // fixing blank canvas when tab starts with display:none
    const ro = new ResizeObserver(() => draw());
    if (containerRef.current) ro.observe(containerRef.current);

    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: 280 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
