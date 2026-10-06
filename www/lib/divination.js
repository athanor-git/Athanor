/* Athanor — tarot divination meanings, with your own edits.
 *
 * Needs ../lib/store.js loaded first, and the content tables for the card names (../../data/db/core.js and
 * ../lib/db.js: loaded here when the page has not loaded them). Data: ../../data/divination.json
 *   { source: {...}, cards: { "<key>": { name, bookTName, meaning, wellDignified, illDignified, keywords, brief, source } } }
 * Card keys: "atu-0".."atu-21"; "<suit>-<1..10>" and "<suit>-knight|queen|prince|princess" (suit: wands|cups|swords|disks).
 * Your edits are Store records of kind "divination" (id = card key, data = {keywords, brief, meaning, notes});
 * one more record there, id "_personal", keeps the stamp of the last automatic import of your document.
 *
 *   await Div.ready                 data loaded (resolves even if the file is missing)
 *   Div.card(key)                   -> { orig, mine, eff }   eff = your edit where present, else the original
 *   Div.render(el, key, {name})     draws the meaning panel with Edit / Reset into el
 *   Div.keyFromParts({major, suit, rank})  helper: major atu number, or suit + rank (1-10 | knight|queen|prince|princess)
 *   Div.importButton(el, onDone)    "Import meanings…" — reads your own .docx/.txt/.md into your meanings
 *                                   (card names as headings; the text under each becomes "My reading")
 */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let DATA = { cards: {}, source: {} };
  let mine = {};
  // Store record (kind "divination") holding the stamp of the last automatic import of the personal document
  const STAMP_ID = '_personal';

  function loadMine() {
    mine = {};
    try { (window.Store ? Store.list('divination') : []).forEach(r => { if (r.id !== STAMP_ID) mine[r.id] = r.data || {}; }); } catch (e) {}
  }

  // the card names that headings may use come from the content tables: data/db/core.js and ../lib/db.js, loaded here
  // when the page has not loaded them itself
  const here = document.currentScript && document.currentScript.src;
  const script = src => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = here ? new URL(src, here).href : src;
    s.onload = ok; s.onerror = () => no(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  const tables = (window.DB ? Promise.resolve() : script('../../data/db/core.js').then(() => script('db.js')))
    .catch(e => console.error('divination.js: ' + e.message));

  const ready = fetch('../../data/divination.json').then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { if (d && d.cards) DATA = d; loadMine(); })
    .then(() => tables)
    .then(() => autoImportPersonal().catch(() => {}));

  function card(key) {
    const orig = DATA.cards[key] || {};
    const m = mine[key] || null;
    const pick = f => (m && m[f] && String(m[f]).trim()) ? m[f] : (orig[f] || '');
    const meaning = (m && m.meaning) || '';
    return { orig, mine: m, eff: { keywords: pick('keywords'), brief: pick('brief'), meaning, notes: (m && m.notes) || '',
      // true while the reading is still exactly the text from the user's document
      fromDocument: !!(m && m.docMeaning && meaning === m.docMeaning) } };
  }

  function save(key, name, fields) {
    const o = DATA.cards[key] || {};
    const prev = mine[key] || {};
    const clean = {
      keywords: (fields.keywords || '').trim(), brief: (fields.brief || '').trim(),
      meaning: (fields.meaning || '').trim(), notes: (fields.notes || '').trim(),
      // the version from the user's own document, kept so "Reset" can return to it
      docMeaning: fields.docMeaning != null ? fields.docMeaning : (prev.docMeaning || ''),
      docKeywords: fields.docKeywords != null ? fields.docKeywords : (prev.docKeywords || ''),
    };
    // don't store copies of the built-in text: an unchanged field means "use the original"
    if (clean.keywords === (o.keywords || '')) clean.keywords = '';
    if (clean.brief === (o.brief || '')) clean.brief = '';
    const empty = !clean.keywords && !clean.brief && !clean.meaning && !clean.notes && !clean.docMeaning;
    try {
      if (empty) Store.remove('divination', key);
      else Store.put('divination', { id: key, name: name || o.name || key, data: clean });
    } catch (e) { alert('Could not save: ' + e.message); return false; }
    loadMine();
    return true;
  }

  // Back to the user's document version if there is one, otherwise to the built-in meaning
  function reset(key) {
    const m = mine[key];
    if (m && m.docMeaning) save(key, null, { keywords: m.docKeywords || '', brief: '', meaning: m.docMeaning, notes: '' });
    else { try { Store.remove('divination', key); } catch (e) {} loadMine(); }
  }

  /* The user's own document of meanings, bundled with their build as assets/personal/meanings.docx,
     is read into their meanings automatically on first start and again whenever the file changes.
     Their notes, "In brief" and any reading or keywords they changed in the app are kept; only the
     document's own text is refreshed (so "Reset to your document" offers the new version). */
  async function autoImportPersonal() {
    let buf;
    try {
      const r = await fetch('../../personal/meanings.docx', { cache: 'no-store' });
      if (!r.ok) return;
      buf = await r.arrayBuffer();
    } catch (e) { return; }
    let stamp = String(buf.byteLength);
    try {
      const h = await crypto.subtle.digest('SHA-256', buf);
      stamp = [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {}
    // the stamp lives in the Store beside the meanings, so it cannot drift from them
    let done = '';
    try { const r = Store.get('divination', STAMP_ID); done = (r && r.data && r.data.stamp) || ''; } catch (e) {}
    if (done === stamp) return;
    const found = parseMeanings(await documentParagraphs(new File([buf], 'meanings.docx')));
    for (const [key, f] of Object.entries(found)) {
      const m = mine[key] || {};
      // changed in the app = differs from the document text it was imported from (or no document text yet)
      const ownMeaning = (m.meaning || '') !== (m.docMeaning || ''), ownKeywords = !!m.keywords && m.keywords !== (m.docKeywords || '');
      save(key, (DATA.cards[key] || {}).name || key, {
        keywords: ownKeywords ? m.keywords : (f.keywords || m.keywords || ''), brief: m.brief || '',
        meaning: ownMeaning ? m.meaning : f.meaning, notes: m.notes || '',
        docMeaning: f.meaning, docKeywords: f.keywords || '',
      });
    }
    try { Store.put('divination', { id: STAMP_ID, name: 'Your document — last import', data: { stamp } }); } catch (e) {}
    try { localStorage.removeItem('l777div.personal'); } catch (e) {}   // where earlier builds kept the stamp
  }

  function injectStyle() {
    if (document.getElementById('dv-style')) return;
    const s = document.createElement('style'); s.id = 'dv-style';
    s.textContent = `.dv{margin-top:10px;border-top:1px solid var(--line,#ddd);padding-top:10px;font-size:14px;line-height:1.5}
.dv .dv-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dv .dv-t{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--acc,#7a5c2e);font-weight:700}
.dv .dv-ed{font-size:10px;border:1px solid var(--acc,#7a5c2e);color:var(--acc,#7a5c2e);border-radius:8px;padding:0 6px}
.dv .dv-kw{font-weight:650;margin:4px 0}
.dv .dv-p{margin:4px 0}
.dv .dv-sub{color:var(--sub,#666);font-size:12.5px}
.dv details{margin-top:6px}.dv summary{cursor:pointer;color:var(--acc,#7a5c2e);font-size:13px;font-weight:600}
.dv .dv-bt{font-family:Georgia,'Times New Roman',serif;font-size:14.5px;margin:6px 0}
.dv .dv-btn{border:1px solid var(--line,#ccc);background:var(--card,#fff);color:var(--ink,#111);border-radius:8px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}
.dv .dv-btn.pri{background:var(--acc,#7a5c2e);border-color:var(--acc,#7a5c2e);color:#fff}
.dv .dv-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dv label{display:block;font-size:12px;color:var(--sub,#666);margin:8px 0 3px}
.dv input,.dv textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:8px;border:1px solid var(--line,#ccc);border-radius:8px;background:var(--card,#fff);color:var(--ink,#111)}
.dv textarea{min-height:70px;resize:vertical}`;
    document.head.appendChild(s);
  }

  function render(el, key, opts) {
    injectStyle();
    opts = opts || {};
    const name = opts.name || (DATA.cards[key] || {}).name || key;
    const { orig, mine: m, eff } = card(key);
    const edited = !!m;
    // Book T's own wording often starts "If ill dignified—…"; the label already says so
    const dign = s => String(s || '').replace(/^\s*(but\s+)?(if\s+|when\s+)?(very\s+)?(ill|well|bad(ly)?)[\s-]+dignified[\s,:;—–-]*/i, '')
      .replace(/^\s*but\s+with\s+(very\s+)?(bad|good)\s+dignity\s+(it\s+means\s+)?/i, '')
      .replace(/^./, c => c.toUpperCase());
    const bookT = orig.meaning ? `<details${opts.openBookT ? ' open' : ''}><summary>Book T — Golden Dawn (Equinox I:8, 1912)</summary>
        ${orig.bookTName ? `<div class="dv-sub">${esc(orig.bookTName)}</div>` : ''}
        <div class="dv-bt">${esc(orig.meaning)}</div>
        ${orig.wellDignified ? `<div class="dv-p"><b>Well dignified:</b> ${esc(dign(orig.wellDignified))}</div>` : ''}
        ${orig.illDignified ? `<div class="dv-p"><b>Ill dignified:</b> ${esc(dign(orig.illDignified))}</div>` : ''}</details>` : '';
    el.innerHTML = `<div class="dv">
      <div class="dv-h"><span class="dv-t">Divination</span>${edited && !(eff.fromDocument && !m.notes && !(m.brief || '').trim()) ? '<span class="dv-ed">your version</span>' : ''}</div>
      ${eff.keywords ? `<div class="dv-kw">${esc(eff.keywords)}</div>` : ''}
      ${eff.brief ? `<div class="dv-p">${esc(eff.brief)}</div>` : ''}
      ${eff.meaning ? `<div class="dv-p dv-mine"><span class="dv-sub">${eff.fromDocument ? 'From your document:' : 'My reading:'}</span> ${esc(eff.meaning).replace(/\n\n/g, '<br><br>')}</div>` : ''}
      ${eff.notes ? `<div class="dv-p"><span class="dv-sub">My notes:</span> ${esc(eff.notes)}</div>` : ''}
      ${!eff.keywords && !eff.brief && !orig.meaning ? '<div class="dv-sub">No meaning loaded for this card yet — add your own with Edit.</div>' : ''}
      ${bookT}
      <div class="dv-row"><button class="dv-btn" data-a="edit">✎ Edit</button>${edited && !(eff.fromDocument && !m.notes && !(m.brief || '').trim() && (m.keywords || '') === (m.docKeywords || '')) ? `<button class="dv-btn" data-a="reset">${m.docMeaning ? 'Reset to your document' : 'Reset to original'}</button>` : ''}</div>
    </div>`;
    el.onclick = ev => {
      const a = ev.target.closest('[data-a]'); if (!a) return;
      ev.stopPropagation();
      if (a.dataset.a === 'edit') edit(el, key, name, opts);
      if (a.dataset.a === 'reset' && confirm((mine[key] && mine[key].docMeaning)
          ? 'Undo your changes to "' + name + '" and go back to the text from your document?'
          : 'Remove your version of "' + name + '" and show the original again?')) { reset(key); render(el, key, opts); if (opts.onChange) opts.onChange(key); }
    };
  }

  function edit(el, key, name, opts) {
    const { orig, eff, mine: m } = card(key);
    el.innerHTML = `<div class="dv">
      <div class="dv-h"><span class="dv-t">Edit divination — ${esc(name)}</span></div>
      <label>Keywords</label><input data-f="keywords" value="${esc(eff.keywords)}" placeholder="${esc(orig.keywords || 'a few words')}">
      <label>In brief</label><textarea data-f="brief" placeholder="${esc(orig.brief || 'one or two sentences')}">${esc(eff.brief)}</textarea>
      <label>My reading (your own meaning — shown alongside)</label><textarea data-f="meaning" placeholder="Write the meaning in your own words…">${esc(m && m.meaning || '')}</textarea>
      <label>My notes</label><textarea data-f="notes" placeholder="Anything you want to remember about this card…">${esc(m && m.notes || '')}</textarea>
      ${orig.meaning ? `<details><summary>Book T for reference</summary><div class="dv-bt">${esc(orig.meaning)}</div></details>` : ''}
      <div class="dv-row"><button class="dv-btn pri" data-a="save">Save</button><button class="dv-btn" data-a="cancel">Cancel</button></div>
    </div>`;
    const first = el.querySelector('textarea[data-f="brief"]'); if (first) first.focus();
    el.onclick = ev => {
      const a = ev.target.closest('[data-a]'); if (!a) { ev.stopPropagation(); return; }
      ev.stopPropagation();
      if (a.dataset.a === 'save') {
        const f = {}; el.querySelectorAll('[data-f]').forEach(i => { f[i.dataset.f] = i.value; });
        if (!save(key, name, f)) return;
        if (opts.onChange) opts.onChange(key);
      }
      render(el, key, opts);
    };
  }

  /* ---------- import your own meanings from a document (.docx / .txt / .md) ----------
     Headings are card names on their own line ("The Fool", "Ace of Wands", "Six OF WANDS",
     "Queen of Cups" …); the paragraphs under each heading become that card's "My reading".
     For numbered cards, a short first line (the usual one-line meaning) becomes the keywords. */
  /* The card names a heading may use come from the content tables, through ../lib/db.js: a trump's Thoth title, its
     Golden Dawn title and its other accepted names (cards: name, gd_name, spellings); a suit's names, also in the
     singular (suits: name, gd_name, spellings); the four court ranks' Thoth names (court_ranks). */
  let NAMES = null;
  function names() {
    if (NAMES) return NAMES;
    const DB = window.DB;
    const words = r => [r.name, r.gd_name, ...DB.items(r.spellings)].filter(Boolean).map(w => w.toLowerCase().replace(/^the /, ''));
    // [card ID, its names] for each trump
    const MAJOR_NAMES = DB.where('cards', c => c.keyscale).map(c => [c.id, [...new Set(words(c))]]);
    const SUITS = Object.create(null), RANKS = Object.create(null);
    for (const s of DB.rows('suits')) for (const w of words(s)) { SUITS[w] = s.id; SUITS[w.replace(/s$/, '')] = s.id; }
    for (const r of DB.rows('court_ranks')) RANKS[r.name.toLowerCase()] = r.id;
    return (NAMES = { MAJOR_NAMES, SUITS, RANKS });
  }
  const NUMS = Object.assign(Object.create(null), { ace: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });

  function keyFromHeading(line) {
    const t = String(line).toLowerCase().replace(/[’']/g, "'").replace(/^\s*(atu\s+)?[0ivxl]+[.:)]?\s+(?=the |[a-z])/, '')
      .replace(/[.:]+$/, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return null;
    const { MAJOR_NAMES, SUITS, RANKS } = names();
    const bare = t.replace(/^the /, '');
    const major = MAJOR_NAMES.find(([, names]) => names.includes(bare));
    if (major) return major[0];
    const m = t.match(/^(\S+) of (?:the )?([a-z]+)$/);
    if (!m || !SUITS[m[2]]) return null;
    const rank = NUMS[m[1]] || (/^\d{1,2}$/.test(m[1]) ? +m[1] : RANKS[m[1]]);
    if (!rank || (typeof rank === 'number' && rank > 10)) return null;
    return SUITS[m[2]] + '-' + rank;
  }

  async function unzipEntry(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a .docx (zip) file');
    let p = dv.getUint32(eocd + 16, true);
    const count = dv.getUint16(eocd + 10, true);
    for (let n = 0; n < count; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === wanted) {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return new TextDecoder().decode(data);
        if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read .docx — save the document as .txt');
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).text();
      }
      p += 46 + nlen + xlen + clen;
    }
    throw new Error('no document text found in the file');
  }

  async function documentParagraphs(file) {
    if (/\.docx$/i.test(file.name)) {
      const xml = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      return [...doc.getElementsByTagName('w:p')].map(p =>
        [...p.getElementsByTagName('w:t')].map(t => t.textContent).join('').trim()).filter(Boolean);
    }
    return (await file.text()).split(/\r?\n/).map(s => s.replace(/^#+\s*/, '').trim()).filter(Boolean);
  }

  function parseMeanings(paras) {
    const cards = {}; let cur = null;
    for (const para of paras) {
      const key = keyFromHeading(para);
      if (key) { cur = cards[key] = cards[key] || []; continue; }
      if (!cur) continue;
      const prev = cur[cur.length - 1];
      // a paragraph that was split mid-sentence ("All such impulses" / "are right, if …") is joined back
      if (prev && !/[.!?:;)"”\]]$/.test(prev) && /^[a-z(]/.test(para)) cur[cur.length - 1] = prev + ' ' + para;
      else cur.push(para);
    }
    const out = {};
    for (const [key, ps] of Object.entries(cards)) {
      if (!ps.length) continue;
      const numbered = /-(\d+)$/.test(key) && !/-1$/.test(key);
      if (numbered && ps.length > 1 && ps[0].length <= 140) out[key] = { keywords: ps[0], meaning: ps.slice(1).join('\n\n') };
      else out[key] = { keywords: '', meaning: ps.join('\n\n') };
    }
    return out;
  }

  async function importFile(file) {
    const found = parseMeanings(await documentParagraphs(file));
    const keys = Object.keys(found);
    if (!keys.length) throw new Error('no card headings found — put each card name (e.g. "The Fool", "Two of Cups") on its own line');
    const replacing = keys.filter(k => mine[k] && mine[k].meaning).length;
    if (!confirm(`Found ${keys.length} card${keys.length > 1 ? 's' : ''} in "${file.name}".\n\nImport them into your own meanings ("My reading"${keys.some(k => found[k].keywords) ? ' and keywords' : ''})?`
      + (replacing ? `\n${replacing} card${replacing > 1 ? 's' : ''} already have a reading of yours — it will be replaced.` : '')
      + '\n\nThe original Book T text stays available, and you can edit or reset any card later.')) return 0;
    let saved = 0;
    for (const k of keys) {
      const m = mine[k] || {};
      const ok = save(k, (DATA.cards[k] || {}).name || k, {
        keywords: found[k].keywords || m.keywords || '', brief: m.brief || '',
        meaning: found[k].meaning, notes: m.notes || '',
        docMeaning: found[k].meaning, docKeywords: found[k].keywords || '',
      });
      if (ok) saved++;
    }
    return saved;
  }

  /** A small "Import meanings…" control. onDone(count) is called after an import. */
  function importButton(el, onDone) {
    injectStyle();
    el.innerHTML = `<span class="dv"><button class="dv-btn" type="button">⇪ Import meanings…</button>
      <input type="file" accept=".docx,.txt,.md" hidden></span>`;
    const btn = el.querySelector('button'), input = el.querySelector('input');
    el.querySelector('.dv').style.cssText = 'margin:0;border:0;padding:0';
    btn.onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files && input.files[0]; input.value = '';
      if (!f) return;
      try {
        const n = await importFile(f);
        if (n) { alert(`Imported ${n} card meaning${n > 1 ? 's' : ''}. Each card now shows "My reading"; tap ✎ Edit to change one.`); if (onDone) onDone(n); }
      } catch (e) { alert('Could not import: ' + e.message); }
    };
  }

  function keyFromParts(p) {
    if (p.major != null) return 'atu-' + p.major;
    const s = String(p.suit || '').toLowerCase(), suit = names().SUITS[s] || s;   // Pentacles, Coins … -> disks
    return suit + '-' + String(p.rank).toLowerCase().replace(/^ace$/, '1');
  }

  window.Div = { ready, card, render, save, reset, keyFromParts, keyFromHeading, parseMeanings, documentParagraphs,
    importFile, importButton, get source() { return DATA.source; } };
})();
