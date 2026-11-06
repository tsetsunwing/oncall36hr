/**
 * Engine 入口（M0 佔位）。
 * Engine 必須是純 TypeScript：不得 import ai／ui／view／react，
 * 亦不得使用 Math.random、Date、fetch 等非確定性或 I/O API（見 eslint.config.js 與 .dependency-cruiser.cjs）。
 * 實際 clock／RNG／reducer 於 M1 加入。
 */
export const ENGINE_BOUNDARY_VERSION = 0;

export interface EngineBoundaryInfo {
  version: number;
}
