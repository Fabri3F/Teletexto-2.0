import { readFileSync } from 'node:fs';
import { CODIGOS_DEPARTAMENTO, NIVELES_RIESGO, type AlertaRiesgo, type CodigoDepartamento, type DatasetAlertas, type NivelRiesgo } from '@teletexto/modelo';
import { describe, expect, it, vi } from 'vitest';
import { alertasVigentes, detalleDepartamento, esVigente, mergeSources, riesgoPorDepartamento, sortAlerts } from './alertas.ts';

// Tarea 5.1. Requisitos 2.2, 2.7, 2.8, 4.2, 4.5, 4.6, 4.9, 4.13, 4.16 y 4.20. `ahora` es siempre un instante en milisegundos.

const INICIO = '2026-11-16T05:00:00Z';
const FIN = '2026-12-16T04:59:59Z';
const T_INICIO = Date.parse(INICIO);
const T_FIN = Date.parse(FIN);
const DENTRO = Date.parse('2026-11-20T12:00:00Z');

/** Alerta completa y válida; `cambios` sobrescribe campos. */
function alerta(id: string, cambios: Partial<AlertaRiesgo> = {}): AlertaRiesgo {
  return {
    id,
    esDatoDePrueba: true,
    titulo: `Alerta ${id}`,
    tipoRiesgo: 'Helada',
    nivel: 'Alto',
    nivelOficial: { texto: 'Naranja', esMaximo: false },
    departamentos: ['21'],
    vigencia: { inicio: INICIO, fin: FIN },
    publicadoEn: '2026-11-15T14:00:00Z',
    actualizadoEn: '2026-11-16T12:00:00Z',
    fuente: 'SENAMHI',
    aviso: { id: `aviso-${id}`, textoOriginal: 'Texto del aviso.', referencia: 'Aviso oficial 1', recomendaciones: [] },
    ...cambios,
  };
}

/** Alerta con campos que el tipo no permite (datos mal formados que llegan de la red o de una caché antigua). */
const rota = (id: string, cambios: Record<string, unknown>): AlertaRiesgo => ({ ...alerta(id), ...cambios }) as unknown as AlertaRiesgo;

const dataset = (...alertas: AlertaRiesgo[]): DatasetAlertas => ({
  metadatos: { fuente: 'VARIAS', publicadoEn: '2026-11-15T14:00:00Z', actualizadoEn: '2026-11-16T13:00:00Z' },
  esDatoDePrueba: true,
  alertas,
});

const ids = (alertas: readonly AlertaRiesgo[]): string[] => alertas.map((a) => a.id);

/** Congela una alerta o un dataset y todo lo que contiene, para comprobar que nada los modifica. */
function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const hijo of Object.values(valor)) congelar(hijo);
  }
  return valor;
}

describe('esVigente: límites inclusivos y milisegundos (Requisito 4.6, Propiedad 28)', () => {
  const a = alerta('a');

  it('es vigente dentro del intervalo', () => {
    expect(esVigente(a, DENTRO)).toBe(true);
  });

  it('es vigente exactamente en el instante de inicio, y no 1 ms antes', () => {
    expect(esVigente(a, T_INICIO)).toBe(true);
    expect(esVigente(a, T_INICIO - 1)).toBe(false);
  });

  it('es vigente exactamente en el instante de fin, y no 1 ms después', () => {
    expect(esVigente(a, T_FIN)).toBe(true);
    expect(esVigente(a, T_FIN + 1)).toBe(false);
  });

  it('con milisegundos en la vigencia, los límites son exactos al milisegundo', () => {
    const conMs = alerta('ms', { vigencia: { inicio: '2026-11-16T05:00:00.001Z', fin: '2026-11-16T05:00:59.999Z' } });
    expect(esVigente(conMs, Date.parse('2026-11-16T05:00:00.000Z'))).toBe(false);
    expect(esVigente(conMs, Date.parse('2026-11-16T05:00:00.001Z'))).toBe(true);
    expect(esVigente(conMs, Date.parse('2026-11-16T05:00:59.999Z'))).toBe(true);
    expect(esVigente(conMs, Date.parse('2026-11-16T05:01:00.000Z'))).toBe(false);
  });

  it('una alerta con fin igual a inicio es vigente solo en ese instante', () => {
    const instante = alerta('i', { vigencia: { inicio: INICIO, fin: INICIO } });
    expect(esVigente(instante, T_INICIO - 1)).toBe(false);
    expect(esVigente(instante, T_INICIO)).toBe(true);
    expect(esVigente(instante, T_INICIO + 1)).toBe(false);
  });

  it('una vigencia con fin anterior a inicio nunca es vigente', () => {
    const invertida = alerta('r', { vigencia: { inicio: FIN, fin: INICIO } });
    for (const t of [T_INICIO - 1, T_INICIO, DENTRO, T_FIN, T_FIN + 1]) expect(esVigente(invertida, t), String(t)).toBe(false);
  });

  it('usa instantes UTC: el fin 2026-12-16T04:59:59Z son las 23:59:59 del 15 de diciembre en Perú', () => {
    expect(esVigente(a, Date.parse('2026-12-16T04:59:59Z'))).toBe(true); // 23:59:59 en Perú
    expect(esVigente(a, Date.parse('2026-12-16T05:00:00Z'))).toBe(false); // 00:00:00 en Perú del 16
  });

  it('el resultado no depende del instante anterior: es el mismo con datos de la red o de la caché', () => {
    const copiaDeCache = JSON.parse(JSON.stringify(a)) as AlertaRiesgo;
    for (const t of [T_INICIO - 1, T_INICIO, DENTRO, T_FIN, T_FIN + 1]) expect(esVigente(copiaDeCache, t)).toBe(esVigente(a, t));
  });

  it('avanzar ahora más allá de fin retira la alerta sin cambiar el dato', () => {
    const fija = congelar(alerta('fija'));
    expect(esVigente(fija, T_FIN)).toBe(true);
    expect(esVigente(fija, T_FIN + 60_000)).toBe(false);
  });

  it.each([
    ['vacía', ''],
    ['texto libre', 'mañana'],
    ['sin Z', '2026-12-16T04:59:59'],
    ['con desfase', '2026-12-16T04:59:59-05:00'],
    ['solo fecha', '2026-12-16'],
    ['día inexistente', '2026-02-30T00:00:00Z'],
    ['con salto de línea', '2026-12-16T04:59:59Z\n'],
    ['un número', 1_800_000_000_000],
    ['null', null],
    ['undefined', undefined],
  ])('con una fecha de fin ilegible (%s) no es vigente', (_etiqueta, fin) => {
    expect(esVigente(rota('x', { vigencia: { inicio: INICIO, fin } }), DENTRO)).toBe(false);
  });

  it.each([['vacía', ''], ['texto libre', 'ayer'], ['con desfase', '2026-11-16T00:00:00-05:00'], ['null', null], ['undefined', undefined]])(
    'con una fecha de inicio ilegible (%s) no es vigente',
    (_etiqueta, inicio) => {
      expect(esVigente(rota('x', { vigencia: { inicio, fin: FIN } }), DENTRO)).toBe(false);
    },
  );

  it('sin vigencia o con una vigencia que no es un objeto no es vigente', () => {
    for (const vigencia of [undefined, null, 'siempre', 5, []]) expect(esVigente(rota('x', { vigencia }), DENTRO), String(vigencia)).toBe(false);
  });

  it.each([['Extremo'], ['bajo'], ['MUY ALTO'], ['Muy  alto'], [''], [null], [undefined], [2], [{}]])(
    'con un nivel no reconocido (%j) no es vigente, aunque las fechas sean correctas',
    (nivel) => {
      expect(esVigente(rota('x', { nivel }), DENTRO)).toBe(false);
    },
  );

  it.each([['Bajo'], ['Moderado'], ['Alto'], ['Muy alto']])('con el nivel %s es vigente', (nivel) => {
    expect(esVigente(alerta('x', { nivel: nivel as NivelRiesgo }), DENTRO)).toBe(true);
  });

  it('sin ningún Departamento válido no es vigente', () => {
    for (const departamentos of [[], ['00'], ['26'], ['99', 'abc'], [21], [null], 'otro', undefined, null, {}]) {
      expect(esVigente(rota('x', { departamentos }), DENTRO), JSON.stringify(departamentos)).toBe(false);
    }
  });

  it('con al menos un Departamento válido entre otros inválidos sí es vigente', () => {
    expect(esVigente(rota('x', { departamentos: ['99', '21'] }), DENTRO)).toBe(true);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], ['2026-11-20T12:00:00Z'], [null], [undefined]])(
    'con un instante inválido (%s) no es vigente',
    (ahora) => {
      expect(esVigente(alerta('x'), ahora as number)).toBe(false);
    },
  );

  it('una alerta que no es un objeto no es vigente y no lanza', () => {
    for (const rara of [null, undefined, 5, 'x', [], true]) expect(esVigente(rara as unknown as AlertaRiesgo, DENTRO), String(rara)).toBe(false);
  });

  it('no modifica la alerta (congelada)', () => {
    expect(() => esVigente(congelar(alerta('c')), DENTRO)).not.toThrow();
  });
});

