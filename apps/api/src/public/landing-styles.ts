/**
 * D230: extra rules for the landing page only, appended after 017's `PUBLIC_PAGE_CSS` (whose
 * variables give light and dark). Radios and buttons are at least 44 px tall; the honeypot sits
 * off-screen rather than `display:none`, which some bots skip.
 */
export const LANDING_CSS = `
.hero h1{font-size:2rem;margin-block-end:.75rem}
.hero p{margin-block:.5rem}
ul.uses{list-style:none;margin:1.5rem 0;padding:0;display:grid;gap:.75rem}
ul.uses li{background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:.9rem 1rem}
.status{border:1px solid var(--accent);border-radius:.75rem;padding:.9rem 1rem;margin-block:1rem}
.status h2{margin-block-end:.25rem}
form.join{display:grid;gap:1rem;background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:1rem;margin-block:1.5rem}
form.join h2{margin:0}
form.join label.field{display:grid;gap:.35rem;font-weight:600}
form.join input[type=email],form.join textarea{font:inherit;font-weight:400;min-height:44px;padding:.5rem .65rem;border:1px solid var(--line);border-radius:.5rem;background:var(--bg);color:var(--fg)}
form.join textarea{min-height:5rem;resize:vertical}
form.join fieldset{border:0;margin:0;padding:0;display:grid;gap:.25rem}
form.join legend{font-weight:600;padding:0;margin-block-end:.35rem}
form.join label.choice{display:flex;align-items:center;gap:.6rem;min-height:44px;padding-inline:.25rem;cursor:pointer}
form.join input[type=radio]{width:1.25rem;height:1.25rem;margin:0;accent-color:var(--accent)}
form.join button{font:inherit;font-weight:600;min-height:44px;padding:.5rem 1rem;border:1px solid var(--accent);border-radius:.5rem;background:var(--accent);color:var(--bg);cursor:pointer}
form.join [aria-invalid=true]{border-color:#b3261e}
.error{color:#b3261e;font-weight:400;font-size:.9rem;margin:0}
.notice{border:1px solid #b3261e;border-radius:.5rem;padding:.6rem .75rem;margin:0}
.hp{position:absolute;inset-inline-start:-10000px;width:1px;height:1px;overflow:hidden}
a.button{display:inline-flex;align-items:center;min-height:44px;padding:.5rem 1rem;border-radius:.5rem;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:600}
`
  .trim()
  .replace(/\n/g, '');
