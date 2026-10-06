/* Athanor — Study & Quiz: the divination learning path, "Learn Thoth divination" (the meanings of the 78 cards in a reading).
 * Loaded by tools/quiz.html after its own script; the API (registerPath, addRelations, onReady, guards, lesson helpers…)
 * is documented in quiz.html under "Learning paths: a registry".
 *
 * Data: Q.data.divination is window.Div (../lib/divination.js): Div.card(key) → {orig, mine, eff}: orig = Book T (Equinox I:8,
 * 1912: public domain) with the app's keywords / "In brief"; mine / eff = the user's own meanings (their imported document and
 * edits). Q.tarot.cards / order: the 78 Thoth cards. Q.scanOf(key): the user's photo of a card ('' when none). The content table
 * Keyword sets (window.DB, loaded by quiz.html): the vices of Book T's ill-dignified readings, and the words that name an element,
 * a planet or a sign. The other word lists here (suits, gender, numbers, the Sephiroth and letters) are tuned to what they catch.
 * Copyright: only Book T and the app's existing summaries may be quoted; never new text from the 1944 Book of Thoth or DuQuette.
 * The user's own meanings are shown back to them from their own saved records only (nothing of theirs is written into this file).
 *
 * Stages (ids are stable: the best score of each is saved under it):
 *   build        How the deck is built: Atus and letters, suits and the Name, courts, Aces, decans   (ta.*, tr.attr)
 *   atus         The 22 Atus: keywords, Book T and "In brief"                                         (dv.kw, dv.bookT, dv.brief)
 *   aces-courts  Aces and court cards                                                                  (the same)
 *   wands … disks  2–10 of each suit: Thoth title and meaning                                          (ta.title and the same)
 *   dignity      Well and ill dignified: Book T's ill-dignified senses                                 (dv.ill, dv.illf — new)
 *   mine         Your own meanings (only while the user has any: their document or edits)              (dv.mine, dv.kw)
 *
 * Questions come from the existing relations, asked through stage.refine (quiz.html: pathCard): the learner's photo of the card
 * in the prompt of "what does … signify?", Book T's closing "Chokmah of Yod (…)" line left out of its quotations (it names the
 * card's number and suit), "If ill dignified, he is …" quoted without the pronoun, and never-offered pairs (near) so that no
 * option is also right: options of the same kind as the answer (Atus with Atus, court cards with court cards…), none that the
 * quoted passage names, and for the keywords none whose keywords share a word with the answer's. Items whose own text would still give the card
 * away (a number, a glyph, a Sephirah, a letter of the Name, the card's name or a form of its title, its suit, its element,
 * its planet or sign, a "he" or "she" among court cards) are left out of the stage (see giveaway), and so are those where a
 * blank "[…]" (the card's name, masked) would point to the answer: an option with a blank, or a quotation whose blank an Atu's
 * title fills; quotations leave out the short items that hold a blank (see unblank). A card is asked once per quiz (clashMeaning).
 * The one new relation, dv.illf ("the card is ill dignified: what does it show?"), is the other direction of dv.ill and shares its
 * fact (fx). Two things reach outside the path. The deck's own divination questions (Practice, the daily review, Speed, Flashcards,
 * Learn a card) are cleaned by the same rules when the cards are built (cleanDeck): the same texts, and a direction whose text would
 * give its card away is not asked. And (QuizPaths.addNear) Practice and the daily review never offer keywords with a blank beside
 * keywords without one, nor keywords that name their own card.
 */
