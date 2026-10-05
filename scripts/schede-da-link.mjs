// Aggiunge le schede buca di un circolo partendo da un link (chiamato dalla GitHub Action quando
// dall'app si chiede "Carica schede da un link"). Legge il link dal titolo/testo della richiesta.
// Uso locale: node scripts/schede-da-link.mjs "https://www.sitocircolo.it/percorso/" ["osm: relation123" "campo: Nome"]
import { readFileSync, writeFileSync } from 'node:fs';
import { readClub } from './schede-auto.mjs';

const title = process.env.ISSUE_TITLE || process.argv[2] || '';
const body = (process.env.ISSUE_BODY || process.argv.slice(3).join('\n')).replace(/\\n/g, '\n');
const url = ((title + ' ' + body).match(/https?:\/\/[^\s<>"']+/) || [])[0];
if (!url) { console.log('RISULTATO: Non ho trovato nessun link da leggere.'); process.exit(0); }
const osm = (body.match(/osm:[ \t]*(\S+)/i) || [])[1] || null;
const campo = ((body.match(/campo:[ \t]*(.*)/i) || [])[1] || '').trim();
const osmOk = osm && /^(way|relation|node)\d+$/.test(osm) ? osm : null;

const fetchText = async u => {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (CaddieMirko; app golf personale)', 'Accept-Language': 'it-IT,it;q=0.9' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
};

const res = await readClub(url, fetchText, m => console.log(m));
console.log('Pagine lette:', res.pagine.length, '— buche trovate:', res.buche.length);
if (res.buche.length < 3) {
  console.log('RISULTATO: Ho letto ' + res.pagine.length + ' pagine di ' + new URL(url).host + ' ma non ho trovato le schede delle buche (servono pagine con "Buca 1", "Buca 2"…). Prova a mandare il link della pagina "Percorso" del sito.');
  process.exit(0);
}
const u = new URL(res.fonte);
const key = 'auto-' + (u.host.replace(/^www\./, '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);
const nome = (res.title.split(/\s[|–—-]\s/)[0] || campo || u.host).trim();
const card = { key, auto: true, club: u.host.replace(/^www\./, ''), percorso: nome, nome: campo && !nome.toLowerCase().includes(campo.toLowerCase().split(' ')[0]) ? campo + ' – ' + nome : nome,
  fonte: res.fonte, ...(res.mappa ? { mappa: res.mappa } : {}), ...(osmOk ? { osm: osmOk } : {}), aggiunta: new Date().toISOString().slice(0, 10),
  buche: res.buche.map(b => { const o = { ...b }; delete o.lenTesto; return o; }) };

const file = 'data/schede.json';
const data = JSON.parse(readFileSync(file, 'utf8'));
const same = data.circoli.findIndex(c => c.key === key || (osmOk && c.osm === osmOk && c.auto));
const curated = data.circoli.find(c => !c.auto && c.fonte && new URL(c.fonte).host === u.host);
if (same >= 0) data.circoli[same] = card; else data.circoli.push(card);
data.aggiornato = new Date().toISOString().slice(0, 10);
writeFileSync(file, JSON.stringify(data));
const conTesto = card.buche.filter(b => b.text).length, conFoto = card.buche.filter(b => b.img).length;
console.log('RISULTATO: Fatto! "' + card.nome + '": ' + card.buche.length + ' buche (' + conFoto + ' con foto, ' + conTesto + ' con descrizione). ' +
  'Fra 2-3 minuti apri l\'app, vai in Altro → Schede da un link → Aggiorna.' + (curated ? ' Nota: per questo circolo c\'era già una scheda preparata a mano.' : ''));
