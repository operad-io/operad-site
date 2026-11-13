#!/usr/bin/env node
// Compiles operad's user docs into static pages in the site's own style
// (style.css + docs.css). No dependencies: needs only Node 18+ or Bun.
//
//   node scripts/build-docs.mjs [path/to/operad/docs/user]
//
// English: the source directory is the first argument, or $OPERAD_DOCS, or
//   ../operad/docs/user (operad's docs/user/*.md). Output: docs/.
// Chinese: docs-zh/*.md in this repository, one file per English page, same
//   file names. Output: zh/docs/. A page with no Chinese file is skipped there.
//   A heading carries the English heading's id as `## 标题 {#english-id}` so that
//   links such as `dev.md#the-gate-and-its-checks` keep working.
// It also rewrites sitemap.xml and llms.txt. Everything else is left alone.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://operad.io";
const REPO = "https://github.com/operad-io/operad";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(process.argv[2] || process.env.OPERAD_DOCS || join(root, "../operad/docs/user"));
const zhDir = join(root, "docs-zh");
const repoDir = resolve(srcDir, "../..");
if (!existsSync(join(srcDir, "index.md"))) {
  console.error(`no index.md in ${srcDir}; pass the path to operad's docs/user`);
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- locales ----------
const LOCALES = {
  en: {
    code: "en",
    htmlLang: "en",
    og: "en_US",
    dir: "docs",
    home: "",
    s: {
      siteDocs: "operad docs", overview: "Overview", docs: "Docs", homeLink: "Home", runIt: "Run it", onThisPage: "On this page",
      linkHere: "Link to this section", prevNext: "Previous and next", prev: "Previous", next: "Next", source: "View this page's source",
      homeAria: "operad, home", sections: "Sections", docsAria: "Documentation", defaultDesc: "The operad user manual.",
      other: "中文", otherLabel: "中文", footHome: "Home",
    },
  },
  zh: {
    code: "zh",
    htmlLang: "zh-CN",
    og: "zh_CN",
    dir: "zh/docs",
    home: "zh/",
    s: {
      siteDocs: "operad 文档", overview: "概览", docs: "文档", homeLink: "首页", runIt: "开始用", onThisPage: "本页目录",
      linkHere: "链接到本节", prevNext: "上一页和下一页", prev: "上一页", next: "下一页", source: "查看英文原文",
      homeAria: "operad，回到首页", sections: "章节", docsAria: "文档", defaultDesc: "operad 用户手册。",
      other: "EN", otherLabel: "English", footHome: "首页",
    },
  },
};

// ---------- read the pages ----------
function readPages(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    let text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
    let description = "";
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (m) {
      const d = m[1].match(/^description:\s*(.*)$/m);
      if (d) description = d[1].trim();
      text = text.slice(m[0].length);
    }
    const slug = file === "index.md" ? "" : file.replace(/\.md$/, "");
    const title = (text.match(/^#\s+(.+?)(\s*\{#[\w-]+\})?\s*$/m) || [, slug])[1].replace(/`/g, "");
    out[file] = { file, slug, title, description, body: text };
  }
  return out;
}
const PAGES = { en: readPages(srcDir), zh: readPages(zhDir) };

// Sidebar order: index first, then the order of the English index page's "Pages" list.
const order = ["index.md"];
for (const m of PAGES.en["index.md"].body.matchAll(/\]\(([\w-]+\.md)\)/g)) {
  if (PAGES.en[m[1]] && !order.includes(m[1])) order.push(m[1]);
}
for (const f of Object.keys(PAGES.en)) if (!order.includes(f)) order.push(f);

// ---------- markdown ----------
function slugify(text, seen) {
  let s = text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-");
  if (!s) s = "section";
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n ? `${s}-${n}` : s;
}

const pageUrl = (L, slug) => `${SITE}/${L.dir}/${slug ? slug + "/" : ""}`;
const rootPrefixFor = (L, page) => "../".repeat(L.dir.split("/").length + (page.slug ? 1 : 0));

// Where a link inside a doc page goes.
function rewriteHref(url, L, rootPrefix) {
  if (/^(https?:|mailto:)/.test(url)) return url;
  if (url.startsWith("#")) return url;
  const [pathPart, hash] = url.split("#");
  const abs = resolve(srcDir, pathPart);
  const rel = relative(srcDir, abs);
  const frag = hash ? `#${hash}` : "";
  if (!rel.startsWith("..") && PAGES.en[rel]) {
    const useL = PAGES[L.code][rel] ? L : LOCALES.en;
    const slug = PAGES.en[rel].slug;
    return `${rootPrefix}${useL.dir}/${slug ? slug + "/" : ""}${frag}`;
  }
  const inRepo = relative(repoDir, abs);
  if (inRepo.startsWith("..")) return url;
  const isDir = !/\.[A-Za-z0-9]+$/.test(inRepo);
  return `${REPO}/${isDir ? "tree" : "blob"}/main/${inRepo}${frag}`;
}

function inline(s, L, rootPrefix) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, u) => `<a href="${u}">${u}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(rewriteHref(u.replace(/&amp;/g, "&"), L, rootPrefix))}">${t}</a>`);
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

