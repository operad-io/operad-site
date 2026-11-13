#!/usr/bin/env node
// Compiles operad's user docs (docs/user/*.md in the operad repository) into
// static pages under docs/, in the site's own style (style.css + docs.css).
// No dependencies: needs only Node 18+ or Bun.
//
//   node scripts/build-docs.mjs [path/to/operad/docs/user]
//
// The source directory is the first argument, or $OPERAD_DOCS, or ../operad/docs/user.
// It rewrites docs/, sitemap.xml and llms.txt. Everything else is left alone.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://operad.io";
const REPO = "https://github.com/operad-io/operad";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(process.argv[2] || process.env.OPERAD_DOCS || join(root, "../operad/docs/user"));
const repoDir = resolve(srcDir, "../..");
if (!existsSync(join(srcDir, "index.md"))) {
  console.error(`no index.md in ${srcDir}; pass the path to operad's docs/user`);
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- read the pages ----------
function readPage(file) {
  let text = readFileSync(join(srcDir, file), "utf8").replace(/\r\n/g, "\n");
  let description = "";
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (m) {
    const d = m[1].match(/^description:\s*(.*)$/m);
    if (d) description = d[1].trim();
    text = text.slice(m[0].length);
  }
  const slug = file === "index.md" ? "" : file.replace(/\.md$/, "");
  const title = (text.match(/^#\s+(.+)$/m) || [, slug])[1].replace(/`/g, "");
  return { file, slug, title, description, body: text };
}
const files = readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort();
const pages = Object.fromEntries(files.map((f) => [f, readPage(f)]));

// Sidebar order: index first, then the order of the index page's "Pages" list.
const order = ["index.md"];
for (const m of pages["index.md"].body.matchAll(/\]\(([\w-]+\.md)\)/g)) {
  if (pages[m[1]] && !order.includes(m[1])) order.push(m[1]);
}
for (const f of files) if (!order.includes(f)) order.push(f);

// ---------- markdown ----------
function slugify(text, seen) {
  let s = text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-");
  if (!s) s = "section";
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n ? `${s}-${n}` : s;
}

// Where a link from a doc page goes. `from` is the page's output directory depth.
function rewriteHref(url, page, rootPrefix) {
  if (/^(https?:|mailto:)/.test(url)) return url;
  if (url.startsWith("#")) return url;
  const [pathPart, hash] = url.split("#");
  const abs = resolve(srcDir, pathPart);
  const rel = relative(srcDir, abs);
  const frag = hash ? `#${hash}` : "";
  if (!rel.startsWith("..") && pages[rel]) {
    const target = pages[rel].slug;
    return `${rootPrefix}docs/${target ? target + "/" : ""}${frag}`;
  }
  const inRepo = relative(repoDir, abs);
  if (inRepo.startsWith("..")) return url;
  const isDir = !/\.[A-Za-z0-9]+$/.test(inRepo);
  return `${REPO}/${isDir ? "tree" : "blob"}/main/${inRepo}${frag}`;
}

function inline(s, page, rootPrefix) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, u) => `<a href="${u}">${u}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(rewriteHref(u.replace(/&amp;/g, "&"), page, rootPrefix))}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function render(page, rootPrefix) {
  const lines = page.body.split("\n");
  const out = [];
  const seen = new Map();
  const headings = [];
  const inl = (s) => inline(s, page, rootPrefix);
  let i = 0;
  const isBlockStart = (l, next) =>
    /^```/.test(l) || /^#{1,6}\s/.test(l) || /^---+\s*$/.test(l) || /^[-*]\s/.test(l) || /^\d+\.\s/.test(l) ||
    /^<!--/.test(l) || (/^\|/.test(l) && next !== undefined && /^\|?\s*:?-{2,}/.test(next));
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^<!--.*-->\s*$/.test(line)) { i++; continue; }
    let m;
    if ((m = line.match(/^```\s*(\S*)/))) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre data-ui><code${m[1] ? ` class="lang-${esc(m[1])}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const level = m[1].length;
      const text = m[2];
      const id = slugify(text, seen);
      if (level === 2 || level === 3) headings.push({ level, id, text: text.replace(/`/g, "") });
      out.push(`<h${level} id="${id}">${inl(text)}${level > 1 ? `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a>` : ""}</h${level}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join("")}</tr>`).join("") +
          `</tbody></table></div>`,
      );
      continue;
    }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const marker = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length) {
        if (marker.test(lines[i])) {
          items.push([lines[i].replace(marker, "")]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1].push(lines[i].trim());
          i++;
        } else if (/^\s*$/.test(lines[i]) && i + 1 < lines.length && marker.test(lines[i + 1])) {
          i++;
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inl(it.join(" "))}</li>`).join("")}</${tag}>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && (buf.length === 0 || !isBlockStart(lines[i], lines[i + 1]))) buf.push(lines[i++].trim());
    out.push(`<p>${inl(buf.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings };
}

// ---------- page chrome ----------
const GH_SVG =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';
const X_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const LOGO_SVG =
  '<svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 38V14M24 38 10 16M24 38 38 16"/><circle cx="10" cy="14" r="4"/><circle cx="24" cy="12" r="4"/><circle cx="38" cy="14" r="4"/></g><circle cx="24" cy="38" r="5" fill="currentColor"/></svg>';

function pageHtml(page, index) {
  const depth = page.slug ? 2 : 1; // docs/<slug>/index.html or docs/index.html
  const rootPrefix = "../".repeat(depth);
  const docsPrefix = page.slug ? "../" : "";
  const { html, headings } = render(page, rootPrefix);
  const url = `${SITE}/docs/${page.slug ? page.slug + "/" : ""}`;
  const title = page.slug ? `${page.title} · operad docs` : "operad docs";
  const desc = page.description || "The operad user manual.";
  const pos = order.indexOf(page.file);
  const prev = pos > 0 ? pages[order[pos - 1]] : null;
  const next = pos < order.length - 1 ? pages[order[pos + 1]] : null;
  const link = (p) => `${docsPrefix}${p.slug ? p.slug + "/" : ""}`;
  const nav = order
    .map((f) => {
      const p = pages[f];
      const label = f === "index.md" ? "Overview" : p.title;
      return `<li><a href="${link(p)}"${f === page.file ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
    })
    .join("\n        ");
  const toc =
    headings.length > 2
      ? `<nav class="toc" aria-label="On this page"><p class="s3">On this page</p><ul>${headings
          .map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
          .join("")}</ul></nav>`
      : "";
  const ld = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.title,
      description: desc,
      inLanguage: "en",
      url,
      isPartOf: { "@type": "WebSite", name: "operad", url: `${SITE}/` },
    },
    null,
    1,
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#fcfcfb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d0d11" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="operad">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<script type="application/ld+json">
${ld}
</script>
<link rel="icon" href="${rootPrefix}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${rootPrefix}style.css">
<link rel="stylesheet" href="${rootPrefix}docs.css">
</head>
<body>

<header class="top board">
  <a class="tile logo" href="${rootPrefix}" aria-label="operad, home">${LOGO_SVG}</a>
  <nav class="tile links" aria-label="Sections">
    <a href="${rootPrefix}">Home</a>
    <a href="${docsPrefix || "./"}" aria-current="true">Docs</a>
    <a class="gh end" href="${REPO}" aria-label="GitHub" title="GitHub">${GH_SVG}</a>
    <a class="gh" href="https://x.com/zyinghai" aria-label="X" title="X">${X_SVG}</a>
  </nav>
  <a class="tile go" href="${rootPrefix}#install">Run it</a>
</header>

<div class="docs">
  <aside class="tile side" aria-label="Documentation">
    <details class="side-nav" open>
      <summary class="s3">Docs</summary>
      <ul>
        ${nav}
      </ul>
    </details>
  </aside>
  <script>if (matchMedia("(max-width: 900px)").matches) document.querySelector(".side-nav").removeAttribute("open")</script>

  <main class="tile paper doc" id="top">
${html}
    <p class="src"><a href="${REPO}/blob/main/docs/user/${page.file}">View this page's source</a></p>
    <nav class="pn" aria-label="Previous and next">
      ${prev ? `<a class="prev" href="${link(prev)}"><small>Previous</small>${esc(prev.file === "index.md" ? "Overview" : prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="${link(next)}"><small>Next</small>${esc(next.title)}</a>` : "<span></span>"}
    </nav>
  </main>
  ${toc ? `<aside class="tile toc-wrap">${toc}</aside>` : ""}
</div>

<footer class="foot docs-foot">
  <p class="fnote">operad.io · <a href="${rootPrefix}">Home</a> · <a href="${REPO}">GitHub</a></p>
</footer>

</body>
</html>
`;
}

// ---------- write ----------
const outDir = join(root, "docs");
rmSync(outDir, { recursive: true, force: true });
for (const f of order) {
  const page = pages[f];
  const dir = page.slug ? join(outDir, page.slug) : outDir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), pageHtml(page));
}

const today = new Date().toISOString().slice(0, 10);
const alt = (en, zh) =>
  `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/>\n    <xhtml:link rel="alternate" hreflang="zh-CN" href="${SITE}/zh/"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>\n`;
const docUrls = order.map((f) => `${SITE}/docs/${pages[f].slug ? pages[f].slug + "/" : ""}`);
writeFileSync(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
${alt()}  </url>
  <url>
    <loc>${SITE}/zh/</loc>
    <lastmod>${today}</lastmod>
${alt()}  </url>
${docUrls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n")}
</urlset>
`,
);

writeFileSync(
  join(root, "llms.txt"),
  `# operad

> operad runs coding agents through verified flows: plan, work, verify, review, merge. The kernel has three words (flow, pending, history); everything else is a plugin. operad is in development.

## Pages

- [operad.io (English)](${SITE}/): the loop, the kernel, the terminal, Claude Code and iPhone clients, how to run it
- [operad.io/zh (中文)](${SITE}/zh/): the same page in Chinese

## Documentation

${order.map((f) => `- [${f === "index.md" ? "Overview" : pages[f].title}](${SITE}/docs/${pages[f].slug ? pages[f].slug + "/" : ""}): ${pages[f].description}`).join("\n")}

## Source

- [GitHub](${REPO}): the operad repository
`,
);

console.log(`built ${order.length} pages from ${srcDir}`);
