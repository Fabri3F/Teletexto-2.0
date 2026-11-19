import { afterEach, describe, expect, it, vi } from 'vitest';
import { ahoraDelSistema, formatLima, formatLimaConSegundos, instanteDeIso, NO_DISPONIBLE, type Ahora } from './dates.ts';

// Tarea 4.1. Requisitos 1.7, 1.8, 9.2 y 9.3: fechas en hora de Perú (UTC-5) calculadas solo en el cliente.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatLima: conversión de UTC a hora de Perú', () => {
  it.each([
    ['2026-03-01T14:30:00Z', '01/03/2026 09:30'],
    ['2026-11-16T22:05:59Z', '16/11/2026 17:05'],
    ['2026-03-01T05:00:00Z', '01/03/2026 00:00'], // justo UTC-5: medianoche, nunca 24:00
    ['2026-03-01T04:59:59Z', '28/02/2026 23:59'],
    ['2026-03-01T23:59:59Z', '01/03/2026 18:59'],
  ])('%s -> %s', (iso, esperado) => {
    expect(formatLima(iso)).toBe(esperado);
  });

  it.each([
    ['2026-03-01T03:00:00Z', '28/02/2026 22:00'], // retrocede el día y el mes
    ['2026-01-01T04:59:59Z', '31/12/2025 23:59'], // retrocede el año
    ['2028-03-01T04:00:00Z', '29/02/2028 23:00'], // año bisiesto
    ['2000-03-01T00:00:00Z', '29/02/2000 19:00'], // bisiesto por divisible entre 400
    ['2100-03-01T00:00:00Z', '28/02/2100 19:00'], // 2100 no es bisiesto
    ['2026-05-01T02:00:00Z', '30/04/2026 21:00'],
  ])('cambia de día, mes y año en los límites: %s -> %s', (iso, esperado) => {
    expect(formatLima(iso)).toBe(esperado);
  });

  it('ignora los milisegundos y no cambia el minuto', () => {
    expect(formatLima('2026-03-01T14:30:00.999Z')).toBe('01/03/2026 09:30');
    expect(formatLima('2026-03-01T14:30:59.5Z')).toBe('01/03/2026 09:30');
    expect(formatLima('2026-03-01T14:30:00.1Z')).toBe(formatLima('2026-03-01T14:30:00Z'));
  });

  it('usa siempre dos dígitos para día, mes, hora y minuto y cuatro para el año', () => {
    expect(formatLima('2026-01-02T10:03:00Z')).toBe('02/01/2026 05:03');
    expect(formatLima('0099-06-15T17:00:00Z')).toBe('15/06/0099 12:00'); // los años 0 a 99 no se tratan como 19xx
    expect(formatLima('0000-01-01T05:00:00Z')).toBe('01/01/0000 00:00');
  });

  it('en el extremo superior, 9999-12-31T23:59:59Z da 31/12/9999 18:59', () => {
    expect(formatLima('9999-12-31T23:59:59Z')).toBe('31/12/9999 18:59');
  });

  it.each([
    [''],
    ['   '],
    ['no es una fecha'],
    ['2026-03-01'], // sin hora
    ['2026-03-01T14:30:00'], // sin Z
    ['2026-03-01T14:30Z'], // sin segundos
    ['2026-03-01T14:30:00z'], // z minúscula
    ['2026-03-01T14:30:00-05:00'], // desfase horario
    ['2026-03-01T14:30:00+00:00'],
    ['2026-03-01 14:30:00Z'], // sin T
    [' 2026-03-01T14:30:00Z'], // espacio
    ['2026-03-01T14:30:00Z '],
    ['2026-03-01T14:30:00.Z'],
    ['2026-03-01T14:30:00.1234Z'], // más de 3 decimales
    ['2026-13-01T00:00:00Z'], // mes 13
    ['2026-00-10T00:00:00Z'],
    ['2026-01-00T00:00:00Z'],
    ['2026-01-32T00:00:00Z'],
    ['2026-02-29T00:00:00Z'], // 2026 no es bisiesto
    ['2026-02-30T00:00:00Z'],
    ['2100-02-29T00:00:00Z'], // 2100 no es bisiesto
    ['2026-04-31T00:00:00Z'],
    ['2026-01-01T24:00:00Z'],
    ['2026-01-01T00:60:00Z'],
    ['2026-01-01T00:00:60Z'],
    ['March 1, 2026 14:30:00 UTC'], // Date.parse lo aceptaría
    ['1 Mar 2026'],
    ['１２３４-01-01T00:00:00Z'], // dígitos de ancho completo
    ['0000-01-01T00:00:00Z'], // en Perú sería el año -1: fuera de cuatro dígitos
    ['0000-01-01T04:59:59Z'],
  ])('devuelve "No disponible" para %j', (iso) => {
    expect(formatLima(iso)).toBe(NO_DISPONIBLE);
  });

  it('devuelve "No disponible" para null, undefined y valores que no son texto', () => {
    expect(formatLima(null)).toBe('No disponible');
    expect(formatLima(undefined)).toBe('No disponible');
    for (const raro of [0, 1_772_000_000_000, {}, [], true, Number.NaN]) {
      expect(formatLima(raro as unknown as string)).toBe('No disponible');
    }
  });

  it('el texto "No disponible" es exactamente ese', () => {
    expect(NO_DISPONIBLE).toBe('No disponible');
  });
});

