import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { KB, LIMITE_COMPRIMIDO_BYTES, NIVEL_GZIP, OBJETIVO_COMPRIMIDO_BYTES, PORCENTAJE_REFERENCIA } from './constantes.ts';
import { fallo, ok, type Resultado } from './result.ts';
import { buscarSimplificacion, type Evaluacion } from './simplificacion.ts';
import { cumpleObjetivo, errorDeLimite, formatoKB, tamanoComprimido } from './tamano.ts';

describe('Tamaño comprimido (requisito 4.17)', () => {
  it('los límites son los que fijó el Equipo: 81 920 bytes de límite absoluto y 76 800 de objetivo operativo', () => {
    expect(KB).toBe(1024);
    expect(LIMITE_COMPRIMIDO_BYTES).toBe(81_920);
    expect(OBJETIVO_COMPRIMIDO_BYTES).toBe(76_800);
    expect(OBJETIVO_COMPRIMIDO_BYTES).toBeLessThan(LIMITE_COMPRIMIDO_BYTES);
    expect(NIVEL_GZIP).toBe(6);
    expect(PORCENTAJE_REFERENCIA).toBe(8.3);
  });

  it('mide los bytes del texto UTF-8 comprimido con gzip de zlib, nivel 6', () => {
    const texto = 'abcdefghij'.repeat(1000);
    expect(tamanoComprimido(texto)).toBe(gzipSync(Buffer.from(texto, 'utf8'), { level: 6 }).length);
    expect(tamanoComprimido(texto)).toBe(gzipSync(Buffer.from(texto, 'utf8')).length); // el nivel 6 es el de zlib por defecto
    expect(tamanoComprimido(texto)).toBeLessThan(Buffer.byteLength(texto));
  });

  it('mide bytes y no caracteres: un texto con acentos pesa más que su número de caracteres', () => {
    const texto = 'ñ'.repeat(5000);
    expect(Buffer.byteLength(texto, 'utf8')).toBe(10_000);
    expect(tamanoComprimido(texto)).toBe(gzipSync(Buffer.from(texto, 'utf8')).length);
  });

  it('es determinista', () => {
    const texto = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ i, d: `M${i} ${i * 2}Z` })));
    expect(tamanoComprimido(texto)).toBe(tamanoComprimido(texto));
  });

  it('el límite es inclusivo: 80 KB exactos cumplen y un byte más no', () => {
    expect(errorDeLimite(LIMITE_COMPRIMIDO_BYTES)).toBeUndefined();
    expect(errorDeLimite(0)).toBeUndefined();
    const error = errorDeLimite(LIMITE_COMPRIMIDO_BYTES + 1);
    expect(error).toContain('pesa 80.0 KB');
    expect(error).toContain('el límite es 80.0 KB');
    expect(error).toContain('requisito 4.17');
  });

  it('el objetivo de 76 800 bytes también es inclusivo', () => {
    expect(cumpleObjetivo(OBJETIVO_COMPRIMIDO_BYTES)).toBe(true);
    expect(cumpleObjetivo(OBJETIVO_COMPRIMIDO_BYTES + 1)).toBe(false);
  });

  it('da formato en KB con un decimal', () => {
    expect(formatoKB(1024)).toBe('1.0 KB');
    expect(formatoKB(76_800)).toBe('75.0 KB');
    expect(formatoKB(1536)).toBe('1.5 KB');
  });
});

