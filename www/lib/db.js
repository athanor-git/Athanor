/* Athanor — the content tables.
 *
 * Every fact is stored once, in a table under data/db/<table>.json: one row per thing, each with a stable "id"; a row
 * points to a row of another table by that row's ID. The tables are edited in the workbook content\Athanor Content.xlsx
 * and written by tools\update_content.ps1 (tools/content/schema.py defines them). Pages read them through this file
 * and keep no content of their own.
 *
 * Load, in a tool page (www/tools/*.html):
 *   <script src="../../data/db/core.js"></script>   the small core tables (planets, signs, cards, decans …) and schema
 *   <script src="../../data/db/texts.js"></script>  the tools' own texts (tool_texts), for DB.text: where a page has any
 *   <script src="../lib/db.js"></script>             this file. All are there before the page's own script runs.
 * Any other table: await DB.load('spirits', 'compass_entries') (fetched once from data/db/<table>.json).
 *
 *   DB.rows(t)            the rows of table t, in book order (do not modify them)
 *   DB.get(t, id)         the row of t with that ID, or null
 *   DB.ref(row, col)      follow a reference: a ref column -> the row it points to (null if empty); a refs column ->
 *                         [rows]; 'id' of a 1:1 table (card_meanings, spirit_texts …) -> the row it belongs to
 *   DB.rev(t, col, id)    reverse lookup: the rows of t whose column col points to id (a ref, or one of the IDs of a
 *                         refs cell), e.g. DB.rev('cards', 'decan', 'aries-1') -> [the 2 of Wands]
 *   DB.where(t, pred)     the rows of t for which pred(row) is true; pred may be an object {col: value, …}
 *   DB.text(id, vars)     a tool's text: the row id of tool_texts ('tarot.why-major'; data/db/texts.js), with each
 *                         {name} replaced by vars.name exactly as given (escape a value first where the page would
 *                         escape it; a {name} with no value is left as it is). No such row: '' and a console error.
 *   DB.load(...tables)    Promise of DB, resolved once every named table is there (fetches those not bundled)
 *   DB.has(t)             is table t there (bundled or loaded)?
 *   DB.type(t, col)       a column's type: 'id', 'text', 'int', 'num', 'bool', 'list', 'json', 'ref:<t>', 'refs:<t>'
 *   DB.ids(v), DB.items(v)  the IDs of a refs cell ("a, b" -> ['a', 'b']); the items of a list cell (one per line)
 *   DB.schema             {tables: {t: {title, cols: {col: type}, id_ref?, cols_from?}}, derived: [[t, what, how]]}
 * rows, get, ref, rev, where and text throw an Error naming the table when it is not there yet (DB.load it first).
 * A row leaves out its empty values (a missing key = empty); a bool is present only when true.
 * Relations stored on one side only (a sign's ruler, a decan's card …) are listed in DB.schema.derived; look them up
 * from the other side, e.g. the ruler of Aries: DB.where('dignities', {sign: 'aries', kind: 'domicile'}).
 */
(function () {
  'use strict';
  const bundle = () => window.ATHANOR_DB || {};
  const me = document.currentScript && document.currentScript.src;
  const BASE = me ? new URL('../../data/db/', me).href : '../../data/db/';   // www/lib/ -> data/db/
  const tables = {};            // t -> {rows, byId: Map, rev: {col: Map(id -> [rows])}}
  const owner = new WeakMap();  // row -> the table it belongs to
  const loading = {};           // t -> Promise of its fetch

  const schema = () => bundle()._schema || { tables: {}, derived: [] };
  const ids = v => String(v == null ? '' : v).split(',').map(x => x.trim()).filter(Boolean);
  const items = v => (v == null || v === '') ? [] : String(v).split('\n');

  function index(t, rows) {
    const byId = new Map();
    for (const r of rows) { byId.set(String(r.id), r); owner.set(r, t); }
    return (tables[t] = { rows, byId, rev: {} });
  }

  function table(t) {
    if (tables[t]) return tables[t];
    const b = bundle()[t];
    return (t[0] !== '_' && Array.isArray(b)) ? index(t, b) : null;
  }

  function need(t) {
    const x = table(t);
    if (!x) throw new Error(`DB: table "${t}" is not loaded (await DB.load('${t}') first)`);
    return x;
  }

  function type(t, col) {
    if (col === 'id') return 'id';
    const s = schema().tables[t];
    return (s && s.cols && s.cols[col]) || 'text';    // (a wide table's columns, e.g. 777's, are text)
  }

  function ownerOf(row) {
    if (!owner.has(row)) Object.keys(bundle()).forEach(table);   // a row taken straight from the bundle
    const t = owner.get(row);
    if (!t) throw new Error('DB.ref: not a row of a loaded table');
    return t;
  }

  const DB = {
    rows(t) { return need(t).rows; },
    get(t, id) { return need(t).byId.get(String(id)) || null; },
    has(t) { return !!table(t); },
    type,
    ids,
    items,
    get schema() { return schema(); },

    ref(row, col) {
      const t = ownerOf(row);
      if (col === 'id') {
        const s = schema().tables[t];
        if (!s || !s.id_ref) throw new Error(`DB.ref: ${t}.id points to no other table`);
        return DB.get(s.id_ref, row.id);
      }
      const m = /^(refs?):(.+)$/.exec(type(t, col));
      if (!m) throw new Error(`DB.ref: ${t}.${col} is not a reference (${type(t, col)})`);
      if (m[1] === 'ref') return row[col] == null ? (need(m[2]), null) : DB.get(m[2], row[col]);
      need(m[2]);
      return ids(row[col]).map(id => DB.get(m[2], id)).filter(Boolean);
    },

    rev(t, col, id) {
      const x = need(t);
      let m = x.rev[col];
      if (!m) {
        m = x.rev[col] = new Map();
        const many = /^refs:/.test(type(t, col));
        for (const r of x.rows) {
          if (r[col] == null) continue;
          for (const k of (many ? ids(r[col]) : [String(r[col])])) {
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
          }
        }
      }
      return m.get(String(id)) || [];
    },

    where(t, pred) {
      const rows = need(t).rows;
      if (typeof pred === 'function') return rows.filter(pred);
      const keys = Object.keys(pred || {});
      return rows.filter(r => keys.every(k => r[k] === pred[k]));
    },

    text(id, vars) {
      const r = DB.get('tool_texts', id);
      if (!r) { console.error(`DB.text: no row "${id}" in tool_texts`); return ''; }
      return String(r.text || '').replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
        (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
    },

    load(...names) {
      return Promise.all(names.flat().map(t => {
        if (table(t)) return null;
        if (!loading[t]) {
          loading[t] = fetch(BASE + encodeURIComponent(t) + '.json')
            .then(r => { if (!r.ok) throw new Error(`DB.load: data/db/${t}.json (${r.status})`); return r.json(); })
            .then(d => { index(t, d.rows || []); })
            .catch(e => { delete loading[t]; throw e; });
        }
        return loading[t];
      })).then(() => DB);
    },
  };

  window.DB = DB;
})();
