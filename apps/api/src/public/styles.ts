/**
 * D177: the one inline stylesheet of public pages. System fonts, a narrow column and logical
 * properties only (`margin-inline`, `padding-inline`), so RTL pages need no extra rules.
 */
export const PUBLIC_PAGE_CSS = `
:root{color-scheme:light dark;--fg:#1d1d1f;--muted:#6b6b70;--bg:#fbfbf8;--card:#fff;--line:#e3e3df;--accent:#2f6d4f}
@media (prefers-color-scheme:dark){:root{--fg:#ececec;--muted:#a0a0a6;--bg:#161618;--card:#202023;--line:#333337;--accent:#7fc6a2}}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Hebrew",sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:40rem;margin-inline:auto;padding:1.25rem 1rem 3rem}
header.site{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;margin-block-end:1.25rem}
header.site a.brand{font-weight:700;color:var(--fg);text-decoration:none}
a{color:var(--accent)}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 .5rem}
h2{font-size:1.15rem;margin:0 0 .25rem}
.muted{color:var(--muted);font-size:.9rem}
.note{border:1px solid var(--line);border-radius:.5rem;padding:.5rem .75rem;margin-block-end:1rem;font-size:.9rem}
nav.cats{display:flex;flex-wrap:wrap;gap:.5rem;margin-block:.75rem 1.25rem;padding:0;list-style:none}
nav.cats a{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:.15rem .7rem;text-decoration:none}
ul.cards{list-style:none;margin:0;padding:0;display:grid;gap:.75rem}
article.card,ul.cards li{background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:.9rem 1rem}
ul.cards li a.title{color:var(--fg);text-decoration:none;font-weight:600}
.body p{margin-block:.5rem}
.body img,figure img{max-width:100%;height:auto;border-radius:.5rem}
figure{margin:0}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{border:1px solid var(--line);padding:.35rem .5rem;text-align:start;vertical-align:top}
dl.calc{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem}
dl.calc dt{color:var(--muted)}
dl.calc dd{margin:0}
.result{font-size:1.25rem;font-weight:700}
.link-host{color:var(--muted);font-size:.85rem}
.pager{margin-block-start:1.25rem}
footer{margin-block-start:2rem;font-size:.85rem;color:var(--muted)}
`
  .trim()
  .replace(/\n/g, '');
