import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { estadoFrescura } from './frescura.ts';

// Tarea 5.8. Requisitos 7.9, 7.10, 7.11 y Propiedad 35. El instante `ahora` y el umbral entran como milisegundos.

const HORA = 60 * 60 * 1000;
const SEIS_HORAS = 6 * HORA; // Páginas 101 y 400
const VEINTICUATRO_HORAS = 24 * HORA; // Páginas 100 y 200
const SYNC = '2026-11-16T12:00:00Z';
const T_SYNC = Date.parse(SYNC);

describe('Sin sincronización exitosa: "nunca" (Requisito 7.11)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['vacío', ''],
    ['espacios', '   '],
    ['texto libre', 'ayer'],
    ['con desfase', '2026-11-16T07:00:00-05:00'],
    ['sin Z', '2026-11-16T12:00:00'],
    ['solo fecha', '2026-11-16'],
    ['día inexistente', '2026-02-30T00:00:00Z'],
    ['mes 13', '2026-13-01T00:00:00Z'],
    ['hora 24', '2026-11-16T24:00:00Z'],
    ['con salto de línea', '2026-11-16T12:00:00Z\n'],
    ['con espacio', ' 2026-11-16T12:00:00Z'],
    ['más de 3 decimales', '2026-11-16T12:00:00.1234Z'],
    ['un número', 1_800_000_000_000],
    ['un objeto', {}],
    ['un arreglo', [SYNC]],
    ['un booleano', true],
  ])('syncedAt %s es "nunca"', (_etiqueta, syncedAt) => {
    expect(estadoFrescura(syncedAt as string, T_SYNC + 1000, SEIS_HORAS)).toBe('nunca');
  });

  it('"nunca" no depende de ahora ni del umbral, aunque sean inválidos', () => {
    for (const [ahora, umbral] of [[Number.NaN, SEIS_HORAS], [T_SYNC, Number.NaN], [Number.POSITIVE_INFINITY, -1], [0, 0], [T_SYNC, SEIS_HORAS]]) {
      expect(estadoFrescura(undefined, ahora as number, umbral as number), `${ahora}, ${umbral}`).toBe('nunca');
      expect(estadoFrescura('ilegible', ahora as number, umbral as number), `${ahora}, ${umbral}`).toBe('nunca');
    }
  });
});