describe('Búsqueda del grado de simplificación', () => {
  /** Modelo de prueba: el tamaño crece con el porcentaje de vértices que se conservan. */
  const evaluarModelo =
    (tamano: (porcentaje: number) => number) =>
    async (porcentaje: number): Promise<Resultado<Evaluacion>> =>
      ok({ porcentaje, comprimidoBytes: tamano(porcentaje) });

  const opciones = (evaluar: (p: number) => Promise<Resultado<Evaluacion>>, objetivoBytes = 1000) => ({
    evaluar,
    objetivoBytes,
    porcentajeMinimo: 0.1,
    iteraciones: 12,
  });

  it('si la fuente sin simplificar ya cumple el objetivo, no se simplifica', async () => {
    const r = await buscarSimplificacion(opciones(evaluarModelo(() => 500)));
    expect(r.ok && r.valor.elegido.porcentaje).toBe(100);
    expect(r.ok && r.valor.intentos).toHaveLength(1);
  });

  it('elige el MAYOR porcentaje que cumple el objetivo (la menor simplificación)', async () => {
    const r = await buscarSimplificacion(opciones(evaluarModelo((p) => p * 100))); // objetivo 1000 -> p = 10
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.elegido.comprimidoBytes).toBeLessThanOrEqual(1000);
    expect(r.valor.elegido.porcentaje).toBeGreaterThan(9.9);
    expect(r.valor.elegido.porcentaje).toBeLessThanOrEqual(10);
  });

  it('el elegido siempre cumple el objetivo: se comprueba con una evaluación real, no se estima', async () => {
    for (const objetivo of [200, 777, 5000, 9000]) {
      const r = await buscarSimplificacion(opciones(evaluarModelo((p) => p * 100), objetivo));
      expect(r.ok && r.valor.elegido.comprimidoBytes <= objetivo, String(objetivo)).toBe(true);
      expect(r.ok && r.valor.intentos.includes(r.valor.elegido)).toBe(true);
    }
  });

  it('falla, sin inventar un resultado, si ni la mayor simplificación permitida alcanza el objetivo', async () => {
    const r = await buscarSimplificacion(opciones(evaluarModelo((p) => 5000 + p)));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0]).toContain('Ni con la mayor simplificación probada (0.1% de los vértices)');
      expect(r.errores[0]).toContain('pesa 5000.1 bytes');
    }
  });

  it('detiene la búsqueda si una evaluación falla y propaga el motivo', async () => {
    const r = await buscarSimplificacion(opciones(async () => fallo('Mapshaper falló')));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual(['Mapshaper falló']);
  });

  it('un fallo a mitad de la búsqueda también se propaga', async () => {
    let llamadas = 0;
    const r = await buscarSimplificacion(
      opciones(async (p) => {
        llamadas++;
        return llamadas === 4 ? fallo('falló en el intento 4') : ok({ porcentaje: p, comprimidoBytes: p * 100 });
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual(['falló en el intento 4']);
  });

  it('hace un número acotado de evaluaciones: 2 de arranque más las iteraciones', async () => {
    let llamadas = 0;
    await buscarSimplificacion(
      opciones(async (p) => {
        llamadas++;
        return ok({ porcentaje: p, comprimidoBytes: p * 100 });
      }),
    );
    expect(llamadas).toBe(2 + 12);
  });

  it('nunca prueba un porcentaje fuera de (porcentajeMinimo, 100]', async () => {
    const probados: number[] = [];
    await buscarSimplificacion(
      opciones(async (p) => {
        probados.push(p);
        return ok({ porcentaje: p, comprimidoBytes: p * 100 });
      }),
    );
    for (const p of probados) {
      expect(p).toBeGreaterThanOrEqual(0.1);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('con un punto de arranque, la primera evaluación de la bisección es ese valor, y el resultado no depende de él', async () => {
    const probados: number[] = [];
    const evaluar = async (p: number): Promise<Resultado<Evaluacion>> => {
      probados.push(p);
      return ok({ porcentaje: p, comprimidoBytes: p * 100 });
    };
    const con = await buscarSimplificacion({ ...opciones(evaluar), inicial: 8.3 });
    expect(probados.slice(0, 3)).toEqual([100, 0.1, 8.3]); // 100 %, mínimo y después el arranque
    const sin = await buscarSimplificacion(opciones(evaluarModelo((p) => p * 100)));
    expect(con.ok && sin.ok).toBe(true);
    if (con.ok && sin.ok) {
      expect(con.valor.elegido.comprimidoBytes).toBeLessThanOrEqual(1000);
      expect(Math.abs(con.valor.elegido.porcentaje - sin.valor.elegido.porcentaje)).toBeLessThan(0.05);
      expect(con.valor.elegido.porcentaje).toBeGreaterThan(9.9); // sube desde 8,3 hasta el mayor que cumple (10)
    }
  });

  it('si el punto de arranque no cumple, la búsqueda baja; si cumple, sube: no es un valor fijo', async () => {
    const bajando = await buscarSimplificacion({ ...opciones(evaluarModelo((p) => p * 1000)), inicial: 8.3 }); // objetivo 1000 -> p = 1
    const subiendo = await buscarSimplificacion({ ...opciones(evaluarModelo((p) => p * 10)), inicial: 8.3 }); // todo cumple hasta 100
    expect(bajando.ok && bajando.valor.elegido.porcentaje).toBeLessThan(1.01);
    expect(bajando.ok && bajando.valor.elegido.porcentaje).toBeGreaterThan(0.9);
    expect(subiendo.ok && subiendo.valor.elegido.porcentaje).toBe(100);
  });

  it('ignora un punto de arranque fuera del intervalo y usa el punto medio', async () => {
    const probados: number[] = [];
    await buscarSimplificacion({
      ...opciones(async (p) => (probados.push(p), ok({ porcentaje: p, comprimidoBytes: p * 100 }))),
      inicial: 500,
    });
    expect(probados[2]).toBeCloseTo(Math.sqrt(0.1 * 100), 9);
  });
  it('es determinista', async () => {
    const a = await buscarSimplificacion(opciones(evaluarModelo((p) => p * 73)));
    const b = await buscarSimplificacion(opciones(evaluarModelo((p) => p * 73)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
