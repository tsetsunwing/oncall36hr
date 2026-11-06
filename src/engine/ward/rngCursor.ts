import { rngChance, rngFloat, rngInt, type RngState, type RngStream } from '../core/rng';

/** 便利包裝：喺一個函數內連續抽籤，最後取回新 rng 狀態寫返入 GameState */
export class RngCursor {
  rng: RngState;

  constructor(rng: RngState) {
    this.rng = rng;
  }

  int(stream: RngStream, minInclusive: number, maxExclusive: number): number {
    const draw = rngInt(this.rng, stream, minInclusive, maxExclusive);
    this.rng = draw.rng;
    return draw.value;
  }

  float(stream: RngStream): number {
    const draw = rngFloat(this.rng, stream);
    this.rng = draw.rng;
    return draw.value;
  }

  chance(stream: RngStream, p: number): boolean {
    const draw = rngChance(this.rng, stream, p);
    this.rng = draw.rng;
    return draw.value;
  }

  shuffle<T>(stream: RngStream, items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(stream, 0, i + 1);
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** 按權重揀一個；權重全為 0 時當平均 */
  weighted<T>(
    stream: RngStream,
    items: readonly T[],
    weightOf: (item: T) => number,
  ): T | undefined {
    if (items.length === 0) return undefined;
    const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
    if (total <= 0) return items[this.int(stream, 0, items.length)];
    let roll = this.float(stream) * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll < 0) return item;
    }
    return items.at(-1);
  }
}
