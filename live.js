/* Bussines Radar · capa de datos reales
   Fuentes públicas, gratuitas y sin clave (todas permiten CORS):
   - Wikimedia Pageviews API → interés diario real por tema (vistas de Wikipedia)
   - Hacker News (Algolia)   → historias recientes y volumen de menciones
   - ExchangeRate-API (open) → tipo de cambio USD → moneda local
   Todo se guarda en caché local para no saturar las APIs. */
window.AmbarLive = (() => {
  'use strict';
  const H = 3600e3;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const cache = {
    get(k, maxAge) {
      try {
        const raw = localStorage.getItem('ambar.c.' + k); if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        return Date.now() - t < maxAge ? v : null;
      } catch { return null; }
    },
    set(k, v) { try { localStorage.setItem('ambar.c.' + k, JSON.stringify({ t: Date.now(), v })); } catch {} },
  };

  // Cola: una petición a la vez por host, con pausa entre peticiones
  const queues = {};
  function queued(host, gap, fn) {
    const prev = queues[host] || Promise.resolve();
    const p = prev.then(fn);
    queues[host] = p.catch(() => {}).then(() => sleep(gap));
    return p;
  }

  async function getJSON(url, tries = 4) {
    let last;
    for (let i = 0; i < tries; i++) {
      let r;
      try { r = await fetch(url, { cache: 'no-store' }); }
      catch (e) { last = e; await sleep(800 * (i + 1)); continue; }
      if (r.status === 429 || r.status >= 500) { last = new Error('HTTP ' + r.status); await sleep(1500 * 2 ** i + Math.random() * 600); continue; }
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }
    throw last || new Error('sin respuesta');
  }

  const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

  /* Resuelve redirecciones y descarta títulos inexistentes (una sola consulta por lote) */
  async function resolveTitles(lang, titles) {
    const key = `rt:${lang}:${titles.join('|')}`;
    const hit = cache.get(key, 30 * 24 * H);
    if (hit) return hit;
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&origin=*&titles=${encodeURIComponent(titles.join('|'))}`;
    const q = (await queued('wiki', 220, () => getJSON(url))).query || {};
    const norm = Object.fromEntries((q.normalized || []).map(x => [x.from, x.to]));
    const red = Object.fromEntries((q.redirects || []).map(x => [x.from, x.to]));
    const exists = new Set(Object.values(q.pages || {}).filter(p => !('missing' in p) && !('invalid' in p)).map(p => p.title));
    const out = [];
    titles.forEach(t => {
      let x = t.replace(/_/g, ' '); x = norm[x] || x; x = red[x] || x;
      if (exists.has(x) && !out.includes(x.replace(/ /g, '_'))) out.push(x.replace(/ /g, '_'));
    });
    cache.set(key, out);
    return out;
  }

  /* Vistas diarias de Wikipedia (90 días). Usa el primer título con tráfico suficiente (≥ minAvg vistas/día). */
  async function pageviews(lang, titles, minAvg = 30) {
    let list;
    try { list = await resolveTitles(lang, titles); } catch { list = titles; }
    const end = new Date(Date.now() - 24 * H), start = new Date(end.getTime() - 89 * 24 * H);
    for (const title of list) {
      const key = `pv2:${lang}:${title}`;
      let out = cache.get(key, 6 * H);
      if (!out) {
        try {
          const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${ymd(start)}/${ymd(end)}`;
          const j = await queued('wiki', 220, () => getJSON(url));
          out = { lang, title, days: (j.items || []).map(i => ({ d: i.timestamp.slice(0, 8), v: i.views })), fetched: Date.now() };
          cache.set(key, out);
        } catch (e) {
          if (e.status === 404 || e.status === 400) continue;
          throw e;
        }
      }
      if (out.days.length < 45) continue;
      const last7 = out.days.slice(-7).reduce((s, x) => s + x.v, 0) / 7;
      if (last7 >= minAvg) return out;
    }
    return null;
  }

  /* Métricas a partir de la serie diaria */
  function wikiMetrics(pv) {
    const v = pv.days.map(x => x.v);
    const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    const avg7 = mean(v.slice(-7));
    const prev28 = mean(v.slice(-35, -7));
    const momentum = prev28 > 0 ? (avg7 / prev28 - 1) * 100 : 0;
    // media móvil de 7 días para los últimos 60 días
    const smooth = [];
    for (let i = Math.max(6, v.length - 60); i < v.length; i++) smooth.push(mean(v.slice(i - 6, i + 1)));
    const dates = pv.days.slice(-smooth.length).map(x => x.d);
    return { avg7, prev28, momentum, smooth, dates, total7: v.slice(-7).reduce((s, x) => s + x, 0) };
  }

  /* Historias de Hacker News de los últimos 30 días */
  async function hn(query) {
    const key = `hn2:${query}`;
    const hit = cache.get(key, 5 * 60e3);
    if (hit) return hit;
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=8&restrictSearchableAttributes=title&typoTolerance=false&numericFilters=${encodeURIComponent('created_at_i>' + since)}`;
    const j = await queued('hn', 350, () => getJSON(url));
    const out = {
      count: j.nbHits || 0,
      items: (j.hits || []).filter(h => h.title).map(h => ({
        id: h.objectID, title: h.title, t: h.created_at_i, pts: h.points || 0, com: h.num_comments || 0,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        hn: `https://news.ycombinator.com/item?id=${h.objectID}`,
        host: h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'news.ycombinator.com',
      })),
      fetched: Date.now(),
    };
    cache.set(key, out);
    return out;
  }

  /* Tipo de cambio desde USD */
  async function fx() {
    const hit = cache.get('fx', 6 * H);
    if (hit) return hit;
    const j = await getJSON('https://open.er-api.com/v6/latest/USD');
    if (j.result !== 'success') throw new Error('fx');
    const out = { rates: j.rates, updated: j.time_last_update_unix * 1000, fetched: Date.now() };
    cache.set('fx', out);
    return out;
  }

  return { pageviews, wikiMetrics, hn, fx, cache };
})();
