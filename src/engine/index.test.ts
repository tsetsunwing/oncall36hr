import { describe, expect, it } from 'vitest';
import { ENGINE_BOUNDARY_VERSION } from './index';

describe('engine placeholder', () => {
  it('is importable without touching ai/ui/view', () => {
    expect(ENGINE_BOUNDARY_VERSION).toBe(0);
  });
});
