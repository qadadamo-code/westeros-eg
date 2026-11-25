import { describe, expect, it } from "vitest";
import { escpos, toMono, tspl } from "./encode";

const px = (w: number, h: number, black: (x: number, y: number) => boolean) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const v = black(x, y) ? 0 : 255; a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255; }
  return a;
};

describe("printer encoders", () => {
  it("packs dots, padding the width to 8", () => {
    const m = toMono(px(10, 2, (x) => x === 0 || x === 9), 10, 2);
    expect(m.w).toBe(16);
    expect([...m.bits]).toEqual([0x80, 0x40, 0x80, 0x40]);
  });
  it("ESC/POS raster header, feed and cut", () => {
    const b = escpos(toMono(px(8, 3, () => true), 8, 3));
    expect([...b.subarray(0, 10)]).toEqual([0x1b, 0x40, 0x1d, 0x76, 0x30, 0, 1, 0, 3, 0]);
    expect([...b.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0]);
  });
  it("TSPL bitmap with 0 = black and copies", () => {
    const b = tspl(toMono(px(8, 1, () => true), 8, 1), { wMm: 50, hMm: 25, copies: 3 });
    const s = new TextDecoder("latin1").decode(b);
    expect(s).toContain("SIZE 50 mm,25 mm");
    expect(s).toContain("BITMAP 0,0,1,1,0,\u0000");
    expect(s).toContain("PRINT 3,1");
  });
});
