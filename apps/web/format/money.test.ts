import { describe, expect, it } from 'vitest';
import { formatSoles, SIN_DATO } from './money.ts';

// Tarea 4.1. Requisitos 3.2 y 3.5: "S/ 2.50", exactamente dos decimales, "Sin dato" sin precio y nunca un valor estimado.

describe('formatSoles: precios válidos', () => {
  it.each([
    [0, 'S/ 0.00'],
    [1, 'S/ 0.01'],
    [5, 'S/ 0.05'],
    [9, 'S/ 0.09'],
    [10, 'S/ 0.10'],
    [99, 'S/ 0.99'],
    [100, 'S/ 1.00'],
    [101, 'S/ 1.01'],
    [250, 'S/ 2.50'],
    [1999, 'S/ 19.99'],
    [100_000, 'S/ 1000.00'],
    [123_456, 'S/ 1234.56'],
    [1_000_000_00, 'S/ 1000000.00'],
  ])('%d céntimos -> %s', (centimos, esperado) => {
    expect(formatSoles(centimos)).toBe(esperado);
  });

  it('no usa separador de miles, usa punto decimal y el prefijo "S/ " con un espacio', () => {
    const texto = formatSoles(123_456_789);
    expect(texto).toBe('S/ 1234567.89');
    expect(texto).not.toContain(',');
    expect(texto.startsWith('S/ ')).toBe(true);
  });

  it('el entero seguro más grande conserva todos sus dígitos, sin coma flotante', () => {
    expect(formatSoles(Number.MAX_SAFE_INTEGER)).toBe('S/ 90071992547409.91');
    expect(formatSoles(Number.MAX_SAFE_INTEGER - 1)).toBe('S/ 90071992547409.90');
    expect(formatSoles(9_007_199_254_740_900)).toBe('S/ 90071992547409.00');
  });

  it('cumple el patrón S/ <enteros>.<dos decimales> y se vuelve a leer con el mismo valor', () => {
    for (const centimos of [0, 1, 7, 10, 99, 100, 250, 1005, 99_999, 1_234_567, 987_654_321_012]) {
      const texto = formatSoles(centimos);
      expect(texto, String(centimos)).toMatch(/^S\/ \d+\.\d{2}$/);
      const [soles, resto] = texto.slice(3).split('.') as [string, string];
      expect(Number(soles) * 100 + Number(resto)).toBe(centimos);
    }
  });

  it('acepta -0 como cero', () => {
    expect(formatSoles(-0)).toBe('S/ 0.00');
  });
});

describe('formatSoles: sin precio válido se muestra "Sin dato" y nunca un valor estimado', () => {
  it('el texto es exactamente "Sin dato"', () => {
    expect(SIN_DATO).toBe('Sin dato');
  });

  it('null', () => {
    expect(formatSoles(null)).toBe('Sin dato');
  });

  it.each([[-1], [-100], [Number.MIN_SAFE_INTEGER], [Number.NEGATIVE_INFINITY]])('negativo %d', (valor) => {
    expect(formatSoles(valor)).toBe('Sin dato');
  });

  it.each([[0.5], [250.5], [2.5], [1e-7], [99.99]])('decimal %d: no se redondea ni se trunca', (valor) => {
    expect(formatSoles(valor)).toBe('Sin dato');
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.MAX_SAFE_INTEGER + 1], [2 ** 53], [1e21], [Number.MAX_VALUE]])(
    'no finito o mayor que Number.MAX_SAFE_INTEGER: %d',
    (valor) => {
      expect(formatSoles(valor)).toBe('Sin dato');
    },
  );

  it('valores que no son números (datos externos mal formados)', () => {
    for (const raro of [undefined, '250', '2.50', true, {}, [], 10n]) {
      expect(formatSoles(raro as unknown as number), String(raro)).toBe('Sin dato');
    }
  });
});
