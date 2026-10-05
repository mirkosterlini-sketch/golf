// Legge in blocco i siti dei circoli elencati in data/circoli-siti.json e aggiunge le schede buca trovate
// a data/schede.json. Non tocca le schede preparate a mano. Scrive un resoconto in data/schede-report.json.
// Uso: node scripts/schede-batch.mjs [filtro-regione]
import { readFileSync, writeFileSync } from 'node:fs';
import { readClub } from './schede-auto.mjs';

const filtro = process.argv[2] || process.env.REGIONE || '';
const lista = JSON.parse(readFileSync('data/circoli-siti.json', 'utf8')).filter(c => !filtro || c.regione.toLowerCase().includes(filtro.toLowerCase()));
const data = JSON.parse(readFileSync('data/schede.json', 'utf8'));
const report = [];

const fetchText = async u => {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (CaddieMirko; app golf personale)', 'Accept-Language': 'it-IT,it;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = r.headers.get('content-type') || '';
  if (!/html|text/.test(t)) throw new Error('non è una pagina');
  return r.text();
};

async function uno(c) {
  if (data.circoli.some(x => !x.auto && x.ges === c.ges)) return { ...c, esito: 'già fatta a mano' };
  try {
    const res = await readClub(c.url, fetchText);
    const buone = res.buche.filter(b => b.img || (b.text && b.text.length > 60));
    const esito = { ...c, pagine: res.pagine.length, buche: res.buche.length, conFoto: res.buche.filter(b => b.img).length, conTesto: res.buche.filter(b => b.text).length, fonte: res.fonte };
    if (res.buche.length < 9 || buone.length < 6) return { ...esito, esito: 'schede non trovate' };
    const card = { key: 'auto-ges-' + c.ges, auto: true, ges: c.ges, nome: c.nome.charAt(0) + c.nome.slice(1).toLowerCase(), fonte: res.fonte,
      ...(res.mappa ? { mappa: res.mappa } : {}), aggiunta: new Date().toISOString().slice(0, 10),
      buche: res.buche.map(b => { const o = { ...b }; delete o.lenTesto; return o; }) };
    const i = data.circoli.findIndex(x => x.key === card.key);
    if (i >= 0) data.circoli[i] = card; else data.circoli.push(card);
    return { ...esito, esito: 'aggiunta' };
  } catch (e) { return { ...c, esito: 'errore: ' + e.message }; }
}

let k = 0;
await Promise.all([0, 1, 2, 3].map(async () => { while (k < lista.length) { const c = lista[k++]; const r = await uno(c); report.push(r); console.log(r.nome, '→', r.esito, r.buche != null ? `(${r.buche} buche, ${r.conFoto} foto, ${r.conTesto} testi)` : ''); } }));
data.aggiornato = new Date().toISOString().slice(0, 10);
writeFileSync('data/schede.json', JSON.stringify(data));
writeFileSync('data/schede-report.json', JSON.stringify(report.sort((a, b) => a.regione.localeCompare(b.regione) || a.nome.localeCompare(b.nome)), null, 1));
console.log('Aggiunte:', report.filter(r => r.esito === 'aggiunta').length, 'su', report.length);
