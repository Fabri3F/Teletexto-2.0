import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { crearEstadoInicial, reducir, VALORES_SYNC, type EstadoSync, type EventoSync, type ValorSync } from './estadoSync.ts';

// Tarea 5.8. Requisitos 1.13 a 1.18 y Propiedad 36: los cinco valores del Estado_de_Sincronización y sus transiciones.

const A = '2026-11-16T12:00:00Z';
const B = '2026-11-17T08:30:15Z';
const C = '2026-11-18T09:00:00.500Z';

const abrir: EventoSync = { tipo: 'abrir' };
const contenidoListo: EventoSync = { tipo: 'contenidoListo' };
const syncInicia: EventoSync = { tipo: 'syncInicia' };
const syncFalla: EventoSync = { tipo: 'syncFalla' };
const offline: EventoSync = { tipo: 'offline' };
const online: EventoSync = { tipo: 'online' };
const syncOk = (at: string): EventoSync => ({ tipo: 'syncOk', at });

/** Estado construido a mano con un valor y, si se indica, una fecha. */
const en = (valor: ValorSync, ultimaSyncOk?: string): EstadoSync => (ultimaSyncOk === undefined ? { valor } : { valor, ultimaSyncOk });

/** Aplica los eventos en orden. */
const aplicar = (estado: EstadoSync, ...eventos: EventoSync[]): EstadoSync => eventos.reduce(reducir, estado);

describe('Estado inicial (Requisito 1.14)', () => {
  it('arranca en "Cargando" sin fecha de sincronización', () => {
    const inicial = crearEstadoInicial();
    expect(inicial.valor).toBe('Cargando');
    expect('ultimaSyncOk' in inicial).toBe(false);
    expect(inicial).toEqual({ valor: 'Cargando' });
  });

  it.each([[A], [B], [C], ['0000-01-01T00:00:00Z'], ['9999-12-31T23:59:59.999Z']])('conserva una fecha ISO UTC válida (%s)', (fecha) => {
    expect(crearEstadoInicial(fecha)).toEqual({ valor: 'Cargando', ultimaSyncOk: fecha });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['vacía', ''],
    ['texto libre', 'ayer'],
    ['con desfase', '2026-11-16T07:00:00-05:00'],
    ['sin Z', '2026-11-16T12:00:00'],
    ['solo fecha', '2026-11-16'],
    ['día inexistente', '2026-02-30T00:00:00Z'],
    ['con salto de línea', '2026-11-16T12:00:00Z\n'],
    ['con espacio', ' 2026-11-16T12:00:00Z'],
    ['un número', 1_800_000_000_000],
    ['un objeto', {}],
  ])('omite una fecha ausente o inválida (%s) y no inventa ninguna', (_etiqueta, fecha) => {
    const inicial = crearEstadoInicial(fecha as string);
    expect(inicial).toEqual({ valor: 'Cargando' });
    expect('ultimaSyncOk' in inicial).toBe(false);
  });

  it('el estado inicial está congelado', () => {
    expect(Object.isFrozen(crearEstadoInicial())).toBe(true);
    expect(Object.isFrozen(crearEstadoInicial(A))).toBe(true);
  });

  it('los cinco valores son exactamente los de los requisitos', () => {
    expect([...VALORES_SYNC]).toEqual(['Cargando', 'Sincronizando', 'Sincronizado', 'Error', 'Sin conexión']);
  });
});

