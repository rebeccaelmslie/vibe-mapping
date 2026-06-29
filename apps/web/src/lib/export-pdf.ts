// Compose the current map into a print-ready PDF: the live MapLibre canvas as
// the base image, with the layout furniture (title, legend, scale bar, north
// arrow, attribution) drawn as crisp vector elements over it. Client-side, so
// it reflects exactly what's on screen — the WYSIWYG promise.

import { jsPDF } from 'jspdf';
import {
  deriveLegend,
  type LegendSection,
  type LegendEntry,
  type LegendPosition,
  type MapSpec,
} from '@vibe/shared';
import { creditsFor } from '@vibe/map-renderer';
import type maplibregl from 'maplibre-gl';
import { pageDimsMm, pageLayout, type ExportOptions } from './page-layout';

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Round a metric distance to a 1/2/5 × 10ⁿ value for a tidy scale bar. */
function niceDistance(meters: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(meters)));
  const n = meters / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return nice * pow;
}

export async function exportMapPdf(
  map: maplibregl.Map,
  spec: MapSpec,
  opts: ExportOptions,
): Promise<void> {
  // Force a fresh frame so the WebGL buffer is current, then read the canvas.
  map.triggerRepaint();
  await new Promise<void>((resolve) => map.once('render', () => resolve()));
  const canvas = map.getCanvas();
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;

  const layout = spec.layout;
  const { w: pageW, h: pageH } = pageDimsMm(opts.pageSize, opts.orientation);
  const pdf = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: opts.pageSize });
  const rects = pageLayout(pageW, pageH, {
    hasTitle: !!layout.title,
    hasSubtitle: !!layout.subtitle,
  });

  // --- Title / subtitle band ------------------------------------------------
  if (rects.title && layout.title) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(20);
    const ty = layout.subtitle ? rects.title.y + 5 : rects.title.y + rects.title.h - 2;
    pdf.text(layout.title, pageW / 2, ty, { align: 'center' });
    if (layout.subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(110);
      pdf.text(layout.subtitle, pageW / 2, ty + 5, { align: 'center' });
    }
  }

  // --- Map image fills the map area (same aspect as the on-screen sheet) -----
  const m = rects.map;
  pdf.addImage(imgData, 'JPEG', m.x, m.y, m.w, m.h);
  pdf.setDrawColor(60);
  pdf.setLineWidth(0.3);
  pdf.rect(m.x, m.y, m.w, m.h);

  // --- Overlays -------------------------------------------------------------
  if (layout.northArrow.visible) {
    // Keep the arrow out of the legend's corner.
    const topLeftTaken = layout.legend.visible && layout.legend.position === 'top-left';
    const nx = topLeftTaken ? m.x + m.w - 9 : m.x + 8;
    drawNorthArrow(pdf, nx, m.y + 9, map.getBearing());
  }
  if (layout.scaleBar.visible) {
    drawScaleBar(pdf, m.x + 5, m.y + m.h - 5, map.getZoom(), map.getCenter().lat, cssW, m.w);
  }
  if (layout.legend.visible) {
    drawLegend(pdf, deriveLegend(spec), layout.legend.position, m.x, m.y, m.w, m.h);
  }

  // --- Attribution footer ---------------------------------------------------
  const credits = creditsFor(spec.basemap, true);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(120);
  pdf.text(`${credits.basemap} · ${credits.labels}`, pageW / 2, rects.footer.y + 4, {
    align: 'center',
  });

  const base = (layout.title || spec.name || 'map').replace(/[^\w-]+/g, '_').slice(0, 40) || 'map';
  pdf.save(`${base}.pdf`);
}

function drawNorthArrow(pdf: jsPDF, cx: number, cy: number, bearing: number): void {
  const r = 5;
  pdf.setFillColor(255, 255, 255);
  pdf.circle(cx, cy, r, 'F');
  pdf.setDrawColor(30);
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r, 'S');
  // North points up; rotate the arrow by the map's bearing.
  const a = (-bearing * Math.PI) / 180;
  const rot = (x: number, y: number) => ({
    x: cx + (x * Math.cos(a) - y * Math.sin(a)),
    y: cy + (x * Math.sin(a) + y * Math.cos(a)),
  });
  const tip = rot(0, -3.6);
  const l = rot(-2, 1.8);
  const rr = rot(2, 1.8);
  pdf.setFillColor(20, 20, 20);
  pdf.triangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y, 'F');
  pdf.setFontSize(6);
  pdf.setTextColor(20);
  pdf.text('N', cx, cy + r + 2.6, { align: 'center' });
}

