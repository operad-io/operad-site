# docs-zh

The Chinese translation of operad's user manual (`docs/user/*.md` in the operad
repository). One file per English page, same file names. `scripts/build-docs.mjs`
compiles these to `/zh/docs/`; this README is not published.

Rules the translators follow:

- Code blocks, inline code, link targets, URLs and error strings stay as in English.
- Every heading ends with the English heading's id, `## 标题 {#english-id}`, so
  links such as `dev.md#the-gate-and-its-checks` keep working.
- Same paragraphs, list items and table rows as the English page, in the same order.

When the English page changes, edit the matching file here, then run

    node scripts/check-docs-zh.mjs ../operad/docs/user

It lists every difference in structure: a dropped table row, a changed command, a
missing heading id, a link that no longer matches. It cannot judge the wording.
Then run `node scripts/build-docs.mjs ../operad/docs/user` and commit `docs-zh/`
and the generated `zh/docs/` together.

Last translated from operad at `7a2d6e1f` plus the dev page's opening section
(branch `dev-doc-workflow`).