describe('instanteDeIso', () => {
  it('convierte a milisegundos, con la misma precisión que Date.parse en fechas válidas', () => {
    for (const iso of [
      '1970-01-01T00:00:00Z',
      '2026-03-01T14:30:00Z',
      '2026-03-01T14:30:00.123Z',
      '2028-02-29T23:59:59.999Z',
      '1999-12-31T23:59:59Z',
      '2000-02-29T00:00:00Z',
      '1600-03-01T12:00:00Z',
      '9999-12-31T23:59:59.999Z',
    ]) {
      expect(instanteDeIso(iso), iso).toBe(Date.parse(iso));
    }
  });

  it('lee los decimales como fracción de segundo: .5 son 500 ms, .05 son 50 ms y .005 son 5 ms', () => {
    expect(instanteDeIso('1970-01-01T00:00:01.5Z')).toBe(1500);
    expect(instanteDeIso('1970-01-01T00:00:01.05Z')).toBe(1050);
    expect(instanteDeIso('1970-01-01T00:00:01.005Z')).toBe(1005);
    expect(instanteDeIso('1970-01-01T00:00:00.001Z')).toBe(1);
  });

  it('trata bien los años 0 a 99 y anteriores a 1970', () => {
    expect(instanteDeIso('0000-01-01T00:00:00Z')).toBe(-62_167_219_200_000);
    expect(instanteDeIso('0099-01-01T00:00:00Z')).toBe(new Date('0099-01-01T00:00:00Z').getTime());
    expect(instanteDeIso('1969-12-31T23:59:59Z')).toBe(-1000);
  });

  it('devuelve undefined si no es una fecha UTC ISO válida terminada en Z', () => {
    for (const invalido of ['', '2026-02-30T00:00:00Z', '2026-03-01T14:30:00-05:00', '2026-03-01', 'hola', null, undefined, 5, {}]) {
      expect(instanteDeIso(invalido), String(invalido)).toBeUndefined();
    }
  });
});