function drawScaleBar(
  pdf: jsPDF,
  x: number,
  yBottom: number,
  zoom: number,
  lat: number,
  cssW: number,
  imgW: number,
): void {
  // Metres per CSS pixel at this latitude/zoom (512px tiles → 2^(zoom+9)).
  const mpp = (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / Math.pow(2, zoom + 9);
  const mmPerPx = imgW / cssW;
  const targetMm = 35;
  const dist = niceDistance((targetMm / mmPerPx) * mpp);
  const barMm = (dist / mpp) * mmPerPx;
  const label = dist >= 1000 ? `${dist / 1000} km` : `${dist} m`;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(x - 1.5, yBottom - 8, barMm + 3, 9, 'F');
  pdf.setDrawColor(20);
  pdf.setLineWidth(0.5);
  pdf.line(x, yBottom - 2, x + barMm, yBottom - 2);
  pdf.line(x, yBottom - 3.6, x, yBottom - 0.4);
  pdf.line(x + barMm, yBottom - 3.6, x + barMm, yBottom - 0.4);
  pdf.setFontSize(7);
  pdf.setTextColor(20);
  pdf.text(label, x, yBottom - 4, { baseline: 'bottom' });
}

function drawLegend(
  pdf: jsPDF,
  sections: LegendSection[],
  position: LegendPosition,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
): void {
  if (sections.length === 0) return;
  const pad = 3;
  const rowH = 4.6;
  const sectionGap = 1.5;
  const boxW = 46;
  const swX = pad + 1;
  const labelX = swX + 8;

  let contentH = 0;
  for (const s of sections) contentH += rowH + s.entries.length * rowH + sectionGap;
  contentH -= sectionGap;
  const boxH = contentH + pad * 2;

  const inset = 3;
  const x =
    position === 'top-left' || position === 'bottom-left'
      ? imgX + inset
      : imgX + imgW - inset - boxW;
  const y =
    position === 'top-left' || position === 'top-right'
      ? imgY + inset
      : imgY + imgH - inset - boxH;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(80);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, boxW, boxH, 'FD');

  let cy = y + pad + rowH / 2;
  for (const s of sections) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(20);
    pdf.text(truncate(pdf, s.title, boxW - pad * 2), x + pad, cy + 1.2);
    cy += rowH;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(60);
    for (const e of s.entries) {
      drawSwatch(pdf, e, x + swX, cy);
      pdf.text(truncate(pdf, e.label, boxW - labelX - pad), x + labelX, cy + 1.1);
      cy += rowH;
    }
    cy += sectionGap;
  }
}

function drawSwatch(pdf: jsPDF, entry: LegendEntry, x: number, cy: number): void {
  const sw = entry.swatch;
  if (sw.kind === 'point') {
    const [r, g, b] = hexToRgb(sw.color);
    const [sr, sg, sb] = hexToRgb(sw.strokeColor);
    pdf.setFillColor(r, g, b);
    pdf.setDrawColor(sr, sg, sb);
    pdf.setLineWidth(0.3);
    pdf.circle(x + 2, cy, 1.6, 'FD');
  } else if (sw.kind === 'line') {
    const [r, g, b] = hexToRgb(sw.color);
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(Math.max(0.4, Math.min(1.2, sw.width / 4)));
    if (sw.dash === 'solid') pdf.setLineDashPattern([], 0);
    else pdf.setLineDashPattern(sw.dash === 'dotted' ? [0.4, 0.8] : [1.2, 0.8], 0);
    pdf.line(x, cy, x + 6, cy);
    pdf.setLineDashPattern([], 0);
  } else if (sw.kind === 'polygon') {
    const [r, g, b] = hexToRgb(sw.fillColor);
    const [or, og, ob] = hexToRgb(sw.outlineColor);
    pdf.setFillColor(r, g, b);
    pdf.setDrawColor(or, og, ob);
    pdf.setLineWidth(0.3);
    pdf.rect(x, cy - 1.6, 6, 3.2, 'FD');
  } else {
    // gradient — draw a few segments low→high
    const stops = sw.stops.length ? sw.stops : ['#cccccc'];
    const segW = 6 / stops.length;
    stops.forEach((c, i) => {
      const [r, g, b] = hexToRgb(c);
      pdf.setFillColor(r, g, b);
      pdf.rect(x + i * segW, cy - 1.6, segW + 0.05, 3.2, 'F');
    });
  }
}

function truncate(pdf: jsPDF, text: string, maxW: number): string {
  if (pdf.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && pdf.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}
