#!/usr/bin/env node
// Checks that docs-zh/*.md still has the shape of the English page it translates:
// same headings (with the English id), same code blocks, same tables, same links,
// same inline code, same number of list items and paragraphs. It cannot judge the
// translation itself; it catches a dropped row, a changed command or a broken link.
//
//   node scripts/check-docs-zh.mjs [path/to/operad/docs/user] [file.md ...]
//
// Exit 1 when any page differs. No dependencies.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const srcDir = resolve(args.find((a) => !a.endsWith(".md")) || process.env.OPERAD_DOCS || join(root, "../operad/docs/user"));
const only = args.filter((a) => a.endsWith(".md")).map((a) => a.replace(/^.*\//, ""));
const zhDir = join(root, "docs-zh");

function slugify(text, seen) {
  let s = text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-");
  if (!s) s = "section";
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n ? `${s}-${n}` : s;
}

function load(path) {
  let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  let description = null;
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (m) {
    const d = m[1].match(/^description:\s*(.*)$/m);
    description = d ? d[1].trim() : null;
    text = text.slice(m[0].length);
  }
  return { description, body: text };
}

function facts(body, explicitIds) {
  const lines = body.split("\n");
  const f = { headings: [], fences: [], tables: [], links: [], codes: [], items: 0, blocks: 0 };
  const seen = new Map();
  let inFence = null;
  let prevBlank = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFence) {
      if (/^```\s*$/.test(line)) { f.fences.push(inFence.join("\n")); inFence = null; } else inFence.push(line);
      continue;
    }
    if (/^```/.test(line)) { inFence = []; f.blocks++; prevBlank = false; continue; }
    if (/^\s*$/.test(line)) { prevBlank = true; continue; }
    if (/^<!--.*-->\s*$/.test(line)) { prevBlank = true; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      let text = m[2], id = null;
      const im = text.match(/^(.*?)\s*\{#([\w-]+)\}$/);
      if (im) { text = im[1]; id = im[2]; seen.set(id, (seen.get(id) || 0) + 1); }
      else if (!explicitIds) id = slugify(text, seen);
      f.headings.push({ level: m[1].length, id });
      f.blocks++; prevBlank = true;
      continue;
    }
    if (/^\|/.test(line)) {
      if (!/^\|?\s*:?-{2,}/.test(line)) {
        const cols = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).length;
        f.tables.push(cols);
      }
      if (prevBlank) f.blocks++;
      prevBlank = false;
    } else if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      f.items++;
      if (prevBlank) f.blocks++;
      prevBlank = false;
    } else if (/^---+\s*$/.test(line)) {
      f.blocks++; prevBlank = true;
    } else {
      if (prevBlank) f.blocks++;
      prevBlank = false;
    }
  }
  // Inline code and links are read per paragraph, so a span that wraps a line still counts.
  const prose = body.replace(/^```[\s\S]*?^```\s*$/gm, "");
  for (const chunk of prose.split(/\n\s*\n/)) {
    const flat = chunk.replace(/\n\s*/g, " ");
    for (const c of flat.matchAll(/`([^`]+)`/g)) f.codes.push(c[1]);
    for (const l of flat.matchAll(/\]\(([^)\s]+)\)/g)) f.links.push(l[1]);
  }
  return f;
}

const problems = [];
const bad = (file, msg) => problems.push(`${file}: ${msg}`);
let checked = 0;

for (const file of readdirSync(srcDir).filter((x) => x.endsWith(".md")).sort()) {
  if (only.length && !only.includes(file)) continue;
  const zhPath = join(zhDir, file);
  if (!existsSync(zhPath)) { if (only.length) bad(file, "no Chinese file"); continue; }
  checked++;
  const en = load(join(srcDir, file)), zh = load(zhPath);
  const fe = facts(en.body, false), fz = facts(zh.body, true);
  if (!zh.description) bad(file, "front matter has no description");
  if (fe.headings.length !== fz.headings.length) bad(file, `headings: ${fe.headings.length} in English, ${fz.headings.length} in Chinese`);
  else fe.headings.forEach((h, i) => {
    const z = fz.headings[i];
    if (h.level !== z.level) bad(file, `heading ${i + 1}: level ${h.level} vs ${z.level}`);
    if (!z.id) bad(file, `heading ${i + 1} has no {#${h.id}}`);
    else if (z.id !== h.id) bad(file, `heading ${i + 1}: id {#${z.id}}, expected {#${h.id}}`);
  });
  if (fe.fences.length !== fz.fences.length) bad(file, `code blocks: ${fe.fences.length} vs ${fz.fences.length}`);
  else fe.fences.forEach((c, i) => { if (c !== fz.fences[i]) bad(file, `code block ${i + 1} differs from the English one`); });
  if (fe.tables.join() !== fz.tables.join()) bad(file, `table rows or columns differ (English ${fe.tables.length} rows, Chinese ${fz.tables.length})`);
  if (fe.links.join("\n") !== fz.links.join("\n")) {
    const a = new Set(fe.links), b = new Set(fz.links);
    bad(file, `links differ; missing: ${[...a].filter((x) => !b.has(x)).slice(0, 4).join(", ") || "-"}; extra: ${[...b].filter((x) => !a.has(x)).slice(0, 4).join(", ") || "-"}; counts ${fe.links.length} vs ${fz.links.length}`);
  }
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ce = count(fe.codes), cz = count(fz.codes);
  const missing = [...ce].filter(([k, n]) => (cz.get(k) || 0) < n).map(([k]) => k);
  const extra = [...cz].filter(([k, n]) => (ce.get(k) || 0) < n).map(([k]) => k);
  if (missing.length || extra.length) bad(file, `inline code differs; missing: ${missing.slice(0, 6).join(" | ") || "-"}; extra: ${extra.slice(0, 6).join(" | ") || "-"}`);
  if (fe.items !== fz.items) bad(file, `list items: ${fe.items} vs ${fz.items}`);
  if (fe.blocks !== fz.blocks) bad(file, `blocks (paragraphs, lists, tables, code): ${fe.blocks} vs ${fz.blocks}`);
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} problem(s) in ${checked} checked file(s)`);
  process.exit(1);
}
console.log(`ok: ${checked} Chinese page(s) match their English pages`);
