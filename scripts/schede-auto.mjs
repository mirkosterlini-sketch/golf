// Lettore automatico delle schede buca dai siti dei circoli.
// Funziona sia nel browser che in Node: riceve l'HTML di una pagina e restituisce le buche trovate
// (numero, par, HCP, foto, descrizione, video). Usato dalla GitHub Action "Aggiungi schede da un link".

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&egrave;': 'è', '&eacute;': 'é', '&agrave;': 'à', '&ograve;': 'ò', '&ugrave;': 'ù', '&igrave;': 'ì', '&Egrave;': 'È', '&ldquo;': '“', '&rdquo;': '”', '&hellip;': '…', '&ndash;': '–', '&mdash;': '—', '&deg;': '°' };
export const decode = s => s.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-f]+;/gi, e => ENT[e] ?? (e[1] === '#' ? String.fromCodePoint(e[2] === 'x' || e[2] === 'X' ? parseInt(e.slice(3, -1), 16) : parseInt(e.slice(2, -1), 10)) : e));
const abs = (u, base) => { try { return new URL(decode(u.trim()), base).href; } catch (e) { return null; } };
const JUNK = /logo|icon|favicon|sponsor|partner|banner|avatar|placeholder|spinner|flag|social|facebook|instagram|youtube\.png|whatsapp|cookie|data:image|pixel|\.svg/i;

// sceglie l'immagine più grande da srcset
function bestFromSrcset(ss) {
  let best = null, bw = 0;
  for (const part of ss.split(',')) { const [u, w] = part.trim().split(/\s+/); const n = parseInt(w, 10) || 1; if (u && n >= bw) { bw = n; best = u; } }
  return best;
}
function imgUrl(tag) {
  const a = n => (tag.match(new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']+)["\']', 'i')) || [])[1];
  const ss = a('data-srcset') || a('srcset');
  return a('data-orig-file') || a('data-large-file') || a('data-full-url') || (ss && bestFromSrcset(ss)) || a('data-lazy-src') || a('data-src') || a('src');
}
const stripSize = u => u.replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)$)/i, '');

