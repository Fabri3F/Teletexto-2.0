import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './a11y/contrast.ts';
import { COLORES_TELETEXTO, COMBINACIONES_TEXTO } from './a11y/paleta.ts';
// Tarea 7.3. Requisitos 1.9, 1.10, 1.11, 1.12 y 14.2. Pruebas estáticas del marcado de `index.html` y de `splash.css`.
// La detección de que la Portada tiene contenido y la clase `listo` en la aplicación son de la tarea 7.5.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./splash.css', import.meta.url), 'utf8');
const cssSinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Texto de un bloque entre llaves equilibradas que empieza en la primera `{` desde `desde`. */
function bloqueDesde(texto: string, desde: number): { dentro: string; fin: number } {
  const apertura = texto.indexOf('{', desde);
  let profundidad = 0;
  for (let i = apertura; i < texto.length; i++) {
    if (texto[i] === '{') profundidad++;
    if (texto[i] === '}') {
      profundidad--;
      if (profundidad === 0) return { dentro: texto.slice(apertura + 1, i), fin: i + 1 };
    }
  }
  throw new Error('llaves sin cerrar');
}

const inicioMedia = cssSinComentarios.indexOf('@media (prefers-reduced-motion: reduce)');
const media = bloqueDesde(cssSinComentarios, inicioMedia);
/** El CSS sin el bloque de movimiento reducido. */
const cssNormal = cssSinComentarios.slice(0, inicioMedia) + cssSinComentarios.slice(media.fin);

/** Declaraciones de la primera regla cuyo selector es exactamente `selector`, en el texto dado. */
function declaraciones(texto: string, selector: string): Map<string, string> {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const coincidencia = new RegExp(`(?:^|[}\\s])${escapado}\\s*\\{([^}]*)\\}`).exec(texto);
  if (coincidencia?.[1] === undefined) throw new Error(`no existe la regla ${selector}`);
  const mapa = new Map<string, string>();
  for (const declaracion of coincidencia[1].split(';')) {
    const separador = declaracion.indexOf(':');
    if (separador > 0) mapa.set(declaracion.slice(0, separador).trim(), declaracion.slice(separador + 1).trim());
  }
  return mapa;
}

/** Duración y retardo (en segundos) de un valor `animation: nombre duración timing retardo relleno`. */
function tiempos(animacion: string): { duracion: number; retardo: number; relleno: string[] } {
  const partes = animacion.split(/\s+/);
  const segundos = partes.filter((p) => /^[0-9.]+s$/.test(p)).map((p) => Number.parseFloat(p));
  return { duracion: segundos[0] ?? Number.NaN, retardo: segundos[1] ?? Number.NaN, relleno: partes.filter((p) => ['forwards', 'backwards', 'both', 'none'].includes(p)) };
}

const elemento = (() => {
  const inicio = html.indexOf('<div id="pantalla-de-carga"');
  const fin = html.indexOf('</div>', inicio) + '</div>'.length;
  return html.slice(inicio, fin);
})();