describe('alertasVigentes', () => {
  it('devuelve solo las vigentes, en el orden del dataset', () => {
    const d = dataset(
      alerta('futura', { vigencia: { inicio: '2027-01-01T00:00:00Z', fin: '2027-02-01T00:00:00Z' } }),
      alerta('b'),
      alerta('vencida', { vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' } }),
      alerta('a', { nivel: 'Bajo' }),
    );
    expect(ids(alertasVigentes(d, DENTRO))).toEqual(['b', 'a']);
  });

  it('incluye la alerta en el instante exacto de su fin y la excluye 1 ms después', () => {
    const d = dataset(alerta('a'));
    expect(ids(alertasVigentes(d, T_FIN))).toEqual(['a']);
    expect(ids(alertasVigentes(d, T_FIN + 1))).toEqual([]);
  });

  it('un mismo dataset ya cargado deja de mostrar la alerta al avanzar ahora, sin recargarlo (Propiedad 28)', () => {
    const d = congelar(dataset(alerta('a'), alerta('corta', { vigencia: { inicio: INICIO, fin: '2026-11-20T00:00:00Z' } })));
    expect(ids(alertasVigentes(d, Date.parse('2026-11-19T00:00:00Z')))).toEqual(['a', 'corta']);
    expect(ids(alertasVigentes(d, Date.parse('2026-11-20T00:00:01Z')))).toEqual(['a']);
  });

  it('excluye las alertas con fechas ilegibles, nivel no reconocido o sin Departamentos válidos', () => {
    const d = dataset(
      alerta('buena'),
      rota('fecha', { vigencia: { inicio: INICIO, fin: 'pronto' } }),
      rota('nivel', { nivel: 'Extremo' }),
      rota('sin-depto', { departamentos: ['99'] }),
      rota('sin-depto-2', { departamentos: [] }),
    );
    expect(ids(alertasVigentes(d, DENTRO))).toEqual(['buena']);
  });

  it('no quita identificadores repetidos: devuelve las dos alertas', () => {
    const d = dataset(alerta('igual'), alerta('igual', { nivel: 'Bajo' }));
    const r = alertasVigentes(d, DENTRO);
    expect(ids(r)).toEqual(['igual', 'igual']);
    expect(r.map((a) => a.nivel)).toEqual(['Alto', 'Bajo']);
  });

  it('devuelve una lista nueva con las mismas alertas, y no modifica el dataset (congelado)', () => {
    const a = alerta('a');
    const d = congelar(dataset(a));
    const r = alertasVigentes(d, DENTRO);
    expect(r).not.toBe(d.alertas);
    expect(r[0]).toBe(a);
    expect(d.alertas).toHaveLength(1);
  });

  it.each([[null], [undefined], [{}], [{ alertas: null }], [{ alertas: 'x' }], [{ alertas: {} }], [[]], ['x'], [5]])(
    'un dataset sin lista de alertas (%j) da una lista vacía y no lanza',
    (d) => {
      expect(alertasVigentes(d as unknown as DatasetAlertas, DENTRO)).toEqual([]);
    },
  );

  it('un dataset vacío da una lista vacía', () => {
    expect(alertasVigentes(dataset(), DENTRO)).toEqual([]);
  });

  it('con un instante inválido no hay alertas vigentes', () => {
    expect(alertasVigentes(dataset(alerta('a')), Number.NaN)).toEqual([]);
  });
});

describe('riesgoPorDepartamento: los 25 Departamentos (Requisitos 4.2, 4.5, 4.9, Propiedad 27)', () => {
  it('devuelve exactamente las 25 claves, una por cada código de CODIGOS_DEPARTAMENTO', () => {
    const r = riesgoPorDepartamento([], DENTRO);
    expect(Object.keys(r).sort()).toEqual([...CODIGOS_DEPARTAMENTO].sort());
    expect(Object.keys(r)).toHaveLength(25);
    // El orden de enumeración propio de un objeto no es el de la lista, pero iterar la lista da cada código en su orden.
    expect(CODIGOS_DEPARTAMENTO.map((codigo) => r[codigo] !== undefined)).toEqual(Array(25).fill(true));
    expect(CODIGOS_DEPARTAMENTO).toHaveLength(25);
  });

  it('sin alertas, todos tienen nivel null y ninguna alerta: no hay nivel por defecto', () => {
    const r = riesgoPorDepartamento([], DENTRO);
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      expect(r[codigo].nivel, codigo).toBeNull();
      expect(r[codigo].alertas, codigo).toEqual([]);
    }
  });

  it('un Departamento sin alertas vigentes sigue en null aunque otros tengan nivel, y nunca recibe "Bajo"', () => {
    const r = riesgoPorDepartamento([alerta('a', { departamentos: ['21'], nivel: 'Alto' })], DENTRO);
    expect(r['21'].nivel).toBe('Alto');
    for (const codigo of CODIGOS_DEPARTAMENTO.filter((c) => c !== '21')) {
      expect(r[codigo].nivel, codigo).toBeNull();
      expect(NIVELES_RIESGO as readonly unknown[]).not.toContain(r[codigo].nivel);
    }
  });

  it('el nivel es el máximo entre las alertas vigentes, para todas las combinaciones de niveles', () => {
    // Los 15 subconjuntos no vacíos de los 4 niveles, en cualquier orden de llegada.
    for (let mascara = 1; mascara < 16; mascara++) {
      const niveles = NIVELES_RIESGO.filter((_, i) => (mascara & (1 << i)) !== 0);
      const esperado = niveles[niveles.length - 1] as NivelRiesgo; // NIVELES_RIESGO va de menor a mayor
      for (const orden of [niveles, [...niveles].reverse()]) {
        const lista = orden.map((nivel, i) => alerta(`n${i}`, { nivel, departamentos: ['15'] }));
        expect(riesgoPorDepartamento(lista, DENTRO)['15'].nivel, orden.join(',')).toBe(esperado);
      }
    }
  });

  it('una alerta de varios Departamentos está en cada uno y cuenta para el máximo de cada uno (Requisito 4.16)', () => {
    const multi = alerta('multi', { nivel: 'Muy alto', departamentos: ['21', '08', '16'] });
    const baja = alerta('baja', { nivel: 'Bajo', departamentos: ['21'] });
    const r = riesgoPorDepartamento([baja, multi], DENTRO);
    expect(r['21'].nivel).toBe('Muy alto');
    expect(r['08'].nivel).toBe('Muy alto');
    expect(r['16'].nivel).toBe('Muy alto');
    expect(ids(r['21'].alertas)).toEqual(['baja', 'multi']);
    expect(ids(r['08'].alertas)).toEqual(['multi']);
    for (const codigo of CODIGOS_DEPARTAMENTO.filter((c) => !['21', '08', '16'].includes(c))) expect(r[codigo].alertas, codigo).toEqual([]);
  });

  it('una alerta que cubre los 25 Departamentos está en todos', () => {
    const todas = alerta('todas', { nivel: 'Moderado', departamentos: [...CODIGOS_DEPARTAMENTO] });
    const r = riesgoPorDepartamento([todas], DENTRO);
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      expect(r[codigo].nivel, codigo).toBe('Moderado');
      expect(ids(r[codigo].alertas), codigo).toEqual(['todas']);
    }
  });

  it('las alertas vencidas y las que aún no empezaron no cuentan, y el Departamento queda en null', () => {
    const vencida = alerta('v', { vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' }, nivel: 'Muy alto' });
    const futura = alerta('f', { vigencia: { inicio: '2027-01-01T00:00:00Z', fin: '2027-02-01T00:00:00Z' }, nivel: 'Muy alto' });
    const r = riesgoPorDepartamento([vencida, futura], DENTRO);
    expect(r['21'].nivel).toBeNull();
    expect(r['21'].alertas).toEqual([]);
  });

  it('una alerta vencida no sube el nivel del Departamento si hay otra vigente más baja', () => {
    const vencida = alerta('v', { vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' }, nivel: 'Muy alto' });
    const vigente = alerta('b', { nivel: 'Bajo' });
    expect(riesgoPorDepartamento([vencida, vigente], DENTRO)['21'].nivel).toBe('Bajo');
  });

  it('el nivel cambia al avanzar ahora sin cambiar los datos: la alerta alta vence y queda la baja', () => {
    const alta = alerta('alta', { nivel: 'Muy alto', vigencia: { inicio: INICIO, fin: '2026-11-20T00:00:00Z' } });
    const baja = alerta('baja', { nivel: 'Bajo' });
    const lista = congelar([alta, baja]);
    expect(riesgoPorDepartamento(lista, Date.parse('2026-11-19T00:00:00Z'))['21'].nivel).toBe('Muy alto');
    expect(riesgoPorDepartamento(lista, Date.parse('2026-11-21T00:00:00Z'))['21'].nivel).toBe('Bajo');
  });

  it('los límites de vigencia son inclusivos también aquí', () => {
    const a = alerta('a', { nivel: 'Alto' });
    expect(riesgoPorDepartamento([a], T_INICIO)['21'].nivel).toBe('Alto');
    expect(riesgoPorDepartamento([a], T_INICIO - 1)['21'].nivel).toBeNull();
    expect(riesgoPorDepartamento([a], T_FIN)['21'].nivel).toBe('Alto');
    expect(riesgoPorDepartamento([a], T_FIN + 1)['21'].nivel).toBeNull();
  });

  it('ignora los códigos que no son de los 25 y cuenta una sola vez un código repetido en la misma alerta', () => {
    const a = rota('a', { departamentos: ['21', '21', '99', 'x', 5, '21'] });
    const r = riesgoPorDepartamento([a], DENTRO);
    expect(ids(r['21'].alertas)).toEqual(['a']);
    expect(Object.keys(r)).toHaveLength(25);
    expect(Object.keys(r)).not.toContain('99');
  });

  it('una alerta con nivel no reconocido, fechas ilegibles o sin Departamentos válidos no aporta nivel a nadie', () => {
    const r = riesgoPorDepartamento([rota('n', { nivel: 'Extremo' }), rota('f', { vigencia: { inicio: 'x', fin: 'y' } }), rota('d', { departamentos: ['99'] })], DENTRO);
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      expect(r[codigo].nivel, codigo).toBeNull();
      expect(r[codigo].alertas, codigo).toEqual([]);
    }
  });

  it('conserva las alertas en el orden recibido y no quita identificadores repetidos', () => {
    const r = riesgoPorDepartamento([alerta('z'), alerta('a', { nivel: 'Bajo' }), alerta('z', { nivel: 'Moderado' })], DENTRO);
    expect(r['21'].alertas.map((a) => `${a.id}:${a.nivel}`)).toEqual(['z:Alto', 'a:Bajo', 'z:Moderado']);
    expect(r['21'].nivel).toBe('Alto');
  });

  it('el nivel que devuelve es siempre uno de NIVELES_RIESGO o null', () => {
    const r = riesgoPorDepartamento(NIVELES_RIESGO.map((nivel, i) => alerta(`n${i}`, { nivel, departamentos: [CODIGOS_DEPARTAMENTO[i] as CodigoDepartamento] })), DENTRO);
    for (const codigo of CODIGOS_DEPARTAMENTO) expect(r[codigo].nivel === null || (NIVELES_RIESGO as readonly string[]).includes(r[codigo].nivel as string), codigo).toBe(true);
  });

  it('no modifica la lista de alertas (congelada) y no lanza con una entrada que no es lista', () => {
    expect(() => riesgoPorDepartamento(congelar([alerta('a')]), DENTRO)).not.toThrow();
    for (const rara of [null, undefined, {}, 'x', 5]) {
      const r = riesgoPorDepartamento(rara as unknown as AlertaRiesgo[], DENTRO);
      expect(Object.keys(r)).toHaveLength(25);
      expect(r['21'].nivel).toBeNull();
    }
  });

  it('con un instante inválido todos quedan en null', () => {
    const r = riesgoPorDepartamento([alerta('a')], Number.NaN);
    for (const codigo of CODIGOS_DEPARTAMENTO) expect(r[codigo].nivel, codigo).toBeNull();
  });

  it('es determinista', () => {
    const lista = [alerta('a'), alerta('b', { departamentos: ['08', '21'], nivel: 'Bajo' })];
    expect(riesgoPorDepartamento(lista, DENTRO)).toEqual(riesgoPorDepartamento(lista, DENTRO));
  });
});

describe('detalleDepartamento: orden por nivel y actualización (Requisitos 4.8, 4.9, 4.20, Propiedad 32)', () => {
  it('ordena por nivel de mayor a menor', () => {
    const lista = [alerta('bajo', { nivel: 'Bajo' }), alerta('muy', { nivel: 'Muy alto' }), alerta('mod', { nivel: 'Moderado' }), alerta('alto', { nivel: 'Alto' })];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['muy', 'alto', 'mod', 'bajo']);
  });

  it('a igual nivel, ordena por actualizadoEn de la más reciente a la más antigua', () => {
    const lista = [
      alerta('vieja', { actualizadoEn: '2026-11-16T09:00:00Z' }),
      alerta('nueva', { actualizadoEn: '2026-11-16T12:00:00Z' }),
      alerta('media', { actualizadoEn: '2026-11-16T10:30:00Z' }),
    ];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['nueva', 'media', 'vieja']);
  });

  it('el nivel manda sobre la fecha: un nivel mayor va antes aunque se actualizó antes', () => {
    const lista = [alerta('alto-nuevo', { nivel: 'Alto', actualizadoEn: '2026-11-18T00:00:00Z' }), alerta('muy-viejo', { nivel: 'Muy alto', actualizadoEn: '2026-11-01T00:00:00Z' })];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['muy-viejo', 'alto-nuevo']);
  });

  it('usa actualizadoEn y no publicadoEn', () => {
    const lista = [
      alerta('a', { publicadoEn: '2026-11-15T00:00:00Z', actualizadoEn: '2026-11-16T09:00:00Z' }),
      alerta('b', { publicadoEn: '2026-11-15T20:00:00Z', actualizadoEn: '2026-11-16T08:00:00Z' }),
    ];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['a', 'b']); // por publicación sería ['b', 'a']
  });

  it('compara los milisegundos como números: 12:00:00.500 es posterior a 12:00:00', () => {
    const lista = [alerta('entero', { actualizadoEn: '2026-11-16T12:00:00Z' }), alerta('medio', { actualizadoEn: '2026-11-16T12:00:00.500Z' })];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['medio', 'entero']);
  });

  it('en un empate exacto de nivel y fecha, ordena por id ascendente, sin importar el orden de llegada', () => {
    const a = alerta('a');
    const b = alerta('b');
    const c = alerta('c');
    for (const orden of [[a, b, c], [c, b, a], [b, c, a], [b, a, c]]) expect(ids(detalleDepartamento('21', orden, DENTRO))).toEqual(['a', 'b', 'c']);
  });

  it('una fecha de actualización ilegible va al final de su nivel, y el nivel sigue mandando', () => {
    const lista = [
      rota('sin-fecha', { actualizadoEn: 'ayer' }),
      alerta('con-fecha', { actualizadoEn: '2020-01-01T00:00:00Z' }),
      alerta('muy-alto', { nivel: 'Muy alto', actualizadoEn: '2026-11-16T09:00:00Z' }),
      rota('muy-alto-sin-fecha', { nivel: 'Muy alto', actualizadoEn: null }),
    ];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['muy-alto', 'muy-alto-sin-fecha', 'con-fecha', 'sin-fecha']);
  });

  it('incluye solo las alertas vigentes que cubren el Departamento', () => {
    const lista = [
      alerta('aqui'),
      alerta('otro', { departamentos: ['08'] }),
      alerta('vencida', { vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' } }),
      alerta('futura', { vigencia: { inicio: '2027-01-01T00:00:00Z', fin: '2027-02-01T00:00:00Z' } }),
    ];
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['aqui']);
    expect(ids(detalleDepartamento('08', lista, DENTRO))).toEqual(['otro']);
  });

  it('una alerta de varios Departamentos aparece en el detalle de cada uno y en ningún otro (Requisito 4.16, Propiedad 29)', () => {
    const multi = alerta('multi', { departamentos: ['21', '08', '16'], nivel: 'Alto' });
    const lista = [multi, alerta('solo-20', { departamentos: ['20'] })];
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      const detalle = ids(detalleDepartamento(codigo, lista, DENTRO));
      expect(detalle.includes('multi'), codigo).toBe(['21', '08', '16'].includes(codigo));
    }
  });

  it('sin alertas vigentes devuelve una lista vacía (la vista muestra "Sin información disponible")', () => {
    expect(detalleDepartamento('21', [], DENTRO)).toEqual([]);
    expect(detalleDepartamento('21', [alerta('a', { departamentos: ['08'] })], DENTRO)).toEqual([]);
    expect(detalleDepartamento('21', [alerta('a')], T_FIN + 1)).toEqual([]);
  });

  it.each([[''], ['1'], ['00'], ['26'], ['99'], ['abc'], [' 21'], ['21 ']])('el código %j no es uno de los 25: lista vacía', (codigo) => {
    expect(detalleDepartamento(codigo, [alerta('a', { departamentos: ['21'] })], DENTRO)).toEqual([]);
  });

  it('un código que no es texto da una lista vacía', () => {
    for (const codigo of [21, null, undefined, {}, ['21']]) expect(detalleDepartamento(codigo as unknown as string, [alerta('a')], DENTRO)).toEqual([]);
  });

  it('no quita identificadores repetidos', () => {
    expect(ids(detalleDepartamento('21', [alerta('x'), alerta('x', { nivel: 'Bajo' })], DENTRO))).toEqual(['x', 'x']);
  });

  it('devuelve una lista nueva y no modifica la recibida (congelada) ni su orden', () => {
    const lista = congelar([alerta('b', { nivel: 'Bajo' }), alerta('a', { nivel: 'Alto' })]);
    const r = detalleDepartamento('21', lista, DENTRO);
    expect(ids(r)).toEqual(['a', 'b']);
    expect(ids(lista)).toEqual(['b', 'a']);
    expect(r).not.toBe(lista);
  });

  it('con un instante inválido o una lista que no es lista, devuelve una lista vacía', () => {
    expect(detalleDepartamento('21', [alerta('a')], Number.NaN)).toEqual([]);
    for (const rara of [null, undefined, {}, 'x']) expect(detalleDepartamento('21', rara as unknown as AlertaRiesgo[], DENTRO)).toEqual([]);
  });

  it('coincide con riesgoPorDepartamento: mismas alertas y nivel máximo igual al de la primera del detalle', () => {
    const lista = [
      alerta('a', { nivel: 'Bajo', departamentos: ['21', '08'] }),
      alerta('b', { nivel: 'Muy alto', departamentos: ['08'] }),
      alerta('c', { nivel: 'Moderado', departamentos: ['21'] }),
    ];
    const riesgo = riesgoPorDepartamento(lista, DENTRO);
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      const detalle = detalleDepartamento(codigo, lista, DENTRO);
      expect(ids(detalle).sort(), codigo).toEqual(ids(riesgo[codigo].alertas).sort());
      expect(detalle[0]?.nivel ?? null, codigo).toBe(riesgo[codigo].nivel);
    }
  });
});

