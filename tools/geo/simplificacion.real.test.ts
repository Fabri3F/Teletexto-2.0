import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEPARTAMENTOS } from '../../apps/web/risk/departamentos/index.ts';
import { EXCEPCIONES_AUTORIZADAS, PARAMETROS_APROBADOS } from './constantes.ts';
import { verificarCodigos, verificarExcepciones, verificarNombres, verificarPartes, type ExcepcionActiva } from './construir.ts';
import { contarPartes, contarPuntos, normalizarFeatures, type UnidadCruda } from './geojson.ts';
import { simplificarFuente } from './simplificacion.ts';
import configFuente from './fuente.config.json' with { type: 'json' };

// Prueba con Mapshaper REAL y el ZIP REAL del IGN. Se omite si el ZIP no está en el repositorio (data/fuentes/ no se
// versiona). Comprueba lo que registró la tarea 3.1 leyendo el ZIP con otro lector, y que la herramienta lo conserva.

const RUTA_ZIP = new URL('../../data/fuentes/ign/DEPARTAMENTOS_LIMITES.zip', import.meta.url);
const hayZip = existsSync(RUTA_ZIP);
const CAMPOS = { codigo: configFuente.codificacion.campoCodigo, nombre: configFuente.codificacion.campoNombre };
const esperado = configFuente.verificacion.esperadoPorDepartamento;

/** Fuente sin simplificar (100) o simplificada con `-explode` y Douglas-Peucker (menos de 100), una unidad por código. */
async function leer(porcentaje: number): Promise<UnidadCruda[]> {
  const zip = readFileSync(RUTA_ZIP);
  const geojson = await simplificarFuente(zip, porcentaje);
  if (!geojson.ok) throw new Error(geojson.errores.join('\n'));
  const unidades = normalizarFeatures(geojson.valor, CAMPOS, { agrupar: porcentaje < 100 });
  if (!unidades.ok) throw new Error(unidades.errores.join('\n'));
  return unidades.valor;
}

/** Las excepciones del registro, comprobadas contra la fuente sin simplificar con los parámetros aprobados. */
function excepcionesDe(original: UnidadCruda[]): ExcepcionActiva[] {
  const r = verificarExcepciones(
    (configFuente as { partesNoRepresentables?: unknown }).partesNoRepresentables,
    EXCEPCIONES_AUTORIZADAS,
    original,
    PARAMETROS_APROBADOS,
  );
  if (!r.ok) throw new Error(r.errores.join('\n'));
  return r.valor;
}

