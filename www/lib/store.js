/* Athanor — saved records (charts, journal entries).
 *
 * In the Android app records are kept by the native UserStore (app storage + a readable copy in
 * Documents/Athanor/<Folder>/ on the phone). In a desktop browser they fall back to localStorage.
 *
 *   Store.list(kind)            -> [{id, name, created, updated, data, hasFile}]   newest first
 *   Store.get(kind, id)         -> {id, name, created, updated, data, html?} | null
 *   Store.get(kind, id, {strict: true}) -> the same, but a record that is there and cannot be read (a damaged
 *                               file) throws Error('unreadable') instead of looking like no record — for callers
 *                               that read a record, change it and save it back
 *   Store.put(kind, record)     -> stored record (without html); record = {id?, name, data, html?}
 *   Store.putImage(kind, record, jpegDataUrl) -> stored record; the image is kept with it (app: also
 *                               copied to Pictures/Athanor/<Folder>, shown in the Gallery).
 *                               list() entries of image records carry `imageUrl` (usable in <img src>).
 *   Store.remove(kind, id)      -> true/false
 *   Store.share(kind, id)       -> opens the share sheet (app only)
 *   Store.folder(kind)          -> "Documents/Athanor/Charts" (app) | ""
 *   Store.native                -> true inside the app
 *   Store.newId()               -> a fresh id
 * kind is "charts", "journal", "cards", "divination" (your edits of card meanings, id = card key) or
 * "daily" (the Daily Journal: one record per calendar day, id = "YYYY-MM-DD").
 * All calls are synchronous.
 */
(function () {
  const A = (window.parent && window.parent.Android && window.parent.Android.storeList) ? window.parent.Android
    : (window.Android && window.Android.storeList) ? window.Android : null;
  const LS = kind => 'l777store.' + kind;
  const lsAll = kind => { try { return JSON.parse(localStorage.getItem(LS(kind))) || {}; } catch (e) { return {}; } };
  const lsSave = (kind, all) => { localStorage.setItem(LS(kind), JSON.stringify(all)); };
  const summary = r => Object.assign({ id: r.id, name: r.name, created: r.created, updated: r.updated, data: r.data || {}, hasFile: false },
    r.imageData ? { imageUrl: r.imageData } : {});
  // Native image URLs are site-relative ("/user/cards/x.jpg"); pages live in /www/tools/, so resolve them
  const absolute = rec => { if (rec && rec.imageUrl && rec.imageUrl[0] === '/') rec.imageUrl = location.origin + rec.imageUrl; return rec; };

  const Store = {
    native: !!A,
    newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    list(kind) {
      if (A) { try { return (JSON.parse(A.storeList(kind)) || []).map(absolute); } catch (e) { return []; } }
      return Object.values(lsAll(kind)).map(summary).sort((a, b) => b.updated - a.updated);
    },
    get(kind, id, opts) {
      const strict = !!(opts && opts.strict);
      if (A) {
        let out;
        try { out = JSON.parse(A.storeGet(kind, id)); } catch (e) { if (strict) throw e; return null; }
        // the app answers {error: "unreadable"} for a record whose file is there but cannot be read
        if (out && out.error) { if (strict) throw new Error(out.error); return null; }
        return out;
      }
      if (strict) {
        let all; try { all = JSON.parse(localStorage.getItem(LS(kind)) || '{}') || {}; } catch (e) { throw new Error('unreadable'); }
        return all[id] || null;
      }
      return lsAll(kind)[id] || null;
    },
    put(kind, record) {
      const r = Object.assign({}, record, { id: record.id || Store.newId() });
      if (A) {
        const out = JSON.parse(A.storePut(kind, JSON.stringify(r)));
        if (out && out.error) throw new Error(out.error);
        return out;
      }
      const all = lsAll(kind), now = Date.now();
      r.created = (all[r.id] && all[r.id].created) || now; r.updated = now;
      // metadata-only updates (rename, re-tag) keep the stored image, as in the app
      if (!r.imageData && all[r.id] && all[r.id].imageData) r.imageData = all[r.id].imageData;
      all[r.id] = r;
      lsSave(kind, all); // throws when storage is full — callers show the error
      const { html, ...rest } = r; return rest;
    },
    putImage(kind, record, jpegDataUrl) {
      const r = Object.assign({}, record, { id: record.id || Store.newId() });
      if (A) {
        const out = JSON.parse(A.storePutImage(kind, JSON.stringify(r), jpegDataUrl));
        if (out && out.error) throw new Error(out.error);
        return out;
      }
      // browser fallback: the image is kept as a data URL (localStorage holds only a few MB)
      return Store.put(kind, Object.assign(r, { imageData: jpegDataUrl }));
    },
    remove(kind, id) {
      if (A) return !!A.storeDelete(kind, id);
      const all = lsAll(kind); const had = id in all; delete all[id]; lsSave(kind, all); return had;
    },
    share(kind, id) {
      if (A) { A.storeShare(kind, id); return true; }
      const r = Store.get(kind, id); if (!r || !(r.html || r.imageData)) return false;
      const a = document.createElement('a');
      a.href = r.imageData || URL.createObjectURL(new Blob([r.html], { type: 'text/html' }));
      a.download = (r.name || 'record').replace(/[\\/:*?"<>|]+/g, '_') + (r.imageData ? '.jpg' : '.html');
      document.body.appendChild(a); a.click(); a.remove();
      return true;
    },
    folder(kind) { return A ? A.storeFolder(kind) : ''; },
  };
  window.Store = Store;
})();