describe('Límite del umbral: estrictamente mayor (Requisito 7.10)', () => {
  it.each([
    ['6 horas (Páginas 101 y 400)', SEIS_HORAS],
    ['24 horas (Páginas 100 y 200)', VEINTICUATRO_HORAS],
  ])('con %s: 1 ms antes, igual y 1 ms después del umbral', (_etiqueta, umbral) => {
    expect(estadoFrescura(SYNC, T_SYNC + umbral - 1, umbral)).toBe('vigente');
    expect(estadoFrescura(SYNC, T_SYNC + umbral, umbral)).toBe('vigente'); // igual al umbral: todavía vigente
    expect(estadoFrescura(SYNC, T_SYNC + umbral + 1, umbral)).toBe('desactualizada');
  });

  it('los umbrales de los requisitos en milisegundos', () => {
    expect(SEIS_HORAS).toBe(21_600_000);
    expect(VEINTICUATRO_HORAS).toBe(86_400_000);
  });

  it('una página de 6 horas con 7 horas es desactualizada, y la misma de 24 horas sigue vigente', () => {
    const ahora = T_SYNC + 7 * HORA;
    expect(estadoFrescura(SYNC, ahora, SEIS_HORAS)).toBe('desactualizada');
    expect(estadoFrescura(SYNC, ahora, VEINTICUATRO_HORAS)).toBe('vigente');
  });

  it('justo después de sincronizar es vigente', () => {
    expect(estadoFrescura(SYNC, T_SYNC, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(SYNC, T_SYNC + 1, SEIS_HORAS)).toBe('vigente');
  });

  it('el umbral viene de quien llama: cualquier valor sirve, sin cifras fijas en la función', () => {
    expect(estadoFrescura(SYNC, T_SYNC + 4 * HORA, 3 * HORA)).toBe('desactualizada');
    expect(estadoFrescura(SYNC, T_SYNC + 4 * HORA, 5 * HORA)).toBe('vigente');
    expect(estadoFrescura(SYNC, T_SYNC + 4 * HORA, 48 * HORA)).toBe('vigente');
  });

  it('con un umbral de 0, solo el mismo instante es vigente', () => {
    expect(estadoFrescura(SYNC, T_SYNC, 0)).toBe('vigente');
    expect(estadoFrescura(SYNC, T_SYNC + 1, 0)).toBe('desactualizada');
  });
});

describe('Milisegundos en la fecha de sincronización', () => {
  it('compara al milisegundo con una fecha que los trae', () => {
    const conMs = '2026-11-16T12:00:00.250Z';
    const t = Date.parse(conMs);
    expect(estadoFrescura(conMs, t + SEIS_HORAS, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(conMs, t + SEIS_HORAS + 1, SEIS_HORAS)).toBe('desactualizada');
  });

  it('una fecha con .5 equivale a .500', () => {
    expect(estadoFrescura('2026-11-16T12:00:00.5Z', T_SYNC + 500 + SEIS_HORAS + 1, SEIS_HORAS)).toBe('desactualizada');
    expect(estadoFrescura('2026-11-16T12:00:00.5Z', T_SYNC + 500 + SEIS_HORAS, SEIS_HORAS)).toBe('vigente');
  });
});

describe('Fecha de sincronización en el futuro (reloj atrasado)', () => {
  it('es vigente: la diferencia es negativa y no se intenta adivinar un reloj mal configurado', () => {
    expect(estadoFrescura(SYNC, T_SYNC - 1, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(SYNC, T_SYNC - 30 * 24 * HORA, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(SYNC, 0, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(SYNC, -1e12, 0)).toBe('vigente');
  });

  it('con un instante negativo y fechas anteriores a 1970 el cálculo sigue siendo exacto', () => {
    const antes1970 = '1969-12-31T00:00:00Z';
    const t = Date.parse(antes1970);
    expect(estadoFrescura(antes1970, t + SEIS_HORAS, SEIS_HORAS)).toBe('vigente');
    expect(estadoFrescura(antes1970, t + SEIS_HORAS + 1, SEIS_HORAS)).toBe('desactualizada');
  });
});

describe('Instante o umbral inválidos: "desactualizada" cuando hay una fecha legible', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['un texto', '1800000000000'],
    ['null', null],
    ['undefined', undefined],
    ['un objeto', {}],
  ])('ahora = %s', (_etiqueta, ahora) => {
    expect(estadoFrescura(SYNC, ahora as number, SEIS_HORAS)).toBe('desactualizada');
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['negativo', -1],
    ['muy negativo', -SEIS_HORAS],
    ['un texto', '21600000'],
    ['null', null],
    ['undefined', undefined],
  ])('umbralMs = %s', (_etiqueta, umbral) => {
    expect(estadoFrescura(SYNC, T_SYNC + 1000, umbral as number)).toBe('desactualizada');
  });

  it('con valores válidos no se confunde con un umbral inválido', () => {
    expect(estadoFrescura(SYNC, T_SYNC + 1000, SEIS_HORAS)).toBe('vigente');
  });
});

describe('Monotonía (Propiedad 35)', () => {
  it('con una fecha y un umbral fijos, una vez desactualizada sigue desactualizada al avanzar ahora', () => {
    for (const umbral of [0, 1, HORA, SEIS_HORAS, VEINTICUATRO_HORAS]) {
      let desactualizada = false;
      for (let paso = -3; paso <= 60; paso++) {
        const ahora = T_SYNC + paso * HORA;
        const r = estadoFrescura(SYNC, ahora, umbral);
        if (desactualizada) expect(r, `${umbral} / ${paso}`).toBe('desactualizada');
        if (r === 'desactualizada') desactualizada = true;
        expect(r === 'vigente' || r === 'desactualizada', `${umbral} / ${paso}`).toBe(true);
      }
      expect(desactualizada, String(umbral)).toBe(true);
    }
  });

  it('si no está desactualizada en ahora, no lo está en un instante anterior', () => {
    for (const umbral of [SEIS_HORAS, VEINTICUATRO_HORAS]) {
      const instantes = [T_SYNC - 5, T_SYNC, T_SYNC + 1, T_SYNC + umbral - 1, T_SYNC + umbral, T_SYNC + umbral + 1, T_SYNC + 10 * umbral];
      for (let i = 0; i < instantes.length; i++) {
        if (estadoFrescura(SYNC, instantes[i] as number, umbral) !== 'desactualizada') {
          for (let j = 0; j <= i; j++) expect(estadoFrescura(SYNC, instantes[j] as number, umbral), `${umbral}: ${j} <= ${i}`).not.toBe('desactualizada');
        }
      }
    }
  });

  it('una sincronización más reciente nunca empeora el resultado con el mismo ahora', () => {
    const ahora = T_SYNC + 8 * HORA;
    const viejo = estadoFrescura(SYNC, ahora, SEIS_HORAS);
    const nuevo = estadoFrescura('2026-11-16T18:00:00Z', ahora, SEIS_HORAS);
    expect(viejo).toBe('desactualizada');
    expect(nuevo).toBe('vigente');
  });
});

describe('Resultado completo de los tres estados', () => {
  it('devuelve exactamente "nunca", "vigente" o "desactualizada"', () => {
    const resultados = new Set([
      estadoFrescura(undefined, 0, 1),
      estadoFrescura(SYNC, T_SYNC, SEIS_HORAS),
      estadoFrescura(SYNC, T_SYNC + SEIS_HORAS + 1, SEIS_HORAS),
    ]);
    expect([...resultados].sort()).toEqual(['desactualizada', 'nunca', 'vigente']);
  });

  it('es determinista', () => {
    expect(estadoFrescura(SYNC, T_SYNC + 1234, SEIS_HORAS)).toBe(estadoFrescura(SYNC, T_SYNC + 1234, SEIS_HORAS));
  });
});

describe('Lógica pura, sin reloj ni API del navegador', () => {
  it('no consulta Date.now', () => {
    const espia = vi.spyOn(Date, 'now');
    estadoFrescura(SYNC, T_SYNC, SEIS_HORAS);
    estadoFrescura(undefined, T_SYNC, SEIS_HORAS);
    estadoFrescura(SYNC, Number.NaN, SEIS_HORAS);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('frescura.ts no usa window, document, temporizadores ni el reloj, y solo importa format/dates', () => {
    const fuente = readFileSync(new URL('./frescura.ts', import.meta.url), 'utf8');
    const codigo = fuente
      .split('\n')
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    expect(codigo).not.toMatch(/\bwindow\b|\bdocument\b|\blocation\b|\bglobalThis\b|\bnavigator\b|setTimeout|setInterval|requestAnimationFrame|Date\b|performance\b|localStorage|sessionStorage|indexedDB/);
    expect([...fuente.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../format/dates.ts']);
  });
});