(function () {
  'use strict';
  if (!window.QuizPaths) return;   // loaded outside quiz.html
  QuizPaths.onReady(function (Q) {
    const Div = Q.data.divination;
    if (!Div || !Q.tarot.order.length) return;
    // its word lists are tab Keyword sets (window.DB; quiz.html loads the table at start-up): without it this path stays away
    if (!window.DB || !DB.has('keyword_sets')) return;
    const TC = Q.tarot.cards, ORDER = Q.tarot.order.slice(), esc = Q.esc, L = Q.lesson, SUITS = Q.tarot.suits, RANKS = Q.tarot.courts;
    const card = k => TC[k] || null;
    const dv = k => { try { return Div.card(k); } catch (e) { return { orig: {}, mine: null, eff: {} }; } };
    const kindOf = k => (card(k) || {}).kind || '';
    const MAJ = ORDER.filter(k => kindOf(k) === 'major'), ACES = ORDER.filter(k => kindOf(k) === 'ace'), COURTS = ORDER.filter(k => kindOf(k) === 'court');
    const suitCards = (su, kinds) => ORDER.filter(k => card(k).suit === su && kinds.includes(kindOf(k)));
    const letterOf = el => RANKS.find(r => r.el === el) || null;   // the suits are the letters of the Name: Wands Yod … Disks Hé final
    let B = null;   // the relation builders handed to addRelations (mask, clip, tItem, dvSide…): kept from the last rebuild

    /* ---------- styles: card blocks in the lessons, the photo in a question, the explanation (the quiz's colours: dark mode too) ---------- */
    if (!document.getElementById('dvp-style')) {
      const s = document.createElement('style'); s.id = 'dvp-style';
      s.textContent = `.dvp-list{margin:4px 0}
.dvp-c{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
.dvp-list>.dvp-c:first-child{border-top:none}
.dvp-th{width:44px;height:66px;object-fit:cover;border-radius:5px;border:1px solid var(--line);flex:0 0 auto;background:var(--line)}
.dvp-b{flex:1;min-width:0;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.dvp-h b{font-size:15px}
.dvp-kw{font-weight:650;margin:3px 0}
.dvp-bt{font-family:Georgia,'Times New Roman',serif;font-size:14.5px;margin:4px 0}
.dvp-tag{display:inline-block;font-size:10px;font-weight:600;border:1px solid var(--acc);color:var(--acc);border-radius:8px;padding:0 6px;margin-left:6px;vertical-align:1px}
.dvp-d{margin-top:2px}.dvp-d>summary{cursor:pointer;color:var(--acc);font-size:13px;font-weight:600;padding:6px 0}
.dvp-grp{border-top:1px solid var(--line);margin:0}.dvp-grp>summary{cursor:pointer;font-weight:700;font-size:15px;padding:12px 0;color:var(--acc)}
.dvp-q{display:block;height:156px;width:auto;max-width:70%;object-fit:contain;margin:12px auto 0;border-radius:8px;border:1px solid var(--line)}
.dvp-ex{display:flex;gap:10px;align-items:flex-start}.dvp-ex .dvp-th{width:36px;height:54px}`;
      document.head.appendChild(s);
    }

    /* ---------- words ---------- */
    const lw = t => String(t || '').toLowerCase().replace(/judgement/g, 'judgment').match(/[a-zà-ɏ]+/g) || [];
    // words that only look like forms of a title ("start" is no form of Star, "lustre" none of Lust, "interest" none of Interference)
    const NOT_FORM = new Set(['start', 'starts', 'started', 'starting', 'stare', 'stared', 'staring', 'stark', 'starch', 'starve', 'starved',
      'starling', 'lustre', 'luster', 'lustrous', 'moonless']);
    const PREFIXES = new Set(['inter', 'under', 'trans', 'super', 'compl', 'compa', 'conte', 'contr', 'conti', 'conse', 'prese', 'prete', 'disco', 'disap']);
    // w (a word of a text) is n (a word of a name) or one of its forms: worried / Worry, domination / Dominion, oppressive / Oppression
    // forms the rule below cannot see ("Justice, or rather justesse"; "folly and madness" beside Atu 0 The Fool)
    const ALIAS = { justice: ['justesse'], fool: ['folly', 'follies'] };
    function formOf(w, n) {
      if (w === n || (ALIAS[n] && ALIAS[n].includes(w))) return true;
      if (NOT_FORM.has(w)) return false;
      const b = n.length > 4 ? n.replace(/([^s])s$/, '$1').replace(/y$/, '') : n;
      if (b.length < 4) return false;
      if (w.startsWith(b) && w.length - b.length <= 7) return true;
      let i = 0; while (i < w.length && i < b.length && w[i] === b[i]) i++;
      return i >= (PREFIXES.has(b.slice(0, 5)) ? 7 : 5) && i >= Math.min(w.length, b.length) - 3;
    }
    const STOP = new Set(('with from that this than then them they their there into upon over also even very much more most some such only other others '
      + 'being been have having which while when what where whose both each either neither after before though through until unless within without '
      + 'against about above below whole part thing things matter card cards sense kind often sometimes almost rather great little small large sort '
      + 'many same ones itself himself herself according depending dependent quite like cause means mean yet makes make made shows show tends '
      + 'those these here just ever never always every towards toward').split(' '));
    const salient = t => Q.uniq(lw(t).filter(w => w.length >= 4 && !STOP.has(w)));
    const shareWord = (A, Bw) => A.some(a => Bw.some(b => formOf(a, b) || formOf(b, a)));
    // Book T's ill-dignified senses are lists of vices: two lists with words of one kind ("cruel" / "merciless") could both be right
    // (tab Keyword sets, set vices: one group of near-synonyms per row)
    const KWS = DB.rows('keyword_sets');
    const VICES = KWS.filter(r => r.set === 'vices').map(r => DB.items(r.words));
    const vices = t => new Set(lw(t).map(w => VICES.findIndex(g => g.includes(w))).filter(i => i >= 0));
    const illNear = (s, t) => shareWord(salient(s), salient(t)) || [...vices(s)].some(i => vices(t).has(i));
    // Book T describes a court card's ill side as a person ("Deceitful, tyrannical and crafty"), an Atu's or a small card's as a state of
    // affairs ("Luxury, dissipation"): offered side by side, the form alone would tell them apart
    const illGroup = it => kindOf(it.tc) === 'court';

    /* ---------- what names a card ---------- */
    const NUM_ID = /^(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Ace|[0IVXL]+)$/i;
    const GENERIC = new Set(['the', 'of', 'man', 'high', 'powers', 'root']);
    // its names and titles as phrases (numbers and numerals are caught on their own), and its title words for their forms
    // an Atu's name in Book T ("Fortitude", "The Wheel of Fate", "The Blasted Tower"): the part of its Book T title before the dash
    const btName = X => X.kind === 'major' ? String(dv(X.key).orig.bookTName || '').split(/\s+[—–-]\s+/)[0] : '';
    const nameIds = X => (X.ids || []).filter(s => !NUM_ID.test(s)).concat(X.gd ? [X.gd] : [], btName(X) ? [btName(X)] : []);
    const titleWords = X => X.kind === 'major' || X.kind === 'minor'
      ? Q.uniq(lw([X.title, X.gd, btName(X)].filter(Boolean).join(' '))).filter(w => w.length >= 3 && !GENERIC.has(w)) : [];
    const namesCard = (t, X) => !!X && !!t && (Q.namesAny([t], nameIds(X)) || titleWords(X).some(n => lw(t).some(w => formOf(w, n))));
    // a title of one small card inside another's (Strength / Established Strength, Strife / Rest from Strife): never offered together
    const titleClash = (X, Y) => !!X && !!Y && [[X, Y], [Y, X]].some(([a, b]) => lw(a.title).some(n => n.length >= 4 && lw(b.title + ' ' + (b.bookT || '')).some(w => formOf(w, n))));

    /* ---------- what gives a card away in a text shown with its question (the stem, or the answer among other texts) ---------- */
    const SUITW = new Set(['wand', 'wands', 'rod', 'rods', 'staff', 'staves', 'baton', 'batons', 'club', 'clubs', 'cup', 'cups', 'chalice', 'chalices',
      'hearts', 'sword', 'swords', 'blade', 'blades', 'spade', 'spades', 'disk', 'disks', 'disc', 'discs', 'pentacle', 'pentacles', 'pantacle',
      'pantacles', 'coin', 'coins']);
    // the words that name an element (ELW), and a planet, a sign or Spirit (ASTRO), by the names the quiz gives them (Liber 777's
    // for a planet: Luna, Sol): tab Keyword sets, sets element and astro
    const kwName = r => r.planet ? (p => p.name_777 || p.name)(DB.ref(r, 'planet')) : r.sign ? DB.ref(r, 'sign').name : DB.ref(r, 'element').name;
    const ELW = Object.fromEntries(KWS.filter(r => r.set === 'element').map(r => [kwName(r), DB.items(r.words)]));
    const ASTRO = Object.fromEntries(KWS.filter(r => r.set === 'astro').map(r => [kwName(r), DB.items(r.words)]));
    const GENDER = new Set(['he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'man', 'men', 'woman', 'women', 'king', 'kings', 'queen', 'queens',
      'prince', 'princes', 'princess', 'princesses', 'knight', 'knights', 'lady', 'lord', 'maiden', 'girl', 'boy', 'youth', 'father', 'mother',
      'son', 'daughter', 'wife', 'husband']);
    const NUMWORD = new Set(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'twos', 'threes', 'fours', 'fives', 'sixes', 'sevens',
      'eights', 'nines', 'tens', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']);
    const SEPHS = 'Kether|Keter|Chokmah|Chokhmah|Binah|Chesed|Geburah|Gevurah|Tiphareth|Tiferet|Netzach|Hod|Yesod|Malkuth';
    const SEPH_RE = new RegExp(`(?<![A-Za-z])(?:${SEPHS})(?![A-Za-z])`, 'i');
    const LETTER_RE = /(?<![A-Za-zÀ-ɏ])(?:Aleph|Beth|Gimel|Daleth|Heh|Hé|Vau|Vav|Zain|Cheth|Teth|Yod|Kaph|Lamed|Mem|Nun|Samekh|Ayin|Peh|Tzaddi|Qoph|Resh|Shin|Tau)(?![A-Za-zÀ-ɏ])/;
    const GLYPH_RE = /[\u0590-\u05FF\u2600-\u27BF\u{1F700}-\u{1F77F}\u25B3\u25BD]/u;   // Hebrew; astrological, alchemical and element signs
    const PLN = n => n === 'Sun' ? 'Sol' : n === 'Moon' ? 'Luna' : n;
    // the Atus' attributions (tr.attr, by the Thoth / Golden Dawn setting): card key → "Mercury", "Fire / Spirit"… (read from the
    // relation, not its cards: during a rebuild the cards are still the last build's, before a change of the setting)
    function atuAttr() {
      const o = {}, r = Q.relation('tr.attr'); (r ? r.items : []).forEach(it => { if (it.tc) o[it.tc] = { t: it.v.t, h: it.v.h, row: it.row }; });
      return o;
    }
    let ATTR = atuAttr();
    const astroOf = X => X.kind === 'major' ? (ATTR[X.key] ? ATTR[X.key].t.split('/').map(x => x.trim()) : [])
      : X.kind === 'minor' && X.dec ? [PLN(X.dec.ruler), X.dec.sign] : [];
    // '' when the text gives nothing of X away; else what it gives (o.gender: the options are cards, so "he" / "she" would narrow them)
    function giveaway(t, X, o) {
      t = String(t || '');
      if (!t.trim() || !X) return 'no text';
      if (/\d/.test(t)) return 'a number';
      if (/(?<![A-Za-z])(?:[IVXL]{2,}|[VXL])(?![A-Za-z])/.test(t)) return 'a numeral';
      if (GLYPH_RE.test(t)) return 'a glyph or Hebrew letter';
      if (SEPH_RE.test(t)) return 'a Sephirah';
      if (LETTER_RE.test(t)) return 'a letter of the Name';
      const ws = lw(t);
      // "bleaker still than the Nine", "the previous symbol": a card's place in its suit
      if (ws.some(w => NUMWORD.has(w)) || /\b(?:previous|preceding|following|next)\s+(?:symbol|card)s?\b/i.test(t)) return 'a number or a place';
      if (Q.namesAny([t], nameIds(X).concat(X.kind === 'minor' ? [['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][X.n]] : [])))
        return 'its name';
      if (titleWords(X).some(n => ws.some(w => formOf(w, n)))) return 'a form of its title';
      if (X.suit) {
        if (ws.some(w => SUITW.has(w))) return 'a suit';
        if ([X.suit.el, X.rank && X.rank.el].filter(Boolean).some(e => ws.some(w => ELW[e].includes(w)))) return 'its element';
      }
      if (astroOf(X).some(a => (ASTRO[a] || ELW[a] || []).some(x => ws.includes(x)))) return 'its planet, sign or element';
      // an Ace or a court card among its fellows: any planet or sign ("Venusian") would point to one of them
      if ((X.kind === 'ace' || X.kind === 'court') && Object.keys(ASTRO).some(a => a !== 'Spirit' && ASTRO[a].some(x => ws.includes(x)))) return 'a planet or sign';
      if (X.kind === 'ace' && ws.some(w => /^(ace|aces|root|roots)$/.test(w))) return 'Ace';
      if (o && o.gender && (X.kind === 'court' || X.kind === 'major') && ws.some(w => GENDER.has(w))) return 'a he or she';
      return '';
    }

    /* ---------- the texts as the stages show them ---------- */
    // Book T's small-card descriptions close with the card's Sephirah and the letter of its suit ("Chokmah of י (…)"): its number and suit
    const cleanBT = t => String(t || '').replace(new RegExp(`\\s*(?<![A-Za-z])(?:${SEPHS})\\s+of\\s+[\\s\\S]*$`), '')
      .replace(/\s*\[[^\]]*$/, '').replace(/\s+/g, ' ').trim();
    // "If ill dignified, he is evil-minded…" → "Evil-minded…": the condition is the question, and "he" / "she" would name the rank
    const cleanIll = t => {
      const s = String(t || '').trim()
        .replace(/^(?:but\s+)?(?:if\s+|when\s+|with\s+)?(?:very\s+)?(?:ill|bad|evil)[\s-]+(?:dignified|dignity|cards)\s*[,:;—–-]?\s*(?:it\s+means\s+|these\s+qualities\s+produce\s+)?/i, '')
        .replace(/,?\s*if\s+ill\s+dignified\s*\.?\s*$/i, '.').replace(/^(?:he|she)\s+(?:is\s+)?/i, '').replace(/^may\s+be\s+/i, '').replace(/\s+/g, ' ').trim();
      return s ? s[0].toUpperCase() + s.slice(1) : '';
    };
    const mask = (X, t) => B && B.mask ? B.mask(X, t) : String(t || '');
    const clip = (t, n) => B && B.clip ? B.clip(t, n) : String(t || '');
    // A blank "[…]" (the card's own name, masked) is a clue in itself: "Good […]" is Good fortune, "sometimes […]" is death. So the texts a
    // question quotes leave out the short list items that hold one ("Synthesis, […], kingdom" → "Synthesis, kingdom"; "Riches and […]"
    // → "Riches"; "Eternal […]. Strength and force…" → "Strength and force…"); a blank that is the subject of a clause ("[…] means
    // idea") or sits in a longer phrase stays (see blankGives). Also the stray quotation mark after a masked title ("the [a title],”").
    const BLANK = '[…]';
    function unblank(t) {
      t = String(t || '').replace(/(\[a (?:title|card)\])([,.;:]?)[”"]/g, '$1$2');
      if (!t.includes(BLANK)) return t;
      const tail = / …$/.test(t) ? ' …' : '';   // the ellipsis of a clipped passage stays at its end
      const p = t.replace(/ …$/, '').split(/(\s*[,;:.!?—]+\s*)/);   // items at even places, their separators between
      const cap = new Set(), opens = i => i === 0 || /[.!?]/.test(p[i - 1]);
      const upper = s => s.replace(/^([^\p{L}\[]*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());   // (not after a blank left in front)
      for (let i = 0; i < p.length; i += 2) {
        let s = p[i];
        if (!s || !s.includes(BLANK)) continue;
        s = s.replace(/\s+(?:and|or)\s+\[…\]$/, '').replace(/^\[…\]\s+(?:and|or)\s+/, '');
        const subject = /\[…\]\s+(?:means|signifies|shows|represents|symboli[sz]es|denotes|implies|indicates|is|are|was|may|can|will|has)\b/.test(s);
        if (s.includes(BLANK) && !subject && s.replace(BLANK, ' ').trim().split(/\s+/).filter(Boolean).length <= 2) {
          p[i] = '';
          if (opens(i)) { if (i + 1 < p.length) p[i + 1] = ''; cap.add(i + 2); }
          else if (/^(?:and|or)\s/.test(p[i + 2] || '')) { p[i - 1] = ''; p[i + 1] = ' '; }   // "Unhappiness, […], and tears" → "Unhappiness and tears"
          else p[i - 1] = '';
        } else { if (s !== p[i] && opens(i)) cap.add(i); p[i] = s; }
      }
      cap.forEach(i => { if (p[i]) p[i] = upper(p[i]); });
      return upper(p.join('').replace(/^[\s,;:.—]+/, '').trim() + tail);
    }
    // the text a question shows besides its card: the passage it quotes (reverse, as the stage's prompt shows it) or its answer among
    // the options (forward: an option is shown as it is)
    const shownText = c => { const t = c.rel.id === 'dv.bookT' ? cleanBT(c.it.v.t) : c.rel.id === 'dv.ill' ? cleanIll(c.it.v.t) : c.it.v.t;
      return c.dir === 'r' ? unblank(t) : t; };
    // a blank still shown with a question gives it away: among the options it marks the one that named its card; in a quotation whose
    // options are Atus (shown with their titles) the title can fill it ("Read it as literal […] or disaster"), unless it is the subject
    // of the clause ("[…] means idea": any card could be). Among small cards and courts (shown by name) only the lesson's titles fill it.
    const blankGives = c => { const t = shownText(c);
      if (!t.includes(BLANK)) return false;
      return c.dir === 'f' || (kindOf(c.it.tc) === 'major' && /\[…\](?!\s+(?:means|signifies|shows|represents|symboli[sz]es|denotes|implies|indicates)\b)/.test(t)); };
    const SAFE = new WeakMap();
    const safeQ = c => {
      if (!SAFE.has(c)) SAFE.set(c, !giveaway(shownText(c), card(c.it.tc), { gender: c.dir === 'r' }) && !blankGives(c));
      return SAFE.get(c);
    };
    // a card's keywords as the quiz shows them (its own names blanked), and their words (for "meanings that share a word")
    const KW = {};
    const kwText = k => KW[k] || (KW[k] = mask(card(k), dv(k).eff.keywords || ''));
    const kwWords = k => salient(kwText(k));
    const kwMine = k => { const d = dv(k); return !!(d.mine && d.eff.keywords && d.eff.keywords !== (d.orig.keywords || '')); };
    const BTW = {};   // the words of a card's Book T meaning (its closing Sephirah line left out); Book T's text never changes
    const btWords = k => BTW[k] || (BTW[k] = salient(cleanBT(dv(k).orig.meaning || '')));

    /* ---------- the learner's photos ---------- */
    const scan = k => { try { return Q.scanOf(k) || ''; } catch (e) { return ''; } };
    const img = (k, cls, alt) => { const u = scan(k); return u ? `<img class="${cls}" src="${esc(u)}" alt="${esc(alt || '')}" loading="lazy">` : ''; };
    const subjH = it => it.leak && it.s.h0 ? it.s.h0 : it.s.h;
    const theCard = it => (kindOf(it.tc) === 'major' ? '' : 'the ') + subjH(it);   // "Atu IX The Hermit", "the Queen of Swords"
    const qImg = it => it.leak ? '' : img(it.tc, 'dvp-q', 'Your photo of this card');

    /* ---------- the deck's own questions: Practice, the daily review, Speed, Flashcards, Learn a card ---------- */
    // They quote the same texts as the stages, so they are cleaned here the same way whenever the cards are built: Book T's closing
    // Sephirah line and "If ill dignified, he is" left out, the short items holding a blank dropped (unblank). A direction whose
    // text would still give the card away is not asked (it.dirs, by safeQ, as in the stages: "what does … signify?" not where the
    // keywords hold a blank either, which would leave them one or two like options); such an item stays an option of the other
    // questions, except keywords that name their own card or hold a blank, never offered for "what does … signify?" (the addNear
    // rule below). The stages ask the same cleaned texts.
    const DECK_T = { 'dv.kw': t => t, 'dv.bookT': cleanBT, 'dv.ill': cleanIll, 'dv.brief': t => t, 'dv.mine': t => t };
    function cleanDeck(ctx) {
      Object.keys(DECK_T).forEach(id => {
        const r = Q.relation(id); if (!r) return;
        r.items = r.items.map(it => {
          const X = card(it.tc); if (!X) return it;
          const t = unblank(DECK_T[id](it.v.t));
          if (!t) return null;
          const o = Object.assign({}, it, { v: ctx.dvSide(t, it.v.cat) });
          const dirs = r.dirs.filter(dir => safeQ({ rel: r, it: o, dir }));
          if (dirs.length < r.dirs.length) o.dirs = dirs;
          return o;
        }).filter(Boolean);
      });
    }
    const KWBAD = new WeakMap();
    const kwBad = it => { if (!KWBAD.has(it)) KWBAD.set(it, !!giveaway(it.v.t, card(it.tc))); return KWBAD.get(it); };

    /* ---------- the new relation: the card is ill dignified → what it shows (the other direction of dv.ill, the same fact) ---------- */
    Q.addRelations(ctx => {
      B = ctx; ATTR = atuAttr(); for (const k in KW) delete KW[k];
      if (!ctx.tItem || !ctx.mask || !ctx.dvSide) return;
      try { cleanDeck(ctx); } catch (e) { console.error('divination path: cleaning the deck', e); }
      const illNote = k => () => `Book T: “${esc(dv(k).orig.illDignified)}”`;
      // (not a sense that would give its card away, nor one with a blank: neither asked nor offered, in the stage and in Practice)
      const items = ORDER.map(k => {
        const X = card(k), t = cleanIll(ctx.mask(X, dv(k).orig.illDignified || '')), v = X && t ? ctx.dvSide(ctx.clip(t, 200), 'dvill') : null;
        return v && !giveaway(v.t, X) && !v.t.includes(BLANK) ? ctx.tItem(X, v, { fx: ['dv.ill|' + k], review: 'Card → ill dignified (Book T)', note: illNote(k), noteL: illNote(k) }) : null;
      });
      ctx.rel({ id: 'dv.illf', deck: 'divination', name: 'Card → ill dignified (Book T)', dirs: ['f'], sim: ctx.tsim,
        // two senses sharing a word or a kind of vice ("cruel" / "merciless") could both be right: never offered together; nor a court
        // card's sense (a person: "Wasteful and prodigal") with another card's (a state of affairs: "Luxury, dissipation")
        near: (a, b) => illGroup(a) !== illGroup(b) || illNear(a.v.t, b.v.t),
        fq: it => `In a reading, ${theCard(it)} is <b>ill dignified</b>. What does it show? <span class="sub">(Book T)</span>${qImg(it)}`,
        items });
    });

    /* ---------- never offered together, and the prompts, per stage (stage.refine) ---------- */
    const TC_ = it => card(it.tc) || {};
    const onlyMajors = (a, b) => TC_(b).kind !== 'major';
    const sameKind = (a, b) => TC_(a).kind !== TC_(b).kind;
    const onlyMinors = (a, b) => TC_(b).kind !== 'minor';
    const grp = it => { const k = TC_(it).kind; return k === 'ace' ? 'minor' : k; };
    const sameGroup = (a, b) => grp(a) !== grp(b);
    // the small cards of the answer's suit first (then the same number)
    const suitSim = (a, b) => (TC_(a).suit && TC_(a).suit === TC_(b).suit ? 3 : 0) + (TC_(a).n === TC_(b).n ? .5 : 0);
    // never offered together: another kind of card (restrict), a card the quoted text names; and for the keywords (short, so two cards'
    // keywords sharing a word could both fit: "Gain." / "Gain of money…", both asked both ways round) a card whose keywords share a word
    // with the answer's, or a keyword text naming the card asked about. (A Book T passage or a summary is the card's own: only the cards
    // it names could be taken for it.)
    // Keywords also need the direction of the question being built (ask: 'f' "what does … signify?", the keywords are the options;
    // 'r' "which card signifies …?", cards are): the quiz hands it to near as its third argument (fwd, see quiz.html distractors);
    // '' (unknown: a matching) applies both directions' rules.
    const askOf = fwd => fwd === true ? 'f' : fwd === false ? 'r' : '';
    // Keywords that echo the other card's Book T meaning could be right for it as well: "Wise, deft, subtle in practical affairs"
    // (Princess of Swords) beside the Queen of Swords ("subtle, quick and confident"), "Success abandoned" (Eight of Cups) beside the
    // Four ("Success or pleasure approaching their end"). Asked "what does a signify?", b's keywords must not echo a's Book T; asked
    // "which card signifies a's keywords?", a's must not echo b's. The Aces are exempt: Book T sets them against each other (the Ace
    // of Wands "Natural, as opposed to Invoked, Force"), and there are only four.
    const echoes = (a, b, ask) => kindOf(a.tc) !== 'ace' && kindOf(b.tc) !== 'ace'
      && ((ask !== 'r' && shareWord(kwWords(b.tc), btWords(a.tc))) || (ask !== 'f' && shareWord(kwWords(a.tc), btWords(b.tc))));
    // Where the keywords are the options, none may stand out from the answer: one with a blank or a word naming its own card (the answer
    // never has one, see safeQ: the blank would mark a wrong option), nor, beside the learner's own keywords (Book T's short meanings,
    // "Gain."), one of the app's ("Plenty, good fortune, festive generosity").
    const ODD = new WeakMap();
    const kwOdd = it => { if (!ODD.has(it)) ODD.set(it, it.v.t.includes(BLANK) || !!giveaway(it.v.t, card(it.tc))); return ODD.get(it); };
    // Practice and the daily review ask "what does … signify?" as well, with every card's keywords: there keywords holding a blank are
    // never offered beside keywords without one (the blank would mark the answer, or a wrong option), nor keywords that name their
    // own card (its suit, number or title: they would look like the answer of a question on a card of that suit) — QuizPaths.addNear
    if (typeof Q.addNear === 'function') Q.addNear('dv.kw', (a, b, fwd) => fwd === true && (a.v.t.includes(BLANK) !== b.v.t.includes(BLANK) || kwBad(a) || kwBad(b)));
    const nearMeaning = (restrict, textOf, kw) => (a, b, fwd) => restrict(a, b) || namesCard(textOf(a), card(b.tc))
      || (!!kw && (shareWord(kwWords(a.tc), kwWords(b.tc)) || namesCard(textOf(b), card(a.tc)) || echoes(a, b, askOf(fwd))
        || (fwd === true && (kwOdd(b) || (kwMine(a.tc) && !kwMine(b.tc))))));
    function meaningRefine(restrict, sim) {
      const o = {
        'dv.kw': { fq: it => `What does ${theCard(it)} signify in a reading?${qImg(it)}`,
          rq: it => `Which card signifies <b>${esc(unblank(it.v.t).replace(/\.$/, ''))}</b> in a reading?`,
          near: nearMeaning(restrict, it => it.v.t, true) },
        'dv.bookT': { rq: it => `<span class="sub">Book T (1912):</span> “${esc(unblank(cleanBT(it.v.t)))}” <br>Which card?`, near: nearMeaning(restrict, it => cleanBT(it.v.t)) },
        'dv.brief': { rq: it => `“${esc(unblank(it.v.t))}” <br>Which card is this?`, near: nearMeaning(restrict, it => it.v.t) },
        'dv.mine': { rq: it => `<span class="sub">Your meanings:</span> “${esc(unblank(it.v.t))}” <br>Which card?`, near: nearMeaning(restrict, it => it.v.t) }
      };
      if (sim) Object.keys(o).forEach(id => { o[id].sim = sim; });
      return o;
    }
    const titleRefine = { 'ta.title': { near: (a, b) => onlyMinors(a, b) || titleClash(card(a.tc), card(b.tc)), sim: suitSim } };
    const illRefine = { 'dv.ill': { rq: it => `<span class="sub">Ill dignified (Book T):</span> “${esc(unblank(cleanIll(it.v.t)))}” <br>Which card?`,
      near: (a, b) => illGroup(a) !== illGroup(b) || illNear(cleanIll(a.v.t), cleanIll(b.v.t)) || namesCard(cleanIll(a.v.t), card(b.tc)) } };

    /* ---------- one question per card and per answer (stage clash) ---------- */
    const ansKey = c => Q.ckey(c.dir === 'f' ? c.it.v : c.it.s);
    // Two questions on one card give each other away: its title sums up its meaning ("Strife" / "Quarrelling and fighting"), the title's
    // explanation names Book T's title ("Lord of Abandoned Success" / "Success abandoned; decline of interest"), a blank in a quotation
    // stands for the title, and the learner's photo (in a prompt, or beside the answer) prints it. So a card is asked once per quiz.
    function clashMeaning(a, b) {
      if (Q.guards.leak(a, b)) return true;
      if (ansKey(a) === ansKey(b)) return true;   // the same answer twice
      return !!a.it.tc && a.it.tc === b.it.tc;
    }
    // stage 1: the facts a structure question states or shows — a suit's element / letter (S), a rank's (R), an element's letter of the
    // Name (L), a sign (Z), an Atu's attribution (A), its card — never two questions on one of them (the Knight of Cups' "Fire of Water"
    // answers "the root of Water?"; "Queens are Hé, the letter of Water" answers "which letter are the Cups?", whose answer is Hé again)
    function buildFacts(c) {
      const X = card(c.it.tc), id = c.rel.id, out = ['card:' + c.it.tc];
      if (!X) return out;
      if (id === 'ta.ace.el' || id === 'ta.ace.letter' || id === 'ta.ace.root') out.push('S:' + X.suit.k);
      if (id === 'ta.ace.letter') out.push('L:' + X.suit.el);
      if (id === 'ta.court.el') out.push('S:' + X.suit.k, 'R:' + X.rank.k);
      if (id === 'ta.court.letter') out.push('R:' + X.rank.k, 'L:' + X.rank.el);
      if ((id === 'ta.decan' || id === 'ta.planet') && X.dec) out.push('Z:' + X.dec.sign);
      if (id === 'tr.attr') String(c.it.v.t).split('/').map(x => x.trim()).forEach(a => { out.push('A:' + a); if (Q.SIGNS.includes(a)) out.push('Z:' + a); });
      return out;
    }
    // (nor the same answer twice: "Water" for the Ace of Cups and for Atu XII)
    const clashBuild = (a, b) => Q.guards.leak(a, b) || ansKey(a) === ansKey(b) || buildFacts(a).some(f => buildFacts(b).includes(f));

    /* ---------- explanations after each answer: the fact just asked, nothing another question of the quiz asks ---------- */
    const he = (s) => Q.he(s);
    const pl = n => `${esc(Q.symOf(PLN(n)))}${esc(n)}`;
    const sgH = s => `${esc(Q.symOf(s))}${esc(s)}`;
    // a text about X with X's own names blanked; '' when a form of them is still there (it could answer "which card is titled …?"), or a
    // number or a card's place ("bleaker still than the Nine" would point to another question's card)
    const tidy = (X, t) => { t = mask(X, t);
      return !t || namesCard(t, X) || /\d/.test(t) || lw(t).some(w => NUMWORD.has(w)) || /\b(?:previous|preceding|following|next)\s+(?:symbol|card)s?\b/i.test(t) ? '' : unblank(t); };
    function explainMeaning(it, c) {
      const X = card(it.tc); if (!X) return null;
      const k = X.key, r = c.dir === 'r', kwQ = c.rel.id === 'dv.kw';
      const t = kwQ ? tidy(X, clip(dv(k).eff.brief || '', 230)) : tidy(X, dv(k).eff.keywords || '');
      const lab = kwQ ? 'In brief' : kwMine(k) ? 'Your keywords' : 'Keywords';
      // (the card itself is not named: after a miss the feedback already says "Answer: …")
      return t ? `<div class="dvp-ex">${r ? img(k, 'dvp-th', '') : ''}<div><span class="sub">${lab}:</span> ${esc(t)}</div></div>` : null;
    }
    function explainTitle(it, c) {
      if (c.rel.id !== 'ta.title') return explainMeaning(it, c);
      const X = card(it.tc); return X && X.bookT ? `Book T calls the ${esc(X.name)} the <i>Lord of ${esc(X.bookT)}</i>.` : null;
    }
    function explainIll(it, c) {
      const X = card(it.tc); if (!X) return null;
      const d = dv(X.key), t = tidy(X, d.eff.keywords || '');
      return `<div class="dvp-ex">${c.dir === 'r' ? img(X.key, 'dvp-th', '') : ''}<div>Book T: “${esc(mask(X, d.orig.illDignified || ''))}”`
        + (t ? `<br><span class="sub">${kwMine(X.key) ? 'Your keywords' : 'Keywords'}:</span> ${esc(t)}` : '') + `</div></div>`;
    }
    function explainBuild(it, c) {
      const X = card(it.tc), id = c.rel.id; if (!X) return null;
      const su = X.suit, rk = X.rank;
      if (id === 'ta.ace.el') return `The ${esc(X.name)} is the root of ${esc(su.el)}: the ${esc(su.n)} are the suit of ${esc(su.el)}.`;
      if (id === 'ta.ace.letter') { const r = letterOf(su.el); return r ? `The ${esc(su.n)} (${esc(su.el)}) are ${esc(r.hl)} ${he(r.he)} of the Name.` : null; }
      if (id === 'ta.court.el') return `${esc(rk.pl)} are the ${esc(rk.el)} of their suit, and the ${esc(su.n)} are ${esc(su.el)}: ${esc(rk.el)} of ${esc(su.el)}.`;
      if (id === 'ta.court.letter') return `${esc(rk.pl)} are ${esc(rk.hl)} ${he(rk.he)} in every suit — the letter of ${esc(rk.el)}.`;
      if ((id === 'ta.decan' || id === 'ta.planet') && X.dec) { const d = X.dec;
        return `The ${esc(X.name)} is ${sgH(d.sign)} ${d.rn} (${esc(d.deg)}), the decan ruled by ${pl(d.ruler)}.`; }
      if (id === 'tr.attr') { const a = ATTR[X.key], P = a && Q.tree.row[a.row];
        return a && P ? `Atu ${esc(X.num)} ${esc(X.title)} is the letter ${esc(P.name)} ${he(P.glyph)}: ${a.h}.` : null; }
      return null;
    }

    /* ---------- lessons ---------- */
    const bt = t => esc(t).replace(/\n+/g, '<br>');
    const list = blocks => `<div class="dvp-list">${blocks.join('')}</div>`;
    const tag = t => `<span class="dvp-tag">${t}</span>`;
    function block(k, o) {
      const X = card(k), d = dv(k); o = o || {};
      const kw = d.eff.keywords, bT = d.orig.meaning, br = d.eff.brief;
      return `<div class="dvp-c">${img(k, 'dvp-th', '')}<div class="dvp-b">`
        + `<div class="dvp-h"><b>${o.head || esc(X.label)}</b>${o.sub ? ` <span class="sub">· ${o.sub}</span>` : ''}</div>`
        + (kw ? `<div class="dvp-kw">${esc(kw)}${kwMine(k) ? tag('your keywords') : ''}</div>` : '')
        + (bT ? `<div class="dvp-bt"><span class="sub">Book T:</span> ${bt(bT)}</div>` : '')
        + (br ? `<details class="dvp-d"><summary>In brief${d.mine && (d.mine.brief || '').trim() ? ' (yours)' : ''}</summary><div>${esc(br)}</div></details>` : '')
        + (o.extra || '') + `</div></div>`;
    }
    const anyScan = () => ORDER.some(k => !!scan(k));
    function lesBuild() {
      const at = ATTR, groups = { element: [], planet: [], sign: [] };
      MAJ.forEach(k => { const a = at[k]; if (!a) return; const p = a.t.split('/')[0].trim();
        (['Air', 'Water', 'Fire', 'Earth'].includes(p) ? groups.element : Q.SIGNS.includes(p) ? groups.sign : groups.planet).push(k); });
      groups.sign.sort((x, y) => Q.SIGNS.indexOf(at[x].t) - Q.SIGNS.indexOf(at[y].t));
      const atu = k => { const X = card(k), a = at[k], P = Q.tree.row[a.row] || {};
        return `<b>${esc(X.num)}</b> ${esc(X.title)} <span class="sub">(${he(P.glyph || '')} ${esc(P.name || '')}, ${a.h})</span>`; };
      const ex = [['knight', 'cups'], ['queen', 'swords'], ['prince', 'disks'], ['princess', 'wands']];
      const decRows = Q.SIGNS.map(s => { const ds = Q.tarot.decans.filter(d => d.sign === s);
        return [`${sgH(s)}<br><span class="sub">${esc(ds[0] ? ds[0].suit.n : '')}</span>`, ...ds.map(d => `<b>${d.n}</b> ${pl(d.ruler)}`)]; });
      const first = Q.tarot.decans[0];
      return L.p(`The 78 cards fall into three families: the <b>22 Atus</b> (the trumps), the <b>16 court cards</b> and the <b>40 small cards</b> — an Ace and nine numbered cards in each suit. Much of what a card says in a reading follows from where it sits in this frame, so learn the frame first.`)
        + L.sec('The 22 Atus: the Hebrew letters')
        + L.p(`Each Atu is one of the 22 letters, and through its letter one of the three elements (the mother letters), the seven planets (the double letters) or the twelve signs (the simple letters).`)
        + L.p(`<b>Elements:</b> ${groups.element.map(atu).join(' · ')}`) + L.p(`<b>Planets:</b> ${groups.planet.map(atu).join(' · ')}`) + L.p(`<b>Signs:</b> ${groups.sign.map(atu).join(' · ')}`)
        + L.sec('The four suits: the letters of the Name')
        + L.p(`The Name ${he('יהוה')} has four letters, and each suit is one of them and one element.`)
        + L.table(['Suit', 'Element', 'Letter', 'World'], SUITS.map(su => { const r = letterOf(su.el); return [`<b>${esc(su.n)}</b>`, esc(su.el), r ? `${esc(r.hl)} ${he(r.he)}` : '', esc(su.world)]; }))
        + L.sec('Court cards: an element of an element')
        + L.p(`The rank gives the first element, the suit the second. A court card is its rank's element working in its suit's element: the Knight of Cups is <b>Fire of Water</b>.`)
        + L.table(['Rank', 'Element', 'Letter', 'For example'], RANKS.map(r => { const e = ex.find(x => x[0] === r.k), su = SUITS.find(x => x.k === (e ? e[1] : 'wands'));
          return [`<b>${esc(r.n)}</b>`, esc(r.el), `${esc(r.hl)} ${he(r.he)}`, `${esc(r.n)} of ${esc(su.n)}: ${esc(r.el)} of ${esc(su.el)}`]; }))
        + L.sec('The Aces: the roots')
        + L.p(`Each Ace is the root of its element, whole and undivided: ${ACES.map(k => `the ${esc(card(k).name)} is <i>${esc(String(card(k).title).replace(/^The /, 'the '))}</i>`).join('; ')}.`)
        + L.sec('The small cards 2–10: the 36 decans')
        + L.p(`The nine numbered cards of a suit are the nine decans (the thirds of a sign, 10° each) of its element's three signs. The seven planets rule the decans in turn, in the Chaldean order, beginning with ${pl(first.ruler)} in the first decan of ${sgH(first.sign)} — so each small card is a planet in a sign: the ${first.n} of ${esc(first.suit.n)} is ${esc(first.ruler)} in ${esc(first.sign)}. Cardinal signs hold the 2, 3 and 4 of their suit, fixed signs the 5, 6 and 7, mutable signs the 8, 9 and 10.`)
        + L.table(['Sign', 'I', 'II', 'III'], decRows)
        + (anyScan() ? '' : L.p(`<span class="sub">Photos of your own cards, once you have scanned them, appear beside the cards in these lessons and in some questions.</span>`));
    }
    const intro = t => L.p(t + ' The quiz asks both ways round — what a card means, and which card a meaning belongs to; every passage it quotes leaves the card\'s own names out.');
    function lesAtus() {
      return intro(`Book T (1912) gives each Atu a short meaning for divination, and the app adds keywords and an “In brief” summary in plain words. Learn the keywords first, then read Book T's own words beside them, then open “In brief”.`)
        + list(MAJ.map(k => block(k, { head: `${esc(card(k).num)} · ${esc(card(k).title)}`, sub: ATTR[k] ? ATTR[k].h : '' })));
    }
    function lesAcesCourts() {
      return intro(`An Ace is the root of its element's powers (its Book T title), so it shows that element's force before it divides into the rest of the suit. Book T describes each court card as a person (“he is active, generous…”), so in a reading a court card usually stands for someone, or for a way of acting; its ill-dignified side is stage 8.`)
        + L.sec('The four Aces') + list(ACES.map(k => block(k, { head: esc(card(k).name), sub: esc(card(k).title) })))
        + L.sec('The sixteen court cards')
        + L.p(`Rank and suit give each its two elements (stage 1): the Knight of Wands is Fire of Fire, the Princess of Disks Earth of Earth.`)
        + list(COURTS.map(k => block(k, { head: esc(card(k).name), sub: esc(card(k).small) })));
    }
    function lesSuit(su) {
      const ks = suitCards(su, ['minor']), r = letterOf(su.el), signs = Q.uniq(ks.map(k => card(k).dec.sign));
      return intro(`The ${esc(su.n)} are ${esc(su.el)}${r ? `, ${esc(r.hl)} ${he(r.he)} of the Name` : ''}. Their nine small cards are the decans of the three ${esc(su.el)} signs, ${Q.listAnd(signs.map(sgH))}: each is a planet in a sign, and its Thoth title sums up what it means in a reading. Book T names each the “Lord of …”, and ends its description with the card's Sephirah and the letter of its suit, then a short meaning.`)
        + L.table(['Card', 'Thoth title', 'Planet in sign'], ks.map(k => { const X = card(k); return [`${X.n} of ${esc(su.n)}`, `<b>${esc(X.title)}</b>`, `${pl(X.dec.ruler)} in ${sgH(X.dec.sign)}`]; }))
        + L.sec('Card by card')
        + list(ks.map(k => { const X = card(k); return block(k, { head: `${X.n} · ${esc(X.title)}`, sub: `Lord of ${esc(X.bookT)}` }); }));
    }
    function lesDignity() {
      const ill = ORDER.filter(k => dv(k).orig.illDignified), well = ORDER.filter(k => dv(k).orig.wellDignified);
      // what else Book T says about dignity, card by card (its own sentences, the ill- and well-dignified ones above left out)
      const notes = ORDER.map(k => { const o = dv(k).orig, skip = [o.illDignified, o.wellDignified].filter(Boolean).map(s => s.trim());
        const all = String(o.meaning || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
        // a bare "According to dignity." keeps the sentence before it, which it qualifies
        const ss = all.map((s, i) => /dignit|dignified/i.test(s) && !skip.some(x => x.includes(s) || s.includes(x)) ? (s.length < 40 && i ? all[i - 1] + ' ' + s : s) : '').filter(Boolean);
        return ss.length ? [k, ss.join(' ')] : null; }).filter(Boolean);
      return L.p(`Book T gives no reversed meanings. Instead, a card is <b>well</b> or <b>ill dignified</b> by the cards on either side of it: cards of its own suit strengthen it greatly; cards of the element contrary to its own weaken it greatly — Fire (Wands) and Water (Cups) are contrary, and so are Air (Swords) and Earth (Disks). Book T counts Swords friendly with Cups and Wands, and Wands friendly with Swords and Disks (its Pentacles); it gives no relation between Cups and Disks. Well dignified, a card shows its good side; ill dignified, its bad side.`)
        + L.p(`<span class="sub">That rule is Book T's method of reading (Equinox I:8, 1912), given here as a teaching aid; the quiz asks the ill-dignified senses below, in both directions — which card a sense belongs to, and what a card shows when ill dignified.</span>`)
        + L.sec(`Book T's ill-dignified senses · ${ill.length} cards`)
        + list(ill.map(k => `<div class="dvp-c">${img(k, 'dvp-th', '')}<div class="dvp-b"><div class="dvp-h"><b>${esc(card(k).label)}</b></div>`
          + `<div class="dvp-bt">${esc(dv(k).orig.illDignified)}</div>${dv(k).eff.keywords ? `<div class="sub">${kwMine(k) ? 'Your keywords' : 'Keywords'}: ${esc(dv(k).eff.keywords)}</div>` : ''}</div></div>`))
        + (well.length ? L.sec('Well dignified') + L.p(well.map(k => `The ${esc(card(k).name)}: “${esc(dv(k).orig.wellDignified)}”`).join(' ') + ` <span class="sub">(the only card for which Book T spells out a separate well-dignified sense)</span>`) : '')
        + (notes.length ? L.sec('What else Book T says about dignity') + L.table(['Card', 'Book T'], notes.map(([k, t]) => [`<b>${esc(card(k).name)}</b>`, esc(t)])) : '');
    }
    function lesMine() {
      const has = k => !!dv(k).eff.meaning || kwMine(k);
      const n = ORDER.filter(k => !!dv(k).eff.meaning).length;
      const mb = k => { const X = card(k), d = dv(k);
        return `<div class="dvp-c">${img(k, 'dvp-th', '')}<div class="dvp-b"><div class="dvp-h"><b>${esc(X.label)}</b></div>`
          + (kwMine(k) ? `<div class="dvp-kw">${esc(d.eff.keywords)}${tag('your keywords')}</div>` : '')
          + (d.eff.meaning ? `<div class="dvp-bt">${esc(d.eff.meaning).replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>')}</div>` : '')
          + (d.eff.notes ? `<div class="sub">Your notes: ${esc(d.eff.notes)}</div>` : '') + `</div></div>`; };
      const groups = [['The Atus', MAJ], ...SUITS.map(su => [esc(su.n), suitCards(su, ['ace', 'minor', 'court'])])]
        .map(([t, ks]) => [t, ks.filter(has)]).filter(g => g[1].length);
      return L.p(`These are your own meanings — ${n} card${n === 1 ? '' : 's'} — from your document or your edits in the Tarot Deck tool. The quiz quotes the opening of each and asks which card it belongs to; where your document gives a card its own keywords, it asks those both ways too. Each card's own names are left out of the quotations. Tap a group to read it.`)
        + groups.map(([t, ks]) => `<details class="dvp-grp"><summary>${t} · ${ks.length}</summary>${list(ks.map(mb))}</details>`).join('');
    }

    /* ---------- the stages ---------- */
    const isK = kinds => it => kinds.includes(kindOf(it.tc));
    const inSuit = su => it => kindOf(it.tc) === 'minor' && card(it.tc).suit === su;
    const pick = (id, f, dir) => Q.sel(id, (it, c) => f(it) && safeQ(c), dir);
    // "what does … signify?" only where three other cards the stage may offer have keywords like the answer's (the learner's own, or
    // the app's) with nothing odd about them (kwOdd): the app's for the Three of Cups beside the learner's for the other Cups would stand out
    const kwPeers = (it, restrict) => Q.cards('dv.kw').filter(c => c.dir === 'f' && c.it.tc !== it.tc && !restrict(it, c.it)
      && kwMine(c.it.tc) === kwMine(it.tc) && !kwOdd(c.it)).length >= 3;
    const meaningItems = (f, restrict) => [pick('dv.kw', it => f(it) && kwPeers(it, restrict), 'f'), pick('dv.kw', f, 'r'), pick('dv.bookT', f), pick('dv.brief', f)];
    const stages = [
      { id: 'build', title: 'How the deck is built', sub: 'Atus and letters; suits and the Name; courts, Aces and decans', size: 12, clash: clashBuild,
        lesson: lesBuild, explain: explainBuild,
        items: () => ['ta.ace.el', 'ta.ace.letter', 'ta.court.el', 'ta.court.letter', 'ta.decan', 'ta.planet', 'tr.attr'].map(id => Q.sel(id)) },
      { id: 'atus', title: 'The 22 Atus', sub: 'Keywords and Book T’s meanings', size: 12, lesson: lesAtus, explain: explainMeaning,
        refine: meaningRefine(onlyMajors), items: () => meaningItems(isK(['major']), onlyMajors) },
      { id: 'aces-courts', title: 'Aces and court cards', sub: 'The four roots and the sixteen characters', size: 12, lesson: lesAcesCourts, explain: explainMeaning,
        refine: meaningRefine(sameKind), items: () => meaningItems(isK(['ace', 'court']), sameKind) },
      // (nine questions: one on each card, see clashMeaning)
      ...SUITS.map(su => ({ id: su.k, title: `${su.n} 2–10`, sub: `${su.el}: Thoth titles and meanings`, size: 9,
        lesson: () => lesSuit(su), explain: explainTitle, refine: Object.assign(meaningRefine(onlyMinors, suitSim), titleRefine),
        items: () => [Q.sel('ta.title', inSuit(su), 'f'), Q.sel('ta.title', inSuit(su), 'r'), ...meaningItems(inSuit(su), onlyMinors)] })),
      { id: 'dignity', title: 'Well and ill dignified', sub: 'How neighbours change a card; Book T’s ill-dignified senses', size: 10,
        lesson: lesDignity, explain: explainIll, refine: illRefine,
        items: () => [pick('dv.ill', () => true), pick('dv.illf', () => true, 'f')] }
    ];
    // the user's own meanings: a stage of its own while they have any (their document, or edits in the Tarot Deck tool)
    const hasMine = Q.cards('dv.mine').length > 0;
    if (hasMine) stages.push({ id: 'mine', title: 'Your own meanings', sub: 'From your document and your edits', size: 12, lesson: lesMine, explain: explainMeaning,
      refine: meaningRefine(sameGroup), items: () => [pick('dv.mine', () => true), pick('dv.kw', it => kwMine(it.tc) && kwPeers(it, sameGroup), 'f'), pick('dv.kw', it => kwMine(it.tc), 'r')] });

    Q.registerPath({
      id: 'divination', title: 'Learn Thoth divination', short: 'Divination', icon: '✦', blurb: 'Meanings in a reading', route: 'divination',
      intro: () => `A guided path through the meanings of the 78 Thoth cards in a reading — Book T (1912), the app's keywords${hasMine ? ' and your own document' : ' (import your own meanings in the Tarot Deck tool to add a stage on them)'}`,
      // (Book T's texts too: without divination.json the Atu, Ace, court and dignity stages would have no questions, and the path
      // could not be passed; the learner's own meanings alone still give Practice and Learn a card their questions)
      requires: () => !!Q.data.divination && Q.cards('dv.kw').length > 0 && Q.cards('dv.bookT').length > 0,
      clash: clashMeaning, retryHint: 'The lesson holds every answer.', stages
    });
  });
})();
