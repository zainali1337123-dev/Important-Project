/**
 * pdf-urdu.ts — Urdu (Nastaliq) text rendering helper for jsPDF.
 *
 * PROBLEM:
 *   jsPDF's built-in `helvetica` font does NOT include Arabic/Urdu glyphs,
 *   so any Urdu text in a PDF renders as broken symbols / empty boxes.
 *   jsPDF also does not perform Arabic shaping (initial/medial/final forms)
 *   or RTL reordering, so even with a Nastaliq font registered, the text
 *   would appear disconnected and LTR-ordered.
 *
 * SOLUTION:
 *   Use the browser's native text-rendering pipeline via <canvas>:
 *     1. Load "Noto Nastaliq Urdu" TTF via CSS @font-face (see globals.css).
 *     2. Wait for the font to be ready via document.fonts.load().
 *     3. Draw the text onto an offscreen <canvas> using ctx.fillText().
 *        The browser handles Arabic shaping, Nastaliq styling, and RTL
 *        ordering automatically.
 *     4. Convert the canvas to a PNG data URL.
 *     5. Embed the PNG into the jsPDF document via doc.addImage().
 *
 * USAGE:
 *   import { renderTextToImageDataUrl, hasUrdu, ensureUrduFontLoaded } from "@/lib/pdf-urdu";
 *
 *   await ensureUrduFontLoaded();
 *   if (hasUrdu(productName)) {
 *     const dataUrl = renderTextToImageDataUrl(productName, { fontSize: 11, color: "#1e2832" });
 *     doc.addImage(dataUrl, "PNG", x, y, w, h);
 *   } else {
 *     doc.text(productName, x, y);  // Roman text — use jsPDF's fast native rendering
 *   }
 *
 * IMPORTANT:
 *   This module is CLIENT-SIDE ONLY. It uses browser APIs (document, canvas, FontFace).
 *   Do not import from server-side code.
 */

/* ─── Types ─── */
export interface RenderTextOptions {
  /** Font size in pt (will be scaled for canvas resolution). Default 12. */
  fontSize?: number;
  /** CSS color string. Default "#1e2832" (dark blue-gray). */
  color?: string;
  /** Font family for non-Urdu (Latin) text. Default "Helvetica, Arial, sans-serif". */
  latinFont?: string;
  /** Font family for Urdu text. Default "Noto Nastaliq Urdu". */
  urduFont?: string;
  /** Bold weight. Default false. */
  bold?: boolean;
  /** Canvas pixel ratio multiplier (higher = crisper image but bigger). Default 3. */
  scale?: number;
  /** Optional max width in pt; text wraps if exceeded. */
  maxWidthPt?: number;
  /** Line height in pt (when wrapping). Default = fontSize * 1.25. */
  lineHeightPt?: number;
}

export interface RenderedTextImage {
  /** PNG data URL (base64). */
  dataUrl: string;
  /** Width in pt (already divided by scale). */
  widthPt: number;
  /** Height in pt (already divided by scale). */
  heightPt: number;
}

/* ─── Urdu detection ───
 * Urdu uses Arabic script (Unicode blocks below). Any character in these
 * ranges means the text needs canvas-based rendering.
 */
const URDU_RANGES: Array<[number, number]> = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

export function hasUrdu(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    for (const [lo, hi] of URDU_RANGES) {
      if (cp >= lo && cp <= hi) return true;
    }
  }
  return false;
}

/**
 * Sanitize or extract clean Roman/English text from a bilingual or Urdu string.
 * Used as a safe fallback when rendering plain text directly in PDF engines
 * that lack embedded Arabic glyphs, preventing "Choker (þ®ù-þïù)" corruptions.
 *
 * Examples:
 *   "Choker (چوکر)" -> "Choker"
 *   "Wanda - ونڈا" -> "Wanda"
 *   "Khal Binola / کھل بنولہ" -> "Khal Binola"
 *   "چوکر" -> "Choker" (if known map exists) or sanitized text
 */
