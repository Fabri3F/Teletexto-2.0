import { describe, expect, it } from 'vitest';
import { esFechaCalendarioReal, esFechaHoraUtcReal, instanteUtc } from './fechas.ts';

describe('Fechas que existen en el calendario', () => {
  it.each([
    '2026-01-31T23:59:59Z',
    '2026-02-28T00:00:00Z',
    '2028-02-29T12:00:00Z', // año bisiesto
    '2000-02-29T00:00:00Z', // divisible entre 400: bisiesto
    '2026-04-30T00:00:00Z',
    '2026-12-31T23:59:59.999Z',
  ])('acepta la fecha y hora %s', (fecha) => {
    expect(esFechaHoraUtcReal(fecha)).toBe(true);
  });

  it.each([
    '2026-02-29T00:00:00Z', // 2026 no es bisiesto
    '2026-02-30T00:00:00Z',
    '2100-02-29T00:00:00Z', // divisible entre 100 y no entre 400: no bisiesto
    '2026-04-31T00:00:00Z',
    '2026-06-31T00:00:00Z',
    '2026-09-31T00:00:00Z',
    '2026-11-31T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-00-10T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00',
    '2026-01-01T00:00:00-05:00',
    'no es una fecha',
    '',
  ])('rechaza la fecha y hora %j', (fecha) => {
    expect(esFechaHoraUtcReal(fecha)).toBe(false);
  });

  it('valida las fechas de calendario AAAA-MM-DD con las mismas reglas', () => {
    expect(esFechaCalendarioReal('2026-11-16')).toBe(true);
    expect(esFechaCalendarioReal('2028-02-29')).toBe(true);
    expect(esFechaCalendarioReal('2026-02-29')).toBe(false);
    expect(esFechaCalendarioReal('2026-04-31')).toBe(false);
    expect(esFechaCalendarioReal('2026-1-1')).toBe(false);
    expect(esFechaCalendarioReal('2026-01-01T00:00:00Z')).toBe(false);
  });

  it('convierte una fecha y hora UTC en milisegundos, con precisión de milisegundo', () => {
    expect(instanteUtc('1970-01-01T00:00:00Z')).toBe(0);
    expect(instanteUtc('1970-01-01T00:00:01.5Z')).toBe(1500);
    expect(instanteUtc('2026-01-01T00:00:00.001Z') - instanteUtc('2026-01-01T00:00:00.000Z')).toBe(1);
  });
});