describe.skipIf(!hayZip)('Mapshaper real con el ZIP del IGN', () => {
  it('lee las 25 unidades con los códigos de la tabla de la tarea 1.4 y sus nombres', async () => {
    const unidades = await leer(100);
    expect(unidades).toHaveLength(25);
    expect(verificarCodigos(unidades, DEPARTAMENTOS).ok).toBe(true);
    expect(verificarNombres(unidades, DEPARTAMENTOS).ok).toBe(true);
  }, 60_000);

  it('sin simplificar conserva las 40 partes y los 334 429 puntos que registró la tarea 3.1, departamento por departamento', async () => {
    const unidades = await leer(100);
    expect(unidades.reduce((s, u) => s + contarPartes(u.poligonos), 0)).toBe(configFuente.verificacion.partesTotales);
    expect(unidades.reduce((s, u) => s + contarPuntos(u.poligonos), 0)).toBe(configFuente.verificacion.verticesTotales);
    expect(verificarPartes(unidades, esperado, 'Fuente').ok).toBe(true);
    for (const { codigo, vertices } of esperado) {
      const unidad = unidades.find((u) => u.codigo === codigo);
      expect(contarPuntos(unidad?.poligonos ?? []), codigo).toBe(vertices);
    }
  }, 60_000);

  it('conserva las partes de las geometrías multiparte: Lima 4, Puno 10, Arequipa 2, Ayacucho 2 y Cusco 2', async () => {
    const unidades = await leer(100);
    const partes = Object.fromEntries(unidades.map((u) => [u.codigo, contarPartes(u.poligonos)]));
    expect(partes['15']).toBe(4);
    expect(partes['21']).toBe(10);
    expect(partes['04']).toBe(2);
    expect(partes['05']).toBe(2);
    expect(partes['08']).toBe(2);
  }, 60_000);

  it('la excepción autorizada (21#6.2) coincide con la fuente real: misma huella, 4 puntos, y no se puede dibujar con los parámetros aprobados', async () => {
    const original = await leer(100);
    const activas = excepcionesDe(original);
    expect(activas.map((e) => e.id)).toEqual(['21#6.2']);
    const anillo = original.find((u) => u.codigo === '21')?.poligonos[6]?.[2];
    expect(anillo).toHaveLength(4);
    expect(EXCEPCIONES_AUTORIZADAS[0]?.sha256).toBe('bd73b61b164180fcb36dd008ea4e42b6f0929bd73b732a889611b8d993b01522');
  }, 60_000);

  it('Mapshaper simplifica de verdad: con el 5 % quedan muchos menos puntos y los 25 departamentos siguen', async () => {
    const original = await leer(100);
    const simple = await leer(5);
    const puntos = (u: UnidadCruda[]) => u.reduce((s, x) => s + contarPuntos(x.poligonos), 0);
    expect(puntos(simple)).toBeLessThan(puntos(original) / 5);
    expect(simple).toHaveLength(25);
    expect(verificarCodigos(simple, DEPARTAMENTOS).ok).toBe(true);
  }, 60_000);

  it.each([8.5, 3, 1])(
    'con -explode y Douglas-Peucker al %d %% se conservan todas las partes representables (39 de 39), cada hueco con su exterior',
    async (porcentaje) => {
      const original = await leer(100);
      const simple = await leer(porcentaje);
      const r = verificarPartes(simple, esperado, `Simplificado al ${porcentaje} %`, excepcionesDe(original));
      expect(r.ok, r.ok ? '' : r.errores.join('\n')).toBe(true);
      expect(simple.reduce((s, u) => s + contarPartes(u.poligonos), 0)).toBeGreaterThanOrEqual(39);
      expect(simple.reduce((s, u) => s + contarPartes(u.poligonos), 0)).toBeLessThanOrEqual(40);
    },
    120_000,
  );

  it('sin -explode, keep-shapes solo protege el anillo mayor de cada departamento y se pierden partes (la razón de usar -explode)', async () => {
    const { default: mapshaper } = await import('mapshaper');
    const salida = await mapshaper.applyCommands('-i fuente.zip encoding=utf8 -simplify dp 3% keep-shapes -o format=geojson salida.json', {
      'fuente.zip': readFileSync(RUTA_ZIP),
    });
    const crudo = salida['salida.json'];
    const geojson = JSON.parse(typeof crudo === 'string' ? crudo : new TextDecoder('utf-8').decode(crudo)) as unknown;
    const unidades = normalizarFeatures(geojson, CAMPOS);
    if (!unidades.ok) throw new Error(unidades.errores.join('\n'));
    const r = verificarPartes(unidades.valor, esperado, 'Sin -explode al 3 %');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join('\n')).toContain('se perdieron');
  }, 120_000);

  it('rechaza porcentajes inválidos sin llamar a Mapshaper', async () => {
    const zip = readFileSync(RUTA_ZIP);
    for (const p of [0, -5, 100.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await simplificarFuente(zip, p);
      expect(r.ok, String(p)).toBe(false);
    }
  });

  it('falla con un mensaje claro si el archivo no es un ZIP válido', async () => {
    const r = await simplificarFuente(new Uint8Array([1, 2, 3, 4]), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toContain('Mapshaper no pudo leer o simplificar la fuente');
  });
});