export function sanitizeUrduForPdf(text: string | null | undefined): string {
  if (!text) return "";
  
  // Clean common garbled/mojibake patterns if corrupted
  let cleaned = text
    .replace(/[\u00FE\u00AE\u00F9\u00EF\u00D8\u00D9\u00DA\u00DB]+/g, "")
    .replace(/\(\s*[-—–]?\s*\)/g, "")
    .replace(/[-—–]\s*$/g, "")
    .trim();

  // If text contains both English and Urdu (e.g., "Choker (چوکر)" or "Choker - چوکر")
  // Extract the English portion
  const parenMatch = cleaned.match(/^([A-Za-z0-9\s\-_.#]+)\s*[\(\[（].*?[\)\]）]/);
  if (parenMatch && parenMatch[1]?.trim()) {
    return parenMatch[1].trim();
  }

  const dashMatch = cleaned.match(/^([A-Za-z0-9\s_.]+)\s*[-—–/|]\s*[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/);
  if (dashMatch && dashMatch[1]?.trim()) {
    return dashMatch[1].trim();
  }

  // If string contains only Urdu and has a known transliteration
  const trimmed = cleaned.trim();
  const knownUrduMap: Record<string, string> = {
    "چوکر": "Choker",
    "ونڈا": "Wanda",
    "کھل": "Khal",
    "بنولہ": "Binola",
    "کھل بنولہ": "Khal Binola",
    "مکئی": "Makai",
    "گندم": "Gandam",
    "توریہ": "Toria",
    "شیرہ": "Sheera",
    "رائس پالش": "Rice Polish",
    "گلوٹن": "Gluten",
    "ڈی ایل ایم": "DLM",
    "چونا": "Choona",
    "سویا بین": "Soyabean",
    "سرسوں": "Sarson",
    "سرسوں کھل": "Sarson Khal",
    "کرایہ": "Fare",
    "مزدوری": "Labor",
    "لیبر": "Labor",
  };

  if (knownUrduMap[trimmed]) {
    return knownUrduMap[trimmed];
  }

  // Filter out any unrenderable Arabic characters if string still has them
  // to avoid Latin-1 mojibake in jsPDF
  const withoutArabic = cleaned.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, "").trim();
  if (withoutArabic.length > 0) {
    return withoutArabic.replace(/\(\s*\)/g, "").replace(/[-—–]\s*$/g, "").trim();
  }

  return cleaned;
}

/**
 * Extract clean English label from bilingual or formatted product name.
 */
export function extractEnglishName(text: string | null | undefined): string {
  return sanitizeUrduForPdf(text);
}

/* ─── Font loading ─── */
let fontLoadPromise: Promise<void> | null = null;

/**
 * Pre-load the Noto Nastaliq Urdu / Arabic font in the browser so it's ready
 * when we render. Safe to call multiple times — caches the promise.
 *
 * Uses CSS Font Loading API (document.fonts). Falls back gracefully
 * to system Arabic fonts (Noto Sans Arabic, Amiri, Segoe UI, Tahoma).
 */
export function ensureUrduFontLoaded(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  if (typeof document === "undefined" || !("fonts" in document)) {
    fontLoadPromise = Promise.resolve();
    return fontLoadPromise;
  }
  fontLoadPromise = document.fonts
    .load('16px "Noto Nastaliq Urdu"')
    .then(() => {
      return (document as any).fonts.ready;
    })
    .catch(() => {
      // Font failed to load — fallback system fonts will be used by canvas
    });
  return fontLoadPromise;
}

/* ─── Canvas rendering ───
 * We create an offscreen <canvas>, set up a 2D context with a high pixel
 * ratio (3x) for crisp output, draw the text, then export as PNG.
 *
 * For mixed Roman+Urdu text (e.g. "Choker — چوکر"), we render it as a
 * single string on canvas — the browser handles LTR+RTL bidirectional
 * ordering automatically via Unicode Bidi algorithm.
 */

const DEFAULT_OPTS: Required<Omit<RenderTextOptions, "maxWidthPt" | "lineHeightPt">> = {
  fontSize: 12,
  color: "#1e2832",
  latinFont: "Helvetica, Arial, sans-serif",
  urduFont: '"Noto Nastaliq Urdu", "Noto Sans Arabic", "Amiri", "Segoe UI", Tahoma, "Arial Unicode MS", sans-serif',
  bold: false,
  scale: 3,
};

/**
 * Render a single line (or wrapped block) of text to a PNG data URL.
 * The returned image has transparent background so it overlays cleanly
 * on any PDF cell color.
 *
 * Multi-line: pass `maxWidthPt` to enable wrapping. Lines are split on
 * word boundaries; long words are hard-broken. Urdu word boundaries
 * (space-separated) work the same way.
 */
export function renderTextToImageDataUrl(
  text: string,
  opts: RenderTextOptions = {},
): RenderedTextImage {
  if (typeof document === "undefined") {
    throw new Error("renderTextToImageDataUrl can only be called in the browser");
  }
  const o = { ...DEFAULT_OPTS, ...opts } as Required<RenderTextOptions> & {
    maxWidthPt?: number;
    lineHeightPt?: number;
  };

  // pt → px conversion (1pt = 1.333px at 96dpi). We render at higher scale
  // for crispness, then divide the final image dimensions by scale to get
  // back to pt units for jsPDF placement.
  const PX_PER_PT = 96 / 72; // ≈ 1.333
  const scale = o.scale;
  const fontPx = o.fontSize * PX_PER_PT * scale;

  // Font family selection — if text has any Urdu, use Nastaliq font for the
  // whole string. Noto Nastaliq Urdu includes Latin glyphs (though not as
  // pretty as Helvetica), so mixed text will still render correctly. The
  // browser's Bidi algorithm handles RTL ordering of Urdu substrings.
  const fontFamily = hasUrdu(text) ? o.urduFont : o.latinFont;
  const weight = o.bold ? "bold" : "normal";
  const fontStr = `${weight} ${fontPx}px ${fontFamily}`;

  // Set up canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true })!;
  ctx.font = fontStr;
  ctx.textBaseline = "top";
  ctx.fillStyle = o.color;

  // Wrap text if maxWidthPt is provided
  const maxPx = o.maxWidthPt != null ? o.maxWidthPt * PX_PER_PT * scale : Infinity;
  const lineHeightPt = o.lineHeightPt ?? o.fontSize * 1.25;
  const lineHeightPx = lineHeightPt * PX_PER_PT * scale;

  const lines = wrapText(ctx, text, maxPx);
  // Compute actual width = max line width
  let maxLinePx = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxLinePx) maxLinePx = m.width;
  }
  // Add small padding to avoid clipping edge glyphs
  const padPx = Math.ceil(fontPx * 0.15);
  const widthPx = Math.ceil(maxLinePx) + padPx * 2;
  const heightPx = Math.ceil(lineHeightPx * lines.length) + padPx * 2;

  // Resize canvas (this resets context state, so we re-apply font)
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx2 = canvas.getContext("2d", { alpha: true })!;
  ctx2.font = fontStr;
  ctx2.textBaseline = "top";
  ctx2.fillStyle = o.color;

  // Draw each line — for Urdu (RTL), textAlign default is "left" which
  // works because the browser's Bidi algorithm handles visual ordering
  // within each line. We just draw left-aligned; Urdu substrings appear
  // right-to-left within the line automatically.
  let yPos = padPx;
  for (const line of lines) {
    ctx2.fillText(line, padPx, yPos);
    yPos += lineHeightPx;
  }

  const dataUrl = canvas.toDataURL("image/png");
  // Convert canvas px back to pt for jsPDF placement
  const widthPt = widthPx / (PX_PER_PT * scale);
  const heightPt = heightPx / (PX_PER_PT * scale);
  return { dataUrl, widthPt, heightPt };
}

/**
 * Word-wrap a text string to fit within maxWidthPx.
 * - Splits on spaces (works for both English and Urdu — Urdu uses spaces).
 * - If a single word is wider than maxWidthPx, hard-breaks it (rare for
 *   normal product names).
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidthPx: number): string[] {
  if (!text) return [""];
  if (!isFinite(maxWidthPx)) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const testLine = current ? `${current} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth <= maxWidthPx) {
      current = testLine;
    } else {
      if (current) lines.push(current);
      // Word itself wider than max? Hard-break by character.
      if (ctx.measureText(word).width > maxWidthPx) {
        let chunk = "";
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width > maxWidthPx && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/* ─── Convenience: render multi-line product cell content ───
 * Product cells often look like:
 *   "Choker — چوکر\n(Driver: Rizwan)"
 * Each \n-separated line is rendered independently with proper wrapping.
 * Returns a tall image suitable for placement inside an autoTable cell.
 *
 * Implementation: renders all lines on a SINGLE canvas (no intermediate
 * Image objects — avoids async image load issues). Each line is drawn
 * left-aligned at the appropriate y offset.
 */
export function renderMultilineTextToImageDataUrl(
  text: string,
  opts: RenderTextOptions = {},
): RenderedTextImage {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return renderTextToImageDataUrl(text, opts);
  }

  const o = { ...DEFAULT_OPTS, ...opts } as Required<Omit<RenderTextOptions, "maxWidthPt" | "lineHeightPt">> & {
    maxWidthPt?: number;
    lineHeightPt?: number;
  };

  const PX_PER_PT = 96 / 72; // ≈ 1.333
  const scale = o.scale;
  const fontPx = o.fontSize * PX_PER_PT * scale;
  const fontFamily = hasUrdu(text) ? o.urduFont : o.latinFont;
  const weight = o.bold ? "bold" : "normal";
  const fontStr = `${weight} ${fontPx}px ${fontFamily}`;

  const lineHeightPt = o.lineHeightPt ?? o.fontSize * 1.25;
  const lineHeightPx = lineHeightPt * PX_PER_PT * scale;
  const maxPx = o.maxWidthPt != null ? o.maxWidthPt * PX_PER_PT * scale : Infinity;

  // First pass: measure each line (with wrapping) to find max width
  // and total height.
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d", { alpha: true })!;
  mctx.font = fontStr;

  const wrappedLines: string[][] = lines.map((line) => wrapText(mctx, line, maxPx));
  const flatLines: string[] = wrappedLines.flat();

  let maxLinePx = 0;
  for (const line of flatLines) {
    const m = mctx.measureText(line);
    if (m.width > maxLinePx) maxLinePx = m.width;
  }

  const padPx = Math.ceil(fontPx * 0.15);
  const widthPx = Math.ceil(maxLinePx) + padPx * 2;
  const heightPx = Math.ceil(lineHeightPx * flatLines.length) + padPx * 2;

  // Create final canvas and render all lines
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d", { alpha: true })!;
  ctx.font = fontStr;
  ctx.textBaseline = "top";
  ctx.fillStyle = o.color;

  let yPos = padPx;
  for (const line of flatLines) {
    ctx.fillText(line, padPx, yPos);
    yPos += lineHeightPx;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const widthPt = widthPx / (PX_PER_PT * scale);
  const heightPt = heightPx / (PX_PER_PT * scale);
  return { dataUrl, widthPt, heightPt };
}

/* ─── Convenience: split a string into segments by script (Latin / Urdu) ───
 * Useful when you want to render each segment with a different font.
 * Currently unused — renderTextToImageDataUrl handles mixed text via
 * browser Bidi automatically — but exposed for future use.
 */
export interface TextSegment {
  text: string;
  isUrdu: boolean;
}

export function splitByScript(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let current = "";
  let currentIsUrdu = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let isUrdu = false;
    for (const [lo, hi] of URDU_RANGES) {
      if (cp >= lo && cp <= hi) {
        isUrdu = true;
        break;
      }
    }
    if (current && isUrdu !== currentIsUrdu) {
      segments.push({ text: current, isUrdu: currentIsUrdu });
      current = "";
    }
    current += ch;
    currentIsUrdu = isUrdu;
  }
  if (current) segments.push({ text: current, isUrdu: currentIsUrdu });
  return segments;
}