describe('Transiciones válidas del diagrama (Requisitos 1.14 a 1.18)', () => {
  it('abrir sin ninguna sincronización deja "Cargando"', () => {
    expect(reducir(crearEstadoInicial(), abrir).valor).toBe('Cargando');
  });

  it('Cargando -> Sincronizando al iniciar la sincronización (1.15)', () => {
    expect(reducir(en('Cargando'), syncInicia)).toEqual({ valor: 'Sincronizando' });
  });

  it('Cargando -> Sin conexión sin conexión (1.18)', () => {
    expect(reducir(en('Cargando'), offline)).toEqual({ valor: 'Sin conexión' });
  });

  it('Sincronizando -> Sincronizado con la fecha de la sincronización exitosa (1.16)', () => {
    expect(reducir(en('Sincronizando'), syncOk(A))).toEqual({ valor: 'Sincronizado', ultimaSyncOk: A });
  });

  it('Sincronizando -> Error si falla tras los reintentos con conexión (1.17)', () => {
    expect(reducir(en('Sincronizando'), syncFalla)).toEqual({ valor: 'Error' });
  });

  it('Sincronizado -> Sincronizando con una sincronización nueva, y conserva la fecha', () => {
    expect(reducir(en('Sincronizado', A), syncInicia)).toEqual({ valor: 'Sincronizando', ultimaSyncOk: A });
  });

  it('Error -> Sincronizando con una sincronización nueva, y conserva la fecha', () => {
    expect(reducir(en('Error', A), syncInicia)).toEqual({ valor: 'Sincronizando', ultimaSyncOk: A });
  });

  it.each([['Cargando'], ['Sincronizando'], ['Sincronizado'], ['Error']] as const)('%s -> Sin conexión al perder la conexión, y conserva la fecha', (valor) => {
    expect(reducir(en(valor, A), offline)).toEqual({ valor: 'Sin conexión', ultimaSyncOk: A });
  });

  it('Sin conexión -> Sincronizando al volver la conexión, y conserva la fecha', () => {
    expect(reducir(en('Sin conexión', A), online)).toEqual({ valor: 'Sincronizando', ultimaSyncOk: A });
    expect(reducir(en('Sin conexión'), online)).toEqual({ valor: 'Sincronizando' });
  });

  it('un ciclo completo: abrir, sincronizar, éxito, perder la conexión, recuperarla, fallar y volver a intentar', () => {
    let estado = crearEstadoInicial();
    const pasos: [EventoSync, ValorSync, string | undefined][] = [
      [abrir, 'Cargando', undefined],
      [contenidoListo, 'Cargando', undefined],
      [syncInicia, 'Sincronizando', undefined],
      [syncOk(A), 'Sincronizado', A],
      [offline, 'Sin conexión', A],
      [online, 'Sincronizando', A],
      [syncFalla, 'Error', A],
      [syncInicia, 'Sincronizando', A],
      [syncOk(B), 'Sincronizado', B],
    ];
    for (const [evento, valor, fecha] of pasos) {
      estado = reducir(estado, evento);
      expect(estado.valor, evento.tipo).toBe(valor);
      expect(estado.ultimaSyncOk, evento.tipo).toBe(fecha);
    }
  });
});

describe('abrir y contenidoListo (decisiones de la tarea)', () => {
  it('abrir pasa a "Cargando" y conserva la fecha desde cualquier valor menos "Sin conexión"', () => {
    for (const valor of ['Sincronizando', 'Sincronizado', 'Error'] as const) {
      expect(reducir(en(valor, A), abrir), valor).toEqual({ valor: 'Cargando', ultimaSyncOk: A });
    }
  });

  it('abrir desde "Cargando" no cambia nada (misma referencia)', () => {
    const e = en('Cargando', A);
    expect(reducir(e, abrir)).toBe(e);
  });

  it('abrir no saca de "Sin conexión": la falta de conexión prevalece', () => {
    const e = en('Sin conexión', A);
    expect(reducir(e, abrir)).toBe(e);
    expect(reducir(e, abrir).valor).toBe('Sin conexión');
  });

  it('una apertura sin conexión: abrir y después offline termina en "Sin conexión"', () => {
    expect(aplicar(crearEstadoInicial(), abrir, offline).valor).toBe('Sin conexión');
    expect(aplicar(crearEstadoInicial(), offline, abrir).valor).toBe('Sin conexión');
  });

  it('abrir con una fecha de una sesión anterior la conserva', () => {
    expect(reducir(crearEstadoInicial(A), abrir)).toEqual({ valor: 'Cargando', ultimaSyncOk: A });
  });

  it.each(VALORES_SYNC)('contenidoListo no cambia el estado desde "%s" (misma referencia)', (valor) => {
    const e = en(valor, A);
    expect(reducir(e, contenidoListo)).toBe(e);
  });

  it('contenidoListo no cambia la fecha ni el valor sin fecha', () => {
    const e = en('Cargando');
    expect(reducir(e, contenidoListo)).toBe(e);
    expect(reducir(e, contenidoListo)).toEqual({ valor: 'Cargando' });
  });
});

