import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_CARACTERES_MOTIVO,
  MOTIVO_NO_DISPONIBLE,
  acotarMotivo,
  formatearUtcSegundos,
  registrarVerificacion,
  type ResultadoVerificacion,
} from './registro.ts';
// Tarea 10.1. Requisito 12.8 y Propiedad 25. Pruebas unitarias del registro de verificación.

const esquemaComun = JSON.parse(readFileSync(new URL('../modelo/esquemas/comun.schema.json', import.meta.url), 'utf8')) as {
  $defs: { fechaHoraUtc: { pattern: string } };
};
/** Patrón de `fechaHoraUtc` del modelo: es el formato que acepta el esquema público. */
const PATRON_MODELO = new RegExp(esquemaComun.$defs.fechaHoraUtc.pattern);
const SIN_FRACCION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SUSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const T = Date.UTC(2026, 2, 1, 14, 30, 0);

describe('formatearUtcSegundos: UTC con precisión de segundos', () => {
  it.each([
    [0, '1970-01-01T00:00:00Z'],
    [T, '2026-03-01T14:30:00Z'],
    [Date.UTC(2026, 10, 16, 12, 0, 5), '2026-11-16T12:00:05Z'],
    [Date.UTC(2024, 1, 29, 23, 59, 59), '2024-02-29T23:59:59Z'],
  ])('%i se formatea como %s', (ms, esperado) => {
    expect(formatearUtcSegundos(ms)).toBe(esperado);
  });
  it('trunca los milisegundos hacia abajo: nunca redondea hacia el segundo siguiente', () => {
    expect(formatearUtcSegundos(T + 1)).toBe('2026-03-01T14:30:00Z');
    expect(formatearUtcSegundos(T + 499)).toBe('2026-03-01T14:30:00Z');
    expect(formatearUtcSegundos(T + 500)).toBe('2026-03-01T14:30:00Z');
    expect(formatearUtcSegundos(T + 999)).toBe('2026-03-01T14:30:00Z');
    expect(formatearUtcSegundos(T + 999.9)).toBe('2026-03-01T14:30:00Z');
    expect(formatearUtcSegundos(T + 1000)).toBe('2026-03-01T14:30:01Z');
    expect(formatearUtcSegundos(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31T23:59:59Z');
  });
  it('trunca hacia abajo también antes de 1970', () => {
    expect(formatearUtcSegundos(-1)).toBe('1969-12-31T23:59:59Z');
    expect(formatearUtcSegundos(-1000)).toBe('1969-12-31T23:59:59Z');
    expect(formatearUtcSegundos(-1001)).toBe('1969-12-31T23:59:58Z');
  });
  it('acepta años de cuatro cifras, de 0000 a 9999', () => {
    expect(formatearUtcSegundos(Date.UTC(9999, 11, 31, 23, 59, 59, 999))).toBe('9999-12-31T23:59:59Z');
    expect(formatearUtcSegundos(new Date('0000-01-01T00:00:00Z').getTime())).toBe('0000-01-01T00:00:00Z');
  });
  it('no inventa una hora para un instante inválido o fuera de rango', () => {
    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 8.64e15 + 1, -8.64e15 - 1, 1e300]) {
      expect(formatearUtcSegundos(valor), String(valor)).toBeUndefined();
    }
    for (const valor of ['123', null, undefined, {}, [], true]) expect(formatearUtcSegundos(valor as never)).toBeUndefined();
  });
  it('rechaza los años de más de cuatro cifras, que el esquema no admite', () => {
    expect(formatearUtcSegundos(Date.UTC(10000, 0, 1))).toBeUndefined();
    expect(formatearUtcSegundos(-62198755200000)).toBeUndefined(); // año -0001
  });
  it('el resultado cumple el patrón fechaHoraUtc del modelo y no tiene fracción', () => {
    let estado = 99;
    for (let i = 0; i < 500; i++) {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      const ms = Math.floor((estado / 4_294_967_296) * 4_000_000_000_000) + (i % 2 === 0 ? 0 : 0.5);
      const formato = formatearUtcSegundos(ms);
      expect(formato, String(ms)).toMatch(PATRON_MODELO);
      expect(formato, String(ms)).toMatch(SIN_FRACCION);
    }
  });
});

