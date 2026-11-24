import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// Tarea 14.1. Requisitos 15.1, 15.2, 15.7, 15.8 y 16.2. Pruebas estáticas de `public/_headers`, del marcado de `index.html`
// y de `DESPLIEGUE.md`. No comprueban Cloudflare: lo que el servidor envía de verdad se comprueba en un despliegue real
// (ver DESPLIEGUE.md, sección 4). `vite preview` no lee `_headers`.
const textoCabeceras = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const despliegue = readFileSync(new URL('../../DESPLIEGUE.md', import.meta.url), 'utf8');
const configuracionVite = readFileSync(new URL('./vite.config.ts', import.meta.url), 'utf8');
const EXPRESION_APROBADA =
  'starts_with(http.request.uri.path, "/p/") or starts_with(http.request.uri.path, "/d/") or starts_with(http.request.uri.path, "/geo/") or http.request.uri.path eq "/manifest.json"';
interface Bloque {
  readonly patron: string;
  readonly cabeceras: ReadonlyArray<readonly [string, string]>;
}
/** Interpreta `_headers` como Cloudflare Pages: patrón sin sangría y cabeceras `nombre: valor` con sangría. Ignora vacías y `#`. */
function interpretar(texto: string): Bloque[] {
  const bloques: Array<{ patron: string; cabeceras: Array<readonly [string, string]> }> = [];
  for (const linea of texto.split('\n')) {
    if (linea.trim() === '' || linea.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(linea)) {
      bloques.push({ patron: linea.trim(), cabeceras: [] });
      continue;
    }
    const actual = bloques.at(-1);
    if (actual === undefined) throw new Error(`cabecera sin patrón: ${linea}`);
    const separador = linea.indexOf(':');
    if (separador < 0) throw new Error(`línea sin ":": ${linea}`);
    actual.cabeceras.push([linea.slice(0, separador).trim(), linea.slice(separador + 1).trim()]);
  }
  return bloques;
}
const bloques = interpretar(textoCabeceras);
const cabeceras = new Map(bloques[0]?.cabeceras ?? []);
/** Directivas de una CSP: nombre en minúsculas y lista de fuentes. Falla si una directiva se repite. */
function directivas(csp: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const parte of csp.split(';')) {
    const palabras = parte.trim().split(/\s+/).filter((p) => p !== '');
    const nombre = palabras[0]?.toLowerCase();
    if (nombre === undefined) continue;
    if (mapa.has(nombre)) throw new Error(`directiva repetida: ${nombre}`);
    mapa.set(nombre, palabras.slice(1));
  }
  return mapa;
}
const csp = directivas(cabeceras.get('Content-Security-Policy') ?? '');
describe('public/_headers: formato que acepta Cloudflare Pages', () => {
  it('es UTF-8 sin BOM, usa solo saltos de línea LF y termina en un salto de línea', () => {
    expect(textoCabeceras.charCodeAt(0)).not.toBe(0xfeff);
    expect(textoCabeceras).not.toContain('\r');
    expect(textoCabeceras.endsWith('\n')).toBe(true);
    expect(textoCabeceras).not.toContain('\t');
  });
  it('tiene una sola regla, para `/*`, y no más de 100 reglas', () => {
    expect(bloques.map((b) => b.patron)).toEqual(['/*']);
    expect(bloques.length).toBeLessThanOrEqual(100);
  });
  it('ninguna línea supera los 2000 caracteres', () => {
    for (const linea of textoCabeceras.split('\n')) expect(linea.length).toBeLessThanOrEqual(2000);
  });
  it('declara exactamente las seis cabeceras aprobadas, cada una una sola vez', () => {
    const nombres = (bloques[0]?.cabeceras ?? []).map(([nombre]) => nombre);
    expect([...nombres].sort()).toEqual(
      [
        'Content-Security-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
      ].sort(),
    );
    expect(new Set(nombres.map((n) => n.toLowerCase())).size).toBe(nombres.length);
  });
  it('no agrega cabeceras de caché ni de CORS ni quita cabeceras de Pages', () => {
    expect(textoCabeceras).not.toMatch(/cache-control|access-control|^\s*!/im);
  });
  it('la configuración de Vite publica `public/` de la raíz del repositorio, donde está `_headers`', () => {
    expect(configuracionVite).toContain("publicDir: '../../public'");
  });
});
describe('public/_headers: política de seguridad de contenido (Requisito 15.7)', () => {
  it('tiene exactamente las directivas aprobadas y ninguna más', () => {
    expect([...csp.keys()].sort()).toEqual(
      [
        'base-uri',
        'connect-src',
        'default-src',
        'form-action',
        'frame-ancestors',
        'img-src',
        'object-src',
        'script-src',
        'style-src',
        'upgrade-insecure-requests',
      ].sort(),
    );
  });
  it.each([
    ['default-src', ["'self'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'"]],
    ['img-src', ["'self'"]],
    ['connect-src', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['object-src', ["'none'"]],
    ['form-action', ["'none'"]],
    ['upgrade-insecure-requests', []],
  ])('%s tiene el valor aprobado', (nombre, fuentes) => {
    expect(csp.get(nombre)).toEqual(fuentes);
  });
  it('solo permite scripts del propio origen', () => {
    expect(csp.get('script-src')).toEqual(["'self'"]);
  });
  it('no permite scripts ni estilos en línea, evaluación de texto, `data:`, `blob:` ni comodines en ninguna directiva', () => {
    const prohibidas = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'", 'data:', 'blob:', 'http:', 'https:', '*', 'ws:', 'wss:'];
    for (const [nombre, fuentes] of csp) {
      for (const fuente of fuentes) {
        expect(prohibidas, `${nombre} permite ${fuente}`).not.toContain(fuente);
        expect(fuente, `${nombre} usa nonce o hash: ${fuente}`).not.toMatch(/^'(nonce|sha256|sha384|sha512)-/i);
        expect(fuente, `${nombre} permite un origen externo: ${fuente}`).toMatch(/^'(self|none)'$/);
      }
    }
  });
  it('`data:` no está en `img-src` porque el código y el build no lo usan', () => {
    expect(cabeceras.get('Content-Security-Policy')).not.toContain('data:');
  });
  it('`worker-src` y `manifest-src` no se declaran: heredan de `script-src` y `default-src`, que son `\'self\'`', () => {
    expect(csp.has('worker-src')).toBe(false);
    expect(csp.has('manifest-src')).toBe(false);
  });
});
describe('public/_headers: demás cabeceras (Requisitos 15.1, 15.2 y 15.7)', () => {
  it('X-Content-Type-Options es nosniff', () => {
    expect(cabeceras.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it('X-Frame-Options es DENY', () => {
    expect(cabeceras.get('X-Frame-Options')).toBe('DENY');
  });
  it('HSTS es exactamente max-age=63072000, sin includeSubDomains ni preload', () => {
    expect(cabeceras.get('Strict-Transport-Security')).toBe('max-age=63072000');
    expect(cabeceras.get('Strict-Transport-Security')).not.toMatch(/includeSubDomains|preload/i);
  });
  it('Referrer-Policy es no-referrer', () => {
    expect(cabeceras.get('Referrer-Policy')).toBe('no-referrer');
  });
  it('Permissions-Policy desactiva cámara, micrófono, ubicación, pagos y USB', () => {
    const politica = cabeceras.get('Permissions-Policy') ?? '';
    const funciones = politica.split(',').map((f) => f.trim());
    expect(funciones).toEqual(['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()']);
  });
});
describe('apps/web/index.html es compatible con la CSP (Requisito 15.7)', () => {
  const etiquetasScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  it('todos los scripts son externos, de módulo y del propio origen, y no tienen cuerpo', () => {
    expect(etiquetasScript.length).toBeGreaterThan(0);
    for (const [, atributos = '', cuerpo = ''] of etiquetasScript) {
      expect(cuerpo.trim()).toBe('');
      expect(atributos).toMatch(/\bsrc="\/[^/"][^"]*"/);
    }
  });
  it('no tiene bloques <style>, atributos style ni manejadores de eventos en línea', () => {
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });
  it('no usa <base>, <form>, <object>, <embed>, <iframe> ni <img>', () => {
    for (const etiqueta of ['base', 'form', 'object', 'embed', 'iframe', 'img']) {
      expect(html, `<${etiqueta}>`).not.toMatch(new RegExp(`<${etiqueta}\\b`, 'i'));
    }
  });
  it('todo `src` y `href` apunta al propio origen (ruta absoluta) y no a otro sitio', () => {
    for (const [, valor = ''] of html.matchAll(/\b(?:src|href)="([^"]*)"/gi)) {
      expect(valor).toMatch(/^\/[^/]/);
    }
  });
  it('las hojas de estilo del cliente no cargan recursos con url(), @import ni @font-face', () => {
    for (const nombre of ['./styles.css', './splash.css']) {
      const css = readFileSync(new URL(nombre, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, nombre).not.toMatch(/url\(|@import|@font-face/i);
    }
  });
});
describe('DESPLIEGUE.md documenta la configuración externa sin afirmar que esté aplicada', () => {
  it('contiene la expresión de la regla aprobada, sin cambios', () => {
    expect(despliegue).toContain(EXPRESION_APROBADA);
  });
  it('conserva los parámetros considerados como referencia: 20 solicitudes, 10 segundos y bloqueo de 10 segundos', () => {
    expect(despliegue).toMatch(/\|\s*Solicitudes\s*\|\s*20\s*\|/);
    expect(despliegue).toMatch(/\|\s*Período\s*\|\s*10 segundos/);
    expect(despliegue).toMatch(/\|\s*Duración del bloqueo\s*\|\s*10 segundos/);
  });
  it('el despliegue público principal es pages.dev y no pide comprar ni configurar un dominio propio', () => {
    expect(despliegue).toContain('https://PROYECTO.pages.dev');
    expect(despliegue).toContain('No se necesita comprar ni configurar un dominio propio.');
    expect(despliegue).toContain('No se configura dominio, "Always Use HTTPS" ni reglas de seguridad');
    expect(despliegue).not.toMatch(/nameserver/i);
  });
  it('declara que nada de Cloudflare está aplicado ni comprobado', () => {
    expect(despliegue).toContain('Nada de lo que está en Cloudflare está aplicado ni comprobado todavía.');
    expect(despliegue).toContain('Pendiente de comprobar en Cloudflare real.');
  });
  it('declara que el Requisito 15.8 sigue pendiente y no se cumple', () => {
    expect(despliegue).toContain('**El Requisito 15.8 sigue pendiente. No se cumple, ni siquiera de forma parcial.**');
    expect(despliegue).toContain('más de 60 solicitudes en 60 segundos');
  });
  it('explica que la regla considerada no se aplica a pages.dev', () => {
    expect(despliegue).toContain('Por eso la regla considerada no se puede aplicar al despliegue en `pages.dev`.');
    expect(despliegue).toContain('**No se va a aplicar mientras el despliegue use solo `pages.dev`.**');
  });
  it('no introduce Workers ni Pages Functions y lo dice', () => {
    expect(despliegue).toContain('**No se implementó ni se introdujo nada de eso.**');
    expect(despliegue).toContain('no se simula uno');
  });
  it('declara que `Retry-After` no está verificado', () => {
    expect(despliegue).toContain('**No se afirma que `Retry-After` funcione.**');
  });
  it('documenta HSTS sin includeSubDomains, igual que `_headers`', () => {
    expect(despliegue).toMatch(/\|\s*`Strict-Transport-Security`\s*\|\s*`max-age=63072000`\s*\|/);
    expect(despliegue).not.toContain('max-age=63072000; includeSubDomains');
    expect(despliegue).toContain('Sin `includeSubDomains` ni `preload`.');
    expect(despliegue).toContain('`includeSubDomains` se quitó de HSTS por decisión del equipo.');
  });
  it('la tabla de cabeceras repite cada cabecera de `_headers` con su valor exacto', () => {
    for (const [nombre, valor] of cabeceras) {
      expect(despliegue, nombre).toContain(`| \`${nombre}\` | \`${valor}\` |`);
    }
  });
  it('deja pendiente el nombre del manifiesto PWA y no lo elige', () => {
    expect(despliegue).toContain('Nombre del manifiesto PWA (tarea 8.2).');
    expect(despliegue).not.toMatch(/manifest\.webmanifest/i);
  });
  it('no afirma que haya una regla activa ni que se cumpla el Requisito 15.8', () => {
    expect(despliegue).not.toMatch(/regla (está|queda|fue) (activa|aplicada)/i);
    expect(despliegue).not.toMatch(/(?<!no )(?<!No )se cumple el Requisito 15\.8/i);
    expect(despliegue).not.toMatch(/Requisito 15\.8 (está cumplido|queda cumplido)/i);
  });
});
