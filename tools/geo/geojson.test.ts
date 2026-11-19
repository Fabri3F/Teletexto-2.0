import { describe, expect, it } from 'vitest';
import { comoFeatureCollection, unidadesEjemplo, rectangulo } from './datos-prueba.ts';
import { contarPartes, contarPuntos, normalizarFeatures } from './geojson.ts';

const CAMPOS = { codigo: 'CODDEP', nombre: 'DEPARTAMEN' };

function feature(propiedades: unknown, geometria: unknown): unknown {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: propiedades, geometry: geometria }] };
}
const cuadrado = [rectangulo(0, 0, 1, 1)];

function mensajes(r: { ok: boolean; errores?: string[] }): string {
  return r.ok ? '' : (r.errores ?? []).join('\n');
}

describe('Normalización de la FeatureCollection de Mapshaper', () => {
  it('convierte Polygon y MultiPolygon en unidades con todas sus partes', () => {
    const r = normalizarFeatures(comoFeatureCollection(unidadesEjemplo()), CAMPOS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.map((u) => [u.codigo, u.nombre, contarPartes(u.poligonos)])).toEqual([
      ['01', 'ALFA', 1],
      ['02', 'BETA', 2],
      ['03', 'GAMMA', 2],
    ]);
    expect(contarPuntos(r.valor[1]?.poligonos ?? [])).toBe(10);
  });

  it('un MultiPolygon conserva todas las partes, sin fusionarlas ni descartarlas', () => {
    const multi = feature({ CODDEP: '15', DEPARTAMEN: 'LIMA' }, {
      type: 'MultiPolygon',
      coordinates: [[rectangulo(0, 0, 1, 1)], [rectangulo(2, 2, 3, 3)], [rectangulo(4, 4, 5, 5)], [rectangulo(6, 6, 7, 7)]],
    });
    const r = normalizarFeatures(multi, CAMPOS);
    expect(r.ok && contarPartes(r.valor[0]?.poligonos ?? [])).toBe(4);
  });

  it('recorta los espacios del código y del nombre', () => {
    const r = normalizarFeatures(feature({ CODDEP: ' 07 ', DEPARTAMEN: ' CALLAO ' }, { type: 'Polygon', coordinates: cuadrado }), CAMPOS);
    expect(r.ok && [r.valor[0]?.codigo, r.valor[0]?.nombre]).toEqual(['07', 'CALLAO']);
  });

  it.each([[null], [undefined], ['texto'], [42], [[]], [{}], [{ type: 'Feature' }], [{ type: 'FeatureCollection' }], [{ type: 'FeatureCollection', features: 'no' }]])(
    'rechaza una entrada que no es una FeatureCollection: %j',
    (entrada) => {
      expect(mensajes(normalizarFeatures(entrada, CAMPOS))).toContain('no es una FeatureCollection de GeoJSON');
    },
  );

  it('rechaza una colección sin registros', () => {
    expect(mensajes(normalizarFeatures({ type: 'FeatureCollection', features: [] }, CAMPOS))).toBe('La fuente no tiene ningún registro.');
  });

  it('rechaza un registro sin atributos, sin código o sin nombre', () => {
    const sinAtributos = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: cuadrado } }] };
    expect(mensajes(normalizarFeatures(sinAtributos, CAMPOS))).toContain('Registro 0: no tiene atributos.');
    expect(mensajes(normalizarFeatures(feature({ DEPARTAMEN: 'X' }, { type: 'Polygon', coordinates: cuadrado }), CAMPOS))).toContain('falta el atributo "CODDEP"');
    expect(mensajes(normalizarFeatures(feature({ CODDEP: '01' }, { type: 'Polygon', coordinates: cuadrado }), CAMPOS))).toContain('falta el atributo "DEPARTAMEN"');
    expect(mensajes(normalizarFeatures(feature({ CODDEP: '  ', DEPARTAMEN: 'X' }, { type: 'Polygon', coordinates: cuadrado }), CAMPOS))).toContain('falta el atributo "CODDEP"');
  });

  it.each([
    ['sin geometría', null],
    ['un punto', { type: 'Point', coordinates: [0, 0] }],
    ['una línea', { type: 'LineString', coordinates: [[0, 0], [1, 1]] }],
    ['un MultiPolygon vacío', { type: 'MultiPolygon', coordinates: [] }],
  ])('rechaza la geometría %s', (_etiqueta, geometria) => {
    expect(normalizarFeatures(feature({ CODDEP: '01', DEPARTAMEN: 'X' }, geometria), CAMPOS).ok).toBe(false);
  });

  it('rechaza un anillo con menos de 4 puntos', () => {
    const corto = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] };
    expect(mensajes(normalizarFeatures(feature({ CODDEP: '01', DEPARTAMEN: 'X' }, corto), CAMPOS))).toContain('un anillo necesita al menos 4 puntos y tiene 3');
  });

  it('rechaza un anillo que no está cerrado', () => {
    const abierto = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] };
    expect(mensajes(normalizarFeatures(feature({ CODDEP: '01', DEPARTAMEN: 'X' }, abierto), CAMPOS))).toContain('el anillo no está cerrado');
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], ['1'], [null]])('rechaza una coordenada no finita o que no es un número: %j', (valor) => {
    const malo = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [valor, 1], [0, 0]]] };
    expect(mensajes(normalizarFeatures(feature({ CODDEP: '01', DEPARTAMEN: 'X' }, malo), CAMPOS))).toContain('el punto 2 no tiene longitud y latitud finitas');
  });

  it('informa todos los registros inválidos a la vez', () => {
    const dos = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { CODDEP: '01', DEPARTAMEN: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { CODDEP: '02', DEPARTAMEN: 'B' }, geometry: null },
      ],
    };
    const texto = mensajes(normalizarFeatures(dos, CAMPOS));
    expect(texto).toContain('código 01');
    expect(texto).toContain('código 02');
  });

  it('usa los nombres de campo que se le indican', () => {
    const r = normalizarFeatures(feature({ COD: '09', NOM: 'X' }, { type: 'Polygon', coordinates: cuadrado }), { codigo: 'COD', nombre: 'NOM' });
    expect(r.ok && r.valor[0]?.codigo).toBe('09');
  });
});