describe('"Sin conexión" prevalece hasta online (Requisito 1.18)', () => {
  const sinConexion = en('Sin conexión', A);

  it.each([['abrir', abrir], ['contenidoListo', contenidoListo], ['syncInicia', syncInicia], ['syncFalla', syncFalla], ['offline', offline]] as const)(
    '%s no saca del estado "Sin conexión" y no cambia nada',
    (_etiqueta, evento) => {
      expect(reducir(sinConexion, evento)).toBe(sinConexion);
    },
  );

  it('un syncOk válido recibido sin conexión actualiza la fecha pero conserva el valor "Sin conexión"', () => {
    const r = reducir(sinConexion, syncOk(B));
    expect(r).toEqual({ valor: 'Sin conexión', ultimaSyncOk: B });
    expect(r.valor).toBe('Sin conexión');
  });

  it('un syncOk sin conexión y sin fecha previa registra la fecha y sigue "Sin conexión"', () => {
    expect(reducir(en('Sin conexión'), syncOk(A))).toEqual({ valor: 'Sin conexión', ultimaSyncOk: A });
  });

  it('un syncOk inválido sin conexión no cambia nada', () => {
    expect(reducir(sinConexion, { tipo: 'syncOk', at: 'ayer' })).toBe(sinConexion);
  });

  it('solo online lo cambia, y pasa a "Sincronizando"', () => {
    expect(reducir(sinConexion, online)).toEqual({ valor: 'Sincronizando', ultimaSyncOk: A });
  });

  it('una sucesión de eventos con sincronización sin conexión no cambia el valor hasta online', () => {
    const r = aplicar(sinConexion, syncInicia, syncFalla, contenidoListo, abrir, syncOk(B), syncInicia, syncFalla);
    expect(r).toEqual({ valor: 'Sin conexión', ultimaSyncOk: B });
  });
});

describe('Fallo de la sincronización (Requisito 1.17)', () => {
  it.each([['Cargando'], ['Sincronizando'], ['Sincronizado']] as const)('syncFalla con conexión desde "%s" da "Error" y conserva la fecha', (valor) => {
    expect(reducir(en(valor, A), syncFalla)).toEqual({ valor: 'Error', ultimaSyncOk: A });
  });

  it('syncFalla sin ninguna sincronización previa da "Error" sin fecha', () => {
    const r = reducir(en('Sincronizando'), syncFalla);
    expect(r).toEqual({ valor: 'Error' });
    expect('ultimaSyncOk' in r).toBe(false);
  });

  it('syncFalla repetido en "Error" no cambia nada', () => {
    const e = en('Error', A);
    expect(reducir(e, syncFalla)).toBe(e);
  });

  it('el fallo no borra la fecha: se conserva a lo largo de varios fallos y reintentos', () => {
    const r = aplicar(en('Sincronizado', A), syncInicia, syncFalla, syncInicia, syncFalla, syncInicia, syncFalla);
    expect(r).toEqual({ valor: 'Error', ultimaSyncOk: A });
  });

  it('tras un fallo, un éxito posterior reemplaza la fecha', () => {
    expect(aplicar(en('Error', A), syncInicia, syncOk(B))).toEqual({ valor: 'Sincronizado', ultimaSyncOk: B });
  });
});

