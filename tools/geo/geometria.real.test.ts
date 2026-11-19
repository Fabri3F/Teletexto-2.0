import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CODIGOS_DEPARTAMENTO, type Geometria } from '@teletexto/modelo';
import { DEPARTAMENTOS } from '../../apps/web/risk/departamentos/index.ts';
import { anillosDeRutaRelativa, areaDoble, centroideDecimas, motivoInvalido, type AnilloDecimas } from './anillos.ts';
import { EXCEPCIONES_AUTORIZADAS, LIMITE_COMPRIMIDO_BYTES, OBJETIVO_COMPRIMIDO_BYTES, PARAMETROS_APROBADOS } from './constantes.ts';
import { decimalesMaximos } from './construir.ts';
import { camposDeGeometria, type FuenteConfig } from './fuente.ts';
import { dependenciasReales, generarGeometria } from './generar.ts';
import fuenteReal from './fuente.config.json' with { type: 'json' };
import mapaReal from './mapa.config.json' with { type: 'json' };
import { tamanoComprimido } from './tamano.ts';

// Pruebas del archivo REAL public/geo/departamentos.json (tarea 3.2) y de su generación con Mapshaper y el ZIP del IGN.
// El archivo se versiona en el repositorio; el ZIP no (data/fuentes/ está en .gitignore), así que la regeneración se
// omite si el ZIP no está.

vi.setConfig({ testTimeout: 60_000 });

const RUTA_GEOMETRIA = new URL('../../public/geo/departamentos.json', import.meta.url);
const RUTA_ZIP = new URL('../../data/fuentes/ign/DEPARTAMENTOS_LIMITES.zip', import.meta.url);
const hayGeometria = existsSync(RUTA_GEOMETRIA);
const hayZip = existsSync(RUTA_ZIP);
const esperado = fuenteReal.verificacion.esperadoPorDepartamento;

/**
 * Intérprete mínimo de rutas SVG `m`/`z` escrito aparte de `anillosDeRutaRelativa`, siguiendo la norma de SVG: tras `m`, los
 * pares adicionales son `l` relativos; `z` cierra la subruta y deja el punto actual en su inicio. Sirve para comprobar que lo
 * que lee un navegador es lo mismo que lo que lee la herramienta.
 */