describe('formatLimaConSegundos: reloj de la Portada', () => {
  it.each([
    [0, '31/12/1969 19:00:00'],
    [1000, '31/12/1969 19:00:01'],
    [Date.parse('2026-03-01T14:30:45Z'), '01/03/2026 09:30:45'],
    [Date.parse('2026-03-01T05:00:00Z'), '01/03/2026 00:00:00'],
    [Date.parse('2026-01-01T04:59:59Z'), '31/12/2025 23:59:59'],
    [Date.parse('2028-03-01T04:59:59Z'), '29/02/2028 23:59:59'],
  ])('%d -> %s', (epochMs, esperado) => {
    expect(formatLimaConSegundos(epochMs)).toBe(esperado);
  });

  it('trunca los milisegundos al segundo, también con instantes negativos', () => {
    expect(formatLimaConSegundos(1999)).toBe('31/12/1969 19:00:01');
    expect(formatLimaConSegundos(1000)).toBe('31/12/1969 19:00:01');
    expect(formatLimaConSegundos(999)).toBe('31/12/1969 19:00:00');
    expect(formatLimaConSegundos(-1)).toBe('31/12/1969 18:59:59');
    expect(formatLimaConSegundos(-1000)).toBe('31/12/1969 18:59:59');
    expect(formatLimaConSegundos(-1001)).toBe('31/12/1969 18:59:58');
  });

  it('avanza exactamente 1 s cuando el instante avanza 1 s, incluso al cambiar de minuto, hora y día', () => {
    const base = Date.parse('2026-03-01T04:59:58Z');
    expect(formatLimaConSegundos(base)).toBe('28/02/2026 23:59:58');
    expect(formatLimaConSegundos(base + 1000)).toBe('28/02/2026 23:59:59');
    expect(formatLimaConSegundos(base + 2000)).toBe('01/03/2026 00:00:00');
  });

  it('coincide con formatLima en los campos comunes, DD/MM/AAAA HH:mm', () => {
    for (const iso of ['2026-03-01T14:30:45Z', '2026-01-01T04:59:59Z', '2028-03-01T04:00:00Z', '2026-06-15T12:00:00.5Z', '0099-06-15T17:00:00Z']) {
      const instante = instanteDeIso(iso) as number;
      expect(formatLimaConSegundos(instante).slice(0, 16), iso).toBe(formatLima(iso));
      expect(formatLimaConSegundos(instante)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    }
  });

  it('en los extremos de los años de cuatro dígitos, muestra la fecha; fuera de ellos, "No disponible"', () => {
    const inicio = Date.parse('0000-01-01T05:00:00Z');
    expect(formatLimaConSegundos(inicio)).toBe('01/01/0000 00:00:00');
    expect(formatLimaConSegundos(inicio - 1000)).toBe('No disponible'); // 31/12/-0001
    const fin = Date.parse('9999-12-31T23:59:59Z');
    expect(formatLimaConSegundos(fin)).toBe('31/12/9999 18:59:59');
    expect(formatLimaConSegundos(Date.parse('+010000-01-01T04:59:59Z'))).toBe('31/12/9999 23:59:59');
    expect(formatLimaConSegundos(Date.parse('+010000-01-01T05:00:00Z'))).toBe('No disponible');
  });

  it('devuelve "No disponible" para NaN, infinitos, instantes fuera del rango de Date y valores que no son números', () => {
    for (const invalido of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 8.64e15 + 1, -8.64e15 - 1, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      expect(formatLimaConSegundos(invalido), String(invalido)).toBe('No disponible');
    }
    for (const raro of ['2026-03-01T14:30:00Z', null, undefined, {}]) {
      expect(formatLimaConSegundos(raro as unknown as number)).toBe('No disponible');
    }
  });
});

describe('Reloj inyectable (Ahora)', () => {
  it('las funciones de formato no consultan el reloj del dispositivo', () => {
    const espia = vi.spyOn(Date, 'now');
    formatLima('2026-03-01T14:30:00Z');
    formatLima('no es una fecha');
    formatLimaConSegundos(1_772_000_000_000);
    instanteDeIso('2026-03-01T14:30:00Z');
    expect(espia).not.toHaveBeenCalled();
  });

  it('con un reloj simulado, el texto es determinista y avanza solo cuando el reloj avanza', () => {
    let ahoraMs = Date.parse('2026-03-01T14:30:00Z');
    const ahora: Ahora = () => ahoraMs;
    expect(formatLimaConSegundos(ahora())).toBe('01/03/2026 09:30:00');
    expect(formatLimaConSegundos(ahora())).toBe('01/03/2026 09:30:00');
    ahoraMs += 1000;
    expect(formatLimaConSegundos(ahora())).toBe('01/03/2026 09:30:01');
    ahoraMs += 59_000;
    expect(formatLimaConSegundos(ahora())).toBe('01/03/2026 09:31:00');
  });

  it('ahoraDelSistema es el reloj del dispositivo: devuelve lo que devuelve Date.now', () => {
    const espia = vi.spyOn(Date, 'now').mockReturnValue(1_772_000_000_000);
    expect(ahoraDelSistema()).toBe(1_772_000_000_000);
    expect(espia).toHaveBeenCalledTimes(1);
    const real: Ahora = ahoraDelSistema;
    espia.mockRestore();
    expect(Math.abs(real() - Date.now())).toBeLessThan(1000);
  });
});

describe('Años bisiestos del calendario gregoriano', () => {
  it('el año 0000 es bisiesto (divisible entre 400): existe el 29 de febrero', () => {
    const dia = 24 * 60 * 60 * 1000;
    const feb28 = instanteDeIso('0000-02-28T00:00:00Z') as number;
    const feb29 = instanteDeIso('0000-02-29T00:00:00Z') as number;
    const mar01 = instanteDeIso('0000-03-01T00:00:00Z') as number;
    expect(feb29).toBeDefined();
    expect(feb29 - feb28).toBe(dia);
    expect(mar01 - feb29).toBe(dia); // el 29/02 está entre el 28/02 y el 01/03: del 28/02 al 01/03 hay dos días
    expect(mar01 - feb28).toBe(2 * dia);
    expect(formatLima('0000-02-29T05:00:00Z')).toBe('29/02/0000 00:00');
    expect(formatLima('0000-03-01T04:00:00Z')).toBe('29/02/0000 23:00'); // retroceder desde el 1 de marzo cae en el 29 de febrero
    expect(formatLima('0000-03-01T05:00:00Z')).toBe('01/03/0000 00:00');
  });

  it.each([['0100'], ['1900'], ['2100']])('el año %s (divisible entre 100 y no entre 400) no es bisiesto: no existe el 29 de febrero', (anio) => {
    expect(instanteDeIso(`${anio}-02-29T00:00:00Z`)).toBeUndefined();
    expect(formatLima(`${anio}-02-29T12:00:00Z`)).toBe('No disponible');
    const feb28 = instanteDeIso(`${anio}-02-28T00:00:00Z`) as number;
    const mar01 = instanteDeIso(`${anio}-03-01T00:00:00Z`) as number;
    expect(mar01 - feb28).toBe(24 * 60 * 60 * 1000); // del 28/02 al 01/03 hay un solo día: no hay 29 de febrero en medio
    expect(formatLima(`${anio}-03-01T04:00:00Z`)).toBe(`28/02/${anio} 23:00`); // retroceder desde el 1 de marzo cae en el 28 de febrero
  });

  it.each([['0004'], ['0400'], ['1904'], ['2000'], ['2024'], ['2028']])('el año %s sí es bisiesto', (anio) => {
    expect(instanteDeIso(`${anio}-02-29T00:00:00Z`)).toBeDefined();
    expect(formatLima(`${anio}-03-01T04:00:00Z`)).toBe(`29/02/${anio} 23:00`);
  });

  it.each([['0001'], ['0099'], ['1999'], ['2026'], ['2027']])('el año %s no es bisiesto', (anio) => {
    expect(instanteDeIso(`${anio}-02-29T00:00:00Z`)).toBeUndefined();
    expect(formatLima(`${anio}-03-01T04:00:00Z`)).toBe(`28/02/${anio} 23:00`);
  });
});

describe('Salto de línea y espacios en las fechas ISO', () => {
  it.each([
    ['2026-03-01T14:30:00Z\n'],
    ['2026-03-01T14:30:00Z\r\n'],
    ['2026-03-01T14:30:00.123Z\n'],
    ['\n2026-03-01T14:30:00Z'],
    ['2026-03-01T14:30:00Z\n2026-03-01T14:30:00Z'],
    ['2026-03-01\nT14:30:00Z'],
    ['2026-03-01T14:30:00Z\t'],
    ['2026-03-01T14:30:00Z\u2028'],
  ])('rechaza %j', (iso) => {
    expect(instanteDeIso(iso)).toBeUndefined();
    expect(formatLima(iso)).toBe('No disponible');
  });

  it('la misma fecha sin el salto de línea sí se acepta', () => {
    expect(formatLima('2026-03-01T14:30:00Z')).toBe('01/03/2026 09:30');
    expect(instanteDeIso('2026-03-01T14:30:00Z')).toBeDefined();
  });
});

describe('Milisegundos con uno, dos y tres dígitos', () => {
  it.each([
    ['1970-01-01T00:00:00.000Z', 0],
    ['1970-01-01T00:00:00.001Z', 1],
    ['1970-01-01T00:00:00.010Z', 10],
    ['1970-01-01T00:00:00.100Z', 100],
    ['1970-01-01T00:00:00.123Z', 123],
    ['1970-01-01T00:00:00.999Z', 999],
    ['1970-01-01T00:00:01.000Z', 1000],
  ])('acepta tres dígitos de milisegundos: %s -> %d ms', (iso, esperado) => {
    expect(instanteDeIso(iso)).toBe(esperado);
    expect(formatLima(iso)).not.toBe('No disponible');
  });

  it('los tres dígitos equivalen a la misma fracción escrita con menos dígitos, y no cambian el minuto mostrado', () => {
    expect(instanteDeIso('2026-03-01T14:30:00.500Z')).toBe(instanteDeIso('2026-03-01T14:30:00.5Z'));
    expect(instanteDeIso('2026-03-01T14:30:00.050Z')).toBe(instanteDeIso('2026-03-01T14:30:00.05Z'));
    expect(formatLima('2026-03-01T14:30:59.999Z')).toBe('01/03/2026 09:30');
    expect(formatLimaConSegundos(instanteDeIso('2026-03-01T14:30:59.999Z') as number)).toBe('01/03/2026 09:30:59');
    expect(formatLimaConSegundos(instanteDeIso('2026-03-01T14:30:00.000Z') as number)).toBe('01/03/2026 09:30:00');
  });

  it('con cuatro dígitos o más de milisegundos se rechaza', () => {
    expect(instanteDeIso('2026-03-01T14:30:00.1234Z')).toBeUndefined();
    expect(formatLima('2026-03-01T14:30:00.0000Z')).toBe('No disponible');
  });
});

describe('Independencia de la zona horaria del dispositivo', () => {
  // Zonas con distinto desfase, con horario de verano (Los Ángeles, Madrid), con media hora de cambio (Lord Howe) y con UTC+14.
  const zonas = ['UTC', 'America/Lima', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Madrid', 'Australia/Lord_Howe'];
  // Instantes alrededor de los cambios de horario de verano de esas zonas, de los límites de día y año, y de los años 0 a 99.
  const isos = [
    '2026-03-08T09:59:59Z', '2026-03-08T10:00:00Z', // cambio en Los Ángeles
    '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', // cambio en Madrid
    '2026-10-03T15:29:59Z', '2026-10-03T15:30:00Z', // cambio en Lord Howe
    '2026-11-01T08:59:59Z', '2026-11-01T09:00:00Z', // fin del horario de verano en Los Ángeles
    '2026-01-01T04:59:59Z', '2026-01-01T05:00:00Z',
    '2028-03-01T04:59:59.999Z', '2000-02-29T12:00:00Z', '1900-03-01T04:00:00Z', '0099-06-15T17:00:00Z', '0000-01-01T05:00:00Z', '9999-12-31T23:59:59Z',
  ];
  const instantes = [0, -1, -1000, 1_772_000_000_000, 1_772_000_000_999, 253_402_318_799_000, -62_167_201_200_000, ...isos.map((iso) => instanteDeIso(iso) as number)];
  const resultados = () => ({
    lima: isos.map((iso) => formatLima(iso)),
    segundos: instantes.map((ms) => formatLimaConSegundos(ms)),
    instantes: isos.map((iso) => instanteDeIso(iso)),
  });

  it('el resultado es idéntico con cualquier zona horaria del proceso, incluidas las de horario de verano', () => {
    const zonaOriginal = process.env['TZ'];
    try {
      process.env['TZ'] = 'UTC';
      const referencia = resultados();
      // Valores conocidos, para que la referencia no pueda ser simplemente "igual de equivocada" en todas las zonas.
      expect(referencia.lima[0]).toBe('08/03/2026 04:59');
      expect(referencia.segundos[0]).toBe('31/12/1969 19:00:00');
      expect(referencia.segundos[3]).toBe('25/02/2026 01:13:20'); // 1 772 000 000 s = 2026-02-25T06:13:20Z
      const horasLocales = new Set<number>();
      for (const zona of zonas) {
        process.env['TZ'] = zona;
        // Comprobación de que el cambio de zona surte efecto en este proceso: si no, la prueba no demostraría nada.
        horasLocales.add(new Date(Date.UTC(2026, 6, 1, 12, 0, 0)).getHours());
        expect(resultados(), zona).toEqual(referencia);
      }
      expect(horasLocales.size, 'la zona horaria del proceso debe cambiar de verdad').toBeGreaterThanOrEqual(5);
    } finally {
      if (zonaOriginal === undefined) delete process.env['TZ'];
      else process.env['TZ'] = zonaOriginal;
    }
  });
});