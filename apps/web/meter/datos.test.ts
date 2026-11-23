import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  acumular,
  AVISO_ALCANCE,
  AVISO_MARGEN_DE_ERROR,
  AVISO_SOLO_LO_MEDIBLE,
  estadoInicialDatos,
  formatMB,
  NO_DISPONIBLE,
  TITULO_INDICADOR,
  textoIndicador,
  type EstadoDatos,
} from './datos.ts';
// Tarea 5.11. Requisitos 8.2 a 8.9, 8.11, 8.12 y 8.15. Pruebas unitarias; las propiedades 37 y 38 son de las tareas 5.12 y 5.13.
const MAX = Number.MAX_SAFE_INTEGER;

/** Modelo independiente con BigInt: centésimas = floor((bytes * 100 + 500 000) / 1 000 000). */
function modeloMB(bytes: number): string {
  const centesimas = (BigInt(bytes) * 100n + 500_000n) / 1_000_000n;
  return `${centesimas / 100n}.${String(centesimas % 100n).padStart(2, '0')} MB`;
}

describe('formatMB (Requisito 8.3)', () => {
  it.each([
    [0, '0.00 MB'],
    [1, '0.00 MB'],
    [4_999, '0.00 MB'],
    [5_000, '0.01 MB'],
    [5_001, '0.01 MB'],
    [9_999, '0.01 MB'],
    [10_000, '0.01 MB'],
    [14_999, '0.01 MB'],
    [15_000, '0.02 MB'],
    [999_999, '1.00 MB'],
    [1_000_000, '1.00 MB'],
    [1_234_567, '1.23 MB'],
    [1_235_000, '1.24 MB'],
    [10_000_000, '10.00 MB'],
    [123_456_789, '123.46 MB'],
  ])('%i bytes es "%s"', (bytes, esperado) => {
    expect(formatMB(bytes)).toBe(esperado);
  });
  it('coincide con el modelo en BigInt para los primeros 200 000 bytes', () => {
    for (let b = 0; b <= 200_000; b++) expect(formatMB(b)).toBe(modeloMB(b));
  });
  it('coincide con el modelo en BigInt en los puntos medios y sus vecinos hasta 5 000 MB', () => {
    for (let c = 0; c <= 500_000; c += 997) {
      for (const b of [c * 10_000 - 1, c * 10_000, c * 10_000 + 4_999, c * 10_000 + 5_000]) {
        if (b >= 0) expect(formatMB(b)).toBe(modeloMB(b));
      }
    }
  });
  it('es exacto en valores enteros seguros muy grandes', () => {
    for (const b of [MAX, MAX - 1, MAX - 4_999, MAX - 5_000, 9_007_199_250_000_000, 9_007_199_254_995_000 - 10_000_000]) {
      expect(formatMB(b)).toBe(modeloMB(b));
    }
  });
  it('siempre tiene dos decimales y es monótona no decreciente', () => {
    let anterior = -1;
    for (let b = 0; b <= 3_000_000; b += 137) {
      const texto = formatMB(b);
      expect(texto).toMatch(/^\d+\.\d{2} MB$/);
      const valor = Number(texto.replace(' MB', ''));
      expect(valor).toBeGreaterThanOrEqual(anterior);
      anterior = valor;
    }
  });
  it.each([
    ['negativo', -1],
    ['decimal', 1.5],
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
    ['menos infinito', Number.NEGATIVE_INFINITY],
    ['mayor que el máximo seguro', MAX + 1],
    ['cadena', '100'],
    ['null', null],
    ['undefined', undefined],
  ])('con entrada inválida (%s) devuelve "No disponible"', (_etiqueta, valor) => {
    expect(formatMB(valor as number)).toBe(NO_DISPONIBLE);
  });
});

