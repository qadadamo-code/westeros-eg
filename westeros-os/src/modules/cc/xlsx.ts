/**
 * Reads the first sheet of an Excel file (.xlsx) or a CSV file into rows of text, in the browser, without a library:
 * an .xlsx file is a zip of XML parts, inflated with the platform's DecompressionStream.
 */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not an Excel file");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) out.set(name, method === 0 ? raw : await inflate(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const parts = await unzip(buf);
  const dec = new TextDecoder();
  const xml = (name: string) => new DOMParser().parseFromString(dec.decode(parts.get(name) ?? new Uint8Array()), "application/xml");
  const shared = parts.has("xl/sharedStrings.xml") ? [...xml("xl/sharedStrings.xml").getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("")) : [];
  const sheetName = [...parts.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!sheetName) throw new Error("the file has no sheet");
  const rows: string[][] = [];
  for (const r of xml(sheetName).getElementsByTagName("row")) {
    const row: string[] = [];
    for (const c of r.getElementsByTagName("c")) {
      const i = colIndex(c.getAttribute("r") ?? "A1");
      const t = c.getAttribute("t");
      const val = c.getElementsByTagName("v")[0]?.textContent ?? "";
      row[i] = t === "s" ? (shared[Number(val)] ?? "") : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent ?? "").join("") : val;
    }
    rows.push(Array.from(row, (x) => (x ?? "").trim()));
  }
  return rows.filter((r) => r.some((x) => x));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) (row.push(cell.trim()), (cell = ""));
    else if (ch === "\n") (row.push(cell.trim()), rows.push(row), (row = []), (cell = ""));
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) (row.push(cell.trim()), rows.push(row));
  return rows.filter((r) => r.some((x) => x));
}

/** Rows as objects keyed by the header row (first row). */
export async function readSheet(file: File): Promise<Record<string, string>[]> {
  const rows = /\.csv$/i.test(file.name) ? parseCsv((await file.text()).replace(/^\uFEFF/, "")) : await readXlsx(await file.arrayBuffer());
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

/** A number typed in Excel or by hand: Arabic digits and separators accepted. */
export function sheetNumber(s: string | undefined): number {
  const n = Number(String(s ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").replace("٫", "."));
  return Number.isFinite(n) ? n : 0;
}
