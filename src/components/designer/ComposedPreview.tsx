// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useRef, useEffect, useCallback } from 'react';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import { MAX_LINEAR_SEGMENTS } from '../../protocol/vibe-datagram';
import { formatTimeSeconds } from '../../ble/waveformUtils';

interface ComposedPreviewProps {
  segments: LinearSegment[];
  mic: number;
  isPlaying?: boolean;
  playbackStartTime?: number | null;
  loop?: boolean;
}

const PADDING = { top: 28, right: 16, bottom: 32, left: 44 };

const DARK = {
  bg: '#131210',
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.25)',
  label: 'rgba(255,255,255,0.5)',
};

const LIGHT = {
  bg: '#F0EDE6',
  grid: 'rgba(0,0,0,0.06)',
  axis: 'rgba(0,0,0,0.2)',
  label: 'rgba(0,0,0,0.45)',
};

const FILL_COLOR = 'rgba(6,182,212,0.15)';
const STROKE_COLOR = '#22d3ee';
const MIC_COLOR = '#C49A3A';
const PLAYHEAD_COLOR = '#f59e0b';

export default function ComposedPreview({ segments, mic, isPlaying, playbackStartTime, loop }: ComposedPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const totalMs = segments.reduce((sum, s) => sum + s.periodMs, 0);

  const draw = useCallback((playheadMs?: number) => {
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

    if (segments.length === 0 || totalMs === 0) {
      ctx.fillStyle = palette.label;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add parts to see the combined waveform', w / 2, h / 2);
      return;
    }

    const toX = (ms: number) => PADDING.left + (ms / totalMs) * plotW;
    const toY = (pct: number) => PADDING.top + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

    // Grid
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let pct = 0; pct <= 100; pct += 25) {
      const y = toY(pct);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = palette.axis;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotH);
    ctx.lineTo(PADDING.left + plotW, PADDING.top + plotH);
    ctx.stroke();

    // Y labels
    ctx.fillStyle = palette.label;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let pct = 0; pct <= 100; pct += 25) {
      ctx.fillText(`${pct}%`, PADDING.left - 6, toY(pct));
    }

    // X labels
    const timeStepMs = totalMs <= 500 ? 100 : totalMs <= 2000 ? 200 : totalMs <= 5000 ? 500 : totalMs <= 20000 ? 2000 : 5000;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let ms = 0; ms <= totalMs; ms += timeStepMs) {
      ctx.fillText(formatTimeSeconds(ms), toX(ms), PADDING.top + plotH + 6);
    }

    // MIC line
    const micPct = Math.min(mic, 100);
    const micY = toY(micPct);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = MIC_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, micY);
    ctx.lineTo(PADDING.left + plotW, micY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Build waveform points
    const points: [number, number][] = [];
    let elapsed = 0;
    for (const seg of segments) {
      const numSamples = Math.max(2, Math.ceil(seg.periodMs / 10));
      for (let i = 0; i <= numSamples; i++) {
        const frac = i / numSamples;
        const ms = elapsed + frac * seg.periodMs;
        const intensity = seg.intensityBegin + (seg.intensityEnd - seg.intensityBegin) * frac;
        const eff = intensity * (micPct / 100);
        points.push([toX(ms), toY(eff)]);
      }
      elapsed += seg.periodMs;
    }

    // Fill
    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], toY(0));
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.lineTo(points[points.length - 1][0], toY(0));
      ctx.closePath();
      ctx.fillStyle = FILL_COLOR;
      ctx.fill();

      // Stroke
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Datagram boundary markers (every MAX_LINEAR_SEGMENTS segments)
    if (segments.length > MAX_LINEAR_SEGMENTS) {
      const chunkColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)';
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = chunkColor;
      ctx.lineWidth = 1;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = chunkColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      let bMs = 0;
      let chunkNum = 1;
      for (let i = 0; i < segments.length; i++) {
        bMs += segments[i].periodMs;
        if ((i + 1) % MAX_LINEAR_SEGMENTS === 0 && i + 1 < segments.length) {
          const bx = toX(bMs);
          ctx.beginPath();
          ctx.moveTo(bx, PADDING.top);
          ctx.lineTo(bx, PADDING.top + plotH);
          ctx.stroke();
          ctx.fillText(`${chunkNum}|${chunkNum + 1}`, bx, PADDING.top - 1);
          chunkNum++;
        }
      }
      ctx.setLineDash([]);
    }

    // Playhead
    if (playheadMs !== undefined && playheadMs >= 0 && totalMs > 0) {
      const px = toX(Math.min(playheadMs, totalMs));
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, PADDING.top);
      ctx.lineTo(px, PADDING.top + plotH);
      ctx.stroke();

      // Playhead triangle at top
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.beginPath();
      ctx.moveTo(px - 4, PADDING.top - 2);
      ctx.lineTo(px + 4, PADDING.top - 2);
      ctx.lineTo(px, PADDING.top + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Title
    ctx.fillStyle = STROKE_COLOR;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${segments.length} segment(s), ${formatTimeSeconds(totalMs)} total`,
      PADDING.left + plotW / 2,
      PADDING.top - 14,
    );
  }, [segments, mic, totalMs]);

  // Animation loop for playhead
  useEffect(() => {
    if (!isPlaying || !playbackStartTime || totalMs === 0) {
      draw();
      return;
    }

    const animate = () => {
      let elapsed = Date.now() - playbackStartTime;
      if (loop) {
        elapsed = elapsed % totalMs;
      } else if (elapsed > totalMs) {
        draw(totalMs);
        return;
      }
      draw(elapsed);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playbackStartTime, loop, totalMs, draw]);

  // Redraw on resize/theme change (when not playing)
  useEffect(() => {
    if (isPlaying) return;
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [draw, isPlaying]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: 220 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