describe('acumular (Requisitos 8.2, 8.8 y 8.15)', () => {
  it('el estado inicial es 0 bytes y se muestra como 0.00 MB (Requisito 8.11)', () => {
    expect(estadoInicialDatos).toEqual({ descargados: 0 });
    expect(Object.isFrozen(estadoInicialDatos)).toBe(true);
    expect(formatMB(estadoInicialDatos.descargados)).toBe('0.00 MB');
  });
  it('suma los bytes descargados de muestras válidas', () => {
    let estado: EstadoDatos = estadoInicialDatos;
    for (const n of [100, 2_000, 30_000]) estado = acumular(estado, { descargados: n });
    expect(estado.descargados).toBe(32_100);
    expect(estado.enviados).toBeUndefined();
  });
  it('suma los bytes enviados por separado', () => {
    const estado = acumular(acumular(estadoInicialDatos, { enviados: 10 }), { descargados: 5, enviados: 7 });
    expect(estado).toEqual({ descargados: 5, enviados: 17 });
  });
  it('el resultado nuevo está congelado y no se modifica el estado recibido', () => {
    const antes: EstadoDatos = Object.freeze({ descargados: 10 });
    const despues = acumular(antes, { descargados: 5, enviados: 3 });
    expect(antes).toEqual({ descargados: 10 });
    expect(despues).toEqual({ descargados: 15, enviados: 3 });
    expect(Object.isFrozen(despues)).toBe(true);
    expect(despues).not.toBe(antes);
  });
  it.each([
    ['cero (por ejemplo respuesta de caché)', 0],
    ['negativo', -5],
    ['decimal', 10.5],
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
    ['menos infinito', Number.NEGATIVE_INFINITY],
    ['mayor que el máximo seguro', MAX + 1],
    ['cadena', '100'],
    ['null', null],
    ['undefined', undefined],
    ['booleano', true],
    ['objeto', {}],
  ])('ignora el valor inválido: %s', (_etiqueta, valor) => {
    const base: EstadoDatos = Object.freeze({ descargados: 50 });
    expect(acumular(base, { descargados: valor as number })).toBe(base);
    expect(acumular(base, { enviados: valor as number })).toBe(base);
  });
  it('una muestra vacía (solicitud fallida o cancelada sin bytes medidos) conserva el total y la referencia', () => {
    const base: EstadoDatos = Object.freeze({ descargados: 1234, enviados: 9 });
    expect(acumular(base, {})).toBe(base);
    expect(acumular(base, { descargados: 0, enviados: 0 })).toBe(base);
    expect(acumular(estadoInicialDatos, {})).toBe(estadoInicialDatos);
  });
  it('una muestra que no es objeto no cambia el estado', () => {
    for (const muestra of [null, undefined, 5, 'x']) {
      expect(acumular(estadoInicialDatos, muestra as never)).toBe(estadoInicialDatos);
    }
  });
  it('una muestra con un campo válido y otro inválido suma solo el válido', () => {
    expect(acumular(estadoInicialDatos, { descargados: 40, enviados: -1 })).toEqual({ descargados: 40 });
    expect(acumular(estadoInicialDatos, { descargados: Number.NaN, enviados: 8 })).toEqual({ descargados: 0, enviados: 8 });
  });
  it('conserva "enviados" ya medido cuando la muestra solo trae descargados', () => {
    const base: EstadoDatos = Object.freeze({ descargados: 1, enviados: 2 });
    expect(acumular(base, { descargados: 3 })).toEqual({ descargados: 4, enviados: 2 });
  });
  it('el total nunca disminuye con ninguna secuencia de muestras', () => {
    const valores = [5, -3, 0, Number.NaN, 12, Number.POSITIVE_INFINITY, 1.5, 7, undefined, '9'];
    let estado: EstadoDatos = estadoInicialDatos;
    for (const v of valores) {
      const siguiente = acumular(estado, { descargados: v as number });
      expect(siguiente.descargados).toBeGreaterThanOrEqual(estado.descargados);
      estado = siguiente;
    }
    expect(estado.descargados).toBe(24);
  });
  it('el total es la suma exacta de las muestras válidas', () => {
    const muestras = [1, 2, 3, 0, -4, 10, 5.5, 100];
    const estado = muestras.reduce<EstadoDatos>((e, n) => acumular(e, { descargados: n }), estadoInicialDatos);
    expect(estado.descargados).toBe(116);
  });
  it('ignora la muestra que haría pasar el total del máximo entero seguro', () => {
    const casiLleno: EstadoDatos = Object.freeze({ descargados: MAX - 10 });
    expect(acumular(casiLleno, { descargados: 11 })).toBe(casiLleno);
    expect(acumular(casiLleno, { descargados: 10 })).toEqual({ descargados: MAX });
    const enviadosLleno: EstadoDatos = Object.freeze({ descargados: 0, enviados: MAX - 10 });
    expect(acumular(enviadosLleno, { enviados: 11 })).toBe(enviadosLleno);
    expect(acumular(enviadosLleno, { descargados: 4, enviados: 11 })).toEqual({ descargados: 4, enviados: MAX - 10 });
  });
});