/* ─── Universal autoTable Helpers for Full Urdu/Arabic Support ─── */

/**
 * Scan a 2D table array (head, body, foot) and pre-render any cell containing
 * Urdu or Arabic characters into high-resolution canvas PNG images.
 *
 * @param tableData 2D array of string/any cell values
 * @param columnWidthsPt Optional map of column index -> available width in pt
 * @param defaultOpts Optional custom font/size/color options
 */
export function createTableUrduCellMap(
  tableData: (string | any)[][],
  columnWidthsPt?: Record<number, number>,
  defaultOpts: RenderTextOptions = {}
): Map<string, RenderedTextImage> {
  const map = new Map<string, RenderedTextImage>();
  if (typeof document === "undefined" || !tableData?.length) return map;

  tableData.forEach((row, rowIdx) => {
    if (!Array.isArray(row)) return;
    row.forEach((cellVal, colIdx) => {
      const text = typeof cellVal === "string" ? cellVal : cellVal != null ? String(cellVal) : "";
      if (hasUrdu(text)) {
        try {
          const maxW = columnWidthsPt?.[colIdx] ?? 140;
          const img = renderMultilineTextToImageDataUrl(text, {
            fontSize: defaultOpts.fontSize ?? 8,
            color: defaultOpts.color ?? "#28323c",
            maxWidthPt: maxW,
            scale: defaultOpts.scale ?? 3,
            ...defaultOpts,
          });
          map.set(`${rowIdx}_${colIdx}`, img);
        } catch (e) {
          console.warn(`Urdu cell render failed at [${rowIdx}, ${colIdx}]:`, e);
        }
      }
    });
  });

  return map;
}