function interpretarRutaSvg(ruta: string): number[][][] {
  const anillos: number[][][] = [];
  let actual: [number, number] = [0, 0];
  let inicio: [number, number] = [0, 0];
  let puntos: number[][] = [];
  for (const orden of ruta.matchAll(/([mz])([^mz]*)/g)) {
    const resto = orden[2] ?? '';
    if (orden[1] === 'z') {
      anillos.push(puntos);
      puntos = [];
      actual = inicio;
      continue;
    }
    // Gramática de números de SVG: un signo opcional, dígitos con un punto opcional, y un número nuevo empieza en cada signo o punto repetido.
    const numeros = (resto.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    expect(numeros.length % 2).toBe(0);
    for (let i = 0; i < numeros.length; i += 2) {
      actual = [actual[0] + (numeros[i] as number), actual[1] + (numeros[i + 1] as number)];
      if (i === 0) inicio = actual;
      puntos.push([Math.round(actual[0] * 10), Math.round(actual[1] * 10)]);
    }
  }
  return anillos;
}

describe.skipIf(!hayGeometria)('public/geo/departamentos.json (archivo versionado de la tarea 3.2)', () => {
  const texto = hayGeometria ? readFileSync(RUTA_GEOMETRIA, 'utf8') : '';
  const geometria = (hayGeometria ? JSON.parse(texto) : {}) as Geometria;

  it('es JSON en UTF-8 sin BOM, con un salto de línea final y sin espacios sobrantes', () => {
    const bytes = readFileSync(RUTA_GEOMETRIA);
    expect(bytes[0]).toBe(0x7b); // "{": no hay BOM
    expect(texto.endsWith('}\n')).toBe(true);
    expect(texto).toBe(`${JSON.stringify(geometria)}\n`);
  });

  it('tiene exactamente los campos del tipo Geometria y los valores aprobados', () => {
    expect(Object.keys(geometria)).toEqual(['version', 'fuente', 'licencia', 'viewBox', 'departamentos']);
    expect(geometria.version).toBe(PARAMETROS_APROBADOS.version);
    expect(geometria.viewBox).toEqual([...PARAMETROS_APROBADOS.viewBox]);
    expect(geometria.viewBox).toEqual([0, 0, 6225, 9207]);
  });

  it('mantiene la atribución ODC-By 1.0 de los datos del IGN y su carácter referencial', () => {
    const { fuente, licencia } = camposDeGeometria(fuenteReal as unknown as FuenteConfig);
    expect(geometria.fuente).toBe(fuente);
    expect(geometria.licencia).toBe(licencia);
    expect(geometria.licencia).toContain('ODC-By');
    expect(geometria.licencia).toContain('versión 1.0');
    expect(geometria.licencia).toContain('https://opendatacommons.org/licenses/by/1.0/');
    expect(geometria.licencia).toContain('Instituto Geográfico Nacional (IGN)');
    expect(geometria.licencia).toContain('no deben tomarse como límites legales definitivos');
    expect(geometria.fuente).toContain('referencial');
  });

  it('pesa menos que el límite absoluto y que el objetivo operativo, medido con gzip de zlib nivel 6', () => {
    const bytes = Buffer.byteLength(texto, 'utf8');
    const comprimido = tamanoComprimido(texto);
    expect(bytes).toBe(readFileSync(RUTA_GEOMETRIA).length);
    expect(comprimido).toBeLessThanOrEqual(OBJETIVO_COMPRIMIDO_BYTES);
    expect(comprimido).toBeLessThanOrEqual(LIMITE_COMPRIMIDO_BYTES);
    expect(OBJETIVO_COMPRIMIDO_BYTES).toBe(76_800);
    expect(LIMITE_COMPRIMIDO_BYTES).toBe(81_920);
  });

  it('tiene exactamente los 25 departamentos de la tabla de la tarea 1.4, en orden, con sus nombres', () => {
    expect(geometria.departamentos).toHaveLength(25);
    expect(geometria.departamentos.map((d) => d.codigo)).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(geometria.departamentos.map((d) => [d.codigo, d.nombre])).toEqual(DEPARTAMENTOS.map((d) => [d.codigo, d.nombre]));
    for (const d of geometria.departamentos) expect(Object.keys(d)).toEqual(['codigo', 'nombre', 'd', 'centroide']);
  });

  it('las rutas son relativas y compactas (solo m, z, dígitos, signos, puntos y espacios) y llevan a lo sumo un decimal', () => {
    for (const d of geometria.departamentos) {
      expect(d.d, d.codigo).toMatch(/^(?:m[-\d. ]+z)+$/);
      expect(d.d, d.codigo).not.toMatch(/[MLHVCSQTAZlhvcsqta]/);
      expect(d.d, d.codigo).not.toMatch(/e/i);
      expect(decimalesMaximos(d.d), d.codigo).toBeLessThanOrEqual(1);
    }
  });

  const anillosPorDepartamento = (): Map<string, AnilloDecimas[]> =>
    new Map(geometria.departamentos.map((d) => [d.codigo, anillosDeRutaRelativa(d.d) ?? []]));

  it('se leen las 39 partes representables: 40 de la fuente menos la excepción 21#6.2, con Puno en 9', () => {
    const porDepto = anillosPorDepartamento();
    let total = 0;
    for (const { codigo, partes } of esperado) {
      const dibujadas = porDepto.get(codigo)?.length;
      const menos = EXCEPCIONES_AUTORIZADAS.filter((e) => e.codigo === codigo).length;
      expect(dibujadas, codigo).toBe(partes - menos);
      total += dibujadas ?? 0;
    }
    expect(total).toBe(39);
    expect(fuenteReal.verificacion.partesTotales - EXCEPCIONES_AUTORIZADAS.length).toBe(39);
    expect(porDepto.get('21')).toHaveLength(9);
    expect(porDepto.get('15')).toHaveLength(4); // Lima conserva sus 3 islas junto al continente
  });

  it('cada parte es un anillo dibujable (3 puntos distintos y área distinta de cero) y todo queda dentro del viewBox', () => {
    const [minX, minY, ancho, alto] = geometria.viewBox;
    for (const [codigo, anillos] of anillosPorDepartamento()) {
      for (const [i, anillo] of anillos.entries()) {
        expect(motivoInvalido(anillo), `${codigo} parte ${i}`).toBeUndefined();
        for (const [xd, yd] of anillo) {
          expect(xd / 10, codigo).toBeGreaterThanOrEqual(minX);
          expect(xd / 10, codigo).toBeLessThanOrEqual(minX + ancho);
          expect(yd / 10, codigo).toBeGreaterThanOrEqual(minY);
          expect(yd / 10, codigo).toBeLessThanOrEqual(minY + alto);
        }
      }
    }
  });

  it('un intérprete de rutas SVG independiente lee exactamente los mismos puntos que la herramienta (compatibilidad con un navegador)', () => {
    for (const [codigo, anillos] of anillosPorDepartamento()) {
      const d = geometria.departamentos.find((x) => x.codigo === codigo)?.d ?? '';
      expect(interpretarRutaSvg(d), codigo).toEqual(anillos);
    }
  });

  it('los huecos son subrutas de sentido contrario al de los exteriores: se ven como huecos con el relleno por defecto de SVG', () => {
    let huecosTotales = 0;
    for (const [codigo, anillos] of anillosPorDepartamento()) {
      const mayor = anillos.reduce((m, a) => (Math.abs(areaDoble(a)) > Math.abs(areaDoble(m)) ? a : m));
      const contrarios = anillos.filter((a) => Math.sign(areaDoble(a)) !== Math.sign(areaDoble(mayor))).length;
      const fila = esperado.find((e) => e.codigo === codigo);
      const exceptuados = EXCEPCIONES_AUTORIZADAS.filter((e) => e.codigo === codigo && e.anillo > 0).length;
      expect(contrarios, codigo).toBe((fila?.huecos ?? -1) - exceptuados);
      huecosTotales += contrarios;
    }
    expect(huecosTotales).toBe(5); // Arequipa 1, Ayacucho 1, Cusco 1 y Puno 2 (3 menos la excepción)
  });
  it('los centroides tienen un decimal, están dentro del viewBox y coinciden con el centroide ponderado por área de las partes dibujadas', () => {
    const [, , ancho, alto] = geometria.viewBox;
    for (const [codigo, anillos] of anillosPorDepartamento()) {
      const d = geometria.departamentos.find((x) => x.codigo === codigo);
      const [cx, cy] = d?.centroide ?? [Number.NaN, Number.NaN];
      expect(Number.isFinite(cx) && Number.isFinite(cy), codigo).toBe(true);
      expect(decimalesMaximos(`${cx} ${cy}`), codigo).toBeLessThanOrEqual(1);
      expect(cx).toBeGreaterThan(0);
      expect(cx).toBeLessThan(ancho);
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThan(alto);
      // Los exteriores y los huecos tienen orientación contraria; el exterior mayor da el sentido de los exteriores.
      const mayor = anillos.reduce((m, a) => (Math.abs(areaDoble(a)) > Math.abs(areaDoble(m)) ? a : m));
      const sentido = Math.sign(areaDoble(mayor));
      const poligonos = anillos.map((a) => [Math.sign(areaDoble(a)) === sentido ? a : undefined]);
      const huecos = anillos.map((a) => [Math.sign(areaDoble(a)) === sentido ? undefined : a]);
      // centroideDecimas toma el primer anillo de cada polígono como exterior y los demás como huecos.
      const centro = centroideDecimas([...poligonos, ...huecos.map((h) => [undefined, ...h])]);
      expect(centro, codigo).toBeDefined();
      expect(Math.abs((centro?.[0] ?? 0) / 10 - cx), `${codigo} x`).toBeLessThanOrEqual(0.15);
      expect(Math.abs((centro?.[1] ?? 0) / 10 - cy), `${codigo} y`).toBeLessThanOrEqual(0.15);
    }
  });
});

describe.skipIf(!hayZip || !hayGeometria)('Generación real con Mapshaper y el ZIP del IGN', () => {
  it('regenera exactamente el archivo versionado, con 25 departamentos, 39 partes, la excepción 21#6.2 y el tamaño dentro del objetivo', async () => {
    const r = await generarGeometria(
      {
        fuente: fuenteReal,
        mapa: mapaReal,
        tabla: DEPARTAMENTOS,
        aprobados: PARAMETROS_APROBADOS,
        excepcionesAutorizadas: EXCEPCIONES_AUTORIZADAS,
      },
      dependenciasReales((ruta) => readFileSync(new URL(ruta, new URL('../../', import.meta.url)))),
    );
    expect(r.ok, r.ok ? '' : r.errores.join('\n')).toBe(true);
    if (!r.ok) return;
    const { registro, texto } = r.valor;
    expect(texto).toBe(readFileSync(RUTA_GEOMETRIA, 'utf8'));
    expect(registro.resumen.departamentos).toBe(25);
    expect(registro.resumen.partes).toBe(39);
    expect(registro.resumen.partesOmitidas).toBe(0);
    expect(registro.fuenteOriginal).toEqual({ partes: 40, puntos: 334_429 });
    expect(registro.excepciones).toEqual(['21#6.2']);
    expect(registro.comprimidoBytes).toBe(tamanoComprimido(texto));
    expect(registro.comprimidoBytes).toBeLessThanOrEqual(76_800);
    expect(registro.objetivoCumplido).toBe(true);
    expect(registro.bytes).toBe(Buffer.byteLength(texto, 'utf8'));
    // La búsqueda arrancó en 8,3 % y eligió el mayor porcentaje que cumple el objetivo: es mayor que 8,3 % porque cabe más.
    expect(registro.porcentajeConservado).toBeGreaterThan(8.3);
    expect(registro.porcentajeConservado).toBeLessThan(9);
    expect(registro.intentos.some((i) => i.porcentaje === 8.3)).toBe(true);
    expect(registro.intentos.every((i) => i.partesOmitidas >= 0)).toBe(true);
  }, 300_000);
});