describe('syncOk y la fecha de la última sincronización exitosa', () => {
  it.each([['Cargando'], ['Sincronizando'], ['Sincronizado'], ['Error']] as const)('syncOk válido desde "%s" da "Sincronizado" con la fecha', (valor) => {
    expect(reducir(en(valor), syncOk(A))).toEqual({ valor: 'Sincronizado', ultimaSyncOk: A });
  });

  it('acepta milisegundos en la fecha y la guarda tal cual', () => {
    expect(reducir(en('Sincronizando'), syncOk(C)).ultimaSyncOk).toBe(C);
  });

  it('toma el valor de esa respuesta aunque sea anterior a la fecha que ya había', () => {
    expect(reducir(en('Sincronizando', B), syncOk(A))).toEqual({ valor: 'Sincronizado', ultimaSyncOk: A });
  });

  it('el mismo syncOk repetido no cambia nada (misma referencia)', () => {
    const e = reducir(en('Sincronizando'), syncOk(A));
    expect(reducir(e, syncOk(A))).toBe(e);
  });

  it.each([
    ['sin at', undefined],
    ['at nulo', null],
    ['at vacío', ''],
    ['texto libre', 'hoy'],
    ['con desfase', '2026-11-16T07:00:00-05:00'],
    ['sin Z', '2026-11-16T12:00:00'],
    ['solo fecha', '2026-11-16'],
    ['día inexistente', '2026-02-30T00:00:00Z'],
    ['hora 24', '2026-11-16T24:00:00Z'],
    ['con salto de línea', '2026-11-16T12:00:00Z\n'],
    ['un número', 1_800_000_000_000],
    ['un objeto', {}],
  ])('un syncOk con %s se ignora en todos los valores y no cambia nada', (_etiqueta, at) => {
    for (const valor of VALORES_SYNC) {
      const e = en(valor, A);
      expect(reducir(e, { tipo: 'syncOk', at } as unknown as EventoSync), valor).toBe(e);
    }
  });

  it('un syncOk inválido deja "Sincronizando" como estaba, sin llegar a "Sincronizado" sin fecha', () => {
    const e = en('Sincronizando');
    const r = reducir(e, { tipo: 'syncOk', at: 'nunca' } as EventoSync);
    expect(r).toBe(e);
    expect(r.valor).toBe('Sincronizando');
  });
});

describe('Eventos inválidos, desconocidos o repetidos', () => {
  it.each([
    ['un tipo desconocido', { tipo: 'reiniciar' }],
    ['sin tipo', {}],
    ['tipo vacío', { tipo: '' }],
    ['tipo con otra capitalización', { tipo: 'SyncOk', at: A }],
    ['tipo de otro tipo', { tipo: 5 }],
    ['null', null],
    ['undefined', undefined],
    ['un texto', 'online'],
    ['un número', 5],
    ['un arreglo', ['online']],
  ])('%s se ignora sin lanzar y no cambia nada', (_etiqueta, evento) => {
    for (const valor of VALORES_SYNC) {
      const e = en(valor, A);
      expect(() => reducir(e, evento as unknown as EventoSync)).not.toThrow();
      expect(reducir(e, evento as unknown as EventoSync), valor).toBe(e);
    }
  });

  it.each([['syncInicia', syncInicia], ['syncFalla', syncFalla], ['offline', offline], ['online', online], ['abrir', abrir], ['contenidoListo', contenidoListo]] as const)(
    '%s repetido es idempotente',
    (_etiqueta, evento) => {
      for (const valor of VALORES_SYNC) {
        const una = reducir(en(valor, A), evento);
        expect(reducir(una, evento), valor).toBe(una);
      }
    },
  );

  it('syncInicia en "Sincronizando" no cambia nada, y online en línea tampoco', () => {
    const sincronizando = en('Sincronizando', A);
    expect(reducir(sincronizando, syncInicia)).toBe(sincronizando);
    for (const valor of ['Cargando', 'Sincronizando', 'Sincronizado', 'Error'] as const) {
      const e = en(valor, A);
      expect(reducir(e, online), valor).toBe(e);
    }
  });

  it('un evento con propiedades de más se trata por su tipo', () => {
    expect(reducir(en('Cargando'), { tipo: 'syncInicia', extra: 1 } as unknown as EventoSync)).toEqual({ valor: 'Sincronizando' });
  });
});

