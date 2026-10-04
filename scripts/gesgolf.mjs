// Scarica i cartellini ufficiali (par, HCP buca, lunghezze, CR/SR) dalle pagine pubbliche "Percorsi" di GesGolf
// e li salva in data/gesgolf.json, che l'app legge. Gira ogni settimana con GitHub Actions.
// Uso: node scripts/gesgolf.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://www.gesgolf.it/GolfOnline/Clubs/';
const REGIONI = { 11: 'Liguria', 2: 'Lombardia', 14: 'Piemonte', 21: "Valle d'Aosta", 18: 'Toscana', 7: 'Emilia Romagna' };
const PAUSA_MS = 1500; // una richiesta ogni secondo e mezzo, per non pesare sul sito

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const num = s => { const v = parseFloat(String(s).replace(',', '.')); return isNaN(v) ? null : v; };

export function parsePercorso(html) {
  const sel = html.match(/id="cpCorpo_selPercorso"[\s\S]*?<\/select>/);
  const course = sel ? clean((sel[0].match(/<option selected="selected"[^>]*>([^<]*)</) || [, ''])[1]) : '';
  const start = html.indexOf('BUCHE DEL PERCORSO');
  if (start < 0) return null;
  const table = html.slice(start, html.indexOf('</table>', start));
  const headRow = (table.match(/<tr class="thGrigio">([\s\S]*?)<\/tr>/) || [])[1] || '';
  const heads = [...headRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => clean(m[1]));
  const iPar = heads.indexOf('PAR'), iHcp = heads.indexOf('HCP');
  const tees = heads.slice(1, iPar);
  const holes = [];
  for (const m of table.matchAll(/<tr>\s*<td class="posizione">([\s\S]*?)<\/tr>/g)) {
    const cells = [...('<td>' + m[1]).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => clean(c[1]));
    const n = parseInt(cells[0], 10); if (!n) continue;
    holes.push({ n, par: parseInt(cells[iPar], 10) || null, hcp: parseInt(cells[iHcp], 10) || null, len: tees.map((_, k) => parseInt(cells[1 + k], 10) || null) });
  }
  const egaAt = html.indexOf('EGA PLAYING');
  const crsr = egaAt > 0 ? [...html.slice(egaAt, egaAt + 4000).matchAll(/(CR|SR)\s*([\d.,]+)/g)].map(m => [m[1], num(m[2])]) : [];
  const teeInfo = tees.map((name, k) => ({ name, cr: (crsr[k * 2] || [])[1] ?? null, sr: (crsr[k * 2 + 1] || [])[1] ?? null }));
  return { course, tees: teeInfo, holes, par: holes.reduce((a, h) => a + (h.par || 0), 0) };
}

function hidden(html) {
  const out = {};
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) out[m[1]] = m[2].replace(/&amp;/g, '&');
  return out;
}

async function main() {
  let cookie = '';
  const get = async (url, opt = {}) => {
    const r = await fetch(url, { ...opt, headers: { 'User-Agent': 'CaddieMirko/1.0 (app golf personale)', ...(cookie ? { Cookie: cookie } : {}), ...(opt.headers || {}) } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(',').map(c => c.split(';')[0]).join('; ');
    return r.text();
  };
  const index = await get(BASE + 'Index.aspx');
  const clubs = new Map();
  for (const [id, regione] of Object.entries(REGIONI)) {
    await sleep(PAUSA_MS);
    const body = new URLSearchParams({ ...hidden(index), 'ctl00$cpCorpo$selRegione': id, 'ctl00$cpCorpo$txtCircolo': '', 'ctl00$cpCorpo$btnRicerca': 'Cerca' });
    const html = await get(BASE + 'Index.aspx', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    for (const m of html.matchAll(/<a[^>]+href="default\.aspx\?circolo_id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const name = clean(m[2]); if (name && !clubs.has(m[1])) clubs.set(m[1], { id: +m[1], name, regione });
    }
    console.log(regione, 'circoli trovati finora:', clubs.size);
  }
  const out = [];
  for (const c of clubs.values()) {
    await sleep(PAUSA_MS);
    try {
      const p = parsePercorso(await get(BASE + 'percorsi.aspx?circolo_id=' + c.id));
      if (p && p.holes.length >= 9) out.push({ ...c, ...p });
      console.log(c.name, p ? p.holes.length + ' buche' : 'nessun percorso');
    } catch (e) { console.log(c.name, 'errore', e.message); }
  }
  if (out.length < 10) throw new Error('Troppi pochi circoli letti (' + out.length + '): non sovrascrivo i dati');
  mkdirSync('data', { recursive: true });
  writeFileSync('data/gesgolf.json', JSON.stringify({ aggiornato: new Date().toISOString().slice(0, 10), fonte: 'gesgolf.it (pagine pubbliche Percorsi)', circoli: out }));
  console.log('Salvati', out.length, 'circoli');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
