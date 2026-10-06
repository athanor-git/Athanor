/* Athanor — your physical tarot decks and the cards you have scanned from them.
 * Needs ../lib/store.js first. Scans are Store records of kind "cards": data.card = card key, data.deck = deck name.
 *
 *   Decks.list()                  deck names: Thoth, Rota Mundi, any you added, and any found on saved scans
 *   Decks.add(name)               remember a new deck
 *   Decks.current() / Decks.setCurrent(name|'')   the deck whose photos the tools show ('' = off)
 *   Decks.scans(deck)             { cardKey: [scan records, newest first] } for one deck ('*' = every deck)
 *   Decks.imageFor(cardKey, deck) best photo of a card: from `deck`, else from any deck ('' deck = none)
 *   Decks.chips(el, {value, onPick, withAll, withOff, withNew})   a row of deck chips
 *   Decks.normal(name) / Decks.sameDeck(a, b)   "Thoth deck" and "Thoth" name the same deck
 */
(function () {
  const DEFAULTS = ['Thoth', 'Rota Mundi'];
  const KEY = 'l777decks';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const saveCfg = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  function allScans() { try { return window.Store ? Store.list('cards') : []; } catch (e) { return []; } }

  // "Thoth deck", "thoth tarot" and "Thoth" are one deck
  const canon = s => String(s || '').trim().replace(/\s+(deck|tarot|cards?)$/i, '').toLowerCase();
  const sameDeck = (a, b) => canon(a) === canon(b);
  /** The deck's name as listed ("Thoth deck" -> "Thoth"), or the name itself when it is a new deck. */
  function normal(name) {
    name = String(name || '').trim(); if (!name) return '';
    const cfg = load();
    return [...DEFAULTS, ...(cfg.added || [])].find(n => sameDeck(n, name)) || name;
  }

  function list() {
    const cfg = load(), names = [...DEFAULTS, ...(cfg.added || [])];
    allScans().forEach(r => { const d = r.data && r.data.deck; if (d && !names.some(n => sameDeck(n, d))) names.push(d); });
    return names;
  }
  function add(name) {
    name = String(name || '').trim(); if (!name) return list();
    const cfg = load(); cfg.added = cfg.added || [];
    if (!list().some(n => sameDeck(n, name))) { cfg.added.push(name); saveCfg(cfg); }
    return list();
  }
  // how a deck names its cards: 'thoth' (Knight, Queen, Prince, Princess; Disks) or 'rws' (King, Queen, Knight, Page; Pentacles)
  const STYLES = { 'rota mundi': 'rws' };
  function style(name) {
    const cfg = load(), c = canon(name);
    return (cfg.styles && cfg.styles[c]) || STYLES[c] || 'thoth';
  }
  function current() { const c = load().current; return c === undefined ? 'Thoth' : normal(c); }
  function setCurrent(name) { const cfg = load(); cfg.current = name && normal(name); saveCfg(cfg); }

  // Scans tagged before the deck chips existed may say "Thoth deck": re-tag them with the listed name
  // (in the app this also moves their Gallery copies into that deck's folder)
  function tidy() {
    allScans().forEach(r => {
      const d = r.data && r.data.deck, n = normal(d);
      if (!d || n === d) return;
      try { Store.put('cards', { id: r.id, name: r.name, data: Object.assign({}, r.data, { deck: n }) }); } catch (e) {}
    });
  }
  function scans(deck) {
    const by = {};
    allScans().forEach(r => {
      const k = r.data && r.data.card; if (!k || !r.imageUrl) return;
      // scans saved before decks existed (no deck) count as Thoth
      const d = (r.data.deck || 'Thoth');
      if (deck !== '*' && !sameDeck(d, deck)) return;
      (by[k] = by[k] || []).push(r);
    });
    return by;
  }
  function imageFor(key, deck) {
    if (!deck) return null;
    const own = (scans(deck)[key] || [])[0];
    return own || null;
  }

  function chips(el, o) {
    o = o || {};
    const names = list();
    const opts = [...(o.withOff ? [['', 'Off']] : []), ...(o.withAll ? [['*', 'All decks']] : []), ...names.map(n => [n, n])];
    const on = v => v === o.value || (v !== '' && v !== '*' && !!o.value && o.value !== '*' && sameDeck(v, o.value));
    el.innerHTML = opts.map(([v, l]) => `<span class="chip dk${on(v) ? ' on' : ''}" data-v="${esc(v)}">${esc(l)}</span>`).join('')
      + (o.withNew ? '<span class="chip dk" data-new="1">+ New deck</span>' : '');
    el.onclick = ev => {
      const c = ev.target.closest('.dk'); if (!c) return;
      if (c.dataset.new) {
        const n = prompt('Name of the deck (e.g. "Rota Mundi", "Tabula Mundi", "Liber T")');
        if (!n || !n.trim()) return;
        add(n.trim()); o.value = normal(n);
      } else o.value = c.dataset.v;
      chips(el, o);
      if (o.onPick) o.onPick(o.value);
    };
  }

  window.Decks = { list, add, current, setCurrent, scans, imageFor, chips, normal, sameDeck, style };
  tidy();
})();
