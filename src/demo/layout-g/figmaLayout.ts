/** Figma frame 1920×1080 → CSS % on locked play-viewport (1280×720 = 2/3). */
import type { CSSProperties } from 'react';

export const FIGMA_W = 1920;
export const FIGMA_H = 1080;

export function pctX(x: number): string {
  return `${String((x / FIGMA_W) * 100)}%`;
}

export function pctY(y: number): string {
  return `${String((y / FIGMA_H) * 100)}%`;
}

export function figmaBox(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    left: pctX(x),
    top: pctY(y),
    width: pctX(w),
    height: pctY(h),
  };
}

/** 03e Bed Zoom card slots (MCP get_metadata). */
export const BEDZOOM_SLOTS = {
  monitor: { x: 24, y: 100, w: 470, h: 200 },
  body: { x: 24, y: 336, w: 322, h: 618 },
  mar: { x: 1032, y: 100, w: 420, h: 525.4 },
  record: { x: 1476, y: 100, w: 420, h: 293 },
  rightLower: { x: 1476, y: 547.6, w: 420, h: 424.4 },
  chatHistory: { x: 24, y: 710, w: 1344, h: 250 },
  dock: { x: 24, y: 988, w: 1872, h: 72 },
} as const;

/** Floor bed pin 36×36; MEWS offset +22/−10 (docs + Floor MCP). */
export const BED_PIN = 36;
export const MEWS_OFFSET = { dx: 22, dy: -10 } as const;