// HTML -> testo a righe, con segnaposto per immagini e video al posto giusto
export function toLines(html, base) {
  let h = html.replace(/<(script|style|noscript|svg|nav|footer|header|form|select)\b[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<img\b[^>]*>/gi, t => { const u = imgUrl(t); const alt = (t.match(/\salt\s*=\s*["']([^"']*)["']/i) || [])[1] || ''; return u && !JUNK.test(u) ? `\n[[IMG ${abs(u, base)} ${alt.replace(/\s+/g, '_')}]]\n` : ' '; });
  h = h.replace(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (m, u) => JUNK.test(u) ? m : `>\n[[IMG ${abs(u, base)} ]]\n<x `);
  h = h.replace(/<iframe\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi, (m, u) => /youtu|vimeo/.test(u) ? `\n[[VID ${abs(u, base)}]]\n` : ' ');
  h = h.replace(/<a\b[^>]*href\s*=\s*["']([^"']*(?:youtu\.be|youtube\.com\/watch|vimeo\.com)[^"']*)["'][^>]*>/gi, (m, u) => `\n[[VID ${abs(u, base)}]]\n`);
  h = h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|section|article|td|tr|table|ul|ol|figure|figcaption|span class="title[^"]*")>/gi, '\n').replace(/<(h[1-6]|p|li|tr)\b[^>]*>/gi, '\n');
  h = decode(h.replace(/<[^>]+>/g, ' '));
  return h.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const HOLE_RE = /^(?:[\w’' ]{0,40}:\s*)?(?:la\s+)?(?:buca|hole|bucca)\s*(?:n[°º.]?\s*)?(\d{1,2})\b\s*[-–:|·.]?\s*(.*)$/i;
const ytId = u => (u.match(/(?:youtu\.be\/|embed\/|v=|shorts\/)([\w-]{11})/) || [])[1];
function videoUrl(u) { const id = ytId(u); return id ? 'https://youtu.be/' + id : /vimeo/.test(u) ? u : null; }

// estrae le buche da una pagina
export function extractHoles(html, base) {
  const lines = toLines(html, base);
  const holes = new Map(), loose = [];
  let cur = null;
  const add = n => { if (!holes.has(n)) holes.set(n, { n, text: [], imgs: [], videos: [] }); return holes.get(n); };
  for (const l of lines) {
    const img = l.match(/^\[\[IMG (\S+) ?(.*)\]\]$/);
    if (img) {
      const u = stripSize(img[1]), name = (u.split('/').pop() + ' ' + img[2]).replace(/[_-]+/g, ' ');
      const m = name.match(/(?:buca|hole|bucca|b)\s*(\d{1,2})(?!\d)/i) || name.match(/^(\d{1,2})\.(?:jpe?g|png|webp)/i);
      if (m && +m[1] >= 1 && +m[1] <= 27) add(+m[1]).imgs.push({ u, byName: true });
      else if (cur) cur.imgs.push({ u, byName: false }); else loose.push(u);
      continue;
    }
    const vid = l.match(/^\[\[VID (\S+)\]\]$/);
    if (vid) { const v = videoUrl(vid[1]); if (v && cur) cur.videos.push(v); continue; }
    const hm = l.length < 400 && l.match(HOLE_RE);
    if (hm && +hm[1] >= 1 && +hm[1] <= 27) { cur = add(+hm[1]); if (hm[2]) cur.text.push(hm[2]); continue; }
    if (cur) cur.text.push(l);
  }
  const out = [];
  for (const h of [...holes.values()].sort((a, b) => a.n - b.n)) {
    let t = h.text.join(' ').replace(/\s+/g, ' ');
    const par = (t.match(/\bpar\s*[:.]?\s*([3-6])\b/i) || [])[1];
    const hcp = (t.match(/\b(?:hcp|h\.c\.p\.|handicap|hep|si|stroke index)\s*[:.]?\s*(\d{1,2})\b/i) || [])[1];
    const lens = [...t.matchAll(/(\d{2,3})\s*(?:mt|m|metri)\b/gi)].map(m => +m[1]).filter(v => v >= 50 && v <= 650);
    // pulizia: niente menu, cookie, pulsanti
    t = t.replace(/\b(Overwiev|Overview|Video|Immagini|Consigli|DETTAGLI|Dettagli|GUARDA IL VIDEO SU YOUTUBE|TORNA ALLA PAGINA PERCORSO|Torna al menu|Leggi di più|Scopri di più|Sponsored by)\b/gi, ' ')
      .replace(/(Questo sito|Questo sito web|Utilizziamo i cookie|cookie policy|Privacy policy)[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
    const named = h.imgs.find(i => i.byName), img = (named || h.imgs[0] || {}).u;
    const b = { n: h.n };
    if (par) b.par = +par; if (hcp && +hcp <= 18) b.hcp = +hcp;
    if (lens.length) b.lenTesto = [...new Set(lens)].slice(0, 6);
    if (img) b.img = img; if (h.videos[0]) b.video = h.videos[0];
    if (t.length > 25) b.text = t.slice(0, 1500);
    out.push(b);
  }
  return { holes: out, loose };
}

// trova la mappa del campo tra le immagini senza numero
export function findMap(lines) {
  return lines.find(u => /mappa|layout|piantina|planimetria|course.?map|percorso|campo/i.test(u.split('/').pop())) || null;
}

// link interni che probabilmente portano al percorso o alle singole buche
export function courseLinks(html, base) {
  const host = new URL(base).host.replace(/^www\./, '');
  const out = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = abs(m[1], base); if (!u) continue;
    let h; try { h = new URL(u); } catch (e) { continue; }
    if (h.host.replace(/^www\./, '') !== host || /\.(pdf|jpe?g|png|zip)$/i.test(h.pathname)) continue;
    const label = decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const s = (h.pathname + ' ' + label).toLowerCase();
    if (/pratica|gare|calendar|tariff|prezzi|news|contatt|ristorant|hotel|camere|privacy|cookie|login|shop|eventi|wedding|matrimon|scuola|academy|meteo|webcam/.test(s)) continue;
    let score = 0;
    if (/(buca|hole)[-_ ]?\d{1,2}\b/.test(s)) score = 3;
    else if (/percors|course|buche|holes|il campo|campo da golf|layout|scorecard/.test(s)) score = 2;
    if (score) out.set(h.href, Math.max(score, out.get(h.href) || 0));
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

// legge un sito partendo da un link: prova la pagina data e le pagine del percorso collegate
export async function readClub(startUrl, fetchText, log = () => {}) {
  const seen = new Set(), pages = [];
  const visit = async u => { if (seen.has(u) || seen.size >= 30) return null; seen.add(u);
    try { const html = await fetchText(u); pages.push({ u, html }); return html; } catch (e) { log('errore ' + u + ' ' + e.message); return null; } };
  const first = await visit(startUrl); if (!first) throw new Error('Non riesco ad aprire il link');
  const title = decode((first.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  let links = courseLinks(first, startUrl);
  const second = links.filter(l => !/(buca|hole)[-_ ]?\d/i.test(l)).slice(0, 6);
  for (const l of second) { const h = await visit(l); if (h) links = links.concat(courseLinks(h, l)); }
  for (const l of [...new Set(links)].filter(l => /(buca|hole)[-_ ]?\d/i.test(l)).slice(0, 27)) await visit(l);
  // unisce le buche trovate: per ogni buca tiene il dato più ricco
  const holes = new Map(); let mappa = null, best = null;
  for (const p of pages) {
    const r = extractHoles(p.html, p.u);
    const one = p.u.match(/(?:buca|hole)[-_ ]?(\d{1,2})\b/i);
    if (one && r.holes.length > 1) r.holes = r.holes.filter(h => h.n === +one[1] || h.img); // pagina di una buca sola
    for (const h of r.holes) {
      const o = holes.get(h.n) || { n: h.n };
      for (const k of ['par', 'hcp', 'img', 'video', 'lenTesto']) if (h[k] && !o[k]) o[k] = h[k];
      if (h.text && (!o.text || h.text.length > o.text.length)) o.text = h.text;
      holes.set(h.n, o);
    }
    if (r.holes.length > (best ? best.n : 0)) best = { u: p.u, n: r.holes.length };
    mappa = mappa || findMap(r.loose);
  }
  const buche = [...holes.values()].filter(h => h.img || h.text).sort((a, b) => a.n - b.n);
  return { title, fonte: best ? best.u : startUrl, mappa, buche, pagine: pages.map(p => p.u) };
}
