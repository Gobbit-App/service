/**
 * D230: extra rules for the landing page only, appended after 017's `PUBLIC_PAGE_CSS` (whose
 * variables give light and dark). Radios and buttons are at least 44 px tall; the honeypot sits
 * off-screen rather than `display:none`, which some bots skip.
 */
export const LANDING_CSS = `
.hero h1{font-size:2rem;margin-block-end:.75rem;position:relative}
.term{position:relative}
.definition::after{content:"";position:absolute;inset-inline:0;bottom:100%;height:.85rem}
.term dfn{font-style:normal;text-decoration:underline dotted var(--accent);text-decoration-thickness:.08em;text-underline-offset:.2em;cursor:help;border-radius:.2em}
.term dfn:focus-visible{outline:2px solid var(--accent);outline-offset:.15em}
.definition{display:block;position:absolute;z-index:10;top:calc(100% + .75rem);left:50%;width:min(22rem,calc(100vw - 2rem));padding:.9rem 1.1rem 1rem;background:var(--card);color:var(--fg);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:.6rem;box-shadow:0 14px 34px -10px rgb(0 0 0/.3),0 2px 6px rgb(0 0 0/.08);font:400 .95rem/1.5 Georgia,"Iowan Old Style","Palatino Linotype",serif;text-align:start;letter-spacing:normal;opacity:0;visibility:hidden;pointer-events:none;transform:translate(-50%,.4rem);transition:opacity .18s ease,transform .18s ease,visibility 0s linear .18s}
.definition::before{content:"";position:absolute;bottom:calc(100% + 3px);left:50%;margin-inline-start:-.5rem;border:.5rem solid transparent;border-bottom-color:var(--accent)}
.term:hover .definition,.term:focus-within .definition{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0);transition-delay:0s}
.definition>span{display:block}
.definition .headword{font-size:1.35rem;font-weight:700;letter-spacing:.01em}
.definition .pron{color:var(--muted)}
.definition .pos{font-style:italic;color:var(--muted);margin-block-end:.55rem;padding-block-end:.55rem;border-bottom:1px solid var(--line)}
.definition .senses{counter-reset:sense}
.definition .sense{display:block;position:relative;counter-increment:sense;padding-inline-start:1.4rem;margin-block:.3rem}
.definition .sense::before{content:counter(sense) ".";position:absolute;inset-inline-start:0;font-weight:700;color:var(--accent)}
.definition .example{font-style:italic;color:var(--muted);padding-inline-start:1.4rem;margin-block-start:.4rem}
.definition .origin{font-size:.82rem;color:var(--muted);margin-block-start:.65rem;padding-block-start:.5rem;border-top:1px dashed var(--line)}
@media (max-width:36rem){.term{position:static}.definition{left:0;width:100%;transform:translateY(.4rem)}.term:hover .definition,.term:focus-within .definition{transform:none}.definition::before{display:none}}
@media (prefers-reduced-motion:reduce){.definition{transition:none}}
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
form.join button{font:inherit;font-weight:600;min-height:44px;padding:.5rem 1rem;border:1px solid var(--accent);border-radius:.5rem;background:var(--accent);color:var(--on-accent);cursor:pointer}
form.join [aria-invalid=true]{border-color:var(--danger)}
.error{color:var(--danger);font-weight:400;font-size:.9rem;margin:0}
.notice{border:1px solid var(--danger);border-radius:.5rem;padding:.6rem .75rem;margin:0}
.hp{position:absolute;inset-inline-start:-10000px;width:1px;height:1px;overflow:hidden}
a.button{display:inline-flex;align-items:center;min-height:44px;padding:.5rem 1rem;border-radius:.5rem;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600}
`
  .trim()
  .replace(/\n/g, '');
