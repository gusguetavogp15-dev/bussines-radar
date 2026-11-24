/* Bussines Radar — UI + puntuación con datos reales
   Datos reales (live.js): interés y momentum (Wikipedia), noticias (Hacker News), tipo de cambio.
   Estimaciones del modelo (data.js): inversión, margen, ROI, retorno, competencia y riesgo. */
(() => {
  'use strict';
  const { CATS, MARKETS, SOURCES, SUPPLIERS, DEALS } = window.AMBAR;
  const Live = window.AmbarLive;

  // ───────── utilidades ─────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => n.replace(/\.com$/i, '').replace(/[^A-Za-zÁÉÍÓÚÑ0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const time = (t = Date.now()) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const hhmm = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + 'k' : String(Math.round(n));
  const ago = sec => {
    const s = Math.max(0, Date.now() / 1000 - sec);
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  };
  const dmy = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const signed = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d) + '%';

  // ───────── iconos ─────────
  const ICONS = {
    ecommerce: '<path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    alimentos: '<path d="M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V9z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H16.5"/><path d="M8 3.5v2.5M12 3.5v2.5"/>',
    tech: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    servicios: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
    importacion: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    sostenible: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l7-7"/>',
    educacion: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
    hogar: '<path d="M4 11l8-7 8 7v9H4v-9z"/><path d="M10 20v-5h4v5"/>',
    all: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>',
    news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 16h4"/>',
  };
  const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[k] || ICONS.all}</svg>`;

  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc48a"/><stop offset="1" stop-color="#ff6a00"/></linearGradient>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1a" stop-opacity=".38"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></linearGradient>
  </defs></svg>`);

  // ───────── estado ─────────
  const COMP = { Baja: 100, Media: 60, Alta: 30 };
  const savedMarket = store.get('ambar.market', 'global');
  const state = {
    view: 'radar', cat: 'all', q: '', maxCap: 40000, risk: 'all', sort: 'score',
    market: MARKETS[savedMarket] ? savedMarket : 'global',
    live: true, saved: new Set(store.get('ambar.saved', [])), steps: store.get('ambar.steps', {}),
    openId: null, supType: 'all', supQ: '', top: [], lastToast: 0, theme: store.get('radar.theme', 'cream'),
    wiki: { en: {}, es: {} },      // métricas reales por idioma y negocio
    hn: {},                        // noticias reales por negocio
    fx: null,                      // tipos de cambio
    seen: new Set(), ready: false, calc: {},
    status: {
      wiki: { s: 'load', n: 0, err: 0, t: 0 },
      hn: { s: 'load', n: 0, err: 0, t: 0 },
      fx: { s: 'load', t: 0 },
    },
  };
  const byId = Object.fromEntries(DEALS.map(d => [d.id, d]));
  const MKT = () => MARKETS[state.market];

  // ───────── moneda (tipo de cambio real) ─────────
  const SYM = { USD: '$', DOP: 'RD$', MXN: 'MX$', EUR: '€' };
  const rate = () => { const c = MKT().cur; return c === 'USD' ? 1 : (state.fx?.rates?.[c] || null); };
  const curCode = () => rate() ? MKT().cur : 'USD';
  const kmoney = usd => SYM[curCode()] + compact(usd * (rate() || 1));
  const money = usd => SYM[curCode()] + Math.round(usd * (rate() || 1)).toLocaleString('es-ES');

  // ───────── puntuación ─────────
  DEALS.forEach(d => { d.live = { score: 0, interest: d.demand, momentum: d.trend, buzz: 50, series: null, real: false, m: null }; });
  function recompute() {
    const W = state.wiki[MKT().lang];
    const logs = DEALS.map(d => W[d.id] ? Math.log10(W[d.id].avg7 + 1) : null).filter(x => x != null);
    const lo = Math.min(...logs), hi = Math.max(...logs);
    const hl = DEALS.map(d => state.hn[d.id] ? Math.log10(state.hn[d.id].count + 1) : null).filter(x => x != null);
    const hlo = Math.min(...hl), hhi = Math.max(...hl);
    DEALS.forEach(d => {
      const m = W[d.id] || null, h = state.hn[d.id] || null, L = d.live;
      L.m = m; L.real = !!m;
      L.interest = m ? (hi > lo ? 12 + 88 * (Math.log10(m.avg7 + 1) - lo) / (hi - lo) : 60) : d.demand;
      L.momentum = m ? clamp(m.momentum, -80, 150) : d.trend;
      L.buzz = h ? (hhi > hlo ? 100 * (Math.log10(h.count + 1) - hlo) / (hhi - hlo) : 50) : 50;
      L.series = m ? m.smooth : null;
      L.score = clamp(
        0.24 * L.interest + 0.16 * clamp(50 + L.momentum * 1.2, 0, 100) + 0.08 * L.buzz
        + 0.20 * Math.min(d.margin, 85) / 85 * 100 + 0.18 * Math.min(d.roi, 300) / 300 * 100 + 0.14 * COMP[d.comp], 1, 99);
    });
  }
  recompute();

  // ───────── gráficos ─────────
  function paths(arr, w, h, pad = 6) {
    const min = Math.min(...arr), max = Math.max(...arr), span = (max - min) || 1;
    const pts = arr.map((v, i) => [i / (arr.length - 1) * w, pad + (1 - (v - min) / span) * (h - 2 * pad)]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return { line: d, area: `${d} L${w},${h} L0,${h} Z`, min, max };
  }
  const FLAT = { line: 'M0,30 L300,30', area: 'M0,30 L300,30 L300,54 L0,54 Z' };
  const C = 2 * Math.PI * 18;
  const ring = (v, lg) => `<div class="ring${lg ? ' lg' : ''}"><svg viewBox="0 0 44 44"><circle class="rb" cx="22" cy="22" r="18"/><circle class="rf" cx="22" cy="22" r="18" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - v / 100)).toFixed(2)}"/></svg><b><span data-score>${Math.round(v)}</span>${lg ? '<small>SCORE</small>' : ''}</b></div>`;
  const deltaHTML = d => {
    if (!d.live.real) return `<span class="down">estimado</span>`;
    const v = d.live.momentum;
    return `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</span>`;
  };
  const srcLine = d => {
    const m = d.live.m;
    if (m) return `Wikipedia (${m.lang}) · ${compact(m.avg7)} vistas/día · 7 d`;
    return state.status.wiki.s === 'load' ? 'Cargando interés real…' : 'Sin datos reales · estimación';
  };

  // ───────── tarjeta ─────────
  function cardHTML(d, enter) {
    return `<article class="card glass${enter ? ' enter' : ''}" data-id="${d.id}" tabindex="0">
      <div class="card-head">
        <div class="card-meta"><div class="cat-label">${CATS[d.cat].label}<span data-badge></span></div><h3>${esc(d.title)}</h3></div>
        ${ring(d.live.score)}
      </div>
      <p class="pitch">${esc(d.pitch)}</p>
      <div class="spark"><svg viewBox="0 0 300 54" preserveAspectRatio="none"><path class="area" fill="url(#areaGrad)" d="${FLAT.area}"/><path class="line" d="${FLAT.line}" vector-effect="non-scaling-stroke"/></svg><span class="delta" data-delta></span></div>
      <div class="stats">
        <div class="stat"><span>Inversión</span><b>${kmoney(d.cap[0])}–${kmoney(d.cap[1])}</b></div>
        <div class="stat"><span>ROI 12 m</span><b>${d.roi}%</b></div>
        <div class="stat"><span>Retorno</span><b>${d.payback} meses</b></div>
      </div>
      <div class="card-foot">
        <span class="sup-count"><b>${d.suppliers.length}</b> proveedores</span>
        <button class="save${state.saved.has(d.id) ? ' on' : ''}" data-save="${d.id}" aria-label="Guardar">${icon('heart')}</button>
      </div>
    </article>`;
  }

  function updateCard(el, d) {
    const L = d.live, p = L.series ? paths(L.series, 300, 54) : FLAT;
    $('.spark', el).classList.toggle('loading', !L.series);
    $('.spark .line', el).setAttribute('d', p.line);
    $('.spark .area', el).setAttribute('d', p.area);
    $('.ring .rf', el).setAttribute('stroke-dashoffset', (C * (1 - L.score / 100)).toFixed(2));
    const sc = $('[data-score]', el), v = String(Math.round(L.score));
    if (sc.textContent !== v) sc.textContent = v;
    $('[data-delta]', el).innerHTML = L.real ? deltaHTML(d) : '';
    const rank = state.top.indexOf(d.id);
    $('[data-badge]', el).innerHTML = rank >= 0 && rank < 3 ? `<span class="badge">TOP ${rank + 1}</span>` : '';
  }

  // ───────── filtros + grid (FLIP) ─────────
  function filtered() {
    const q = state.q.trim().toLowerCase();
    const list = DEALS.filter(d => {
      if (state.cat !== 'all' && d.cat !== state.cat) return false;
      if (state.risk !== 'all' && d.risk !== state.risk) return false;
      if (state.maxCap < 40000 && d.cap[0] > state.maxCap) return false;
      if (q) {
        const hay = [d.title, d.pitch, CATS[d.cat].label, ...d.suppliers.map(([k]) => SUPPLIERS[k].n)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const key = { score: d => -d.live.score, roi: d => -d.roi, cap: d => d.cap[0], payback: d => d.payback, trend: d => -d.live.momentum }[state.sort];
    return list.sort((a, b) => key(a) - key(b));
  }

  const cardEls = new Map();
  function renderGrid() {
    const grid = $('#dealGrid'), list = filtered(), first = new Map();
    cardEls.forEach((el, id) => { if (el.isConnected) first.set(id, el.getBoundingClientRect()); });
    $('.empty', grid)?.remove();
    const keep = new Set(list.map(d => d.id));
    cardEls.forEach((el, id) => { if (!keep.has(id)) el.remove(); });
    list.forEach(d => {
      let el = cardEls.get(d.id);
      if (!el) { const t = document.createElement('div'); t.innerHTML = cardHTML(d, true); el = t.firstElementChild; cardEls.set(d.id, el); }
      else if (!first.has(d.id)) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
      grid.appendChild(el);
      updateCard(el, d);
    });
    list.forEach(d => {
      const el = cardEls.get(d.id), r0 = first.get(d.id);
      if (!r0) return;
      const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (!dx && !dy) return;
      el.style.transition = 'none'; el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = ''; }));
    });
    if (!list.length) grid.insertAdjacentHTML('beforeend', `<div class="empty glass"><b>Sin resultados con estos filtros</b>Prueba ampliando el capital disponible o cambiando de categoría.</div>`);
    renderKPIs();
  }
  function rebuildCards() { cardEls.forEach(el => el.remove()); cardEls.clear(); renderGrid(); if (state.view === 'saved') renderSaved(); }

  // ───────── KPIs ─────────
  function renderKPIs() {
    const list = filtered(), W = state.wiki[MKT().lang];
    const views = list.reduce((a, d) => a + (W[d.id]?.total7 || 0), 0);
    const news = list.reduce((a, d) => a + (state.hn[d.id]?.count || 0), 0);
    $('#kpis').innerHTML = [
      ['Negocios', String(list.length)],
      ['Vistas · 7 días', views ? compact(views) : '—'],
      ['Noticias · 30 días', Object.keys(state.hn).length ? compact(news) : '—'],
    ].map(([l, v]) => `<div class="kpi"><span>${l}</span><b class="num">${v}</b></div>`).join('');
  }

  // ───────── ranking (para la insignia TOP) ─────────
  function renderTop() {
    state.top = [...DEALS].sort((a, b) => b.live.score - a.live.score).slice(0, 3).map(d => d.id);
  }
  function buildTicker() {}
  function updateTicker() {}

  // ───────── noticias reales ─────────
  function renderFeed(freshIds = new Set()) {
    const seen = new Set(), items = [];
    DEALS.forEach(d => (state.hn[d.id]?.items || []).slice(0, 3).forEach(it => { if (!seen.has(it.id)) { seen.add(it.id); items.push({ ...it, deal: d }); } }));
    items.sort((a, b) => b.t - a.t);
    const movers = DEALS.filter(d => d.live.real && Math.abs(d.live.momentum) >= 15).sort((a, b) => Math.abs(b.live.momentum) - Math.abs(a.live.momentum)).slice(0, 3);
    const feed = $('#feed');
    if (!items.length && !movers.length) {
      feed.innerHTML = `<li class="plain"><span class="ev info">●</span><div>${state.status.hn.s === 'err' ? 'No se pudieron cargar noticias. Reintentando…' : 'Cargando noticias reales…'}</div></li>`;
      return;
    }
    feed.innerHTML =
      movers.map(d => `<li data-open="${d.id}"><span class="ev ${d.live.momentum >= 0 ? 'up' : 'down'}">${d.live.momentum >= 0 ? '▲' : '▼'}</span><div>Interés en <b>${esc(d.title)}</b> ${d.live.momentum >= 0 ? 'sube' : 'baja'} ${Math.abs(d.live.momentum).toFixed(0)}% frente a las 4 semanas previas<time>Wikipedia · ${compact(d.live.m.avg7)} vistas/día</time></div></li>`).join('') +
      items.slice(0, 14).map(it => `<li class="${freshIds.has(it.id) ? 'fresh' : ''}"><span class="ev info">${icon('news')}</span><div><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a><time><span class="ftag" data-open="${it.deal.id}">${esc(it.deal.tk)}</span> · ${esc(it.host)} · ${ago(it.t)}${it.pts > 1 ? ` · ${it.pts} pts` : ''}</time></div></li>`).join('');
  }

  // ───────── fuentes ─────────
  function renderSources() {
    const st = state.status, lang = MKT().lang;
    const W = state.wiki[lang], n = Object.keys(W).length;
    const lastDay = n ? Object.values(W)[0].dates.slice(-1)[0] : null;
    const fb = Object.values(W).filter(m => m.lang !== lang).length;
    const row = (s, name, detail, url) => `<li><span class="sdot ${s}"></span><div><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a><small>${detail}</small></div></li>`;
    const r = rate(), c = MKT().cur;
    $('#sources').innerHTML =
      row(st.wiki.s, 'Wikipedia · vistas por tema',
        st.wiki.s === 'load' ? `Cargando… ${n}/${DEALS.length} temas` :
        n ? `${n}/${DEALS.length} temas · ${lang}.wikipedia${fb ? ` (${fb} en inglés)` : ''} · datos al ${dmy(lastDay)}` : 'Sin conexión · usando estimaciones',
        'https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews') +
      row(st.hn.s, 'Hacker News · noticias',
        st.hn.s === 'load' && !st.hn.t ? `Cargando… ${Object.keys(state.hn).length}/${DEALS.length}` :
        Object.keys(state.hn).length ? `${Object.keys(state.hn).length} temas · actualizado ${hhmm(st.hn.t)}` : 'Sin conexión',
        'https://hn.algolia.com') +
      row(st.fx.s, 'Tipo de cambio',
        st.fx.s === 'load' ? 'Cargando…' : !state.fx ? 'Sin conexión · montos en USD' :
        c === 'USD' ? `Montos en USD · tasas al ${new Date(state.fx.updated).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` :
        `1 USD = ${r.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${c} · ${new Date(state.fx.updated).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
        'https://www.exchangerate-api.com');
  }

  // ───────── refresco de UI ─────────
  let uiTimer = null, sortTimer = null;
  function refreshUI(fresh) {
    recompute();
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      renderTop();
      $$('.card[data-id]').forEach(el => updateCard(el, byId[el.dataset.id]));
      renderKPIs(); updateTicker(); renderFeed(fresh); renderSources();
      if (state.openId) openDeal(state.openId, true);
      $('#lastUpdate').textContent = hhmm(Date.now());
    }, 120);
    clearTimeout(sortTimer);
    sortTimer = setTimeout(() => { if (state.view === 'radar' && !state.openId) renderGrid(); }, 1400);
  }

  // ───────── carga de datos reales ─────────
  let wikiRun = 0;
  async function loadWiki() {
    const lang = MKT().lang, run = ++wikiRun, st = state.status.wiki;
    st.s = 'load'; st.err = 0; renderSources();
    await Promise.allSettled(DEALS.map(async d => {
      try {
        let pv = await Live.pageviews(lang, SOURCES[d.id][lang]);
        if (!pv && lang !== 'en') pv = await Live.pageviews('en', SOURCES[d.id].en);
        if (pv) state.wiki[lang][d.id] = { ...Live.wikiMetrics(pv), title: pv.title, lang: pv.lang };
      } catch { st.err++; }
      if (run === wikiRun) refreshUI();
    }));
    if (run !== wikiRun) return;
    const n = Object.keys(state.wiki[lang]).length;
    st.s = n ? (n < DEALS.length ? 'warn' : 'ok') : 'err'; st.t = Date.now();
    refreshUI();
  }
  async function loadHN(d, announce) {
    const st = state.status.hn;
    try {
      const r = await Live.hn(SOURCES[d.id].hn);
      const fresh = new Set();
      r.items.forEach(it => { if (!state.seen.has(it.id)) { state.seen.add(it.id); if (announce) fresh.add(it.id); } });
      state.hn[d.id] = r; st.s = 'ok'; st.t = Date.now();
      if (fresh.size) {
        const it = r.items.find(x => fresh.has(x.id));
        toast(d, 'Nueva noticia · ' + d.tk, it.title, true);
      }
      refreshUI(fresh);
    } catch { st.err++; if (!Object.keys(state.hn).length) st.s = 'err'; renderSources(); }
  }
  async function loadFX() {
    try { state.fx = await Live.fx(); state.status.fx.s = 'ok'; }
    catch { state.status.fx.s = 'err'; }
    state.status.fx.t = Date.now();
    renderSources();
    if (MKT().cur !== 'USD') rebuildCards();
  }

  let hnIdx = 0, pollTimer = null, slowTimer = null;
  function startPolling() {
    clearInterval(pollTimer); clearInterval(slowTimer);
    pollTimer = setInterval(() => { loadHN(DEALS[hnIdx++ % DEALS.length], true); }, 20000);   // noticias: ciclo completo ≈ 6 min
    slowTimer = setInterval(() => { loadWiki(); loadFX(); }, 30 * 60e3);                       // interés y divisas
  }
  function toast() {}

  // ───────── detalle ─────────
  function openDeal(id, keep) {
    const d = byId[id]; if (!d) return;
    const sheet = $('#sheet'), scroll = keep ? sheet.scrollTop : 0;
    state.openId = id;
    const L = d.live, m = L.m, h = state.hn[id];
    const wikiUrl = m ? `https://${m.lang}.wikipedia.org/wiki/${encodeURIComponent(m.title)}` : null;
    const p = m ? paths(m.smooth, 600, 170, 14) : null;
    const real = [];
    if (m) real.push(`El interés en “${esc(m.title.replace(/_/g, ' '))}” ${m.momentum >= 0 ? 'subió' : 'bajó'} <b>${Math.abs(m.momentum).toFixed(1)}%</b> en 7 días frente a las 4 semanas previas.`);
    if (h) real.push(`<b>${h.count.toLocaleString('es-ES')}</b> ${h.count === 1 ? 'historia' : 'historias'} sobre “${esc(SOURCES[id].hn)}” en Hacker News en 30 días.`);
    sheet.innerHTML = `
      <button class="close" data-close aria-label="Cerrar">${icon('close')}</button>
      <header class="m-head">
        <div class="t">
          <div class="cat-label">${CATS[d.cat].label} · ${MKT().label}</div>
          <h2>${esc(d.title)}</h2>
          <p>${esc(d.pitch)}</p>
          <button class="btn${state.saved.has(id) ? ' on' : ''}" data-save="${id}">${icon('heart')}<span>${state.saved.has(id) ? 'Guardado' : 'Guardar'}</span></button>
        </div>
        ${ring(L.score, true)}
      </header>

      <section class="m-chart inner">
        <div class="row"><h4>Interés · 60 días</h4><span class="mono">${L.real ? deltaHTML(d) : ''}</span></div>
        ${m ? `<div class="chart-wrap">
          <svg viewBox="0 0 600 170" preserveAspectRatio="none">
            <line class="gl" x1="0" x2="600" y1="85" y2="85" vector-effect="non-scaling-stroke"/>
            <path class="area" fill="url(#areaGrad)" d="${p.area}"/><path class="line" d="${p.line}" vector-effect="non-scaling-stroke"/>
          </svg>
          <span class="ax top">${compact(p.max)} vistas/día</span><span class="ax bot">${compact(p.min)}</span>
        </div>
        <div class="chart-foot"><span>${dmy(m.dates[0])}</span><a href="${wikiUrl}" target="_blank" rel="noopener noreferrer">Wikipedia (${m.lang}) · ${esc(m.title.replace(/_/g, ' '))} ↗</a><span>${dmy(m.dates[m.dates.length - 1])}</span></div>`
        : `<div class="chart-empty">${state.status.wiki.s === 'load' ? 'Cargando datos…' : 'Sin datos reales para este tema.'}</div>`}
      </section>

      <section class="m-stats">
        <div><span>Vistas / día <i class="real">real</i></span><b>${m ? compact(m.avg7) : '—'}</b></div>
        <div><span>Momentum <i class="real">real</i></span><b>${m ? signed(m.momentum) : '—'}</b></div>
        <div><span>Noticias 30 d <i class="real">real</i></span><b>${h ? h.count.toLocaleString('es-ES') : '—'}</b></div>
        <div><span>Inversión <i>est.</i></span><b>${kmoney(d.cap[0])}–${kmoney(d.cap[1])}</b></div>
        <div><span>ROI 12 meses <i>est.</i></span><b>${d.roi}%</b></div>
        <div><span>Retorno <i>est.</i></span><b>${d.payback} meses</b></div>
      </section>
      <p class="note">Margen ${d.margin}% · riesgo ${d.risk.toLowerCase()} · competencia ${d.comp.toLowerCase()} (estimaciones).</p>

      <section class="m-sec inner">
        <div class="m-sec-h"><h4>Proveedores</h4><span>por afinidad con este negocio</span></div>
        <div class="sup-list">${[...d.suppliers].sort((a, b) => b[1] - a[1]).map(([k, fit, why]) => {
          const s = SUPPLIERS[k];
          return `<a class="sup-row" href="${s.u}" target="_blank" rel="noopener noreferrer">
            <span class="logo-sq">${initials(s.n)}</span>
            <div class="info"><b>${esc(s.n)} ↗</b><small>${esc(s.t)} · ${esc(s.r)}</small><p>${esc(why)}</p></div>
            <div class="meta"><div>Pedido mín.<b>${esc(s.moq)}</b></div><div>Entrega<b>${esc(s.lead)}</b></div></div>
            <div class="fit"><b>${fit}</b><span>afinidad</span></div>
          </a>`;
        }).join('')}</div>
        <p class="note">Pedido mínimo y tiempos son aproximados: confírmalos con cada proveedor.</p>
      </section>

      <div class="m-two">
        <section class="m-sec inner">
          <h4>Por qué ahora</h4>
          <ul class="signals">${real.map(s => `<li class="r">${s}</li>`).join('')}${d.signals.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </section>
        <section class="m-sec inner">
          <h4>Plan de arranque</h4>
          <ol class="steps">${d.steps.map((s, i) => `<li><span>${i + 1}</span>${esc(s)}</li>`).join('')}</ol>
        </section>
      </div>

      ${h && h.items.length ? `<section class="m-sec inner">
        <div class="m-sec-h"><h4>Noticias recientes</h4><span>Hacker News</span></div>
        <div class="news">${h.items.slice(0, 4).map(it => `<a class="news-row" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(it.title)}</b><small>${esc(it.host)} · ${ago(it.t)}</small></a>`).join('')}</div>
      </section>` : ''}`;
    $('#modal').classList.add('open');
    $('#modal').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    sheet.scrollTop = scroll;
  }
  function closeModal() {
    state.openId = null;
    $('#modal').classList.remove('open');
    $('#modal').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ───────── proveedores ─────────
  const usage = {};
  DEALS.forEach(d => d.suppliers.forEach(([k]) => (usage[k] = usage[k] || []).push(d)));
  function renderSupChips() {
    const types = {};
    Object.keys(usage).forEach(k => { const t = SUPPLIERS[k].t; types[t] = (types[t] || 0) + 1; });
    $('#supChips').innerHTML = `<button class="chip${state.supType === 'all' ? ' on' : ''}" data-sup="all">Todos <span class="n">${Object.keys(usage).length}</span></button>` +
      Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button class="chip${state.supType === t ? ' on' : ''}" data-sup="${esc(t)}">${esc(t)} <span class="n">${n}</span></button>`).join('');
  }
  function renderSuppliers() {
    const q = state.supQ.trim().toLowerCase();
    const keys = Object.keys(usage).filter(k => {
      const s = SUPPLIERS[k];
      if (state.supType !== 'all' && s.t !== state.supType) return false;
      if (q && !`${s.n} ${s.t} ${s.r} ${s.d} ${usage[k].map(d => d.title).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => usage[b].length - usage[a].length || SUPPLIERS[a].n.localeCompare(SUPPLIERS[b].n));
    $('#supGrid').innerHTML = keys.length ? keys.map((k, i) => {
      const s = SUPPLIERS[k];
      return `<article class="sup-card glass">
        <div class="sup-top"><span class="logo-sq${i % 3 === 0 ? ' o' : i % 3 === 2 ? ' k' : ''}">${initials(s.n)}</span><div><b>${esc(s.n)}</b><small>${esc(s.t)} · ${esc(s.r)}</small></div></div>
        <p>${esc(s.d)}</p>
        <div class="kv"><div class="inner"><span>Pedido mín.</span><b>${esc(s.moq)}</b></div><div class="inner"><span>Entrega</span><b>${esc(s.lead)}</b></div><div class="inner"><span>Precio</span><b>${s.p}</b></div></div>
        <div class="used">${usage[k].map(d => `<span class="tag" data-open="${d.id}">${esc(d.title)}</span>`).join('')}</div>
        <a class="visit" href="${s.u}" target="_blank" rel="noopener noreferrer">Visitar sitio ${icon('arrow')}</a>
      </article>`;
    }).join('') : `<div class="empty glass"><b>No hay proveedores con ese filtro</b>Prueba otra búsqueda.</div>`;
  }

  // ───────── guardados ─────────
  function renderSaved() {
    const list = DEALS.filter(d => state.saved.has(d.id)).sort((a, b) => b.live.score - a.live.score);
    $('#savedGrid').innerHTML = list.length ? list.map(d => cardHTML(d, true)).join('')
      : `<div class="empty glass"><b>Aún no hay guardados</b>Toca el corazón en cualquier negocio para seguirlo aquí.</div>`;
    $$('#savedGrid .card').forEach(el => updateCard(el, byId[el.dataset.id]));
    $('#savedCount').textContent = state.saved.size;
  }
  function toggleSave(id) {
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    store.set('ambar.saved', [...state.saved]);
    const on = state.saved.has(id);
    $$(`[data-save="${id}"]`).forEach(b => {
      b.classList.toggle('on', on); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      const t = $('span', b); if (t) t.textContent = on ? 'Guardado' : 'Guardar';
    });
    $('#savedCount').textContent = state.saved.size;
    if (state.view === 'saved') renderSaved();
  }

  // ───────── navegación / tema ─────────
  function moveTabPill() {
    const a = $('.tab.active'), pill = $('#tabPill');
    pill.style.left = a.offsetLeft + 'px'; pill.style.width = a.offsetWidth + 'px';
  }
  function setView(v) {
    state.view = v;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    moveTabPill();
    if (v === 'suppliers') { renderSupChips(); renderSuppliers(); }
    if (v === 'saved') renderSaved();
    if (v === 'radar') renderGrid();
    window.RadarExtra?.onView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setTheme(t) {
    state.theme = t;
    document.documentElement.dataset.theme = t;
    $('meta[name=theme-color]').content = t === 'dark' ? '#070606' : '#fbf8f2';
    $('#themeToggle').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
    store.set('radar.theme', t);
  }

  // ───────── controles ─────────
  function renderCatChips() {
    const counts = {}; DEALS.forEach(d => counts[d.cat] = (counts[d.cat] || 0) + 1);
    $('#catChips').innerHTML = `<button class="chip${state.cat === 'all' ? ' on' : ''}" data-cat="all">${icon('all')}Todas <span class="n">${DEALS.length}</span></button>` +
      Object.entries(CATS).map(([k, c]) => `<button class="chip${state.cat === k ? ' on' : ''}" data-cat="${k}">${icon(k)}${c.label} <span class="n">${counts[k] || 0}</span></button>`).join('');
  }
  function setCapLabel() {
    const r = $('#cap'), v = +r.value;
    state.maxCap = v;
    r.style.setProperty('--fill', ((v - r.min) / (r.max - r.min) * 100) + '%');
    $('#capLabel').textContent = kmoney(v) + (v >= 40000 ? '+' : '');
  }

  $('#market').innerHTML = Object.entries(MARKETS).map(([k, v]) => `<option value="${k}"${k === state.market ? ' selected' : ''}>${v.label}</option>`).join('');
  $('#market').addEventListener('change', e => {
    const prevLang = MKT().lang;
    state.market = e.target.value; store.set('ambar.market', state.market);
    state.ready = false;
    recompute(); setCapLabel(); rebuildCards(); renderTop(); updateTicker(); renderFeed(); renderSources();
    if (MKT().lang !== prevLang || !Object.keys(state.wiki[MKT().lang]).length) loadWiki().then(() => { state.ready = true; });
    else state.ready = true;
  });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderGrid(); });
  $('#q').addEventListener('input', e => { state.q = e.target.value; renderGrid(); });
  $('#cap').addEventListener('input', () => { setCapLabel(); renderGrid(); });
  $('#supQ').addEventListener('input', e => { state.supQ = e.target.value; renderSuppliers(); });
  $('#themeToggle').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'cream' : 'dark'));
  $$('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));

  document.addEventListener('click', e => {
    const t = e.target;
    const save = t.closest('[data-save]'); if (save) { e.stopPropagation(); toggleSave(save.dataset.save); return; }
    if (t.closest('[data-close]')) { closeModal(); return; }
    const cat = t.closest('[data-cat]'); if (cat) { state.cat = cat.dataset.cat; renderCatChips(); renderGrid(); return; }
    const sup = t.closest('[data-sup]'); if (sup) { state.supType = sup.dataset.sup; renderSupChips(); renderSuppliers(); return; }
    const open = t.closest('[data-open]'); if (open) { openDeal(open.dataset.open); return; }
    if (t.closest('a')) return;
    const card = t.closest('.card[data-id]'); if (card) openDeal(card.dataset.id);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.openId) closeModal();
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); setView('radar'); $('#q').focus(); }
    if (e.key === 'Enter' && document.activeElement.matches('.card[data-id]')) openDeal(document.activeElement.dataset.id);
  });
  window.addEventListener('resize', moveTabPill);

  window.RadarApp = { byId, openDeal, setView };

  // ───────── arranque ─────────
  setTheme(state.theme);
  renderCatChips();
  setCapLabel();
  renderTop();
  buildTicker();
  renderGrid();
  renderFeed();
  renderSources();
  $('#savedCount').textContent = state.saved.size;
  requestAnimationFrame(moveTabPill);
  document.fonts?.ready.then(moveTabPill);

  loadFX();
  const firstWiki = loadWiki();
  const firstHN = (async () => { await Promise.allSettled(DEALS.map(d => loadHN(d, false))); })();
  Promise.allSettled([firstWiki, firstHN]).then(() => {
    state.ready = true;
    const best = DEALS.filter(d => d.live.real).sort((a, b) => b.live.momentum - a.live.momentum)[0];
    if (best && best.live.momentum > 5) toast(best, 'Mayor momentum ahora', `${best.title}: interés ${signed(best.live.momentum, 0)} frente a las 4 semanas previas.`, true);
    startPolling();
  });
})();