describe('Marcado de la pantalla de carga en index.html (Requisito 1.9)', () => {
  it('es un div con el identificador pantalla-de-carga, oculto a los lectores de pantalla', () => {
    expect(html).toContain('<div id="pantalla-de-carga" aria-hidden="true">');
  });
  it('muestra el nombre "Teletexto 2.0"', () => {
    expect(elemento).toMatch(/<p class="splash-nombre">Teletexto 2\.0<\/p>/);
  });
  it('lleva un logotipo SVG en línea, decorativo y sin foco', () => {
    const svg = /<svg[\s\S]*?<\/svg>/.exec(elemento)?.[0] ?? '';
    expect(svg).not.toBe('');
    expect(svg).toContain('viewBox="0 0 64 48"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
  });
  it('el SVG solo usa formas simples: sin imágenes, referencias, scripts ni elementos externos', () => {
    const svg = /<svg[\s\S]*?<\/svg>/.exec(elemento)?.[0] ?? '';
    for (const prohibido of ['<image', '<use', '<foreignObject', '<script', '<style', 'href=', 'xlink:', 'filter=', '<animate', '<set']) {
      expect(svg, prohibido).not.toContain(prohibido);
    }
  });
  it('no usa regiones aria-live ni roles que anuncien la pantalla: el nombre lo da el título del documento', () => {
    expect(elemento).not.toContain('aria-live');
    expect(elemento).not.toContain('role=');
    expect(html).toContain('<title>Teletexto 2.0</title>');
    expect(html).toContain('<html lang="es">');
  });
  it('está dentro de <body>, antes de #app y fuera de él', () => {
    const cuerpo = html.indexOf('<body>');
    const inicio = html.indexOf('<div id="pantalla-de-carga"');
    const cierre = inicio + elemento.length;
    const app = html.indexOf('<div id="app"');
    expect(cuerpo).toBeGreaterThan(-1);
    expect(inicio).toBeGreaterThan(cuerpo);
    expect(cierre).toBeLessThanOrEqual(app);
    expect(elemento).not.toContain('id="app"');
  });
  it('no está dentro del contenedor de la aplicación: #app está vacío en el marcado', () => {
    expect(html).toContain('<div id="app"></div>');
  });
});

describe('index.html: enlace a splash.css y ausencia de recursos innecesarios (Requisito 1.11)', () => {
  it('enlaza splash.css desde <head>, antes del script de entrada', () => {
    const cabecera = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(cabecera).toContain('<link rel="stylesheet" href="/splash.css" />');
    expect(html.indexOf('<link rel="stylesheet" href="/splash.css" />')).toBeLessThan(html.indexOf('<script'));
  });
  it('el único <link> es el de splash.css (sin fuentes web ni otras hojas)', () => {
    expect(html.match(/<link\b[^>]*>/g)).toEqual(['<link rel="stylesheet" href="/splash.css" />']);
  });
  it('el único script es el de entrada de la aplicación, y ninguno está dentro de la pantalla de carga', () => {
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="module" src="/main.tsx">']);
    expect(elemento).not.toContain('<script');
  });
  it('no tiene estilos en línea ni manejadores de eventos ni javascript: en ninguna parte', () => {
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });
  it('no usa imágenes, medios, marcos ni recursos externos', () => {
    for (const prohibido of ['<img', '<picture', '<canvas', '<iframe', '<object', '<embed', '<video', '<audio', '<source', 'data:']) {
      expect(html, prohibido).not.toContain(prohibido);
    }
    expect(html).not.toMatch(/\.(png|jpe?g|gif|webp|avif|bmp|ico)\b/i);
    expect(html).not.toMatch(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});

describe('splash.css: ocultamiento a los 1.5 s y clase listo (Requisito 1.10)', () => {
  const base = declaraciones(cssNormal, '#pantalla-de-carga');
  it('cubre toda la pantalla desde el primer momento y queda por encima del resto', () => {
    expect(base.get('position')).toBe('fixed');
    expect(base.get('inset')).toBe('0');
    expect(Number(base.get('z-index'))).toBeGreaterThanOrEqual(1000);
    expect(base.has('visibility')).toBe(false);
    expect(base.has('opacity')).toBe(false);
    expect(base.has('display') && base.get('display') !== 'none').toBe(true);
  });
  it('la animación dura 0.3 s, empieza a los 1.2 s y termina a los 1.5 s', () => {
    const { duracion, retardo } = tiempos(base.get('animation') ?? '');
    expect(duracion).toBeCloseTo(0.3, 10);
    expect(retardo).toBeCloseTo(1.2, 10);
    expect(duracion + retardo).toBeCloseTo(1.5, 10);
  });
  it('la animación solo se aplica hacia delante (forwards), una vez, sin repetir ni aplicarse antes del retardo', () => {
    const animacion = base.get('animation') ?? '';
    expect(tiempos(animacion).relleno).toEqual(['forwards']);
    expect(animacion).not.toMatch(/infinite|alternate|backwards|both/);
  });
  it('el fotograma final deja la pantalla transparente y oculta; el inicial, visible', () => {
    const inicio = cssNormal.indexOf('@keyframes ocultar-pantalla-de-carga');
    const { dentro } = bloqueDesde(cssNormal, inicio);
    expect(dentro).toMatch(/from\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;[^}]*\}/);
    expect(dentro).toMatch(/to\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*\}/);
    expect(base.get('animation')).toContain('ocultar-pantalla-de-carga ');
  });
  it('la clase listo oculta de inmediato y cancela la animación, sin transición', () => {
    const listo = declaraciones(cssNormal, '#pantalla-de-carga.listo');
    expect(listo.get('animation')).toBe('none');
    expect(listo.get('opacity')).toBe('0');
    expect(listo.get('visibility')).toBe('hidden');
    expect([...listo.keys()].some((k) => k.startsWith('transition'))).toBe(false);
  });
  it('listo pesa más que la regla base, también con movimiento reducido', () => {
    // #pantalla-de-carga.listo (id + clase) tiene más especificidad que #pantalla-de-carga, así que gana en ambos casos.
    expect(cssSinComentarios).toMatch(/#pantalla-de-carga\.listo\s*\{/);
    expect(media.dentro).not.toContain('.listo');
  });
  it('modelo temporal: visible antes de 1.2 s, desvanecida entre 1.2 s y 1.5 s y oculta desde 1.5 s', () => {
    const { duracion, retardo } = tiempos(base.get('animation') ?? '');
    const progreso = (t: number): number => Math.min(1, Math.max(0, (t - retardo) / duracion));
    const opacidad = (t: number): number => 1 - progreso(t);
    expect(opacidad(0)).toBe(1);
    expect(opacidad(1.19)).toBe(1);
    expect(opacidad(1.35)).toBeCloseTo(0.5, 9);
    expect(opacidad(1.5)).toBeCloseTo(0, 9);
    expect(opacidad(2)).toBe(0);
  });
});

describe('splash.css: movimiento reducido (Requisito 1.12)', () => {
  const reducida = declaraciones(media.dentro, '#pantalla-de-carga');
  it('hay un bloque prefers-reduced-motion: reduce', () => {
    expect(inicioMedia).toBeGreaterThan(-1);
    expect(media.dentro.length).toBeGreaterThan(0);
  });
  it('conserva solo el cambio discreto de visibilidad a los 1.5 s: duración 0, step-end, retardo 1.5 s', () => {
    const animacion = reducida.get('animation') ?? '';
    const { duracion, retardo, relleno } = tiempos(animacion);
    expect(duracion).toBe(0);
    expect(retardo).toBeCloseTo(1.5, 10);
    expect(relleno).toEqual(['forwards']);
    expect(animacion).toContain('step-end');
    expect(animacion).not.toMatch(/infinite|alternate|backwards|both/);
  });
  it('sus fotogramas solo cambian la visibilidad', () => {
    const inicio = media.dentro.indexOf('@keyframes');
    const { dentro } = bloqueDesde(media.dentro, inicio);
    expect(dentro.replace(/\s+/g, ' ').trim()).toBe('to { visibility: hidden; }');
  });
  it('no hay desvanecimiento, transformación, transición ni desplazamiento en el bloque', () => {
    for (const prohibido of ['opacity', 'transform', 'transition', 'translate', 'scale', 'rotate', 'filter', 'margin', 'top', 'left', 'width', 'height', '0.3s']) {
      expect(media.dentro, prohibido).not.toContain(prohibido);
    }
  });
  it('fuera del bloque no hay ninguna otra animación ni transición salvo el desvanecimiento normal', () => {
    expect(cssNormal).not.toContain('transition');
    expect(cssNormal.match(/animation\s*:/g)).toHaveLength(2); // la regla base y listo (animation: none)
    expect(cssNormal.match(/@keyframes\s+[\w-]+/g)).toEqual(['@keyframes ocultar-pantalla-de-carga']);
    expect(cssNormal).not.toMatch(/animation-(name|duration|iteration)/);
  });
  it('el logotipo y el nombre son estáticos: ninguna regla de ellos anima nada', () => {
    for (const selector of ['.splash-logo', '.splash-marco', '.splash-t', '.splash-barra', '.splash-nombre']) {
      const reglas = declaraciones(cssNormal, selector);
      expect([...reglas.keys()].some((k) => k.startsWith('animation') || k.startsWith('transition')), selector).toBe(false);
    }
  });
});

describe('splash.css: sin recursos externos (Requisito 1.11)', () => {
  it('no usa url(), @import, @font-face, data: ni direcciones', () => {
    for (const prohibido of ['url(', '@import', '@font-face', 'data:', 'http:', 'https:', '//']) {
      expect(cssSinComentarios, prohibido).not.toContain(prohibido);
    }
  });
  it('no usa JavaScript embebido ni expresiones', () => {
    expect(cssSinComentarios).not.toMatch(/expression\(|javascript:|behavior:/i);
  });
});

describe('splash.css: colores y contraste (Requisitos 6.5 y 18.1)', () => {
  const colores = [...new Set(cssNormal.concat(media.dentro).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])];
  const base = declaraciones(cssNormal, '#pantalla-de-carga');
  const fondo = base.get('background') ?? '';
  it('todos los colores son #rrggbb en minúsculas y pertenecen a la paleta del teletexto', () => {
    expect(colores.length).toBeGreaterThan(0);
    const paleta: string[] = Object.values(COLORES_TELETEXTO);
    for (const color of colores) {
      expect(color, color).toMatch(/^#[0-9a-f]{6}$/);
      expect(paleta, color).toContain(color);
    }
  });
  it('el fondo es negro', () => {
    expect(fondo).toBe(COLORES_TELETEXTO.negro);
  });
  it.each([
    ['el texto de la pantalla (blanco)', () => base.get('color') ?? ''],
    ['el nombre (amarillo)', () => declaraciones(cssNormal, '.splash-nombre').get('color') ?? ''],
  ])('%s cumple 7:1 y es una combinación de la paleta', (_etiqueta, obtener) => {
    const texto = obtener();
    expect(contrastRatio(texto, fondo)).toBeGreaterThanOrEqual(7);
    expect(COMBINACIONES_TEXTO.some((c) => c.texto === texto && c.fondo === fondo)).toBe(true);
  });
  it('las partes del logotipo cumplen 3:1 frente al fondo', () => {
    const partes = [
      declaraciones(cssNormal, '.splash-marco').get('stroke'),
      declaraciones(cssNormal, '.splash-t').get('fill'),
      declaraciones(cssNormal, '.splash-barra').get('stroke'),
    ];
    for (const parte of partes) {
      expect(parte).toBeDefined();
      expect(contrastRatio(parte ?? '', fondo), parte).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Peso comprimido (Requisito 1.11)', () => {
  const gzip = (texto: string): number => gzipSync(Buffer.from(texto, 'utf8'), { level: 9 }).length;
  const LIMITE = 5120;
  it('index.html más splash.css, comprimidos por separado con gzip nivel 9, no superan 5 120 bytes', () => {
    const del = gzip(html);
    const delCss = gzip(css);
    expect(del).toBeGreaterThan(0);
    expect(delCss).toBeGreaterThan(0);
    expect(del + delCss, `index.html ${del} B + splash.css ${delCss} B`).toBeLessThanOrEqual(LIMITE);
  });
  it('cada archivo sin comprimir también es pequeño (menos de 5 KB)', () => {
    expect(Buffer.byteLength(html)).toBeLessThan(LIMITE);
    expect(Buffer.byteLength(css)).toBeLessThan(LIMITE);
  });
});
