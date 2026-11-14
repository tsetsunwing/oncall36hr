import { describe, expect, it } from 'vitest';
import { badgeKindFromGroup, buildLayoutGTokenVars, layoutGTokens } from './applyTokens';

describe('applyTokens (tokens.json → CSS vars)', () => {
  it('maps Figma MCP teal / dock / route paints onto --g-* vars', () => {
    const vars = buildLayoutGTokenVars();
    expect(vars['--g-teal']).toBe(layoutGTokens.color.teal);
    expect(vars['--g-teal']).toBe('#0d7380');
    expect(vars['--g-dock-observe']).toBe('#40b87a');
    expect(vars['--g-dock-tests']).toBe('#8c66d9');
    expect(vars['--g-dock-treat']).toBe('#4085d9');
    expect(vars['--g-dock-resus']).toBe('#eb4747');
    expect(vars['--g-route-iv']).toBe('#7333a6');
    expect(vars['--g-route-ivf']).toBe('#004dbf');
    expect(vars['--g-radius-card']).toBe('14px');
    expect(vars['--g-fs-chip']).toBe('8px');
  });

  it('remaps production monitor --mon-* to Figma waveform paints', () => {
    const vars = buildLayoutGTokenVars();
    expect(vars['--mon-green']).toBe(layoutGTokens.color.monitorWaveform.ecg);
    expect(vars['--mon-cyan']).toBe(layoutGTokens.color.monitorWaveform.pleth);
    expect(vars['--mon-red']).toBe(layoutGTokens.color.monitorWaveform.abp);
    expect(vars['--mon-bg']).toBe(layoutGTokens.color.monitor);
  });

  it('classifies Results badge kinds from group labels', () => {
    expect(badgeKindFromGroup('Radiology')).toBe('xray');
    expect(badgeKindFromGroup('POCT')).toBe('poct');
    expect(badgeKindFromGroup('血液 Haem')).toBe('haem');
    expect(badgeKindFromGroup('生化 Biochem')).toBe('biochem');
  });
});