function render(page, L, rootPrefix) {
  const lines = page.body.split("\n");
  const out = [];
  const seen = new Map();
  const headings = [];
  const inl = (s) => inline(s, L, rootPrefix);
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
      let text = m[2];
      let id = null;
      const im = text.match(/^(.*?)\s*\{#([\w-]+)\}$/);
      if (im) { text = im[1]; id = im[2]; seen.set(id, (seen.get(id) || 0) + 1); }
      if (!id) id = slugify(text, seen);
      if (level === 2 || level === 3) headings.push({ level, id, text: text.replace(/`/g, "") });
      out.push(`<h${level} id="${id}">${inl(text)}${level > 1 ? `<a class="anchor" href="#${id}" aria-label="${esc(L.s.linkHere)}">#</a>` : ""}</h${level}>`);
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
  '<svg viewBox="5 2 38 42" width="30" height="33" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.15"><path d="M23.06 32.49L16.75 22.44M26.40 31.52L26.40 22.98M29.74 32.49L36.05 22.44M13.59 16.28L11.13 10.23M16.23 16.29L18.75 10.23"/><circle cx="26.4" cy="37.8" r="5.7"/><circle cx="14.9" cy="19.5" r="2.9"/><circle cx="26.4" cy="19.5" r="2.9"/><circle cx="37.9" cy="19.5" r="2.9"/><circle cx="9.9" cy="7.2" r="2.7"/><circle cx="20.0" cy="7.2" r="2.7"/></g></svg>';

function pageHtml(L, page) {
  const pages = PAGES[L.code];
  const otherL = L.code === "en" ? LOCALES.zh : LOCALES.en;
  const S = L.s;
  const rootPrefix = rootPrefixFor(L, page);
  const docsPrefix = page.slug ? "../" : "";
  const { html, headings } = render(page, L, rootPrefix);
  const url = pageUrl(L, page.slug);
  const title = page.slug ? `${page.title} · ${S.siteDocs}` : S.siteDocs;
  const desc = page.description || S.defaultDesc;
  const here = order.filter((f) => pages[f]);
  const pos = here.indexOf(page.file);
  const prev = pos > 0 ? pages[here[pos - 1]] : null;
  const next = pos < here.length - 1 ? pages[here[pos + 1]] : null;
  const link = (p) => `${docsPrefix}${p.slug ? p.slug + "/" : ""}`;
  const label = (p) => (p.file === "index.md" ? S.overview : p.title);
  const nav = here
    .map((f) => `<li><a href="${link(pages[f])}"${f === page.file ? ' aria-current="page"' : ""}>${esc(label(pages[f]))}</a></li>`)
    .join("\n        ");
  const toc =
    headings.length > 2
      ? `<nav class="toc" aria-label="${esc(S.onThisPage)}"><p class="s3">${esc(S.onThisPage)}</p><ul>${headings
          .map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
          .join("")}</ul></nav>`
      : "";
  // The same page in the other language, or that language's docs index.
  const counterpart = PAGES[otherL.code][page.file] ? page : PAGES[otherL.code]["index.md"] ? PAGES[otherL.code]["index.md"] : null;
  const counterHref = counterpart
    ? `${rootPrefix}${otherL.dir}/${counterpart.slug ? counterpart.slug + "/" : ""}`
    : null;
  const alternates = [];
  if (PAGES.en[page.file]) alternates.push(`<link rel="alternate" hreflang="en" href="${pageUrl(LOCALES.en, page.slug)}">`);
  if (PAGES.zh[page.file]) alternates.push(`<link rel="alternate" hreflang="zh-CN" href="${pageUrl(LOCALES.zh, page.slug)}">`);
  if (PAGES.en[page.file]) alternates.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl(LOCALES.en, page.slug)}">`);
  const langToggle = counterHref
    ? `\n    <a class="gh lang" href="${counterHref}" hreflang="${otherL.htmlLang}" lang="${otherL.htmlLang}" aria-label="${esc(S.otherLabel)}" title="${esc(S.otherLabel)}">${
        L.code === "en" ? "<b>EN</b><i>/</i><span>中</span>" : "<span>EN</span><i>/</i><b>中</b>"
      }</a>`
    : "";
  const sourceHref = `${REPO}/blob/main/docs/user/${page.file}`;
  const ld = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.title,
      description: desc,
      inLanguage: L.htmlLang,
      url,
      isPartOf: { "@type": "WebSite", name: "operad", url: `${SITE}/` },
    },
    null,
    1,
  );
  return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="${url}">
${alternates.join("\n")}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#fcfcfb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d0d11" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="operad">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${L.og}">
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
  <a class="tile logo" href="${rootPrefix}${L.home}" aria-label="${esc(S.homeAria)}">${LOGO_SVG}</a>
  <nav class="tile links" aria-label="${esc(S.sections)}">
    <a href="${rootPrefix}${L.home}">${S.homeLink}</a>
    <a href="${docsPrefix || "./"}" aria-current="true">${S.docs}</a>
    <a class="gh end" href="${REPO}" aria-label="GitHub" title="GitHub">${GH_SVG}</a>
    <a class="gh" href="https://x.com/zyinghai" aria-label="X" title="X">${X_SVG}</a>${langToggle}
  </nav>
  <a class="tile go" href="${rootPrefix}${L.home}#install">${S.runIt}</a>
</header>

<div class="docs">
  <aside class="tile side" aria-label="${esc(S.docsAria)}">
    <details class="side-nav" open>
      <summary class="s3">${S.docs}</summary>
      <ul>
        ${nav}
      </ul>
    </details>
  </aside>
  <script>if (matchMedia("(max-width: 900px)").matches) document.querySelector(".side-nav").removeAttribute("open")</script>

  <main class="tile paper doc" id="top">
${html}
    <p class="src"><a href="${sourceHref}">${S.source}</a></p>
    <nav class="pn" aria-label="${esc(S.prevNext)}">
      ${prev ? `<a class="prev" href="${link(prev)}"><small>${S.prev}</small>${esc(label(prev))}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="${link(next)}"><small>${S.next}</small>${esc(label(next))}</a>` : "<span></span>"}
    </nav>
  </main>
  ${toc ? `<aside class="tile toc-wrap">${toc}</aside>` : ""}
</div>

<footer class="foot docs-foot">
  <p class="fnote">operad.io · <a href="${rootPrefix}${L.home}">${S.footHome}</a> · <a href="${REPO}">GitHub</a></p>
</footer>

</body>
</html>
`;
}

// ---------- write ----------
const built = {};
for (const L of Object.values(LOCALES)) {
  const outDir = join(root, L.dir);
  rmSync(outDir, { recursive: true, force: true });
  built[L.code] = [];
  for (const f of order) {
    const page = PAGES[L.code][f];
    if (!page) continue;
    const dir = page.slug ? join(outDir, page.slug) : outDir;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), pageHtml(L, page));
    built[L.code].push(f);
  }
}

const today = new Date().toISOString().slice(0, 10);
const altLinks = (en, zh) =>
  [en && `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`, zh && `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zh}"/>`, en && `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`]
    .filter(Boolean)
    .join("\n") + "\n";
const entries = [
  `  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${today}</lastmod>\n${altLinks(`${SITE}/`, `${SITE}/zh/`)}  </url>`,
  `  <url>\n    <loc>${SITE}/zh/</loc>\n    <lastmod>${today}</lastmod>\n${altLinks(`${SITE}/`, `${SITE}/zh/`)}  </url>`,
];
for (const f of order) {
  const en = PAGES.en[f], zh = PAGES.zh[f];
  if (en) entries.push(`  <url>\n    <loc>${pageUrl(LOCALES.en, en.slug)}</loc>\n    <lastmod>${today}</lastmod>\n${altLinks(pageUrl(LOCALES.en, en.slug), zh && pageUrl(LOCALES.zh, zh.slug))}  </url>`);
  if (zh) entries.push(`  <url>\n    <loc>${pageUrl(LOCALES.zh, zh.slug)}</loc>\n    <lastmod>${today}</lastmod>\n${altLinks(en && pageUrl(LOCALES.en, en.slug), pageUrl(LOCALES.zh, zh.slug))}  </url>`);
}
writeFileSync(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`,
);

const zhIndex = PAGES.zh["index.md"];
writeFileSync(
  join(root, "llms.txt"),
  `# operad

> operad runs coding agents through verified flows: plan, work, verify, review, merge. The kernel has three words (flow, pending, history); everything else is a plugin. operad is in development.

## Pages

- [operad.io (English)](${SITE}/): the loop, the kernel, the terminal, Claude Code and iPhone clients, how to run it
- [operad.io/zh (中文)](${SITE}/zh/): the same page in Chinese

## Documentation

${order.map((f) => `- [${f === "index.md" ? "Overview" : PAGES.en[f].title}](${pageUrl(LOCALES.en, PAGES.en[f].slug)}): ${PAGES.en[f].description}`).join("\n")}
${zhIndex ? `\nThe same documentation in Chinese (中文文档): [${SITE}/zh/docs/](${SITE}/zh/docs/)\n` : ""}
## Source

- [GitHub](${REPO}): the operad repository
`,
);

console.log(`built ${built.en.length} English and ${built.zh.length} Chinese pages from ${srcDir}`);