describe('sortAlerts: orden de la Página 101 (Requisito 2.2, Propiedad 18)', () => {
  it('ordena por nivel de mayor a menor', () => {
    const lista = [alerta('bajo', { nivel: 'Bajo' }), alerta('muy', { nivel: 'Muy alto' }), alerta('mod', { nivel: 'Moderado' }), alerta('alto', { nivel: 'Alto' })];
    expect(ids(sortAlerts(lista))).toEqual(['muy', 'alto', 'mod', 'bajo']);
  });

  it('a igual nivel, ordena por publicadoEn de la más reciente a la más antigua', () => {
    const lista = [
      alerta('vieja', { publicadoEn: '2026-11-14T10:00:00Z' }),
      alerta('nueva', { publicadoEn: '2026-11-16T10:00:00Z' }),
      alerta('media', { publicadoEn: '2026-11-15T10:00:00Z' }),
    ];
    expect(ids(sortAlerts(lista))).toEqual(['nueva', 'media', 'vieja']);
  });

  it('usa publicadoEn y no actualizadoEn, a diferencia del detalle del Departamento', () => {
    const lista = [
      alerta('a', { publicadoEn: '2026-11-15T00:00:00Z', actualizadoEn: '2026-11-16T09:00:00Z' }),
      alerta('b', { publicadoEn: '2026-11-15T20:00:00Z', actualizadoEn: '2026-11-16T08:00:00Z' }),
    ];
    expect(ids(sortAlerts(lista))).toEqual(['b', 'a']);
    expect(ids(detalleDepartamento('21', lista, DENTRO))).toEqual(['a', 'b']);
  });

  it('compara los milisegundos como números', () => {
    const lista = [alerta('entero', { publicadoEn: '2026-11-15T12:00:00Z' }), alerta('medio', { publicadoEn: '2026-11-15T12:00:00.250Z' })];
    expect(ids(sortAlerts(lista))).toEqual(['medio', 'entero']);
  });

  it('es una permutación de la lista: mismos elementos, sin quitar, añadir ni duplicar', () => {
    const lista = [alerta('c', { nivel: 'Bajo' }), alerta('a'), alerta('b', { nivel: 'Muy alto' }), alerta('d', { nivel: 'Moderado' })];
    const r = sortAlerts(lista);
    expect(r).toHaveLength(lista.length);
    expect(ids(r).sort()).toEqual(ids(lista).sort());
    for (const a of lista) expect(r).toContain(a);
  });

  it('no filtra por vigencia: conserva las vencidas', () => {
    const vencida = alerta('vencida', { vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' } });
    expect(ids(sortAlerts([vencida, alerta('a', { nivel: 'Bajo' })]))).toEqual(['vencida', 'a']);
  });

  it('en un empate exacto ordena por id ascendente, y el resultado no depende del orden de entrada (las 24 permutaciones)', () => {
    const base = [alerta('a'), alerta('b'), alerta('c'), alerta('d')];
    const permutaciones = (lista: AlertaRiesgo[]): AlertaRiesgo[][] =>
      lista.length <= 1 ? [lista] : lista.flatMap((x, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [x, ...resto]));
    const todas = permutaciones(base);
    expect(todas).toHaveLength(24);
    for (const orden of todas) expect(ids(sortAlerts(orden))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('una fecha de publicación ilegible y un nivel no reconocido van al final', () => {
    const lista = [
      rota('nivel-raro', { nivel: 'Extremo' }),
      rota('sin-fecha', { publicadoEn: 'ayer' }),
      alerta('bien', { publicadoEn: '2020-01-01T00:00:00Z' }),
      alerta('muy-alto', { nivel: 'Muy alto' }),
    ];
    expect(ids(sortAlerts(lista))).toEqual(['muy-alto', 'bien', 'sin-fecha', 'nivel-raro']);
  });

  it('devuelve una copia y no modifica la lista recibida (congelada)', () => {
    const lista = congelar([alerta('b', { nivel: 'Bajo' }), alerta('a', { nivel: 'Alto' })]);
    const r = sortAlerts(lista);
    expect(ids(r)).toEqual(['a', 'b']);
    expect(ids(lista)).toEqual(['b', 'a']);
    expect(r).not.toBe(lista);
  });

  it('una lista vacía, o algo que no es lista, da una lista vacía', () => {
    expect(sortAlerts([])).toEqual([]);
    for (const rara of [null, undefined, {}, 'x', 5]) expect(sortAlerts(rara as unknown as AlertaRiesgo[])).toEqual([]);
  });

  it('con un solo elemento lo devuelve igual', () => {
    const a = alerta('a');
    expect(sortAlerts([a])).toEqual([a]);
  });

  it('es estable con identificadores repetidos y es determinista', () => {
    const lista = [alerta('x', { nivel: 'Bajo' }), alerta('x', { nivel: 'Bajo', titulo: 'segunda' })];
    expect(sortAlerts(lista).map((a) => a.titulo)).toEqual(['Alerta x', 'segunda']);
    expect(sortAlerts(lista)).toEqual(sortAlerts(lista));
  });
});

describe('mergeSources: fusión de SENAMHI e INDECI (Requisito 2.7, Propiedad 18)', () => {
  const s1 = alerta('s1', { fuente: 'SENAMHI' });
  const s2 = alerta('s2', { fuente: 'SENAMHI' });
  const i1 = alerta('i1', { fuente: 'INDECI' });
  const i2 = alerta('i2', { fuente: 'INDECI' });

  it('con las dos disponibles, combina SENAMHI primero e INDECI después y no nombra ninguna fuente', () => {
    const r = mergeSources([s1, s2], [i1, i2]);
    expect(ids(r.alertas)).toEqual(['s1', 's2', 'i1', 'i2']);
    expect(r.fuentesNoDisponibles).toEqual([]);
  });

  it.each([[null], [undefined]])('con SENAMHI no disponible (%s), muestra las de INDECI y nombra a SENAMHI', (ausente) => {
    const r = mergeSources(ausente, [i1, i2]);
    expect(ids(r.alertas)).toEqual(['i1', 'i2']);
    expect(r.fuentesNoDisponibles).toEqual(['SENAMHI']);
  });

  it.each([[null], [undefined]])('con INDECI no disponible (%s), muestra las de SENAMHI y nombra a INDECI', (ausente) => {
    const r = mergeSources([s1, s2], ausente);
    expect(ids(r.alertas)).toEqual(['s1', 's2']);
    expect(r.fuentesNoDisponibles).toEqual(['INDECI']);
  });

  it('con las dos no disponibles, no hay alertas y se nombran las dos, SENAMHI primero', () => {
    for (const [a, b] of [[null, null], [undefined, undefined], [null, undefined], [undefined, null]] as const) {
      const r = mergeSources(a, b);
      expect(r.alertas).toEqual([]);
      expect(r.fuentesNoDisponibles).toEqual(['SENAMHI', 'INDECI']);
    }
  });

  it('una lista vacía significa "disponible sin alertas": no se nombra la fuente', () => {
    const solo = mergeSources([], [i1]);
    expect(ids(solo.alertas)).toEqual(['i1']);
    expect(solo.fuentesNoDisponibles).toEqual([]);
    const ninguna = mergeSources([], []);
    expect(ninguna).toEqual({ alertas: [], fuentesNoDisponibles: [] });
  });

  it('cubre las 9 combinaciones de disponibilidad (no disponible, vacía o con alertas) con un resultado coherente', () => {
    const estadosS: [string, AlertaRiesgo[] | null][] = [['no disponible', null], ['vacía', []], ['con alertas', [s1]]];
    const estadosI: [string, AlertaRiesgo[] | null][] = [['no disponible', null], ['vacía', []], ['con alertas', [i1]]];
    let combinaciones = 0;
    for (const [nombreS, listaS] of estadosS) {
      for (const [nombreI, listaI] of estadosI) {
        combinaciones++;
        const r = mergeSources(listaS, listaI);
        const noDisponibles = [...(listaS === null ? ['SENAMHI'] : []), ...(listaI === null ? ['INDECI'] : [])];
        const esperadas = [...(listaS?.length ? ['s1'] : []), ...(listaI?.length ? ['i1'] : [])];
        expect(r.fuentesNoDisponibles, `${nombreS} / ${nombreI}`).toEqual(noDisponibles);
        expect(ids(r.alertas), `${nombreS} / ${nombreI}`).toEqual(esperadas);
      }
    }
    expect(combinaciones).toBe(9);
  });
  it('descarta las alertas cuya fuente no corresponde a la lista en la que vienen', () => {
    const r = mergeSources([s1, i1], [i2, s2]);
    expect(ids(r.alertas)).toEqual(['s1', 'i2']);
    expect(r.fuentesNoDisponibles).toEqual([]);
  });

  it('una lista disponible que solo trae alertas de la otra fuente queda vacía, y la fuente no se nombra como no disponible', () => {
    const r = mergeSources([i1], [i2]);
    expect(ids(r.alertas)).toEqual(['i2']);
    expect(r.fuentesNoDisponibles).toEqual([]);
  });

  it('descarta las alertas con una fuente que no es SENAMHI ni INDECI', () => {
    const r = mergeSources([rota('x', { fuente: 'MIDAGRI' }), rota('y', { fuente: undefined }), s1], [rota('z', { fuente: 'senamhi' })]);
    expect(ids(r.alertas)).toEqual(['s1']);
  });

  it('elimina identificadores repetidos conservando la primera aparición, también entre fuentes', () => {
    const primera = alerta('dup', { fuente: 'SENAMHI', titulo: 'primera' });
    const entreFuentes = alerta('dup', { fuente: 'INDECI', titulo: 'segunda' });
    const r = mergeSources([primera, s1], [entreFuentes, i1]);
    expect(ids(r.alertas)).toEqual(['dup', 's1', 'i1']);
    expect(r.alertas[0]?.titulo).toBe('primera');
    expect(r.alertas[0]?.fuente).toBe('SENAMHI');
  });

  it('elimina identificadores repetidos dentro de la misma lista', () => {
    const a = alerta('dup', { fuente: 'SENAMHI', titulo: 'a' });
    const b = alerta('dup', { fuente: 'SENAMHI', titulo: 'b' });
    expect(mergeSources([a, b], []).alertas.map((x) => x.titulo)).toEqual(['a']);
  });

  it('un identificador repetido de una alerta descartada por su fuente no bloquea a la válida', () => {
    const mala = alerta('dup', { fuente: 'INDECI' }); // viene en la lista de SENAMHI: se descarta
    const buena = alerta('dup', { fuente: 'INDECI', titulo: 'buena' });
    const r = mergeSources([mala], [buena]);
    expect(r.alertas.map((x) => x.titulo)).toEqual(['buena']);
  });

  it('las alertas cuyo id no es un texto no se pueden comparar y se conservan todas', () => {
    const a = rota('a', { id: undefined, fuente: 'SENAMHI' });
    const b = rota('b', { id: undefined, fuente: 'SENAMHI' });
    const c = rota('c', { id: 5, fuente: 'SENAMHI' });
    expect(mergeSources([a, b, c], []).alertas).toHaveLength(3);
  });

  it('no filtra por vigencia ni ordena: conserva las vencidas y el orden de entrada', () => {
    const vencida = alerta('vencida', { fuente: 'SENAMHI', vigencia: { inicio: '2026-01-01T00:00:00Z', fin: '2026-02-01T00:00:00Z' }, nivel: 'Bajo' });
    const alta = alerta('alta', { fuente: 'SENAMHI', nivel: 'Muy alto' });
    expect(ids(mergeSources([vencida, alta], []).alertas)).toEqual(['vencida', 'alta']);
  });

  it('un valor que no es lista cuenta como no disponible, y los elementos que no son alertas se saltan', () => {
    for (const raro of [{}, 'x', 5, true]) {
      const r = mergeSources(raro as unknown as AlertaRiesgo[], [i1]);
      expect(r.fuentesNoDisponibles, String(raro)).toEqual(['SENAMHI']);
      expect(ids(r.alertas)).toEqual(['i1']);
    }
    const r = mergeSources([null, undefined, 5, 'x', [], s1] as unknown as AlertaRiesgo[], []);
    expect(ids(r.alertas)).toEqual(['s1']);
  });

  it('no modifica las listas recibidas (congeladas) y devuelve listas nuevas', () => {
    const listaS = congelar([s1, s2]);
    const listaI = congelar([i1]);
    const r = mergeSources(listaS, listaI);
    expect(r.alertas).not.toBe(listaS);
    expect(listaS).toHaveLength(2);
    expect(listaI).toHaveLength(1);
    expect(r.alertas[0]).toBe(s1);
  });

  it('es determinista', () => {
    expect(mergeSources([s1, s2], [i1])).toEqual(mergeSources([s1, s2], [i1]));
  });
});

describe('Consistencia entre las Páginas 101 y 400 con los datos reales (Requisitos 2.8, 4.13, Propiedad 30)', () => {
  const real = JSON.parse(readFileSync(new URL('../../../data/prueba/alertas.json', import.meta.url), 'utf8')) as DatasetAlertas;
  const t = (iso: string): number => Date.parse(iso);

  /** Las dos vistas con el mismo instante: la lista de la 101 y los detalles de los 25 Departamentos de la 400. */
  function vistas(ahora: number) {
    const pagina101 = sortAlerts(alertasVigentes(real, ahora));
    const lista = real.alertas;
    const detalles = Object.fromEntries(CODIGOS_DEPARTAMENTO.map((codigo) => [codigo, detalleDepartamento(codigo, lista, ahora)])) as Record<CodigoDepartamento, AlertaRiesgo[]>;
    const riesgo = riesgoPorDepartamento(lista, ahora);
    return { pagina101, detalles, riesgo };
  }

  it('el archivo de prueba trae las 4 alertas esperadas', () => {
    expect(ids(real.alertas)).toEqual(['prueba-alerta-001', 'prueba-alerta-002', 'prueba-alerta-003', 'prueba-alerta-004']);
  });

  it('con ahora a mitad de la vigencia, la Página 101 ordena por nivel y publicación', () => {
    const { pagina101 } = vistas(t('2026-11-16T12:00:00Z'));
    expect(ids(pagina101)).toEqual(['prueba-alerta-003', 'prueba-alerta-001', 'prueba-alerta-002', 'prueba-alerta-004']); // Muy alto, Alto, Moderado, Bajo
  });

  it('con ahora a mitad de la vigencia, el mapa tiene 5 Departamentos con nivel y 20 sin él', () => {
    const { riesgo } = vistas(t('2026-11-16T12:00:00Z'));
    const esperado: Partial<Record<CodigoDepartamento, NivelRiesgo>> = { '21': 'Alto', '08': 'Alto', '16': 'Moderado', '20': 'Muy alto', '04': 'Bajo' };
    for (const codigo of CODIGOS_DEPARTAMENTO) expect(riesgo[codigo].nivel, codigo).toBe(esperado[codigo] ?? null);
    expect(CODIGOS_DEPARTAMENTO.filter((c) => riesgo[c].nivel === null)).toHaveLength(20);
  });

  it('el detalle de Puno (21) lista sus dos alertas ordenadas por nivel: Alto y luego Bajo', () => {
    const { detalles } = vistas(t('2026-11-16T12:00:00Z'));
    expect(ids(detalles['21'])).toEqual(['prueba-alerta-001', 'prueba-alerta-004']);
    expect(ids(detalles['08'])).toEqual(['prueba-alerta-001']);
    expect(ids(detalles['16'])).toEqual(['prueba-alerta-002']);
    expect(ids(detalles['20'])).toEqual(['prueba-alerta-003']);
    expect(ids(detalles['04'])).toEqual(['prueba-alerta-004']);
    expect(detalles['15']).toEqual([]);
  });

  it.each([
    ['antes del inicio', t('2026-11-16T04:59:59Z')],
    ['en el instante de inicio', t('2026-11-16T05:00:00Z')],
    ['a mitad de la vigencia', t('2026-11-16T12:00:00Z')],
    ['en el fin de las alertas de 30 días', t('2026-12-16T04:59:59Z')],
    ['1 ms después de ese fin', t('2026-12-16T04:59:59.001Z')],
    ['después de ese fin', t('2026-12-16T05:00:00Z')],
    ['en el fin de la alerta 003', t('2026-12-21T04:59:59Z')],
    ['después de la alerta 003', t('2026-12-21T05:00:00Z')],
    ['en el fin de la alerta 002', t('2027-01-01T04:59:59Z')],
    ['después de todas', t('2027-01-01T05:00:00Z')],
  ])('%s: la Página 101 y la Página 400 muestran las mismas alertas, con el mismo nivel, vigencia y Departamentos', (_etiqueta, ahora) => {
    const { pagina101, detalles, riesgo } = vistas(ahora);
    const ids101 = new Set(ids(pagina101));
    // La unión de los detalles de los 25 Departamentos es el conjunto de la Página 101, por id.
    const ids400 = new Set(CODIGOS_DEPARTAMENTO.flatMap((codigo) => ids(detalles[codigo])));
    expect(ids400).toEqual(ids101);
    for (const alertaDe101 of pagina101) {
      // Cada alerta está exactamente en los Departamentos que declara, y en la 400 es la misma alerta (mismo objeto, mismo nivel y vigencia).
      const enDetalles = CODIGOS_DEPARTAMENTO.filter((codigo) => ids(detalles[codigo]).includes(alertaDe101.id));
      expect(enDetalles.sort(), alertaDe101.id).toEqual([...alertaDe101.departamentos].sort());
      for (const codigo of enDetalles) {
        const enMapa = detalles[codigo].find((a) => a.id === alertaDe101.id);
        expect(enMapa, alertaDe101.id).toBe(alertaDe101);
        expect(enMapa?.nivel).toBe(alertaDe101.nivel);
        expect(enMapa?.vigencia).toEqual(alertaDe101.vigencia);
      }
    }
    // El nivel de cada Departamento es el máximo de sus alertas vigentes, o null si no tiene.
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      const rangos = detalles[codigo].map((a) => NIVELES_RIESGO.indexOf(a.nivel));
      expect(riesgo[codigo].nivel, codigo).toBe(rangos.length === 0 ? null : NIVELES_RIESGO[Math.max(...rangos)]);
      expect(riesgo[codigo].alertas, codigo).toHaveLength(detalles[codigo].length);
    }
  });

  it('al vencer las alertas de 30 días, Puno, Cusco y Arequipa vuelven a "sin información" y siguen Loreto y Piura', () => {
    const { riesgo } = vistas(t('2026-12-16T05:00:00Z'));
    expect(riesgo['21'].nivel).toBeNull();
    expect(riesgo['08'].nivel).toBeNull();
    expect(riesgo['04'].nivel).toBeNull();
    expect(riesgo['16'].nivel).toBe('Moderado');
    expect(riesgo['20'].nivel).toBe('Muy alto');
  });

  it('antes del inicio y después de todas las vigencias no queda ninguna alerta ni nivel en el mapa', () => {
    for (const ahora of [t('2026-11-16T04:59:59Z'), t('2027-01-01T05:00:00Z')]) {
      const { pagina101, riesgo } = vistas(ahora);
      expect(pagina101).toEqual([]);
      for (const codigo of CODIGOS_DEPARTAMENTO) expect(riesgo[codigo].nivel, codigo).toBeNull();
    }
  });

  it('separar el dataset por fuente y volver a combinarlo conserva todas las alertas', () => {
    const senamhi = real.alertas.filter((a) => a.fuente === 'SENAMHI');
    const indeci = real.alertas.filter((a) => a.fuente === 'INDECI');
    const r = mergeSources(senamhi, indeci);
    expect(r.fuentesNoDisponibles).toEqual([]);
    expect(ids(r.alertas)).toEqual(['prueba-alerta-001', 'prueba-alerta-004', 'prueba-alerta-002', 'prueba-alerta-003']);
    expect(new Set(ids(r.alertas))).toEqual(new Set(ids(real.alertas)));
    // Con INDECI no disponible, solo quedan las de SENAMHI y se nombra INDECI.
    const parcial = mergeSources(senamhi, null);
    expect(ids(parcial.alertas)).toEqual(['prueba-alerta-001', 'prueba-alerta-004']);
    expect(parcial.fuentesNoDisponibles).toEqual(['INDECI']);
  });

  it('los datos reales siguen siendo de prueba y las alertas conservan su marca', () => {
    expect(real.esDatoDePrueba).toBe(true);
    for (const a of alertasVigentes(real, t('2026-11-16T12:00:00Z'))) expect(a.esDatoDePrueba).toBe(true);
  });
});

describe('Lógica pura, sin reloj ni API del navegador', () => {
  it('ninguna función consulta Date.now', () => {
    const espia = vi.spyOn(Date, 'now');
    const lista = [alerta('a'), alerta('b', { fuente: 'INDECI', departamentos: ['08', '21'] })];
    esVigente(lista[0] as AlertaRiesgo, DENTRO);
    alertasVigentes(dataset(...lista), DENTRO);
    riesgoPorDepartamento(lista, DENTRO);
    detalleDepartamento('21', lista, DENTRO);
    sortAlerts(lista);
    mergeSources(lista, lista);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('alertas.ts no usa window, document, location, temporizadores ni el reloj, y solo importa del modelo y de format/dates', () => {
    const fuente = readFileSync(new URL('./alertas.ts', import.meta.url), 'utf8');
    const codigo = fuente
      .split('\n')
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    expect(codigo).not.toMatch(/\bwindow\b|\bdocument\b|\blocation\b|\bglobalThis\b|\bnavigator\b|setTimeout|setInterval|requestAnimationFrame|Date\b|performance\b|fetch\(|localStorage|sessionStorage/);
    const importaciones = [...fuente.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(importaciones).toEqual(['@teletexto/modelo', '../format/dates.ts']);
  });
});
