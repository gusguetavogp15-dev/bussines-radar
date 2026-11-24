#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bussines Radar · servidor local.

Sirve la app y recoge datos que el navegador no puede leer directamente:
  - Amazon "Más vendidos" y "Últimas novedades" (ranking por categoría)
  - Walmart "Best sellers"
  - Google Trends: lo más buscado hoy en Rep. Dominicana y EE.UU.
  - Noticias: elDinero, Diario Libre (economía) y Google Noticias (RD y mundo)

Guarda una foto diaria del ranking para construir las vistas de semana y mes, en
~/Library/Application Support/Bussines Radar/datos (así la tarea diaria puede escribir ahí).
Solo usa la librería estándar de Python 3.  Uso:
  python3 server.py [--no-open] [--port N]   abre la app
  python3 server.py --once [--export DIR]   actualiza los datos una vez (y los exporta como JSON)
  python3 server.py --install-daily [HH:MM]  programa la actualización diaria (por defecto 08:00)
  python3 server.py --uninstall-daily        quita la actualización diaria
"""
import functools, gzip, html, json, os, re, shutil, subprocess, sys, threading, time, urllib.parse, urllib.request, webbrowser
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
SUPPORT = os.path.expanduser('~/Library/Application Support/Bussines Radar')
DATA = os.path.abspath(os.environ['BR_DATA']) if os.environ.get('BR_DATA') else os.path.join(SUPPORT, 'datos')
LEGACY_DATA = os.path.join(ROOT, 'datos')          # ubicación anterior, se migra una vez
LABEL = 'com.bussinesradar.daily'
PLIST = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % LABEL)
CACHE_F = os.path.join(DATA, 'cache.json')
HIST_F = os.path.join(DATA, 'historial.json')
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36')
PRODUCTS_EVERY = 60 * 60      # ranking de productos: cada hora
NEWS_EVERY = 15 * 60          # noticias y búsquedas: cada 15 min

LOCK = threading.Lock()
STATE = {'products': None, 'news': None, 'searches': None}
HIST = {'days': {}, 'catalog': {}}


def log(*a):
    print(datetime.now().strftime('%H:%M:%S'), *a, flush=True)


def fetch(url, lang='es-DO,es;q=0.9,en;q=0.8', timeout=25):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA, 'Accept-Language': lang, 'Accept-Encoding': 'gzip',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    return raw.decode('utf-8', 'ignore')


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s or ''))).strip()


def num(s):
    try:
        return float(re.sub(r'[^\d.]', '', s.replace(',', '')))
    except Exception:
        return None


# ───────────────────────── Amazon ─────────────────────────
AMAZON_CATS = [  # (ruta, nombre)
    ('beauty', 'Belleza y cuidado personal'), ('hpc', 'Salud y hogar'), ('kitchen', 'Cocina y comedor'),
    ('home-garden', 'Hogar'), ('electronics', 'Electrónica'), ('sporting-goods', 'Deportes y aire libre'),
    ('pet-supplies', 'Mascotas'), ('toys-and-games', 'Juguetes y juegos'), ('fashion', 'Ropa, zapatos y joyería'),
    ('baby-products', 'Bebé'), ('office-products', 'Oficina'), ('automotive', 'Automotriz'),
]
SKIP = re.compile(r'gift card|tarjeta de regalo|suscripci|subscription|auto-renewal|membres|kindle|ebook|'
                  r'prime video|audible|plan with|digital code|código digital', re.I)


CAT_MAP = {
    'belleza y cuidado personal': 'Belleza y cuidado personal', 'beauty': 'Belleza y cuidado personal', 'personal care': 'Belleza y cuidado personal',
    'salud y hogar': 'Salud y hogar', 'household essentials': 'Salud y hogar', 'health and medicine': 'Salud y hogar',
    'cocina y comedor': 'Cocina y comedor', 'hogar': 'Hogar', 'home': 'Hogar', 'home improvement': 'Hogar',
    'patio, césped y jardín': 'Hogar', 'patio & garden': 'Hogar', 'hogar y cocina': 'Hogar',
    'electrónica': 'Electrónica', 'electrónicos': 'Electrónica', 'electronics': 'Electrónica', 'video games': 'Electrónica',
    'deportes y aire libre': 'Deportes y aire libre', 'sports & outdoors': 'Deportes y aire libre',
    'mascotas': 'Mascotas', 'pets': 'Mascotas', 'productos para mascotas': 'Mascotas',
    'juguetes y juegos': 'Juguetes y juegos', 'toys': 'Juguetes y juegos',
    'ropa, zapatos y joyería': 'Ropa, zapatos y joyería', 'clothing': 'Ropa, zapatos y joyería',
    'bebé': 'Bebé', 'baby': 'Bebé', 'productos para bebé': 'Bebé',
    'oficina': 'Oficina', 'productos de oficina': 'Oficina', 'arts crafts & sewing': 'Oficina',
    'automotriz': 'Automotriz', 'auto & tires': 'Automotriz', 'amazon renewed': 'Reacondicionados',
    'party & occasions': 'Fiestas y regalos', 'cell phones': 'Electrónica', 'videojuegos': 'Electrónica',
    'tv & video': 'Electrónica', 'computers': 'Electrónica', 'sports & outdoors': 'Deportes y aire libre',
    'toys & games': 'Juguetes y juegos', 'food': 'Salud y hogar', 'grocery': 'Salud y hogar',
}
DROP_CATS = {'monedas coleccionables', 'photo center', 'tarjetas de regalo', 'tienda kindle', 'libros', 'apps y juegos', 'services', 'gift cards'}


def norm_cat(c):
    k = (c or '').strip().lower()
    if k in DROP_CATS:
        return None
    return CAT_MAP.get(k, (c or 'Otros').strip())


def parse_amazon(page, lista, default_cat):
    """Devuelve productos de una página de ranking de Amazon (carrusel o cuadrícula)."""
    heads = [(m.start(), clean(m.group(1))) for m in re.finditer(r'<h2[^>]*>(.*?)</h2>', page, re.S)]
    marks = list(re.finditer(r'zg-bdg-text">#(\d+)<', page))
    out = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else m.start() + 9000
        c = page[m.start():min(end, m.start() + 9000)]
        asin = re.search(r'/dp/(\w{10})', c)
        name = re.search(r'p13n-sc-(?:truncate|css-line-clamp)[^>]*>([^<]+)<', c)
        if not asin or not name:
            continue
        name = clean(name.group(1))
        if SKIP.search(name):
            continue
        cat = default_cat
        if not cat:
            prev = [t for p, t in heads if p < m.start()]
            cat = re.sub(r'^(Los más vendidos en|Best Sellers in|Últimas novedades en|Hot New Releases in)\s*', '',
                         prev[-1]) if prev else 'General'
        cat = norm_cat(cat)
        if not cat:
            continue
        price = re.search(r'p13n-sc-price[^>]*>([^<]+)<', c)
        rat = re.search(r'aria-label="([\d.]+) (?:de 5 estrellas, Hay|out of 5 stars,) ([\d,.]+)', c)
        img = re.search(r'<img[^>]+src="([^"]+)"', c)
        out.append({
            'id': 'amazon:' + asin.group(1), 'src': 'Amazon', 'list': lista, 'cat': cat, 'rank': int(m.group(1)),
            'name': name, 'price': clean(price.group(1)) if price else None,
            'rating': num(rat.group(1)) if rat else None, 'reviews': int(num(rat.group(2)) or 0) if rat else None,
            'url': 'https://www.amazon.com/dp/' + asin.group(1), 'img': img.group(1) if img else None,
        })
    return out


def get_amazon():
    items, ok, tried = [], 0, 0
    pages = [('https://www.amazon.com/Best-Sellers/zgbs', 'top', None),
             ('https://www.amazon.com/gp/new-releases', 'new', None)]
    for path, name in AMAZON_CATS:
        pages.append(('https://www.amazon.com/gp/bestsellers/%s' % path, 'top', name))
        pages.append(('https://www.amazon.com/gp/new-releases/%s' % path, 'new', name))
    for url, lista, cat in pages:
        tried += 1
        try:
            got = parse_amazon(fetch(url), lista, cat)
            if got:
                ok += 1
                items += got
        except Exception as e:
            log('amazon', url.rsplit('/', 1)[-1], 'error', e)
        time.sleep(1.5)
    log('amazon: %d productos de %d/%d páginas' % (len(items), ok, tried))
    return items, ok, tried


# ───────────────────────── Walmart ─────────────────────────
def get_walmart():
    items = []
    for page in (1, 2):
        try:
            s = fetch('https://www.walmart.com/shop/best-sellers' + ('?page=%d' % page if page > 1 else ''))
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', s, re.S)
            if not m:
                break
            found = []

            def walk(o):
                if isinstance(o, dict):
                    if o.get('__typename') == 'Product' and o.get('name') and o.get('usItemId'):
                        found.append(o)
                    for v in o.values():
                        walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)
            walk(json.loads(m.group(1)))
            for o in found:
                if o.get('isSponsoredFlag') or SKIP.search(o['name']):
                    continue
                pid = 'walmart:' + str(o['usItemId'])
                if any(x['id'] == pid for x in items):
                    continue
                cat = norm_cat(clean(o.get('departmentName') or '') or 'Otros')
                if not cat:
                    continue
                items.append({
                    'id': pid, 'src': 'Walmart', 'list': 'top', 'rank': len(items) + 1, 'cat': cat,
                    'type': o.get('catalogProductType'), 'name': clean(o['name']),
                    'price': (o.get('priceInfo') or {}).get('linePrice') or None,
                    'rating': o.get('averageRating'), 'reviews': o.get('numberOfReviews'),
                    'url': 'https://www.walmart.com' + (o.get('canonicalUrl') or '').split('?')[0],
                    'img': (o.get('imageInfo') or {}).get('thumbnailUrl'),
                })
        except Exception as e:
            log('walmart error', e)
        time.sleep(1.5)
    log('walmart: %d productos' % len(items))
    return items


# ───────────────────────── Tipo de cambio (para leer precios en DOP) ─────────────────────────
_fx = {'t': 0, 'rates': {}}


def usd_of(price):
    if not price:
        return None
    v = num(price)
    if v is None:
        return None
    m = re.match(r'\s*([A-Z]{3})\b', price)
    cur = m.group(1) if m and m.group(1) != 'USD' else None
    if cur:
        if time.time() - _fx['t'] > 6 * 3600:
            try:
                _fx['rates'] = json.loads(fetch('https://open.er-api.com/v6/latest/USD')).get('rates', {})
                _fx['t'] = time.time()
            except Exception:
                pass
        rate = _fx['rates'].get(cur)
        return round(v / rate, 2) if rate else None
    return v


# ───────────────────────── Historial (semana / mes) ─────────────────────────
def load_disk():
    os.makedirs(DATA, exist_ok=True)
    for name in ('cache.json', 'historial.json'):        # migra los datos guardados junto a la app
        old, new = os.path.join(LEGACY_DATA, name), os.path.join(DATA, name)
        if os.path.exists(old) and not os.path.exists(new):
            try:
                shutil.copy2(old, new)
            except Exception:
                pass
    try:
        STATE.update(json.load(open(CACHE_F, encoding='utf-8')))
    except Exception:
        pass
    try:
        HIST.update(json.load(open(HIST_F, encoding='utf-8')))
    except Exception:
        pass


def save_disk():
    try:
        json.dump(STATE, open(CACHE_F, 'w', encoding='utf-8'), ensure_ascii=False)
        json.dump(HIST, open(HIST_F, 'w', encoding='utf-8'), ensure_ascii=False)
    except Exception as e:
        log('no se pudo guardar', e)


def period(days):
    """Productos vistos en el ranking en los últimos N días, con días de presencia y mejor puesto."""
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    agg = {}
    for d, ranks in HIST['days'].items():
        if d < since:
            continue
        for pid, rk in ranks.items():
            a = agg.setdefault(pid, {'id': pid, 'days': 0, 'best': rk, 'sum': 0})
            a['days'] += 1
            a['best'] = min(a['best'], rk)
            a['sum'] += rk
    out = []
    for a in agg.values():
        meta = HIST['catalog'].get(a['id'])
        if meta:
            out.append(dict(meta, days=a['days'], best=a['best'], rank=round(a['sum'] / a['days'])))
    out.sort(key=lambda x: (-x['days'], x['rank']))
    return out[:150]


def refresh_products():
    amazon, ok, tried = get_amazon()
    walmart = get_walmart()
    kept = []                              # si una tienda no responde, se conservan sus últimos datos

    def last_known(src):
        prefix = src.lower() + ':'
        for d in sorted(HIST['days'], reverse=True):
            ranks = {k: v for k, v in HIST['days'][d].items() if k.startswith(prefix)}
            if ranks:
                return [dict(HIST['catalog'][k], rank=r) for k, r in ranks.items() if k in HIST['catalog']]
        return []
    if not amazon:
        amazon = last_known('Amazon')
        kept.append('Amazon') if amazon else None
    if not walmart:
        walmart = last_known('Walmart')
        kept.append('Walmart') if walmart else None
    if kept:
        log('sin respuesta nueva de', ', '.join(kept), '· se conservan sus datos anteriores')
    best = {}
    for it in amazon + walmart:            # un producto puede salir en varias listas: se queda el mejor puesto
        it['usd'] = usd_of(it.get('price'))
        if it['id'] not in best or it['rank'] < best[it['id']]['rank']:
            best[it['id']] = it
    items = list(best.values())
    now = int(time.time())
    with LOCK:
        if items:
            today = date.today().isoformat()
            day = HIST['days'].setdefault(today, {})
            for it in items:
                day[it['id']] = min(day.get(it['id'], 999), it['rank'])
                HIST['catalog'][it['id']] = {k: it.get(k) for k in
                                             ('id', 'src', 'list', 'cat', 'type', 'name', 'price', 'usd', 'rating', 'reviews', 'url', 'img')}
            limit = (date.today() - timedelta(days=35)).isoformat()
            HIST['days'] = {d: v for d, v in HIST['days'].items() if d >= limit}
            alive = {pid for v in HIST['days'].values() for pid in v}
            HIST['catalog'] = {k: v for k, v in HIST['catalog'].items() if k in alive}
            prev_days = sorted(d for d in HIST['days'] if d < today)
            prev = HIST['days'][prev_days[-1]] if prev_days else {}
            for it in items:
                it['prev'] = prev.get(it['id'])
                it['isNew'] = bool(prev) and it['id'] not in prev
            STATE['products'] = {
                'updated': now, 'today': items, 'historyDays': len(HIST['days']),
                'sources': {
                    'Amazon': {'n': len(amazon), 'pages': '%d/%d' % (ok, tried), 'ok': bool(amazon), 'kept': 'Amazon' in kept},
                    'Walmart': {'n': len(walmart), 'ok': bool(walmart), 'kept': 'Walmart' in kept},
                },
            }
        elif STATE['products']:
            STATE['products']['stale'] = True
        save_disk()


# ───────────────────────── Noticias y búsquedas ─────────────────────────
def rss(url, source, region, limit=40):
    out = []
    try:
        s = fetch(url)
    except Exception as e:
        log('rss', source, 'error', e)
        return out
    for it in re.findall(r'<item>(.*?)</item>', s, re.S)[:limit]:
        def tag(t):
            m = re.search(r'<%s[^>]*>(.*?)</%s>' % (t, t), it, re.S)
            return clean(re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', m.group(1), flags=re.S)) if m else ''
        title, link = tag('title'), tag('link')
        src = (tag('source') or source) if source == 'Google Noticias' else source
        if not title or not link:
            continue
        if src and title.endswith(' - ' + src):
            title = title[:-len(src) - 3]
        try:
            t = int(parsedate_to_datetime(tag('pubDate')).timestamp())
        except Exception:
            t = int(time.time())
        out.append({'title': title, 'url': link, 'source': src, 'region': region, 't': t})
    return out


FEEDS = [
    ('https://eldinero.com.do/feed/', 'elDinero', 'rd'),
    ('https://www.diariolibre.com/rss/economia.xml', 'Diario Libre', 'rd'),
    ('https://news.google.com/rss/search?q=' + urllib.parse.quote('(economía OR negocios OR comercio OR emprendimiento OR ventas) "República Dominicana" when:3d') + '&hl=es-419&gl=DO&ceid=DO:es-419', 'Google Noticias', 'rd'),
    ('https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=es-419&gl=US&ceid=US:es-419', 'Google Noticias', 'world'),
    ('https://news.google.com/rss/search?q=' + urllib.parse.quote('("más vendidos" OR "tendencias de consumo" OR "comercio electrónico" OR "productos virales") when:7d') + '&hl=es-419&gl=US&ceid=US:es-419', 'Google Noticias', 'world'),
]


def get_searches(geo):
    out = []
    try:
        s = fetch('https://trends.google.com/trending/rss?geo=' + geo)
    except Exception as e:
        log('trends', geo, 'error', e)
        return out
    for it in re.findall(r'<item>(.*?)</item>', s, re.S):
        def tag(t):
            m = re.search(r'<%s>(.*?)</%s>' % (t, t), it, re.S)
            return clean(m.group(1)) if m else ''
        try:
            t = int(parsedate_to_datetime(tag('pubDate')).timestamp())
        except Exception:
            t = int(time.time())
        out.append({'term': tag('title'), 'traffic': tag('ht:approx_traffic'), 't': t,
                    'news': tag('ht:news_item_title'), 'newsUrl': tag('ht:news_item_url'), 'newsSource': tag('ht:news_item_source')})
    return out


def refresh_news():
    items, seen = [], set()
    for url, source, region in FEEDS:
        for it in rss(url, source, region):
            key = re.sub(r'\W+', '', it['title'].lower())[:70]
            if key in seen or time.time() - it['t'] > 8 * 86400:
                continue
            seen.add(key)
            items.append(it)
    items.sort(key=lambda x: -x['t'])
    per, kept = {}, []                      # que una sola fuente no llene la lista
    for it in items:
        k = (it['region'], it['source'])
        per[k] = per.get(k, 0) + 1
        if per[k] <= (25 if it['region'] == 'rd' else 5):
            kept.append(it)
    items = kept
    do, us = get_searches('DO'), get_searches('US')
    with LOCK:
        if items:
            STATE['news'] = {'updated': int(time.time()), 'items': items[:160]}
        if do or us:
            STATE['searches'] = {'updated': int(time.time()), 'do': do, 'us': us}
        save_disk()
    log('noticias: %d · búsquedas RD %d / EE.UU. %d' % (len(items), len(do), len(us)))


def worker():
    last_p = (STATE['products'] or {}).get('updated', 0)
    last_n = (STATE['news'] or {}).get('updated', 0)
    while True:
        try:
            if time.time() - last_n > NEWS_EVERY:
                refresh_news()
                last_n = time.time()
            if time.time() - last_p > PRODUCTS_EVERY:
                refresh_products()
                last_p = time.time()
        except Exception as e:
            log('error en la actualización', e)
        time.sleep(20)


def payload_tendencias():
    with LOCK:
        p = dict(STATE['products'] or {'today': [], 'loading': True})
        p['week'], p['month'] = period(7), period(30)
        p['searches'] = STATE['searches']
        return p


def payload_noticias():
    with LOCK:
        return STATE['news'] or {'items': [], 'loading': True}


def export(folder):
    """Escribe los datos como archivos JSON para publicarlos en una web estática (GitHub Pages)."""
    os.makedirs(folder, exist_ok=True)
    for name, obj in (('tendencias.json', payload_tendencias()), ('noticias.json', payload_noticias())):
        with open(os.path.join(folder, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    log('exportado a', folder)


# ───────────────────────── HTTP ─────────────────────────
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/tendencias':
            return self.send_json(payload_tendencias())
        if path == '/api/noticias':
            return self.send_json(payload_noticias())
        if path.startswith('/datos') or path.endswith('.py') or path.endswith('.command'):
            return self.send_error(404)
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


# ───────────────────────── Actualización diaria (launchd) ─────────────────────────
def run_once():
    load_disk()
    log('actualización diaria: inicio')
    try:
        refresh_news()
    except Exception as e:
        log('noticias: error', e)
    try:
        refresh_products()
    except Exception as e:
        log('productos: error', e)
    p = STATE.get('products') or {}
    log('actualización diaria: fin · %d productos · historial %s días' % (len(p.get('today') or []), p.get('historyDays')))


def sync_updater():
    """Copia este servidor a Application Support, donde la tarea diaria puede leerlo (macOS
    no deja que las tareas en segundo plano lean el Escritorio sin permisos)."""
    try:
        os.makedirs(SUPPORT, exist_ok=True)
        dst = os.path.join(SUPPORT, 'server.py')
        if os.path.abspath(__file__) != dst:
            shutil.copy2(os.path.abspath(__file__), dst)
        return dst
    except Exception as e:
        log('no se pudo copiar el actualizador', e)
        return None


def install_daily(hhmm='08:00'):
    h, m = (int(x) for x in hhmm.split(':'))
    script = sync_updater()
    if not script:
        sys.exit('No se pudo preparar el actualizador.')
    logf = os.path.join(SUPPORT, 'actualizacion.log')
    plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>%s</string><string>--once</string></array>
  <key>WorkingDirectory</key><string>%s</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>%d</integer><key>Minute</key><integer>%d</integer></dict>
  <key>StandardOutPath</key><string>%s</string>
  <key>StandardErrorPath</key><string>%s</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
""" % (LABEL, html.escape(script), html.escape(SUPPORT), h, m, html.escape(logf), html.escape(logf))
    os.makedirs(os.path.dirname(PLIST), exist_ok=True)
    uid = str(os.getuid())
    subprocess.run(['launchctl', 'bootout', 'gui/' + uid, PLIST], capture_output=True)
    with open(PLIST, 'w', encoding='utf-8') as f:
        f.write(plist)
    r = subprocess.run(['launchctl', 'bootstrap', 'gui/' + uid, PLIST], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('launchctl no pudo cargar la tarea: ' + (r.stderr or r.stdout).strip())
    print('Actualización diaria programada a las %02d:%02d. Registro: %s' % (h, m, logf))


def uninstall_daily():
    subprocess.run(['launchctl', 'bootout', 'gui/%d' % os.getuid(), PLIST], capture_output=True)
    if os.path.exists(PLIST):
        os.remove(PLIST)
    print('Actualización diaria desactivada.')


def main():
    if '--once' in sys.argv or '--export' in sys.argv:
        if '--once' in sys.argv:
            run_once()
        else:
            load_disk()
        if '--export' in sys.argv:
            export(sys.argv[sys.argv.index('--export') + 1])
        p = STATE.get('products') or {}
        if '--once' in sys.argv and not (p.get('today') and not p.get('stale')) and not (STATE.get('news') or {}).get('items'):
            sys.exit('No se pudo obtener ningún dato nuevo.')
        return
    if '--install-daily' in sys.argv:
        i = sys.argv.index('--install-daily')
        return install_daily(sys.argv[i + 1] if len(sys.argv) > i + 1 and ':' in sys.argv[i + 1] else '08:00')
    if '--uninstall-daily' in sys.argv:
        return uninstall_daily()
    if os.path.exists(PLIST):
        sync_updater()                     # mantiene al día la copia que usa la tarea diaria
    port = 5178
    if '--port' in sys.argv:
        port = int(sys.argv[sys.argv.index('--port') + 1])
    load_disk()
    threading.Thread(target=worker, daemon=True).start()
    handler = functools.partial(Handler, directory=ROOT)
    srv = None
    for p in range(port, port + 6):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', p), handler)
            port = p
            break
        except OSError:
            continue
    if not srv:
        sys.exit('No hay puertos libres entre %d y %d' % (port, port + 5))
    url = 'http://127.0.0.1:%d/' % port
    log('Bussines Radar en', url, '(Ctrl+C para cerrar)')
    if '--no-open' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log('cerrado')


if __name__ == '__main__':
    main()
