/**
 * Printer languages for محطة الطباعة: a black-and-white picture of the ticket becomes the bytes a network printer
 * takes on port 9100. Receipt printers speak ESC/POS (raster image), label printers (Xprinter XP-420B …) speak TSPL.
 * Pictures keep Arabic exactly as drawn, whatever code pages the printer has. Pure.
 */

export interface Mono {
  /** width in dots, a multiple of 8 */
  w: number;
  h: number;
  /** one bit per dot, rows of w/8 bytes, 1 = black */
  bits: Uint8Array;
}

/** RGBA pixels → 1-bit (dark enough = black); `w` is padded up to a multiple of 8 with white */
export function toMono(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 160): Mono {
  const w = Math.ceil(width / 8) * 8;
  const row = w / 8;
  const bits = new Uint8Array(row * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (lum < threshold) bits[y * row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  return { w, h: height, bits };
}

const concat = (parts: (Uint8Array | number[])[]): Uint8Array => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** ESC/POS: init, the picture in bands (GS v 0), feed and cut */
export function escpos(img: Mono, opts: { cut?: boolean; feed?: number } = {}): Uint8Array {
  const row = img.w / 8;
  const parts: (Uint8Array | number[])[] = [[0x1b, 0x40]];
  const BAND = 255;
  for (let y = 0; y < img.h; y += BAND) {
    const h = Math.min(BAND, img.h - y);
    parts.push([0x1d, 0x76, 0x30, 0x00, row & 0xff, (row >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]);
    parts.push(img.bits.subarray(y * row, (y + h) * row));
  }
  parts.push([0x1b, 0x64, opts.feed ?? 4]);
  if (opts.cut !== false) parts.push([0x1d, 0x56, 0x42, 0x00]);
  return concat(parts);
}

/** TSPL: label size and gap, the picture (BITMAP, where 0 = black), and how many copies */
export function tspl(img: Mono, opts: { wMm: number; hMm: number; gapMm?: number; copies?: number }): Uint8Array {
  const row = img.w / 8;
  const inv = img.bits.map((b) => ~b & 0xff);
  return concat([
    ascii(`SIZE ${opts.wMm} mm,${opts.hMm} mm\r\nGAP ${opts.gapMm ?? 2} mm,0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,${row},${img.h},0,`),
    inv,
    ascii(`\r\nPRINT ${Math.max(1, Math.round(opts.copies ?? 1))},1\r\n`),
  ]);
}

/** dots across the paper at 203 dpi (8 dots per mm); thermal heads print 48 mm on 58 mm paper and 72 mm on 80 mm */
export const dotsFor = (paper: "58" | "80"): number => (paper === "58" ? 384 : 576);
export const labelDots = (mm: number): number => Math.round(mm * 8);

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
