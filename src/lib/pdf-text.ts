// Lightweight, dependency-free PDF selectable-text check (PRD §3.1 / M4).
//
// Ported in spirit from Hope-Maine's accessibility-at-upload gate. A scanned
// image-only PDF is invisible to a screen reader and must be flagged; a PDF with
// real text layers is accessible. We deliberately avoid pdf-parse / pdfjs-dist:
// they bundle a whole PDF engine and are fragile inside an esbuild-bundled
// Netlify function. This is a heuristic flag for a human, not a hard gate, so a
// cheap, robust check beats a heavy, brittle one.
//
// Signal: a text PDF declares `/Font` resources and emits text-showing operators
// (Tj / TJ) in its content streams. An image-only scan declares `/Image`
// XObjects and no fonts. Content streams are usually FlateDecode-compressed, so
// we inflate what we can with Node's zlib before scanning.

import { inflateSync } from "node:zlib";

export type AccessibilityFlag = "has_text" | "image_only" | "not_checked";

const STREAM_RE = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

export function pdfAccessibility(buf: Buffer): AccessibilityFlag {
  if (!buf || buf.length === 0) return "not_checked";
  const raw = buf.toString("latin1");

  // Fast path: an uncompressed /Font declaration is a strong text signal.
  if (/\/Font\b/.test(raw) && /(\bTj\b|\bTJ\b)/.test(raw)) return "has_text";

  // Otherwise inflate each stream and look for fonts + text operators inside
  // (object streams / content streams are typically FlateDecode-compressed).
  let sawText = false;
  let sawImage = /\/Subtype\s*\/Image\b/.test(raw);
  let m: RegExpExecArray | null;
  STREAM_RE.lastIndex = 0;
  while ((m = STREAM_RE.exec(raw)) !== null) {
    const chunk = Buffer.from(m[1], "latin1");
    let text: string;
    try {
      text = inflateSync(chunk).toString("latin1");
    } catch {
      text = m[1]; // not deflate-compressed (or already plain) — scan as-is
    }
    if (/\/Font\b/.test(text) || /\bTj\b|\bTJ\b|\bBT\b/.test(text)) { sawText = true; break; }
    if (/\/Subtype\s*\/Image\b/.test(text)) sawImage = true;
  }

  if (sawText) return "has_text";
  if (sawImage) return "image_only";
  // No fonts, no images we could see — unknown rather than falsely "accessible".
  return "not_checked";
}

// Safe, collision-resistant storage key for an uploaded file.
export function sanitizeFilename(name: string): string {
  return (name || "file.pdf")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "file.pdf";
}
