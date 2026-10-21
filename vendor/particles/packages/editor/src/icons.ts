/**
 * Inline SVG icons used in the inspector. Each function returns a fresh element
 * so callers can mutate freely (size, color via currentColor).
 */

const svg = (path: string, viewBox = '0 0 16 16'): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('fill', 'currentColor');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  el.appendChild(p);
  return el;
};

// Transport
export const iconPlay = (): SVGSVGElement =>
  svg('M4 3l9 5-9 5V3z');
export const iconPause = (): SVGSVGElement =>
  svg('M4 3h3v10H4zM9 3h3v10H9z');
export const iconStop = (): SVGSVGElement =>
  svg('M3 3h10v10H3z');
export const iconRestart = (): SVGSVGElement =>
  svg('M8 2a6 6 0 015.3 3.2l1-1V8h-3.8l1.4-1.4A4.3 4.3 0 108 12.3V14A6 6 0 118 2z');
export const iconStepForward = (): SVGSVGElement =>
  svg('M3 3v10l8-5zM12 3h2v10h-2z');

// Generic
export const iconPlus = (): SVGSVGElement =>
  svg('M7 2h2v5h5v2H9v5H7V9H2V7h5z');
export const iconMore = (): SVGSVGElement =>
  svg('M8 3.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 4a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 4a1.5 1.5 0 110 3 1.5 1.5 0 010-3z');
export const iconCheck = (): SVGSVGElement =>
  svg('M13.5 4.5L6 12 2.5 8.5l1-1L6 10l6.5-6.5z');
export const iconChev = (): SVGSVGElement =>
  svg('M5 3l5 5-5 5z');
export const iconEye = (): SVGSVGElement =>
  svg('M8 3C4.5 3 2.1 6.1 1.4 8c.7 1.9 3.1 5 6.6 5s5.9-3.1 6.6-5C13.9 6.1 11.5 3 8 3zm0 8a3 3 0 110-6 3 3 0 010 6zm0-1.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z');
export const iconEyeOff = (): SVGSVGElement =>
  svg('M2.2 1.5L14.5 13.8l-1.1 1.1-2.2-2.2c-.9.4-2 .7-3.2.7-3.5 0-5.9-3.1-6.6-5 .3-.8 1-1.8 1.9-2.7L1.1 2.6l1.1-1.1zm3.2 5.2A3 3 0 009.3 10.6L8.1 9.4H8a1.5 1.5 0 01-1.5-1.5v-.1L5.4 6.7zM8 3c3.5 0 5.9 3.1 6.6 5-.2.6-.7 1.3-1.3 2L11.2 8A3 3 0 008 4.9c-.4 0-.7.1-1 .2L5.7 3.8C6.4 3.3 7.1 3 8 3z');
export const iconLock = (): SVGSVGElement =>
  svg('M4 7V5a4 4 0 018 0v2h1v7H3V7h1zm2 0h4V5a2 2 0 00-4 0v2z');
export const iconUnlock = (): SVGSVGElement =>
  svg('M6 7h7v7H3V7h1V5a4 4 0 017.6-1.7l-1.8.9A2 2 0 006 5v2z');
export const iconTrash = (): SVGSVGElement =>
  svg('M5 2h6l.5 1H14v2H2V3h2.5L5 2zm-1 4h8l-.6 8H4.6L4 6z');
export const iconGrid = (): SVGSVGElement =>
  svg('M2 2h12v12H2V2zm1.5 1.5v3h3v-3h-3zm4.5 0v3h3v-3H8zm4.5 0v3h1v-3h-1zm-9 4.5v3h3V8h-3zm4.5 0v3h3V8H8zm4.5 0v3h1V8h-1zm-9 4.5v1h3v-1h-3zm4.5 0v1h3v-1H8zm4.5 0v1h1v-1h-1z');
export const iconGizmo = (): SVGSVGElement =>
  svg('M7 2h2v8.2l2.2-2.2 1.4 1.4L8 14 3.4 9.4 4.8 8 7 10.2V2z');
export const iconAxes = (): SVGSVGElement =>
  svg('M8 8V2h2l-3-2-3 2h2v6H0v2l2-3 2 3V8h2v6h2l-3 2-3-2h2V8h4zm2 0h6v2l-2-3-2 3V8h-2z', '0 0 16 16');
export const iconHelpers = (): SVGSVGElement =>
  svg('M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7L8 1.5zm0 1.8L4 5.6v4.8l4 2.3 4-2.3V5.6L8 3.3zm0 2.2l2 1.1v2.8l-2 1.1-2-1.1V6.6l2-1.1z');

// Module icons
export const iconMain = (): SVGSVGElement =>
  svg('M8 1.5a1 1 0 011 1v.7l1.5.6.5-.5a1 1 0 011.4 1.4l-.5.5.6 1.5h.7a1 1 0 010 2h-.7l-.6 1.5.5.5a1 1 0 01-1.4 1.4l-.5-.5-1.5.6v.7a1 1 0 01-2 0v-.7l-1.5-.6-.5.5A1 1 0 013.1 11l.5-.5L3 9H2.3a1 1 0 010-2H3l.6-1.5-.5-.5A1 1 0 014.5 3.6l.5.5L6.5 3.5v-.7a1 1 0 011-1zM8 6a2 2 0 100 4 2 2 0 000-4z');
export const iconEmission = (): SVGSVGElement =>
  svg('M8 1l1.6 4.4L14 7l-4.4 1.6L8 13 6.4 8.6 2 7l4.4-1.6z');
export const iconShape = (): SVGSVGElement =>
  svg('M8 1l6 3.5v7L8 15 2 11.5v-7z');
export const iconVelocity = (): SVGSVGElement =>
  svg('M2 8h9.5l-3-3 1.4-1.4L14.8 8l-4.9 4.4L8.5 11l3-3H2z');
export const iconColor = (): SVGSVGElement =>
  svg('M8 1.5a6.5 6.5 0 100 13 1.5 1.5 0 001.5-1.5c0-.4-.2-.8-.4-1.1-.2-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5h1.8a3 3 0 003-3A6.5 6.5 0 008 1.5zM4 8a1 1 0 110-2 1 1 0 010 2zm2-3a1 1 0 110-2 1 1 0 010 2zm4 0a1 1 0 110-2 1 1 0 010 2zm2 3a1 1 0 110-2 1 1 0 010 2z');
export const iconSize = (): SVGSVGElement =>
  svg('M3 3h6v2H5v4H3V3zm10 10h-6v-2h4V7h2v6z');
export const iconRenderer = (): SVGSVGElement =>
  // Stylized "monitor / preview" — a frame with a soft dot inside
  svg('M2 3h12v9H2V3zm1 1v7h10V4H3zm5 1.5a2 2 0 100 4 2 2 0 000-4zM5 14h6v1H5z');
export const iconSprite = (): SVGSVGElement =>
  // Grid of 2x2 to suggest tiles
  svg('M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z');

export const MODULE_ICONS: Record<string, () => SVGSVGElement> = {
  main: iconMain,
  emission: iconEmission,
  shape: iconShape,
  renderer: iconRenderer,
  vol: iconVelocity,
  col: iconColor,
  cbs: iconColor,
  sol: iconSize,
  spriteAnim: iconSprite,
};

export function moduleIcon(id: string): SVGSVGElement {
  return (MODULE_ICONS[id] ?? iconMore)();
}