describe('Agrupación por código (tras -explode de Mapshaper)', () => {
  /** Un registro por cada parte de Beta, como los deja `-explode`. */
  const explotado = (): unknown => ({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { CODDEP: '02', DEPARTAMEN: 'BETA' }, geometry: { type: 'Polygon', coordinates: [rectangulo(0, 5, 1, 6)] } },
      { type: 'Feature', properties: { CODDEP: '01', DEPARTAMEN: 'ALFA' }, geometry: { type: 'Polygon', coordinates: [rectangulo(0, 0, 1, 1)] } },
      { type: 'Feature', properties: { CODDEP: '02', DEPARTAMEN: 'BETA' }, geometry: { type: 'Polygon', coordinates: [rectangulo(2, 0, 2.5, 0.5), rectangulo(2.1, 0.1, 2.2, 0.2)] } },
    ],
  });

  it('sin agrupar, un código repetido queda como dos unidades (y verificarCodigos lo informará como error de la fuente)', () => {
    const r = normalizarFeatures(explotado(), CAMPOS);
    expect(r.ok && r.valor.map((u) => u.codigo)).toEqual(['02', '01', '02']);
  });

  it('agrupando, junta las partes de cada código en el orden en que aparecen, conservando cada hueco con su exterior', () => {
    const r = normalizarFeatures(explotado(), CAMPOS, { agrupar: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.map((u) => [u.codigo, u.nombre, u.poligonos.length, contarPartes(u.poligonos)])).toEqual([
      ['02', 'BETA', 2, 3],
      ['01', 'ALFA', 1, 1],
    ]);
    expect(r.valor[0]?.poligonos[1]).toHaveLength(2); // el segundo polígono sigue con su hueco
  });

  it('agrupando, falla si un mismo código trae dos nombres', () => {
    const mal = explotado() as { features: { properties: Record<string, string> }[] };
    (mal.features[2] as { properties: Record<string, string> }).properties['DEPARTAMEN'] = 'OTRO';
    const r = normalizarFeatures(mal, CAMPOS, { agrupar: true });
    expect(r.ok).toBe(false);
    expect(mensajes(r)).toContain('El código 02 aparece con dos nombres: "BETA" y "OTRO".');
  });
});