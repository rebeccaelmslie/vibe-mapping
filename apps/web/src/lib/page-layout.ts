// Single source of truth for the print page geometry, shared by the on-screen
// paper-sheet preview (ExportView) and the PDF composer (export-pdf). Both work
// in millimetres so the preview is a true WYSIWYG of the exported page.

export type PageSize = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

/** Portrait [width, height] in mm. */
const PAGE_MM: Record<PageSize, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
};

export const PAGE_SIZE_LABEL: Record<PageSize, string> = { a4: 'A4', letter: 'Letter' };

export interface ExportOptions {
  pageSize: PageSize;
  orientation: Orientation;
}

/** CSS pixels per millimetre at 96dpi — for rendering the sheet on screen. */
export const MM_TO_PX = 96 / 25.4;

export function pageDimsMm(size: PageSize, orientation: Orientation): { w: number; h: number } {
  const [shortSide, longSide] = PAGE_MM[size];
  return orientation === 'portrait'
    ? { w: shortSide, h: longSide }
    : { w: longSide, h: shortSide };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageRects {
  margin: number;
  /** Title band, or null when there's no title. */
  title: Rect | null;
  /** The map image area. */
  map: Rect;
  /** Attribution footer strip. */
  footer: Rect;
}

/**
 * Lay a page out into title band / map area / footer, all in mm. The map area
 * gets whatever's left between the title and footer inside the margins — its
 * aspect ratio is what the preview's map element and the PDF image both use.
 */
export function pageLayout(
  w: number,
  h: number,
  opts: { hasTitle: boolean; hasSubtitle: boolean },
): PageRects {
  const margin = 10;
  const footerH = 6;
  let top = margin;
  let title: Rect | null = null;
  if (opts.hasTitle) {
    const titleH = opts.hasSubtitle ? 14 : 9;
    title = { x: margin, y: margin, w: w - margin * 2, h: titleH };
    top = margin + titleH + 2;
  }
  const map = { x: margin, y: top, w: w - margin * 2, h: h - top - margin - footerH };
  const footer = { x: margin, y: h - margin - footerH, w: w - margin * 2, h: footerH };
  return { margin, title, map, footer };
}
