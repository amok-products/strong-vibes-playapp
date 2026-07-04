// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Pencil, Eraser, Waves, Undo2, Trash2, Save } from 'lucide-react';
import { pointsToSegments, generateId, formatTimeSeconds } from './designerUtils';
import type { DrawPoint, DesignerPart } from './designerUtils';
import { MAX_LINEAR_SEGMENTS } from '../../protocol/vibe-datagram';
import MiniWaveform from '../assembler/MiniWaveform';
import HelpTooltip from '../assembler/HelpTooltip';

interface DrawCanvasProps {
  onSavePart: (part: DesignerPart) => void;
}

type Tool = 'pencil' | 'eraser';

const HELP_DRAW = `Draw your own intensity curve with your mouse.

Click on the canvas to place points. Points are connected with straight lines to create your pattern.

Use the pencil to add points, the eraser to remove them, and smooth to round sharp corners.`;

const CANVAS_HEIGHT = 200;

export default function DrawCanvas({ onSavePart }: DrawCanvasProps) {
  const [points, setPoints] = useState<DrawPoint[]>([
    { t: 0, intensity: 0 },
    { t: 1, intensity: 0 },
  ]);
  const [tool, setTool] = useState<Tool>('pencil');
  const [duration, setDuration] = useState(2000);
  // Single-level undo for the Smooth action: a snapshot of points captured just
  // before the last Smooth (null = nothing to undo). Any manual edit (draw/erase),
  // Clear, or a completed Undo invalidates it. Local to this component — there is
  // no global history system.
  const [preSmoothPoints, setPreSmoothPoints] = useState<DrawPoint[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(
    () => pointsToSegments(points, duration),
    [points, duration],
  );

  const totalDuration = useMemo(
    () => segments.reduce((sum, s) => sum + s.periodMs, 0),
    [segments],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const isDark = document.documentElement.classList.contains('dark');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = CANVAS_HEIGHT;
    const pad = { top: 16, right: 16, bottom: 24, left: 40 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? '#131210' : '#F0EDE6';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let pct = 0; pct <= 100; pct += 25) {
      const y = pad.top + plotH - (pct / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let pct = 0; pct <= 100; pct += 25) {
      ctx.fillText(`${pct}%`, pad.left - 6, pad.top + plotH - (pct / 100) * plotH);
    }

    // Sort points for drawing
    const sorted = [...points].sort((a, b) => a.t - b.t);

    // Fill under curve
    if (sorted.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pad.left + sorted[0].t * plotW, pad.top + plotH);
      for (const p of sorted) {
        ctx.lineTo(pad.left + p.t * plotW, pad.top + plotH - (p.intensity / 100) * plotH);
      }
      ctx.lineTo(pad.left + sorted[sorted.length - 1].t * plotW, pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(6,182,212,0.15)';
      ctx.fill();

      // Line
      ctx.beginPath();
      for (let i = 0; i < sorted.length; i++) {
        const x = pad.left + sorted[i].t * plotW;
        const y = pad.top + plotH - (sorted[i].intensity / 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Points
    for (const p of sorted) {
      const x = pad.left + p.t * plotW;
      const y = pad.top + plotH - (p.intensity / 100) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#1E1B17' : '#F5F1EB';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [points]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [draw]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pad = { top: 16, right: 16, bottom: 24, left: 40 };
    const plotW = rect.width - pad.left - pad.right;
    const plotH = CANVAS_HEIGHT - pad.top - pad.bottom;

    const x = e.clientX - rect.left - pad.left;
    const y = e.clientY - rect.top - pad.top;
    const t = Math.max(0, Math.min(1, x / plotW));
    const intensity = Math.max(0, Math.min(100, (1 - y / plotH) * 100));

    if (tool === 'pencil') {
      if (points.length >= MAX_LINEAR_SEGMENTS + 1) return;
      setPoints(prev => [...prev, { t, intensity: Math.round(intensity) }]);
      setPreSmoothPoints(null); // a real point edit supersedes the last Smooth
    } else {
      // Eraser: remove nearest point (except first and last)
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.t === 0 || p.t === 1) continue;
        const dx = (p.t - t) * plotW;
        const dy = ((p.intensity - intensity) / 100) * plotH;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist && dist < 20) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      if (nearestIdx >= 0) {
        setPoints(prev => prev.filter((_, i) => i !== nearestIdx));
        setPreSmoothPoints(null); // a real point edit supersedes the last Smooth
      }
    }
  }, [tool, points]);

  const handleSmooth = useCallback(() => {
    if (points.length <= 2) return; // nothing to smooth
    setPreSmoothPoints(points);     // snapshot for one-level undo
    setPoints(prev => {
      const sorted = [...prev].sort((a, b) => a.t - b.t);
      if (sorted.length <= 2) return prev;

      const result: DrawPoint[] = [sorted[0]];
      for (let i = 1; i < sorted.length - 1; i++) {
        const p = sorted[i];
        const before = sorted[i - 1];
        const after = sorted[i + 1];
        result.push({
          t: p.t,
          intensity: Math.round((before.intensity + p.intensity * 2 + after.intensity) / 4),
        });
      }
      result.push(sorted[sorted.length - 1]);
      return result;
    });
  }, [points]);

  const handleUndoSmooth = useCallback(() => {
    if (!preSmoothPoints) return;
    setPoints(preSmoothPoints);
    setPreSmoothPoints(null);
  }, [preSmoothPoints]);

  const handleClear = useCallback(() => {
    setPoints([
      { t: 0, intensity: 0 },
      { t: 1, intensity: 0 },
    ]);
    setPreSmoothPoints(null);
  }, []);

  const handleSave = useCallback(() => {
    const part: DesignerPart = {
      id: generateId('draw'),
      name: 'Drawn Pattern',
      segments,
      tags: [],
      source: 'draw',
      createdAt: new Date().toISOString(),
    };
    onSavePart(part);
  }, [segments, onSavePart]);

  const durationSliderToMs = (v: number) => {
    return Math.round(Math.exp(Math.log(200) + (v / 1000) * (Math.log(30000) - Math.log(200))));
  };
  const msToDurationSlider = (ms: number) => {
    return Math.round(((Math.log(ms) - Math.log(200)) / (Math.log(30000) - Math.log(200))) * 1000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">Draw Your Own</span>
        <HelpTooltip content={HELP_DRAW} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setTool('pencil')}
          className={`btn-sm px-2 py-1 rounded flex items-center gap-1 ${tool === 'pencil' ? 'bg-accent-500/20 text-accent-600 dark:text-accent-400' : 'btn-ghost'}`}>
          <Pencil className="w-3 h-3" /> Draw
        </button>
        <button onClick={() => setTool('eraser')}
          className={`btn-sm px-2 py-1 rounded flex items-center gap-1 ${tool === 'eraser' ? 'bg-accent-500/20 text-accent-600 dark:text-accent-400' : 'btn-ghost'}`}>
          <Eraser className="w-3 h-3" /> Erase
        </button>
        <button onClick={handleSmooth} className="btn-ghost btn-sm flex items-center gap-1">
          <Waves className="w-3 h-3" /> Smooth
        </button>
        <button onClick={handleUndoSmooth} disabled={!preSmoothPoints}
          className="btn-ghost btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo the last Smooth">
          <Undo2 className="w-3 h-3" /> Undo
        </button>
        <button onClick={handleClear} className="btn-ghost btn-sm flex items-center gap-1 text-danger-500">
          <Trash2 className="w-3 h-3" /> Clear
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-surface-400 font-mono">
          {points.length - 1} / {MAX_LINEAR_SEGMENTS} segments
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="w-full cursor-crosshair">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ height: CANVAS_HEIGHT }}
          className="w-full rounded-lg"
        />
      </div>

      {/* Duration slider */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-surface-400 w-16 text-right shrink-0">Duration:</span>
        <span className="text-xs font-mono text-surface-600 dark:text-surface-200 w-14 text-right shrink-0">
          {formatTimeSeconds(duration)}
        </span>
        <input
          type="range" min={0} max={1000} value={msToDurationSlider(duration)}
          onChange={e => setDuration(durationSliderToMs(parseInt(e.target.value, 10)))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-slider"
        />
      </div>

      <div className="flex items-center gap-3">
        <MiniWaveform timbre={0} linearSegments={segments} mic={100} width={120} height={40} />
        <div className="text-[10px] text-surface-400 font-mono">
          {segments.length} seg{segments.length !== 1 ? 's' : ''} &bull; {formatTimeSeconds(totalDuration)}
        </div>
        <div className="flex-1" />
        <button onClick={handleSave} disabled={segments.length === 0} className="btn-secondary flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" /> Save as Part
        </button>
      </div>
    </div>
  );
}