describe('textoIndicador (Requisitos 8.1, 8.4 a 8.9)', () => {
  const estado: EstadoDatos = Object.freeze({ descargados: 1_234_567, enviados: 250_000 });
  it('con descargas y envíos medibles muestra ambos valores en MB', () => {
    expect(textoIndicador(estado, { descargas: true, envios: true })).toEqual([
      TITULO_INDICADOR,
      'Descargados: 1.23 MB',
      'Enviados: 0.25 MB',
      AVISO_MARGEN_DE_ERROR,
      AVISO_ALCANCE,
    ]);
  });
  it('con ambas mediciones y sin envíos acumulados muestra 0.00 MB', () => {
    expect(textoIndicador(estadoInicialDatos, { descargas: true, envios: true })).toEqual([
      TITULO_INDICADOR,
      'Descargados: 0.00 MB',
      'Enviados: 0.00 MB',
      AVISO_MARGEN_DE_ERROR,
      AVISO_ALCANCE,
    ]);
  });
  it('solo con descargas medibles muestra "Enviados: No disponible" y el aviso de lo medible (Requisito 8.6)', () => {
    expect(textoIndicador(estado, { descargas: true, envios: false })).toEqual([
      TITULO_INDICADOR,
      'Descargados: 1.23 MB',
      'Enviados: No disponible',
      AVISO_SOLO_LO_MEDIBLE,
      AVISO_MARGEN_DE_ERROR,
      AVISO_ALCANCE,
    ]);
  });
  it('no muestra los envíos del estado si no son medibles', () => {
    const texto = textoIndicador(estado, { descargas: true, envios: false }).join('\n');
    expect(texto).not.toContain('0.25');
  });
  it('solo con envíos medibles muestra "Descargados: No disponible" y el aviso', () => {
    expect(textoIndicador(estado, { descargas: false, envios: true })).toEqual([
      TITULO_INDICADOR,
      'Descargados: No disponible',
      'Enviados: 0.25 MB',
      AVISO_SOLO_LO_MEDIBLE,
      AVISO_MARGEN_DE_ERROR,
      AVISO_ALCANCE,
    ]);
  });
  it('sin ninguna medición muestra "No disponible" y ningún valor numérico (Requisito 8.7)', () => {
    const lineas = textoIndicador(estado, { descargas: false, envios: false });
    expect(lineas).toEqual([TITULO_INDICADOR, NO_DISPONIBLE, AVISO_SOLO_LO_MEDIBLE, AVISO_MARGEN_DE_ERROR, AVISO_ALCANCE]);
    expect(lineas.join('\n')).not.toMatch(/\d/);
    expect(lineas.join('\n')).not.toContain('MB');
  });
  it('siempre incluye el título y el aviso de alcance, en todas las combinaciones (Requisitos 8.1 y 8.9)', () => {
    for (const descargas of [true, false]) {
      for (const envios of [true, false]) {
        const lineas = textoIndicador(estado, { descargas, envios });
        expect(lineas[0]).toBe(TITULO_INDICADOR);
        expect(lineas[lineas.length - 1]).toBe(AVISO_ALCANCE);
      }
    }
  });
  it('el aviso de margen de error va una sola vez, justo antes del aviso de alcance, en todas las combinaciones', () => {
    for (const descargas of [true, false]) {
      for (const envios of [true, false]) {
        const lineas = textoIndicador(estado, { descargas, envios });
        expect(lineas.filter((l) => l === AVISO_MARGEN_DE_ERROR)).toHaveLength(1);
        expect(lineas[lineas.length - 2]).toBe(AVISO_MARGEN_DE_ERROR);
      }
    }
  });
  it('los textos obligatorios son exactos y no afirman medir todo el consumo', () => {
    expect(TITULO_INDICADOR).toBe('Datos usados por esta aplicación en esta sesión');
    expect(AVISO_ALCANCE).toBe('No incluye otras aplicaciones ni el consumo total de Internet del dispositivo');
    expect(AVISO_SOLO_LO_MEDIBLE).toBe('Solo se muestra lo que el navegador puede medir');
    expect(AVISO_MARGEN_DE_ERROR).toBe('Medido a partir de las respuestas de la aplicación; puede diferir del consumo real de red');
  });
  it('trata una capacidad que no es exactamente true como no medible', () => {
    const lineas = textoIndicador(estado, { descargas: 1 as unknown as boolean, envios: undefined as unknown as boolean });
    expect(lineas).toEqual([TITULO_INDICADOR, NO_DISPONIBLE, AVISO_SOLO_LO_MEDIBLE, AVISO_MARGEN_DE_ERROR, AVISO_ALCANCE]);
  });
  it('un estado de descargados inválido nunca produce un número', () => {
    const roto = { descargados: Number.NaN } as EstadoDatos;
    expect(textoIndicador(roto, { descargas: true, envios: false })[1]).toBe('Descargados: No disponible');
  });
  it('no modifica el estado ni las capacidades', () => {
    const capacidades = Object.freeze({ descargas: true, envios: false });
    expect(() => textoIndicador(estado, capacidades)).not.toThrow();
    expect(estado).toEqual({ descargados: 1_234_567, enviados: 250_000 });
  });
});

describe('Sin red ni persistencia (Requisito 8.12)', () => {
  const fuente = readFileSync(new URL('./datos.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no usa APIs de red, almacenamiento, reloj ni temporizadores', () => {
    for (const prohibido of [
      'window', 'document', 'navigator', 'performance', 'fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'localStorage',
      'sessionStorage', 'indexedDB', 'caches', 'Date', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Math.random', 'import ',
    ]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });
});
