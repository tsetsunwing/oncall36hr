/**
 * Bridge: tokens.json (Figma MCP extract) → CSS custom properties.
 * Layout G screens must consume these vars; do not hardcode paints in components.
 */
import type { CSSProperties } from 'react';
import tokens from './tokens.json';

type CssVarMap = Record<`--${string}`, string>;

function px(n: number): string {
  return `${String(n)}px`;
}

/** Flat CSS custom properties derived from tokens.json (source of truth). */
export function buildLayoutGTokenVars(): CssVarMap {
  const c = tokens.color;
  const r = tokens.radius;
  const s = tokens.space;
  const t = tokens.type;
  const sh = tokens.shadow;
  const layout = tokens.layout;

  return {
    /* Surfaces */
    '--g-bg': c.bg,
    '--g-bg-setup': c.bgSetup,
    '--g-bg-start': c.bgStart,
    '--g-surface': c.surface,
    '--g-surface-solid': c.surfaceSolid,
    '--g-surface-card': c.surfaceCard,
    '--g-surface-hud': c.surfaceHud,
    '--g-surface-need': c.surfaceNeed,
    '--g-surface-float': c.surfaceFloat,
    '--g-surface-start-panel': c.surfaceStartPanel,
    '--g-monitor': c.monitor,
    '--g-monitor-panel': c.monitorParam,
    '--g-monitor-wave': c.monitorWave,

    /* Text */
    '--g-text': c.text,
    '--g-text-hud': c.textHud,
    '--g-text-need': c.textNeed,
    '--g-text-strong': c.textStrong,
    '--g-muted': c.muted,
    '--g-muted-hud': c.mutedHud,
    '--g-faint': c.faint,
    '--g-faint-setup': c.faintSetup,

    /* Lines */
    '--g-line': c.line,
    '--g-line-strong': c.lineStrong,
    '--g-line-filter': c.lineFilter,
    '--g-host-bg': c.lineStrong,

    /* Accent */
    '--g-teal': c.teal,
    '--g-teal-soft': c.tealSoft,
    '--g-teal-soft-selected': c.tealSoftSelected,
    '--g-teal-soft-menu': c.tealSoftMenu,
    '--g-teal-soft-preview': c.tealSoftPreview,
    '--g-teal-tint': c.tealSoftMenu,
    '--g-teal-border': c.teal,
    '--g-teal-border-start': c.tealBorderStart,
    '--g-zone-selected': c.zoneSelected,
    '--g-speed-selected': c.speedSelected,
    '--g-dose-blue': c.doseBlue,

    /* Status */
    '--g-ok': c.ok,
    '--g-ok-soft': c.okSoft,
    '--g-warn': c.warn,
    '--g-warn-soft': c.warnSoft,
    '--g-danger': c.gradeH,
    '--g-danger-soft': c.gradeHSoft,
    '--g-grade-h': c.gradeH,
    '--g-grade-h-soft': c.gradeHSoft,
    '--g-grade-l': c.gradeL,
    '--g-grade-l-soft': c.gradeLSoft,
    '--g-grade-n': c.muted,
    '--g-mews-green': c.mewsOk,
    '--g-mews-amber': c.warn,
    '--g-mews-red': c.gradeH,

    /* Routes */
    '--g-route-po': c.route.PO.fg,
    '--g-route-po-bg': c.route.PO.bg,
    '--g-route-iv': c.route.IV.fg,
    '--g-route-iv-bg': c.route.IV.bg,
    '--g-route-ivf': c.route.IVF.fg,
    '--g-route-ivf-bg': c.route.IVF.bg,
    '--g-route-im': c.route.IM.fg,
    '--g-route-im-bg': c.route.IM.bg,
    '--g-route-sc': c.route.SC.fg,
    '--g-route-sc-bg': c.route.SC.bg,
    '--g-route-neb': c.route.NEB.fg,
    '--g-route-neb-bg': c.route.NEB.bg,
    '--g-route-sl': c.route.SL.fg,
    '--g-route-sl-bg': c.route.SL.bg,

    /* Badges */
    '--g-badge-haem': c.badge.haem.fg,
    '--g-badge-haem-bg': c.badge.haem.bg,
    '--g-badge-biochem': c.badge.biochem.fg,
    '--g-badge-biochem-bg': c.badge.biochem.bg,
    '--g-badge-xray': c.badge.xray.fg,
    '--g-badge-xray-bg': c.badge.xray.bg,
    '--g-badge-poct': c.badge.poct.fg,
    '--g-badge-poct-bg': c.badge.poct.bg,

    /* Dock */
    '--g-dock-observe': c.dock.observe,
    '--g-dock-tests': c.dock.tests,
    '--g-dock-treat': c.dock.treat,
    '--g-dock-resus': c.dock.resus,
    '--g-dock-chat': c.dock.chat,

    /* Chips */
    '--g-chip-bg': c.chipBg,
    '--g-chip-idle': c.chipIdle,
    '--g-chip-border': c.chipBorder,
    '--g-chip-text': c.chipText,
    '--g-chip-selected-bg': c.tealSoftSelected,
    '--g-chip-selected-border': c.teal,
    '--g-chip-selected-text': c.teal,
    '--g-chip-history-bg': c.chipBg,
    '--g-chip-current-border-width': '1.4px',
    '--g-chip-filter-selected-border': c.text,

    /* Radii */
    '--g-radius-card': px(r.card),
    '--g-radius-chip': px(r.chip),
    '--g-radius-badge': px(r.badge),
    '--g-radius-filter': px(r.filterBtn),
    '--g-radius-hud': px(r.hudClock),
    '--g-radius-hud-lg': px(r.hudBtn),
    '--g-radius-need': px(r.need),
    '--g-radius-phone': px(r.phone),
    '--g-radius-dock-chat': px(r.dockChat),
    '--g-radius-dock-chip': px(r.dockChip),
    '--g-radius-btn': px(r.hudBtn),
    '--g-radius-menu-row': px(r.menuRow),
    '--g-radius-menu-selected': px(r.menuRowSelected),
    '--g-radius-float': px(r.floatMenu),
    '--g-radius-confirm': px(r.confirmOrder),
    '--g-radius-cta': px(r.cta),
    '--g-radius-setup': px(r.setupPanel),
    '--g-radius-input': px(r.input),
    '--g-radius-wave': px(r.wave),
    '--g-radius-param': px(r.param),

    /* Space */
    '--g-pad-card': px(s.cardPad),
    '--g-gap-row': px(s.chipPadY + 6),
    '--g-gap-hud': px(s.hudGap),
    '--g-gap-dock': px(s.dockGap),
    '--g-edge-right': px(s.edgeRight),
    '--g-hud-btn-h': px(s.hudBtnH),
    '--g-dock-h': px(s.dockH),
    '--g-filter-size': px(s.filterSize),
    '--g-viewport-w': px(layout.playViewport.w),
    '--g-viewport-h': px(layout.playViewport.h),

    /* Type */
    '--g-fs-chip': px(t.chip),
    '--g-fs-badge': px(t.badge),
    '--g-fs-caption': px(t.caption),
    '--g-fs-label': px(t.label),
    '--g-fs-body': px(t.body),
    '--g-fs-title': px(t.title),
    '--g-fs-hud-clock': px(t.hudClock),
    '--g-fs-hud-muted': px(t.hudMuted),
    '--g-fs-dock': px(t.dock),
    '--g-fs-confirm': px(t.confirmOrder),
    '--g-fs-display': px(t.cta + 16),
    '--g-fs-cta': px(t.cta),
    '--g-fs-monitor': px(t.monitorValue),
    '--g-fw-regular': '400',
    '--g-fw-medium': '500',
    '--g-fw-semibold': '600',
    '--g-fw-bold': '700',

    /* Shadows */
    '--g-shadow-hud': sh.hud,
    '--g-shadow-card': sh.card,
    '--g-shadow-float': sh.float,
    '--g-shadow-monitor': sh.monitor,
    '--g-shadow-cta': sh.cta,
    '--g-shadow-cta-setup': sh.ctaSetup,
    '--g-shadow-setup': sh.setupPanel,
    '--g-shadow-menu': '0 2px 4px rgba(0, 0, 0, 0.12)',
    '--g-shadow-start-panel': '0 8px 12px rgba(0, 0, 0, 0.5)',

    /* Waveforms → also remap production --mon-* inside Layout G */
    '--g-ecg': c.monitorWaveform.ecg,
    '--g-pleth': c.monitorWaveform.pleth,
    '--g-abp': c.monitorWaveform.abp,
    '--g-rr': c.monitorWaveform.rr,
    '--g-temp': c.monitorWaveform.temp,
    '--g-nibp': c.monitorWaveform.nibp,
    '--g-need-track': c.needTrack,
    '--g-white': '#ffffff',
    '--g-white-08': 'rgba(255, 255, 255, 0.08)',
    '--g-white-45': 'rgba(255, 255, 255, 0.45)',
    '--g-white-85': 'rgba(255, 255, 255, 0.85)',
    '--g-bed-label-bg': 'rgba(18, 32, 41, 0.72)',

    /* Production monitor remap (scoped under .lg-demo) */
    '--mon-bg': c.monitor,
    '--mon-panel': c.monitorWave,
    '--mon-line': c.monitorParam,
    '--mon-ink': c.monitorWaveform.nibp,
    '--mon-dim': c.mutedHud,
    '--mon-green': c.monitorWaveform.ecg,
    '--mon-cyan': c.monitorWaveform.pleth,
    '--mon-red': c.monitorWaveform.abp,
    '--mon-yellow': c.monitorWaveform.rr,
    '--mon-warn': c.monitorWaveform.temp,
    '--mon-blue': c.doseBlue,
  };
}

const STYLE_ID = 'layout-g-figma-tokens';

/** Inject tokens.json as CSS vars for .lg-demo / host / entrance link. Idempotent. */
export function ensureLayoutGTokensInjected(): void {
  if (typeof document === 'undefined') return;
  const vars = buildLayoutGTokenVars();
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const css = `/* generated from src/demo/layout-g/tokens.json — do not hand-edit */\n.lg-demo,\n.layout-g-demo-host,\na.lg-entrance-link {\n${body}\n}\n`;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** React style prop: same vars (inline wins for the element). */
export function layoutGTokenStyle(): CSSProperties {
  return { ...buildLayoutGTokenVars() };
}

export function badgeKindFromGroup(
  group: string,
): 'haem' | 'biochem' | 'xray' | 'poct' | 'default' {
  const g = group.toLowerCase();
  if (g.includes('haem') || g.includes('血液') || g.includes('cbc')) return 'haem';
  if (g.includes('biochem') || g.includes('生化') || g.includes('abg')) return 'biochem';
  if (g.includes('x-ray') || g.includes('xray') || g.includes('radio') || g.includes('x光'))
    return 'xray';
  if (g.includes('poct') || g.includes('床邊')) return 'poct';
  return 'default';
}

export { tokens as layoutGTokens };