describe('acotarMotivo: máximo 500 caracteres sin partir Unicode', () => {
  it('no cambia un motivo de 500 caracteres o menos', () => {
    expect(acotarMotivo('')).toBe('');
    expect(acotarMotivo('añadido:lugar "cusco"')).toBe('añadido:lugar "cusco"');
    expect(acotarMotivo('a'.repeat(499))).toBe('a'.repeat(499));
    expect(acotarMotivo('a'.repeat(500))).toBe('a'.repeat(500));
    expect(MAX_CARACTERES_MOTIVO).toBe(500);
  });
  it('recorta a 500 un motivo de 501 o más', () => {
    expect(acotarMotivo('a'.repeat(501))).toBe('a'.repeat(500));
    expect(acotarMotivo('a'.repeat(100_000))).toHaveLength(500);
  });
  it('conserva el principio del motivo, que es donde está el tipo de rechazo', () => {
    const largo = `añadido:cifra "15 mm"; ${'x'.repeat(1000)}`;
    expect(acotarMotivo(largo).startsWith('añadido:cifra "15 mm"; ')).toBe(true);
  });
  it('no parte un par sustituto: si el corte cae en medio de un carácter, lo quita entero', () => {
    const cortado = acotarMotivo(`${'a'.repeat(499)}😀`);
    expect(cortado).toBe('a'.repeat(499));
    expect(cortado.length).toBe(499);
    expect(cortado).not.toMatch(SUSTITUTO_SUELTO);
  });
  it('conserva un par sustituto que cabe completo', () => {
    const resultado = acotarMotivo(`${'a'.repeat(498)}😀b`);
    expect(resultado).toBe(`${'a'.repeat(498)}😀`);
    expect(resultado.length).toBe(500);
  });
  it('con solo emojis cumple 500 unidades y 250 puntos de código, sin sustitutos sueltos', () => {
    const resultado = acotarMotivo('😀'.repeat(600));
    expect(resultado.length).toBeLessThanOrEqual(500);
    expect([...resultado].length).toBeLessThanOrEqual(500);
    expect(resultado).not.toMatch(SUSTITUTO_SUELTO);
    expect(resultado).toBe('😀'.repeat(250));
  });
  it('con texto acentuado y letras fuera del plano básico nunca supera 500 ni deja sustitutos sueltos', () => {
    const puntos = [...'áéíóúñ𝒜𝓑😀'.repeat(200)];
    // Las entradas se arman con puntos de código completos, así que son texto Unicode bien formado.
    for (const cantidad of [240, 250, 251, 300, 333, 400, 480, 500, 600, 900]) {
      const entrada = puntos.slice(0, cantidad).join('');
      expect(entrada).not.toMatch(SUSTITUTO_SUELTO);
      const resultado = acotarMotivo(entrada);
      expect(resultado.length, String(cantidad)).toBeLessThanOrEqual(500);
      expect(resultado, String(cantidad)).not.toMatch(SUSTITUTO_SUELTO);
      expect(entrada.startsWith(resultado), String(cantidad)).toBe(true);
    }
  });
});

describe('registrarVerificacion: { estado, motivo?, verificadoEn }', () => {
  it('un resultado aprobado no tiene motivo', () => {
    const registro = registrarVerificacion({ estado: 'aprobado' }, T);
    expect(registro).toEqual({ estado: 'aprobado', verificadoEn: '2026-03-01T14:30:00Z' });
    expect(Object.keys(registro ?? {})).toEqual(['estado', 'verificadoEn']);
  });
  it('un resultado rechazado lleva su motivo', () => {
    const registro = registrarVerificacion({ estado: 'rechazado', motivo: 'añadido:lugar "cusco"' }, T);
    expect(registro).toEqual({ estado: 'rechazado', motivo: 'añadido:lugar "cusco"', verificadoEn: '2026-03-01T14:30:00Z' });
    expect(Object.keys(registro ?? {})).toEqual(['estado', 'motivo', 'verificadoEn']);
  });
  it('un resultado no verificado lleva su motivo', () => {
    const registro = registrarVerificacion({ estado: 'no_verificado', motivo: 'tiempo agotado' }, T);
    expect(registro).toEqual({ estado: 'no_verificado', motivo: 'tiempo agotado', verificadoEn: '2026-03-01T14:30:00Z' });
  });
  it('el motivo se recorta a 500 caracteres', () => {
    const registro = registrarVerificacion({ estado: 'rechazado', motivo: `omision:recomendacion ${'x'.repeat(2000)}` }, T);
    expect(registro?.motivo).toHaveLength(500);
    expect(registro?.motivo?.startsWith('omision:recomendacion ')).toBe(true);
  });
  it('un rechazo o un fallo sin motivo recibe un motivo, porque es obligatorio', () => {
    for (const estado of ['rechazado', 'no_verificado'] as const) {
      for (const motivo of ['', '   ', undefined, null, 5]) {
        const registro = registrarVerificacion({ estado, motivo } as unknown as ResultadoVerificacion, T);
        expect(registro?.motivo, `${estado} ${String(motivo)}`).toBe(MOTIVO_NO_DISPONIBLE);
      }
    }
  });
  it('sin un instante válido no hay registro', () => {
    for (const resultado of [
      { estado: 'aprobado' },
      { estado: 'rechazado', motivo: 'm' },
      { estado: 'no_verificado', motivo: 'm' },
    ] as const) {
      expect(registrarVerificacion(resultado, Number.NaN)).toBeUndefined();
      expect(registrarVerificacion(resultado, Number.POSITIVE_INFINITY)).toBeUndefined();
      expect(registrarVerificacion(resultado, 1e300)).toBeUndefined();
    }
  });
  it('verificadoEn cumple el patrón del modelo en los tres estados', () => {
    for (const resultado of [
      { estado: 'aprobado' },
      { estado: 'rechazado', motivo: 'm' },
      { estado: 'no_verificado', motivo: 'm' },
    ] as const) {
      const registro = registrarVerificacion(resultado, T + 123);
      expect(registro?.verificadoEn).toMatch(PATRON_MODELO);
      expect(registro?.verificadoEn).toMatch(SIN_FRACCION);
    }
  });
  it('el registro es un objeto congelado que se puede escribir como JSON sin pérdida', () => {
    const registro = registrarVerificacion({ estado: 'rechazado', motivo: 'añadido:cifra "5 mm"' }, T);
    expect(Object.isFrozen(registro)).toBe(true);
    expect(JSON.parse(JSON.stringify(registro))).toEqual(registro);
  });
  it('no modifica el resultado recibido', () => {
    const resultado = Object.freeze({ estado: 'rechazado', motivo: 'y'.repeat(900) } as const);
    registrarVerificacion(resultado, T);
    expect(resultado.motivo).toHaveLength(900);
  });
});

describe('Pureza del módulo', () => {
  const fuente = readFileSync(new URL('./registro.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no lee el reloj, no usa red ni almacenamiento y no importa nada', () => {
    for (const prohibido of ['Date.now', 'performance', 'fetch', 'window', 'document', 'localStorage', 'setTimeout', 'Math.random', 'import ', 'process']) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
    expect(fuente.match(/new Date\(/g)).toHaveLength(1);
  });
});