describe('Conservación de ultimaSyncOk (Propiedad 36)', () => {
  const todos: EventoSync[] = [abrir, contenidoListo, syncInicia, syncOk(A), syncOk(B), syncFalla, offline, online];

  it('ningún evento que no sea un syncOk válido cambia la fecha ni la borra', () => {
    for (const valor of VALORES_SYNC) {
      for (const evento of todos.filter((e) => e.tipo !== 'syncOk')) {
        expect(reducir(en(valor, A), evento).ultimaSyncOk, `${valor} + ${evento.tipo}`).toBe(A);
      }
    }
  });

  it('una secuencia larga sin ningún syncOk válido nunca modifica la fecha inicial', () => {
    const eventos: EventoSync[] = [abrir, syncInicia, syncFalla, offline, online, contenidoListo, syncInicia, offline, abrir, online, syncFalla];
    let estado = crearEstadoInicial(A);
    for (const evento of eventos) {
      estado = reducir(estado, evento);
      expect(estado.ultimaSyncOk, evento.tipo).toBe(A);
    }
  });

  it('sin ninguna sincronización exitosa nunca aparece una fecha', () => {
    const eventos: EventoSync[] = [abrir, contenidoListo, syncInicia, syncFalla, offline, online, syncFalla, abrir];
    let estado = crearEstadoInicial();
    for (const evento of eventos) {
      estado = reducir(estado, evento);
      expect('ultimaSyncOk' in estado, evento.tipo).toBe(false);
    }
  });

  it('"Sincronizado" siempre tiene la fecha definida', () => {
    for (const valor of VALORES_SYNC) {
      const r = reducir(en(valor), syncOk(A));
      if (r.valor === 'Sincronizado') expect(r.ultimaSyncOk).toBe(A);
    }
  });
});

describe('Inmutabilidad', () => {
  it('no modifica el estado de entrada (congelado) y devuelve estados congelados cuando cambia', () => {
    const entrada = Object.freeze({ valor: 'Sincronizando' as const, ultimaSyncOk: A });
    const r = reducir(entrada, syncOk(B));
    expect(entrada).toEqual({ valor: 'Sincronizando', ultimaSyncOk: A });
    expect(r).not.toBe(entrada);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => ((r as { valor: ValorSync }).valor = 'Error')).toThrow(TypeError);
    expect(r.valor).toBe('Sincronizado');
  });

  it('un estado sin cambios es la misma referencia, no una copia', () => {
    const e = Object.freeze(en('Sincronizado', A));
    expect(reducir(e, contenidoListo)).toBe(e);
    expect(reducir(e, online)).toBe(e);
  });

  it('cada evento sobre el mismo estado produce siempre el mismo resultado', () => {
    const e = Object.freeze(en('Sincronizado', A));
    for (const evento of [abrir, syncInicia, syncFalla, offline, syncOk(B)]) expect(reducir(e, evento)).toEqual(reducir(e, evento));
  });

  it('el estado de entrada no cambia tras cualquier evento', () => {
    for (const valor of VALORES_SYNC) {
      const e = Object.freeze(en(valor, A));
      for (const evento of [abrir, contenidoListo, syncInicia, syncOk(B), syncFalla, offline, online]) {
        reducir(e, evento);
        expect(e, `${valor} + ${evento.tipo}`).toEqual({ valor, ultimaSyncOk: A });
      }
    }
  });
});

