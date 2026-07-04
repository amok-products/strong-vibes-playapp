// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useRef, useEffect } from 'react';
import type { LinearSegment, SineParams, GaussianParams } from '../../protocol/vibe-datagram';
import { sampleRawIntensity, getTotalCycleMs } from '../../ble/waveformUtils';

interface MiniWaveformProps {
  timbre: number;
  linearSegments?: LinearSegment[];
  sineParams?: SineParams;
  gaussianSegments?: GaussianParams[];
  mic: number;
  width?: number;
  height?: number;
}

const DEFAULT_LINEAR: LinearSegment = { intensityBegin: 0, intensityEnd: 100, periodMs: 1000 };
const DEFAULT_SINE: SineParams = { amplitude: 50, center: 50, periodMs: 2000 };
const DEFAULT_GAUSSIAN: GaussianParams = { startPoint: 0, endPoint: 100, durationMs: 1000, steep: 10 };

export default function MiniWaveform({
  timbre,
  linearSegments = [DEFAULT_LINEAR],
  sineParams = DEFAULT_SINE,
  gaussianSegments = [DEFAULT_GAUSSIAN],
  mic,
  width = 80,
  height = 32,
}: MiniWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#131210' : '#F0EDE6';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 4);
    ctx.fill();

    const cycleMs = getTotalCycleMs(timbre, linearSegments, sineParams, gaussianSegments);
    const micPct = Math.min(mic, 100);
    const pad = 3;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const numSamples = Math.max(40, plotW);

    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    for (let i = 0; i <= numSamples; i++) {
      const ms = (i / numSamples) * cycleMs;
      const raw = sampleRawIntensity(ms, cycleMs, timbre, linearSegments, sineParams, gaussianSegments);
      const eff = raw * (micPct / 100);
      const x = pad + (i / numSamples) * plotW;
      const y = height - pad - (Math.max(0, Math.min(100, eff)) / 100) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width - pad, height - pad);
    ctx.closePath();
    ctx.fillStyle = isDark ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.18)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= numSamples; i++) {
      const ms = (i / numSamples) * cycleMs;
      const raw = sampleRawIntensity(ms, cycleMs, timbre, linearSegments, sineParams, gaussianSegments);
      const eff = raw * (micPct / 100);
      const x = pad + (i / numSamples) * plotW;
      const y = height - pad - (Math.max(0, Math.min(100, eff)) / 100) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const micY = height - pad - (micPct / 100) * plotH;
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#C49A3A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, micY);
    ctx.lineTo(width - pad, micY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [timbre, linearSegments, sineParams, gaussianSegments, mic, width, height]);

  return <canvas ref={canvasRef} className="rounded shrink-0" style={{ width, height }} />;
}
