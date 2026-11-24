/* Bussines Radar · Más vendidos y Noticias
   Lee /api/tendencias y /api/noticias del servidor local (server.py).
   Datos reales: rankings de Amazon y Walmart, búsquedas de Google Trends y titulares de prensa.
   Estimaciones: el "potencial" de cada producto y las ideas sugeridas (reglas simples, explicadas abajo). */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + 'k' : String(Math.round(n));
  const hhmm = sec => new Date(sec * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const when = sec => { const d = new Date(sec * 1000); return d.toDateString() === new Date().toDateString() ? 'hoy ' + hhmm(sec) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + hhmm(sec); };
  const ago = sec => {
    const s = Math.max(0, Date.now() / 1000 - sec);
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  };
  const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const st = {
    data: null, news: null, offline: false, loaded: false, mode: /\.github\.io$/.test(location.hostname) ? 'static' : null,
    period: 'today', list: 'all', src: 'all', cat: 'all', q: '', shown: 48,
    region: 'all', sector: 'all',
  };

  // ───────── Potencial de reventa (estimación transparente, 0–100) ─────────
  // precio en zona cómoda para importar y revender + puesto en el ranking + demanda probada (valoraciones) + novedad
  function potential(p) {
    const u = p.usd;
    const price = u == null ? 15 : u >= 15 && u <= 80 ? 35 : (u >= 8 && u < 15) || (u > 80 && u <= 150) ? 22 : 8;
    const rank = Math.max(0, 25 - (p.rank - 1) * 0.8);
    const demand = Math.min(25, Math.log10((p.reviews || 0) + 1) * 5);
    const extra = (p.list === 'new' ? 10 : 0) + ((p.days || 0) >= 3 ? 5 : 0);
    return Math.round(Math.min(100, price + rank + demand + extra));
  }
  const priceText = p => p.usd != null ? '$' + p.usd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (p.price || 'Sin precio');
  const sourcingQuery = p => p.type || p.name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  const alibaba = p => 'https://www.alibaba.com/trade/search?SearchText=' + encodeURIComponent(sourcingQuery(p));

  // ───────── Ideas por categoría de producto ─────────
  const CAT_IDEAS = {
    'Belleza y cuidado personal': ['Tienda de belleza por Instagram y WhatsApp con los productos virales del momento. Importa lotes pequeños por courier y repón solo lo que rota.', ['colageno']],
    'Salud y hogar': ['Suscripción mensual de básicos del hogar y bienestar (suplementos, limpieza) con entrega a domicilio.', ['colageno', 'ecopack']],
    'Cocina y comedor': ['Gadgets de cocina de alto margen vendidos con videos cortos de demostración.', ['cafe']],
    'Hogar': ['Organización y decoración funcional: importa los artículos top y véndelos en combos.', ['velas', 'plantas']],
    'Electrónica': ['Accesorios (cargadores, audífonos, fundas) con garantía local: el margen está en el accesorio, no en el equipo.', ['reacond', 'solar']],
    'Deportes y aire libre': ['Equipo de ejercicio para casa y botellas térmicas con marca propia.', []],
    'Mascotas': ['Tienda de accesorios y snacks para mascotas con suscripción mensual.', ['mascotas']],
    'Juguetes y juegos': ['Importación de temporada de juguetes en tendencia (Navidad y Reyes) con preventa para no quedarte con inventario.', []],
    'Ropa, zapatos y joyería': ['Básicos y accesorios en tendencia: valida con venta bajo pedido antes de comprar tallas.', ['pod', 'joyeria']],
    'Bebé': ['Kits para recién nacido y baby shower con los productos mejor valorados.', []],
    'Oficina': ['Papelería y organización para oficinas y estudiantes, con ventas por volumen a empresas.', []],
    'Automotriz': ['Accesorios y productos de detallado: combina la venta con un servicio a domicilio.', ['carwash']],
    'Reacondicionados': ['Compra-venta de electrónica reacondicionada con garantía propia.', ['reacond']],
  };
  const DEFAULT_IDEA = ['Importa los artículos top de la categoría en lotes pequeños y valida la demanda antes de escalar.', []];

  // ───────── Sectores para leer las noticias ─────────
  const SECTORS = [
    { id: 'turismo', name: 'Turismo', kw: ['turismo', 'turistas', 'turistic', 'hotel', 'vuelos', 'aeropuerto', 'crucero', 'aerolinea'],
      ideas: ['Experiencias y tours locales para visitantes', 'Proveeduría para hoteles y alquileres vacacionales (amenities, lavandería, mantenimiento)'], deals: ['eventos', 'carwash'] },
    { id: 'energia', name: 'Energía', kw: ['apagon', 'apagones', 'energia', 'electric', 'combustible', 'solar', 'edesur', 'edenorte', 'edeeste', 'gasolina'],
      ideas: ['Venta e instalación de inversores, baterías y paneles', 'Estaciones de energía portátiles para hogares y negocios'], deals: ['solar'] },
    { id: 'comercio', name: 'Comercio e importación', kw: ['comercio electronico', 'ecommerce', 'e-commerce', 'black friday', 'viernes negro', 'compras en linea', 'courier', 'aduanas', 'importacion', 'importaciones', 'mercancia', 'amazon', 'temu', 'shein', 'mas vendidos', 'consumidores'],
      ideas: ['Importación por courier y reventa de productos en tendencia', 'Servicio de compras por encargo con entrega local'], deals: ['joyeria', 'reacond', 'ecopack'] },
    { id: 'tecnologia', name: 'Tecnología e IA', kw: ['inteligencia artificial', ' ia ', 'chatgpt', 'nvidia', 'openai', 'automatizacion', 'startup', 'fintech', 'ciberseguridad', 'ciberataque', 'digitalizacion', 'tecnologia'],
      ideas: ['Automatización con IA para negocios locales', 'Ciberseguridad y soporte gestionado para pymes'], deals: ['ia', 'ciber', 'barber'] },
    { id: 'alimentos', name: 'Alimentos y agro', kw: ['cafe', 'cacao', 'arroz', 'pollo', 'alimentos', 'restaurante', 'canasta', 'agro', 'agropecuari', 'supermercado', 'cosecha', 'bebidas'],
      ideas: ['Marca de alimentos de especialidad con venta directa', 'Cocina solo-delivery con menú corto'], deals: ['cafe', 'darkkitchen', 'mascotas'] },
    { id: 'construccion', name: 'Construcción e inmuebles', kw: ['construccion', 'vivienda', 'inmobiliari', 'cemento', 'alquiler', 'bienes raices'],
      ideas: ['Mantenimiento y remodelación por suscripción', 'Amueblado y decoración para alquileres'], deals: ['plantas', 'eventos'] },
    { id: 'finanzas', name: 'Crédito y finanzas', kw: ['credito', 'prestamo', 'tasa de interes', 'banco central', 'remesas', 'dolar', 'inflacion', 'financiamiento', 'banreservas', 'mipymes', 'pymes'],
      ideas: ['Servicios para pymes: contabilidad, cobros y automatización', 'Negocios de bajo capital que aprovechan financiamiento a mipymes'], deals: ['ia', 'comunidad'] },
    { id: 'salud', name: 'Salud y bienestar', kw: ['salud', 'medicamento', 'farmacia', 'bienestar', 'suplemento', 'gimnasio', 'nutricion'],
      ideas: ['Suplementos y bienestar con marca propia', 'Máquinas expendedoras saludables en clínicas y gimnasios'], deals: ['colageno', 'vending'] },
    { id: 'empleo', name: 'Empleo y educación', kw: ['empleo', 'desempleo', 'capacitacion', 'educacion', 'universidad', 'cursos', 'trabajadores', 'salario'],
      ideas: ['Formación práctica de pago en habilidades demandadas', 'Agencia de contenido y talento creativo'], deals: ['comunidad', 'ugc'] },
    { id: 'exportacion', name: 'Exportación y zonas francas', kw: ['zonas francas', 'zona franca', 'exportacion', 'exportaciones', 'nearshoring', 'manufactura', 'logistic'],
      ideas: ['Servicios B2B para zonas francas: empaque, logística y suministros', 'Empaques sostenibles para exportadores'], deals: ['ecopack'] },
    { id: 'temporada', name: 'Temporada y regalos', kw: ['navidad', 'navide', 'doble sueldo', 'regalia', 'fin de ano', 'reyes magos', 'san valentin', 'dia de las madres'],
      ideas: ['Regalos corporativos y canastas de temporada', 'Alquiler de mobiliario y decoración para eventos'], deals: ['velas', 'joyeria', 'eventos'] },
    { id: 'transporte', name: 'Transporte y vehículos', kw: ['vehiculo', 'motocicleta', 'transito', 'intrant', 'carros electricos', 'transporte', 'metro de'],
      ideas: ['Servicios a domicilio para vehículos', 'Accesorios y mantenimiento ligero'], deals: ['carwash'] },
  ];
  const sectorsOf = title => { const t = ' ' + plain(title) + ' '; return SECTORS.filter(s => s.kw.some(k => t.includes(k))); };
  const dealBtn = id => {
    const d = window.RadarApp?.byId[id];
    return d ? `<button class="tag link" data-open="${id}">${esc(d.title)}</button>` : '';
  };

  // ───────── carga ─────────
  // Primero el servidor local (/api); si no existe, los archivos publicados (data/*.json, p. ej. en GitHub Pages)
  async function load() {
    const get = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const tries = st.mode === 'static' ? [['data/tendencias.json', 'data/noticias.json']]
      : [['/api/tendencias', '/api/noticias'], ['data/tendencias.json', 'data/noticias.json']];
    for (const [u1, u2] of tries) {
      try {
        const [a, b] = await Promise.all([get(u1), get(u2)]);
        st.data = a; st.news = b; st.loaded = true; st.offline = false;
        st.mode = u1.startsWith('/api') ? 'live' : 'static';
        break;
      } catch { /* siguiente opción */ }
    }
    if (!st.loaded) st.offline = true;
    render();
  }

  const OFFLINE = `<div class="empty glass"><b>No se encontraron los datos</b>
    Abre la app desde su dirección web, o en esta Mac con el archivo <b style="display:inline">Abrir Radar.command</b> (doble clic).</div>`;

  // ───────── Más vendidos ─────────
  function productList() {
    const d = st.data; if (!d) return [];
    let list = st.period === 'today' ? d.today : st.period === 'week' ? d.week : d.month;
    list = (list || []).map(p => ({ ...p, pot: potential(p) }));
    if (st.period === 'today' && st.list !== 'all') list = list.filter(p => p.list === st.list);
    if (st.src !== 'all') list = list.filter(p => p.src === st.src);
    if (st.cat !== 'all') list = list.filter(p => p.cat === st.cat);
    const q = plain(st.q.trim());
    if (q) list = list.filter(p => plain(p.name + ' ' + p.cat + ' ' + (p.type || '')).includes(q));
    if (st.period === 'today') list.sort((a, b) => a.rank - b.rank || b.pot - a.pot);
    return list;
  }

  function productCard(p) {
    const move = p.prev && p.prev !== p.rank ? (p.prev > p.rank ? `<span class="up">▲ ${p.prev - p.rank}</span>` : `<span class="down">▼ ${p.rank - p.prev}</span>`) : '';
    const sub = st.period === 'today'
      ? `${p.list === 'new' ? 'Novedad' : 'Más vendido'} #${p.rank} ${move}${p.isNew ? ' <span class="badge">ENTRA HOY</span>' : ''}`
      : `${p.days} ${p.days === 1 ? 'día' : 'días'} en ranking · mejor puesto #${p.best}`;
    return `<article class="pcard glass">
      <a class="pimg" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="">` : ''}</a>
      <div class="pbody">
        <div class="cat-label">${esc(p.src)} · ${esc(p.cat)}</div>
        <h3>${esc(p.name)}</h3>
        <div class="pmeta"><b>${esc(priceText(p))}</b>${p.rating ? ` · ★ ${p.rating}${p.reviews ? ` (${compact(p.reviews)})` : ''}` : ''}</div>
        <div class="psub">${sub}</div>
        <div class="ppot" title="Estimación: precio, puesto, valoraciones y novedad"><span>Potencial</span><div class="track"><i style="width:${p.pot}%"></i></div><b>${p.pot}</b></div>
        <div class="pact"><a href="${esc(alibaba(p))}" target="_blank" rel="noopener noreferrer">Buscar proveedor ↗</a><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ver en ${esc(p.src)} ↗</a></div>
      </div>
    </article>`;
  }

  function categoryIdeas(all) {
    const by = {};
    all.forEach(p => (by[p.cat] = by[p.cat] || []).push(p));
    return Object.entries(by).map(([cat, ps]) => {
      const top = [...ps].sort((a, b) => b.pot - a.pot).slice(0, 5);
      const priced = ps.filter(p => p.usd != null);
      return { cat, n: ps.length, score: top.reduce((s, p) => s + p.pot, 0) / Math.max(1, top.length), top,
        avg: priced.length ? priced.reduce((s, p) => s + p.usd, 0) / priced.length : null };
    }).filter(c => c.n >= 5).sort((a, b) => b.score - a.score).slice(0, 4);
  }

  function renderTrends() {
    const box = $('#trendsBody'); if (!box) return;
    if (st.offline) { box.innerHTML = OFFLINE; $('#trendsStatus').textContent = ''; return; }
    const d = st.data;
    if (!d || (!d.today.length && d.loading !== false)) {
      box.innerHTML = `<div class="empty glass"><b>Recogiendo los rankings…</b>La primera carga tarda uno o dos minutos. Esta página se actualiza sola.</div>`;
      $('#trendsStatus').textContent = 'Cargando';
      return;
    }
    const src = d.sources || {};
    $('#trendsStatus').innerHTML = `Actualizado ${when(d.updated)}${d.stale ? ' (último intento falló; se muestra lo anterior)' : ''} · ` +
      Object.entries(src).map(([k, v]) => `${k} ${v.n}${v.kept ? ' (datos anteriores)' : ''}`).join(' · ') + ` · historial: ${d.historyDays} ${d.historyDays === 1 ? 'día' : 'días'}`;

    const base = (d.today || []).map(p => ({ ...p, pot: potential(p) }));
    const cats = [...new Set(base.map(p => p.cat))].sort();
    const list = productList();
    const ideas = categoryIdeas(base);
    const s = d.searches || {};
    const searchList = (arr) => (arr || []).slice(0, 10).map(x => `<li><div><b>${esc(x.term)}</b><small>${esc(x.traffic)} búsquedas · ${ago(x.t)}</small>${x.news ? `<a href="${esc(x.newsUrl)}" target="_blank" rel="noopener noreferrer">${esc(x.news)}</a>` : ''}</div></li>`).join('') || '<li><div><small>Sin datos por ahora.</small></div></li>';
    const histNote = st.period !== 'today' && d.historyDays < (st.period === 'week' ? 7 : 30)
      ? `<p class="note">El historial tiene ${d.historyDays} ${d.historyDays === 1 ? 'día' : 'días'}. La vista de ${st.period === 'week' ? 'semana' : 'mes'} se completa a medida que el radar se abra cada día.</p>` : '';

    box.innerHTML = `
      <div class="layout">
        <div>
          <div class="toolbar">
            <div class="tb-row">
              <div class="seg" data-seg="period">${[['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].map(([k, l]) => `<button class="${st.period === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
              ${st.period === 'today' ? `<div class="seg" data-seg="list">${[['all', 'Todo'], ['top', 'Más vendidos'], ['new', 'Novedades']].map(([k, l]) => `<button class="${st.list === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
              <div class="seg" data-seg="src">${['all', ...Object.keys(src)].map(k => `<button class="${st.src === k ? 'on' : ''}" data-v="${k}">${k === 'all' ? 'Todas las tiendas' : k}</button>`).join('')}</div>
              <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="trendQ" type="search" placeholder="Buscar producto" value="${esc(st.q)}" autocomplete="off"></label>
            </div>
            <div class="chips">${['all', ...cats].map(c => `<button class="chip${st.cat === c ? ' on' : ''}" data-tcat="${esc(c)}">${c === 'all' ? 'Todas' : esc(c)}</button>`).join('')}</div>
          </div>
          ${histNote}
          <div class="pgrid">${list.slice(0, st.shown).map(productCard).join('') || '<div class="empty glass"><b>Sin productos con estos filtros</b></div>'}</div>
          ${list.length > st.shown ? `<button class="more" data-more>Ver más (${list.length - st.shown})</button>` : ''}
        </div>
        <aside class="side-col">
          <div class="panel glass">
            <div class="panel-h"><h3>Ideas desde lo más vendido</h3></div>
            <div class="ideas">${ideas.map(c => {
              const [txt, deals] = CAT_IDEAS[c.cat] || DEFAULT_IDEA;
              return `<div class="idea"><b>${esc(c.cat)}</b><small>${c.n} productos en ranking${c.avg != null ? ` · precio medio $${c.avg.toFixed(0)}` : ''}</small><p>${esc(txt)}</p>
                <small>Ejemplos: ${c.top.slice(0, 2).map(p => `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.name.split(/[,(|-]/)[0].slice(0, 46))}</a>`).join(' · ')}</small>
                <div class="used"><button class="tag link" data-tcat="${esc(c.cat)}">Ver productos</button>${deals.map(dealBtn).join('')}</div></div>`;
            }).join('')}</div>
            <p class="note">Sugerencias automáticas según las categorías con mejor potencial estimado. Valídalas antes de invertir.</p>
          </div>
          <div class="panel glass"><div class="panel-h"><h3>Lo más buscado hoy · Rep. Dominicana</h3><span>Google Trends</span></div><ul class="tlist">${searchList(s.do)}</ul></div>
          <div class="panel glass"><div class="panel-h"><h3>Lo más buscado hoy · EE.UU.</h3><span>Google Trends</span></div><ul class="tlist">${searchList(s.us)}</ul></div>
        </aside>
      </div>`;
  }

  // ───────── Noticias ─────────
  function renderNews() {
    const box = $('#newsBody'); if (!box) return;
    if (st.offline) { box.innerHTML = OFFLINE; $('#newsStatus').textContent = ''; return; }
    const n = st.news;
    if (!n || !n.items.length) {
      box.innerHTML = `<div class="empty glass"><b>Cargando noticias…</b>Esta página se actualiza sola.</div>`;
      $('#newsStatus').textContent = 'Cargando';
      return;
    }
    const items = n.items.map(it => ({ ...it, sectors: sectorsOf(it.title) }));
    $('#newsStatus').textContent = `Actualizado ${when(n.updated)} · ${items.length} titulares · elDinero, Diario Libre y Google Noticias`;
    const inRegion = items.filter(it => st.region === 'all' || it.region === st.region);
    const recent = inRegion.filter(it => Date.now() / 1000 - it.t < 3 * 86400);
    const counts = SECTORS.map(s => ({ s, hits: recent.filter(it => it.sectors.includes(s)) })).filter(x => x.hits.length >= 2).sort((a, b) => b.hits.length - a.hits.length);
    const list = inRegion.filter(it => st.sector === 'all' || it.sectors.some(s => s.id === st.sector));

    box.innerHTML = `
      <div class="toolbar">
        <div class="tb-row">
          <div class="seg" data-seg="region">${[['all', 'Todas'], ['rd', 'Rep. Dominicana'], ['world', 'Mundo']].map(([k, l]) => `<button class="${st.region === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
        </div>
        <div class="chips"><button class="chip${st.sector === 'all' ? ' on' : ''}" data-sector="all">Todos los temas</button>${counts.map(({ s, hits }) => `<button class="chip${st.sector === s.id ? ' on' : ''}" data-sector="${s.id}">${esc(s.name)} <span class="n">${hits.length}</span></button>`).join('')}</div>
      </div>
      <div class="layout">
        <div class="panel glass nlist">${list.slice(0, 70).map(it => `<a class="nrow" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(it.title)}</b><small>${esc(it.source)} · ${it.region === 'rd' ? 'RD' : 'Mundo'} · ${ago(it.t)}${it.sectors.length ? ' · ' + it.sectors.map(s => esc(s.name)).join(', ') : ''}</small></a>`).join('') || '<p class="note">Sin titulares con este filtro.</p>'}</div>
        <aside class="side-col">
          <div class="panel glass">
            <div class="panel-h"><h3>Ideas desde las noticias</h3><span>últimos 3 días</span></div>
            <div class="ideas">${counts.slice(0, 5).map(({ s, hits }) => `<div class="idea"><b>${esc(s.name)}</b><small>${hits.length} titulares</small>
              <ul>${s.ideas.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
              <small>${hits.slice(0, 2).map(h => `<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.title.slice(0, 80))}</a>`).join('<br>')}</small>
              <div class="used"><button class="tag link" data-sector="${s.id}">Ver titulares</button>${s.deals.map(dealBtn).join('')}</div></div>`).join('') || '<p class="note">Aún no hay temas con suficientes titulares.</p>'}</div>
            <p class="note">Sugerencias automáticas: se agrupan los titulares por palabras clave y se proponen negocios relacionados. No miden rentabilidad; valídalas antes de invertir.</p>
          </div>
        </aside>
      </div>`;
  }

  function render() {
    const keep = document.activeElement?.id === 'trendQ';
    renderTrends(); renderNews();
    if (keep) { const i = $('#trendQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }

  // ───────── eventos ─────────
  document.addEventListener('click', e => {
    const t = e.target;
    const segBtn = t.closest('.seg[data-seg] button');
    if (segBtn) { st[segBtn.parentElement.dataset.seg] = segBtn.dataset.v; st.shown = 48; render(); return; }
    const tc = t.closest('[data-tcat]'); if (tc) { st.cat = tc.dataset.tcat; st.shown = 48; render(); $('#view-trends').scrollIntoView({ block: 'start' }); return; }
    const sc = t.closest('[data-sector]'); if (sc) { st.sector = sc.dataset.sector; render(); return; }
    if (t.closest('[data-more]')) { st.shown += 48; render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'trendQ') { st.q = e.target.value; st.shown = 48; render(); } });

  let timer = null, active = false;
  async function cycle() {
    clearTimeout(timer);
    if (!active) return;
    await load();
    const ready = st.data && st.data.today.length && st.news && st.news.items.length;
    if (active && !st.offline) timer = setTimeout(cycle, ready ? (st.mode === 'static' ? 30 * 60e3 : 5 * 60e3) : 12e3);   // mientras carga, reintenta cada 12 s
  }
  window.RadarExtra = {
    onView(v) { active = v === 'trends' || v === 'news'; cycle(); },
  };
})();