describe('Todas las secuencias de eventos (Propiedad 36)', () => {
  type Tipo = EventoSync['tipo'];
  // Modelo escrito aparte del reducer: para cada valor, el valor al que lleva cada tipo de evento; lo que falta no cambia.
  const tabla: Record<ValorSync, Partial<Record<Tipo, ValorSync>>> = {
    Cargando: { syncInicia: 'Sincronizando', syncOk: 'Sincronizado', syncFalla: 'Error', offline: 'Sin conexión' },
    Sincronizando: { abrir: 'Cargando', syncOk: 'Sincronizado', syncFalla: 'Error', offline: 'Sin conexión' },
    Sincronizado: { abrir: 'Cargando', syncInicia: 'Sincronizando', syncFalla: 'Error', offline: 'Sin conexión' },
    Error: { abrir: 'Cargando', syncInicia: 'Sincronizando', syncOk: 'Sincronizado', offline: 'Sin conexión' },
    'Sin conexión': { online: 'Sincronizando' },
  };
  const eventos: EventoSync[] = [abrir, contenidoListo, syncInicia, syncOk(A), syncOk(B), { tipo: 'syncOk', at: 'no es fecha' }, syncFalla, offline, online];

  it('coincide con el modelo en todas las secuencias de hasta 6 eventos y cumple las propiedades en cada paso', () => {
    let nodos = 0;
    const fallos: string[] = [];
    const comprobar = (condicion: boolean, mensaje: string): void => {
      if (!condicion && fallos.length < 5) fallos.push(mensaje);
    };
    const recorrer = (estado: EstadoSync, modelo: { valor: ValorSync; fecha: string | undefined; conectado: boolean }, resto: number, camino: string): void => {
      nodos++;
      comprobar((VALORES_SYNC as readonly string[]).includes(estado.valor), `${camino}: valor ${estado.valor}`);
      comprobar(estado.valor === modelo.valor, `${camino}: valor ${estado.valor} y se esperaba ${modelo.valor}`);
      comprobar(estado.ultimaSyncOk === modelo.fecha, `${camino}: fecha ${estado.ultimaSyncOk} y se esperaba ${modelo.fecha}`);
      comprobar(modelo.conectado || estado.valor === 'Sin conexión', `${camino}: sin conexión debe prevalecer`);
      comprobar(estado.valor !== 'Sincronizado' || estado.ultimaSyncOk !== undefined, `${camino}: Sincronizado sin fecha`);
      if (resto === 0) return;
      for (const evento of eventos) {
        const siguiente = reducir(estado, evento);
        const valido = evento.tipo !== 'syncOk' || (evento.at === A || evento.at === B);
        const nuevoValor = valido ? (tabla[modelo.valor][evento.tipo] ?? modelo.valor) : modelo.valor;
        const nuevaFecha = evento.tipo === 'syncOk' && valido ? evento.at : modelo.fecha;
        const conectado = evento.tipo === 'offline' ? false : evento.tipo === 'online' ? true : modelo.conectado;
        // Un syncOk válido sin conexión conserva "Sin conexión": la tabla no lo mueve.
        comprobar(Object.isFrozen(siguiente) || siguiente === estado, `${camino}: estado sin congelar`);
        comprobar((siguiente === estado) === (nuevoValor === modelo.valor && nuevaFecha === modelo.fecha), `${camino} > ${evento.tipo}: referencia`);
        recorrer(siguiente, { valor: nuevoValor, fecha: nuevaFecha, conectado }, resto - 1, `${camino} > ${evento.tipo}`);
      }
    };
    recorrer(crearEstadoInicial(), { valor: 'Cargando', fecha: undefined, conectado: true }, 6, 'inicio');
    expect(fallos).toEqual([]);
    expect(nodos).toBe(Array.from({ length: 7 }, (_, i) => eventos.length ** i).reduce((a, b) => a + b, 0));
  });
});

describe('Lógica pura, sin reloj ni API del navegador', () => {
  it('ninguna función consulta Date.now', () => {
    const espia = vi.spyOn(Date, 'now');
    aplicar(crearEstadoInicial(A), abrir, syncInicia, syncOk(B), offline, online, syncFalla, contenidoListo);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('estadoSync.ts no usa window, document, location, temporizadores ni el reloj, y solo importa format/dates', () => {
    const fuente = readFileSync(new URL('./estadoSync.ts', import.meta.url), 'utf8');
    const codigo = fuente
      .split('\n')
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    expect(codigo).not.toMatch(/\bwindow\b|\bdocument\b|\blocation\b|\bglobalThis\b|\bnavigator\b|setTimeout|setInterval|requestAnimationFrame|Date\b|performance\b|localStorage|sessionStorage|indexedDB/);
    expect([...fuente.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../format/dates.ts']);
  });
});
