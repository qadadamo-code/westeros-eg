/**
 * Draws a ticket (any React node: the receipt, the kitchen ticket, the sticker) into a picture `dots` wide, so the
 * print station can send it to a network printer. The node is laid out off-screen, its computed styles are copied
 * inline, and the copy is drawn through an SVG foreignObject (Chrome on the station PC). No extra library.
 */
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

// heights are left to the layout: fixed pixel heights made lines overlap when a font differed (Saqr 2026-11-25)
const SKIP = new Set(["height", "block-size", "min-height", "min-block-size"]);
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    if (SKIP.has(p)) continue;
    css += `${p}:${cs.getPropertyValue(p)};`;
  }
  (dst as HTMLElement).setAttribute("style", css);
  const a = src.children;
  const b = dst.children;
  for (let i = 0; i < a.length; i++) if (b[i]) inlineStyles(a[i], b[i]);
}

/**
 * A picture drawn from an SVG can't load the page's web fonts, so the text fell back to another font and overlapped.
 * The fonts of the page's Google Fonts link (Arabic and Latin parts) are fetched once and embedded as data URLs.
 */
let fontCache: Promise<string> | null = null;
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
export function embeddedFonts(): Promise<string> {
  if (fontCache) return fontCache;
  fontCache = (async () => {
    const href = (document.querySelector('link[href*="fonts.googleapis.com/css"]') as HTMLLinkElement | null)?.href;
    if (!href) return "";
    const css = await (await fetch(href)).text();
    const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].filter((m) => m[1] === "arabic" || m[1] === "latin").map((m) => m[2]);
    const out = await Promise.all(blocks.map(async (b) => {
      const url = b.match(/url\(([^)]+)\)/)?.[1]?.replace(/["']/g, "");
      if (!url) return "";
      try {
        return b.replace(/url\([^)]+\)/, `url(${await toDataUrl(await (await fetch(url)).blob())})`);
      } catch {
        return "";
      }
    }));
    return out.join("\n");
  })().catch(() => {
    fontCache = null;
    return "";
  });
  return fontCache;
}

/** lays the node out at `widthCss` (e.g. "72mm") and returns a canvas `dots` wide (white background) */
export async function nodeToCanvas(node: ReactNode, dots: number, widthCss?: string): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;background:#fff;${widthCss ? `width:${widthCss};` : ""}`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<>{node}</>));
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    const el = (host.firstElementChild as HTMLElement | null) ?? host;
    const r = el.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(r.width));
    const h = Math.max(1, Math.ceil(r.height));
    const clone = el.cloneNode(true) as HTMLElement;
    inlineStyles(el, clone);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const xhtml = new XMLSerializer().serializeToString(clone);
    const fonts = await embeddedFonts();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${fonts ? `<defs><style>${fonts}</style></defs>` : ""}<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("render_failed"));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const scale = dots / w;
    const c = document.createElement("canvas");
    c.width = dots;
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    root.unmount();
    host.remove();
  }
}

export const pixelsOf = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