/**
 * Returns autoTable lifecycle hooks (`didParseCell` & `didDrawCell`) that:
 * 1. Prevent jsPDF standard fonts from rendering garbled Latin-1 mojibake for Urdu strings.
 * 2. Draw high-DPI canvas rendered PNGs with native Arabic shaping and RTL visual layout.
 * 3. Gracefully sanitize unrendered Arabic characters to clean Roman text if canvas fails.
 */
export function getAutoTableUrduHooks(
  cellMap: Map<string, RenderedTextImage>,
  doc: any,
  config: { paddingMm?: number; section?: "body" | "all" } = {}
) {
  const paddingMm = config.paddingMm ?? 2.2;
  const section = config.section ?? "body";
  const MM_PER_PT = 0.353;

  return {
    didParseCell: (hookData: any) => {
      if (section === "body" && hookData.section !== "body") return;
      const key = `${hookData.row.index}_${hookData.column.index}`;
      
      if (cellMap.has(key)) {
        // Replace cell text with space strings to preserve row height without
        // letting jsPDF attempt to write raw Unicode bytes with helvetica font
        if (Array.isArray(hookData.cell.text)) {
          hookData.cell.text = hookData.cell.text.map(() => " ");
        } else {
          hookData.cell.text = [" "];
        }
      } else {
        // Safe fallback: if cell has Urdu but was not in image map, sanitize
        // the text so it never prints corrupted "Choker (þ®ù-þïù)"
        const originalText = Array.isArray(hookData.cell.text)
          ? hookData.cell.text.join("\n")
          : String(hookData.cell.text || "");
        if (hasUrdu(originalText)) {
          const sanitized = sanitizeUrduForPdf(originalText);
          hookData.cell.text = sanitized ? [sanitized] : [" "];
        }
      }
    },
    didDrawCell: (hookData: any) => {
      if (section === "body" && hookData.section !== "body") return;
      const key = `${hookData.row.index}_${hookData.column.index}`;
      if (!cellMap.has(key)) return;

      const image = cellMap.get(key)!;
      const cell = hookData.cell;
      const maxWmm = cell.width - paddingMm * 2;
      const maxHmm = cell.height - paddingMm * 2;

      const imgWmm = image.widthPt * MM_PER_PT;
      const imgHmm = image.heightPt * MM_PER_PT;
      const scale = Math.min(maxWmm / imgWmm, maxHmm / imgHmm, 1);
      const drawW = imgWmm * scale;
      const drawH = imgHmm * scale;

      // Center vertically, align based on cell halign
      let imgX = cell.x + paddingMm;
      if (cell.styles.halign === "right") {
        imgX = cell.x + cell.width - paddingMm - drawW;
      } else if (cell.styles.halign === "center") {
        imgX = cell.x + (cell.width - drawW) / 2;
      }
      const imgY = cell.y + (cell.height - drawH) / 2;

      try {
        doc.addImage(image.dataUrl, "PNG", imgX, imgY, drawW, drawH);
      } catch (e) {
        console.warn("AutoTable Urdu image draw error:", e);
      }
    },
  };
}

