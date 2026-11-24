import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as api from './index.ts';
import { registrarVerificacion, type ResultadoVerificacion } from './registro.ts';
import { MAX_CARACTERES_AVISO, MAX_CARACTERES_RESUMEN, PLAZO_VERIFICACION_MS, verificar, type AvisoVerificable } from './verificar.ts';
// Tarea 10.1. Requisitos 11.3, 12.1, 12.2, 12.3, 12.4, 12.8 y 12.9. Pruebas unitarias de `verificar`.

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
/** Reloj fijo: el tiempo no avanza. */
const FIJO = { ahora: () => T0 };

const rec = (clave: string, ...frases: string[]) => ({ clave, frases });
const aviso = (textoOriginal: string, ...recomendaciones: { clave: string; frases: string[] }[]): AvisoVerificable => ({ textoOriginal, recomendaciones });
const ver = (a: AvisoVerificable, resumen: string): ResultadoVerificacion => verificar(a, resumen, FIJO);
const motivoDe = (r: ResultadoVerificacion): string => ('motivo' in r ? r.motivo : '');

/** Reloj que avanza `paso` milisegundos en cada lectura. */
function relojConPaso(paso: number): () => number {
  let t = 0;
  return () => {
    const v = t;
    t += paso;
    return v;
  };
}
/** Reloj que da 0 en la primera lectura y `despues` en todas las siguientes. */
function relojConSalto(despues: number): () => number {
  let lecturas = 0;
  return () => (lecturas++ === 0 ? 0 : despues);
}

const datos = JSON.parse(readFileSync(new URL('../../data/prueba/alertas.json', import.meta.url), 'utf8')) as {
  alertas: { id: string; aviso: AvisoVerificable }[];
};
const [A1, A2, A3, A4] = datos.alertas.map((a) => a.aviso) as [AvisoVerificable, AvisoVerificable, AvisoVerificable, AvisoVerificable];

const R1 = 'Alerta naranja por helada en Puno y Cusco, del 16 de noviembre al 15 de diciembre. Abrigue a los niños y proteja los cultivos.';
const R2 = 'Alerta amarilla por lluvia intensa en Loreto hasta el 31 de diciembre. Manténgase informado por los canales oficiales.';
const R3 =
  'Alerta roja por inundación en Piura hasta el 20 de diciembre. Aléjese de los ríos, prepare una mochila de emergencia y siga las indicaciones de las autoridades.';
const R4 = 'Alerta verde por vientos fuertes en Puno y Arequipa del 16 de noviembre al 15 de diciembre. Asegure los objetos livianos.';

describe('Avisos reales de data/prueba con resúmenes fieles', () => {
  it.each([
    ['prueba-alerta-001', A1, R1],
    ['prueba-alerta-002', A2, R2],
    ['prueba-alerta-003', A3, R3],
    ['prueba-alerta-004', A4, R4],
  ])('aprueba el resumen de %s', (_id, a, resumen) => {
    expect(ver(a, resumen)).toEqual({ estado: 'aprobado' });
  });
  it('aprueba el resumen con otras frases aceptadas de la recomendación', () => {
    expect(ver(A1, 'Alerta naranja en Puno y Cusco. Abriga a los niños y proteger los cultivos.')).toEqual({ estado: 'aprobado' });
    expect(ver(A3, 'Alerta roja en Piura. Alejarse de los ríos, mochila de emergencia e indicaciones de las autoridades.')).toEqual({ estado: 'aprobado' });
  });
  it('aprueba un resumen que omite datos del aviso: puede ser un subconjunto', () => {
    expect(ver(A1, 'Helada en Puno. Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
    expect(ver(A1, 'Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('la prueba tiene cuatro avisos con recomendaciones declaradas', () => {
    expect(datos.alertas).toHaveLength(4);
    for (const a of datos.alertas) expect(a.aviso.recomendaciones.length, a.id).toBeGreaterThanOrEqual(1);
  });
});

describe('Datos críticos añadidos (Requisitos 11.3 y 12.2)', () => {
  it.each([
    ['cifra', `${R1} Se esperan 15 mm de lluvia.`, /^añadido:cifra "15 mm"/],
    ['cifra en palabras', `${R1} Duran dos días.`, /^añadido:cifra "dos día"/],
    ['fecha', `${R1} Será hasta el 3 de enero.`, /^añadido:fecha "--01-03"/],
    ['fecha relativa', `${R1} Empieza mañana.`, /^añadido:fecha "relativa:mañana"/],
    ['hora', `${R1} A las 7:30.`, /^añadido:hora "07:30"/],
    ['lugar', 'Alerta naranja por helada en Puno, Cusco y Arequipa. Abrigue a los niños y proteja los cultivos.', /^añadido:lugar "arequipa"/],
    ['nivel (color)', 'Alerta roja por helada en Puno. Abrigue a los niños y proteja los cultivos.', /^añadido:nivel "color:rojo"/],
    ['nivel (normalizado)', 'Alerta de nivel alto por helada en Puno. Abrigue a los niños y proteja los cultivos.', /^añadido:nivel "nivel:alto"/],
  ])('rechaza un %s que no está en el aviso', (_tipo, resumen, motivo) => {
    const r = ver(A1, resumen);
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toMatch(motivo);
  });
  it('el color no se equipara con el nivel: "alto" no sustituye a "naranja"', () => {
    for (const [a, resumen] of [
      [A1, 'Alerta de nivel alto en Puno. Abrigue a los niños y proteja los cultivos.'],
      [A2, 'Alerta de nivel moderado en Loreto. Manténgase informado.'],
      [A3, 'Alerta de nivel muy alto en Piura. Aléjese de los ríos, prepare una mochila de emergencia y siga las indicaciones de las autoridades.'],
      [A4, 'Alerta de nivel bajo en Puno. Asegure los objetos livianos.'],
    ] as const) {
      const r = ver(a, resumen);
      expect(r.estado).toBe('rechazado');
      expect(motivoDe(r)).toMatch(/^añadido:nivel "nivel:/);
    }
  });
  it('rechaza el aviso de otra fuente: un nombre que no es lugar ni dato crítico no se detecta, pero un departamento nuevo sí', () => {
    expect(ver(A1, 'Puno, Cusco y Tacna. Abrigue a los niños y proteja los cultivos.').estado).toBe('rechazado');
  });
  it('rechaza una cifra con la misma forma que una del aviso pero con otra unidad', () => {
    expect(ver(A1, `${R1} Teletexto 2.0 mm`).estado).toBe('rechazado');
  });
});

describe('Datos críticos modificados (Requisito 12.4)', () => {
  const lluvia = aviso('Se esperan 5 mm de lluvia en Puno el 16/11/2026 a las 7:30. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
  const base = 'Se esperan 5 mm de lluvia en Puno el 16 de noviembre a las 7:30. Hay que abrigarse.';
  it('el resumen de referencia se aprueba', () => {
    expect(ver(lluvia, base)).toEqual({ estado: 'aprobado' });
  });
  it.each([
    ['el valor de una cifra', base.replace('5 mm', '50 mm'), /^modificado:cifra "50 mm"/],
    ['la unidad de una cifra', base.replace('5 mm', '5 cm'), /^modificado:cifra "5 cm"/],
    ['la unidad por una magnitud equivalente (sin convertir)', base.replace('5 mm', '0.5 cm'), /^(añadido|modificado):cifra "0.5 cm"/],
    ['el día de una fecha', base.replace('16 de', '17 de'), /^modificado:fecha "--11-17"/],
    ['el mes de una fecha', base.replace('noviembre', 'diciembre'), /^modificado:fecha "--12-16"/],
    ['el año de una fecha', base.replace('16 de noviembre', '16 de noviembre de 2027'), /^modificado:fecha "2027-11-16"/],
    ['la hora', base.replace('7:30', '8:30'), /^añadido:hora "08:30"/],
  ])('rechaza el cambio de %s', (_cambio, resumen, motivo) => {
    const r = ver(lluvia, resumen);
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toMatch(motivo);
  });
  it('rechaza el cambio de signo de una cifra, también con "menos" y "bajo cero"', () => {
    const frio = aviso('Habrá -5 °C en Puno. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(frio, 'Habrá -5 °C en Puno. Hay que abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(frio, 'Habrá menos 5 °C en Puno. Hay que abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(frio, 'Habrá −5 °C en Puno. Hay que abrigarse.')).toEqual({ estado: 'aprobado' });
    for (const resumen of ['Habrá 5 °C en Puno. Hay que abrigarse.', 'Habrá +5 °C en Puno. Hay que abrigarse.', 'Habrá 5 grados en Puno. Hay que abrigarse.']) {
      const r = ver(frio, resumen);
      expect(r.estado, resumen).toBe('rechazado');
      expect(motivoDe(r), resumen).toMatch(/^modificado:cifra/);
    }
    const calor = aviso('Habrá 5 °C en Puno. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(calor, 'Habrá -5 °C en Puno. Hay que abrigarse.').estado).toBe('rechazado');
    expect(ver(calor, 'Habrá menos 5 °C en Puno. Hay que abrigarse.').estado).toBe('rechazado');
    expect(ver(calor, 'Habrá 5 °C bajo cero en Puno. Hay que abrigarse.').estado).toBe('rechazado');
  });
  it('rechaza una cifra con otro formato: 1.000, 1,000 y 1000 no son el mismo valor', () => {
    const a = aviso('Hay 1.000 personas afectadas. Se recomienda mantener la calma.', rec('calma', 'mantener la calma'));
    expect(ver(a, 'Hay 1.000 personas afectadas. Mantener la calma.')).toEqual({ estado: 'aprobado' });
    for (const otro of ['1,000', '1000', '1 000', 'mil']) {
      const r = ver(a, `Hay ${otro} personas afectadas. Mantener la calma.`);
      expect(r.estado, otro).toBe('rechazado');
    }
  });
  it('rechaza "dos" por "2": los números en palabras se comparan tal cual', () => {
    const a = aviso('Habrá 2 días de lluvia. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(a, 'Habrá 2 días de lluvia. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Habrá dos días de lluvia. Abrigarse.').estado).toBe('rechazado');
  });
  it('rechaza un sustantivo distinto detrás de la cifra', () => {
    const a = aviso('Hay 5 niños afectados. Se recomienda mantener la calma.', rec('calma', 'mantener la calma'));
    expect(ver(a, 'Hay 5 niños afectados. Mantener la calma.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Hay 5 familias afectadas. Mantener la calma.').estado).toBe('rechazado');
  });
});

describe('Variaciones de formato que no cambian el significado', () => {
  const a = aviso('Helada en Puno y San Martín del 16/11/2026 al 15/12/2026, a las 7:30 p. m., con 15 mm y 30 % de humedad. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
  it.each([
    ['fecha ISO', 'Del 2026-11-16 al 2026-12-15 en Puno y San Martín, 15 mm y 30 %, a las 19:30. Abrigarse.'],
    ['fecha con nombre de mes', 'Del 16 de noviembre de 2026 al 15 de diciembre de 2026 en Puno y San Martín, 15 mm y 30 %, 19:30. Abrigarse.'],
    ['fecha parcial', 'Del 16 de noviembre al 15 de diciembre en Puno y San Martín, 15 mm y 30 %, 19:30. Abrigarse.'],
    ['solo el mes', 'En noviembre y diciembre en Puno y San Martín. Abrigarse.'],
    ['hora con otro formato', 'Puno, 07:30 p. m., 15 mm, 30 %. Abrigarse.'],
    ['hora de 24 horas con "horas"', 'Puno, 19:30 horas, 15 mm, 30 %. Abrigarse.'],
    ['unidades con otro nombre', 'Puno, 15 milímetros y 30 por ciento. Abrigarse.'],
    ['unidades pegadas', 'Puno, 15mm y 30%. Abrigarse.'],
    ['mayúsculas', 'PUNO Y SAN MARTÍN, 15 MM Y 30 %. ABRIGARSE.'],
    ['lugar sin tilde', 'Puno y San Martin. Abrigarse.'],
  ])('aprueba %s', (_variante, resumen) => {
    expect(ver(a, resumen)).toEqual({ estado: 'aprobado' });
  });
  it('el nombre de color con otro género sigue siendo el mismo nivel', () => {
    const roja = aviso('Alerta roja en Piura. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(roja, 'Nivel rojo en Piura. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(roja, 'Alerta de nivel rojo en Piura. Abrigarse.')).toEqual({ estado: 'aprobado' });
  });
});

describe('Fechas parciales: solo se comparan los componentes escritos, sin completar ninguno', () => {
  it('el resumen puede dar menos componentes que el aviso', () => {
    const a = aviso('Vigente el 16/11/2026. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(a, 'Vigente el 16 de noviembre de 2026. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Vigente el 16 de noviembre. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Vigente en noviembre. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Vigente en noviembre de 2026. Abrigarse.')).toEqual({ estado: 'aprobado' });
  });
  it('el resumen no puede dar un componente que el aviso no escribe', () => {
    const a = aviso('Vigente el 16 de noviembre. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(a, 'Vigente el 16 de noviembre de 2026. Abrigarse.').estado).toBe('rechazado');
    expect(ver(a, 'Vigente en noviembre de 2026. Abrigarse.').estado).toBe('rechazado');
  });
  it('un componente distinto rechaza aunque los demás coincidan', () => {
    const a = aviso('Vigente el 16/11/2026. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    for (const resumen of ['Vigente el 17 de noviembre.', 'Vigente el 16 de diciembre.', 'Vigente el 16 de noviembre de 2025.']) {
      const r = ver(a, `${resumen} Abrigarse.`);
      expect(r.estado, resumen).toBe('rechazado');
      expect(motivoDe(r), resumen).toMatch(/^modificado:fecha/);
    }
    // Un mes que no coincide con ningún componente del aviso también se rechaza; el motivo lo cuenta como dato añadido.
    const r = ver(a, 'Vigente en diciembre. Abrigarse.');
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toMatch(/^(añadido|modificado):fecha "--12"/);
  });
  it('un año suelto es una cifra y no se completa con la fecha del aviso', () => {
    const a = aviso('Vigente el 16/11/2026. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    const r = ver(a, 'Vigente durante 2026. Abrigarse.');
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toMatch(/^añadido:cifra "2026/);
  });
  it('una fecha imposible no se acepta como si fuera otra', () => {
    const a = aviso('Vigente el 16/11/2026. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
    expect(ver(a, 'Vigente el 31 de noviembre de 2026. Abrigarse.').estado).toBe('rechazado');
  });
});

describe('Horas', () => {
  const a = aviso('Desde las 7:30 hasta las 19:00. Se recomienda abrigarse.', rec('abrigarse', 'abrigarse'));
  it('compara las horas ya normalizadas', () => {
    expect(ver(a, 'De 07:30 a 7:00 p. m. Abrigarse.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'De 7:30 a.m. a 19:00 horas. Abrigarse.')).toEqual({ estado: 'aprobado' });
  });
  it('rechaza una hora distinta, incluida la de la mañana frente a la de la tarde', () => {
    expect(ver(a, 'De 7:30 p. m. a 19:00. Abrigarse.').estado).toBe('rechazado');
    expect(ver(a, 'De 7:35 a 19:00. Abrigarse.').estado).toBe('rechazado');
  });
});

describe('Recomendaciones: omitidas y negadas (Requisitos 12.3 y 12.9)', () => {
  it('rechaza si falta una recomendación y nombra la que falta', () => {
    const r = ver(A1, 'Alerta naranja por helada en Puno y Cusco. Abrigue a los niños.');
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toBe('omision:recomendacion "proteger-cultivos"');
  });
  it('rechaza si faltan varias y las nombra todas', () => {
    const r = ver(A3, 'Alerta roja por inundación en Piura.');
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toBe(
      'omision:recomendacion "alejarse-de-rios"; omision:recomendacion "mochila-de-emergencia"; omision:recomendacion "seguir-indicaciones"',
    );
  });
  it('exige el 100 % de las recomendaciones', () => {
    for (const quitar of ['Aléjese de los ríos, ', 'prepare una mochila de emergencia y ', 'siga las indicaciones de las autoridades']) {
      expect(ver(A3, R3.replace(quitar, '')).estado, quitar).toBe('rechazado');
    }
  });
  it('basta una de las frases aceptadas de cada recomendación', () => {
    expect(ver(A1, 'Abrigar a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
    expect(ver(A1, 'Abriga a los niños y proteger los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('exige palabras completas y la frase completa', () => {
    expect(ver(A1, 'Desabrigue a los niños y proteja los cultivos.').estado).toBe('rechazado');
    expect(ver(A1, 'Abrigue a los niños y proteja los cultivosos.').estado).toBe('rechazado');
    expect(ver(A1, 'Abrigue a niños y proteja los cultivos.').estado).toBe('rechazado');
    expect(ver(A1, 'Abrigue, a los niños y proteja los cultivos.').estado).toBe('rechazado');
  });
  it('rechaza una recomendación que cambió de sentido: otra instrucción no cuenta', () => {
    expect(ver(A3, R3.replace('Aléjese de los ríos', 'Acérquese a los ríos')).estado).toBe('rechazado');
  });
  it.each([
    ['no'],
    ['nunca'],
    ['jamás'],
    ['tampoco'],
    ['sin'],
    ['evite'],
    ['no es necesario'],
    ['no se debe'],
    ['no, no'],
    ['deje de'],
  ])('rechaza una recomendación negada con "%s" justo antes', (negacion) => {
    const r = ver(A1, `Alerta naranja en Puno. ${negacion} abrigar a los niños y proteja los cultivos.`);
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toBe('omision:recomendacion "abrigar-ninos" (negada)');
  });
  it('una negación en otra oración no niega la recomendación', () => {
    expect(ver(A1, 'No hay que alarmarse. Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
    expect(ver(A1, 'Alerta naranja. No hay peligro inmediato; abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('una frase negada en un lugar y presente sin negar en otro cuenta como presente', () => {
    expect(ver(A1, 'No abrigue a los niños con ropa mojada. Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('LÍMITE: una negación a más de tres palabras de la frase no se detecta', () => {
    expect(ver(A1, 'No se debe dudar de que hay que abrigar a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('las frases de la recomendación pueden contener su propia negación', () => {
    const a = aviso('Se recomienda no cruzar los ríos.', rec('no-cruzar', 'no cruzar los ríos', 'no cruce los ríos'));
    expect(ver(a, 'No cruce los ríos.')).toEqual({ estado: 'aprobado' });
    expect(ver(a, 'Cruce los ríos.').estado).toBe('rechazado');
  });
  it('compara las frases sin distinguir mayúsculas ni espacios repetidos', () => {
    expect(ver(A1, 'ABRIGUE   A LOS   NIÑOS y PROTEJA los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('las tildes cuentan: la frase sin tilde no equivale a la que la tiene', () => {
    expect(ver(A2, 'Mantengase informado por los canales oficiales.').estado).toBe('rechazado');
  });
});

describe('Aviso sin recomendaciones declaradas (decisión 11)', () => {
  it('con marcadores de instrucción devuelve no_verificado', () => {
    const r = ver(aviso('Alerta naranja en Puno. Se recomienda abrigarse.'), 'Alerta naranja en Puno.');
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('no declara recomendaciones');
  });
  it.each([['El nivel debe vigilarse.'], ['Evite las zonas bajas.'], ['Recomendamos precaución.'], ['Es importante informarse.']])(
    'con el marcador de "%s" devuelve no_verificado',
    (frase) => {
      expect(ver(aviso(`Alerta naranja en Puno. ${frase}`), 'Alerta naranja en Puno.').estado).toBe('no_verificado');
    },
  );
  it('sin marcadores y sin recomendaciones se aprueba un resumen que es subconjunto', () => {
    const a = aviso('Alerta naranja en Puno el 16/11/2026.');
    expect(ver(a, 'Alerta naranja en Puno.')).toEqual({ estado: 'aprobado' });
  });
  it('un dato añadido se rechaza antes que el fallo de verificación', () => {
    const r = ver(aviso('Alerta naranja en Puno. Se recomienda abrigarse.'), 'Alerta naranja en Cusco.');
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r)).toMatch(/^añadido:lugar "cusco"/);
  });
});

describe('Entradas inválidas y límites de tamaño: no_verificado', () => {
  const valido = aviso('Alerta naranja en Puno.', rec('abrigarse', 'abrigarse'));
  it.each([
    ['resumen vacío', ''],
    ['resumen de espacios', '   \n '],
    ['resumen que no es texto (null)', null],
    ['resumen que no es texto (número)', 5],
    ['resumen que no es texto (objeto)', {}],
    ['resumen undefined', undefined],
  ])('%s', (_etiqueta, resumen) => {
    const r = verificar(valido, resumen as never, FIJO);
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('resumen');
  });
  it.each([
    ['aviso null', null],
    ['aviso que no es objeto', 'texto'],
    ['aviso sin texto', { recomendaciones: [] }],
    ['aviso con texto vacío', { textoOriginal: '', recomendaciones: [] }],
    ['aviso con texto de espacios', { textoOriginal: '  ', recomendaciones: [] }],
    ['aviso con texto que no es cadena', { textoOriginal: 5, recomendaciones: [] }],
    ['recomendaciones que no son lista', { textoOriginal: 'Alerta.', recomendaciones: 'abrigarse' }],
    ['sin recomendaciones (propiedad ausente)', { textoOriginal: 'Alerta.' }],
    ['recomendación sin clave', { textoOriginal: 'Alerta.', recomendaciones: [{ frases: ['abrigarse'] }] }],
    ['recomendación nula', { textoOriginal: 'Alerta.', recomendaciones: [null] }],
    ['recomendación sin frases', { textoOriginal: 'Alerta.', recomendaciones: [{ clave: 'x' }] }],
    ['recomendación con lista de frases vacía', { textoOriginal: 'Alerta.', recomendaciones: [{ clave: 'x', frases: [] }] }],
    ['recomendación con una frase vacía', { textoOriginal: 'Alerta.', recomendaciones: [{ clave: 'x', frases: ['abrigarse', ''] }] }],
    ['recomendación con una frase de espacios', { textoOriginal: 'Alerta.', recomendaciones: [{ clave: 'x', frases: ['  '] }] }],
    ['recomendación con una frase que no es texto', { textoOriginal: 'Alerta.', recomendaciones: [{ clave: 'x', frases: [5] }] }],
  ])('%s', (_etiqueta, malo) => {
    const r = verificar(malo as never, 'Alerta.', FIJO);
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r).length).toBeGreaterThan(0);
  });
  it('un aviso que lanza un error al leerlo da no_verificado y no una excepción', () => {
    const roto = {
      get textoOriginal(): string {
        throw new Error('fallo al leer');
      },
      recomendaciones: [],
    };
    const r = verificar(roto as never, 'Alerta.', FIJO);
    expect(r).toEqual({ estado: 'no_verificado', motivo: 'error interno al verificar' });
  });
  it('acepta un aviso de exactamente 20 000 caracteres y rechaza uno de 20 001', () => {
    expect(MAX_CARACTERES_AVISO).toBe(20_000);
    const justo = aviso(`Alerta naranja en Puno. ${'x'.repeat(MAX_CARACTERES_AVISO - 24)}`, rec('abrigarse', 'abrigarse'));
    expect(justo.textoOriginal).toHaveLength(MAX_CARACTERES_AVISO);
    expect(ver(justo, 'Alerta naranja en Puno. Abrigarse.')).toEqual({ estado: 'aprobado' });
    const largo = aviso(`${justo.textoOriginal}x`, rec('abrigarse', 'abrigarse'));
    const r = ver(largo, 'Alerta naranja en Puno. Abrigarse.');
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('20000');
  });
  it('acepta un resumen de exactamente 2 000 caracteres y rechaza uno de 2 001', () => {
    expect(MAX_CARACTERES_RESUMEN).toBe(2_000);
    const a = aviso('Alerta naranja en Puno.', rec('abrigarse', 'abrigarse'));
    const justo = `Abrigarse. ${'x'.repeat(MAX_CARACTERES_RESUMEN - 11)}`;
    expect(justo).toHaveLength(MAX_CARACTERES_RESUMEN);
    expect(ver(a, justo)).toEqual({ estado: 'aprobado' });
    const r = ver(a, `${justo}x`);
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('2000');
  });
  it('los topes se comprueban antes de analizar nada: un texto enorme no tarda', () => {
    const antes = performance.now();
    const r = ver(aviso('x'.repeat(5_000_000), rec('a', 'a')), 'Alerta naranja.');
    expect(r.estado).toBe('no_verificado');
    expect(performance.now() - antes).toBeLessThan(500);
  });
});

describe('Plazo de 5 segundos (Requisito 12.1)', () => {
  it('el plazo es de 5 000 ms', () => {
    expect(PLAZO_VERIFICACION_MS).toBe(5000);
  });
  it('con un reloj que avanza poco, se aprueba', () => {
    expect(verificar(A1, R1, { ahora: relojConPaso(1) })).toEqual({ estado: 'aprobado' });
  });
  it('con un reloj que avanza 600 ms por lectura se agota el plazo durante la verificación', () => {
    const r = verificar(A1, R1, { ahora: relojConPaso(600) });
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('tiempo agotado');
    expect(motivoDe(r)).toContain('5000 ms');
  });
  it('exactamente 5 000 ms todavía es válido y 5 001 ms agota el plazo', () => {
    expect(verificar(A1, R1, { ahora: relojConSalto(5000) })).toEqual({ estado: 'aprobado' });
    const r = verificar(A1, R1, { ahora: relojConSalto(5001) });
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('tiempo agotado');
  });
  it('un resumen que se aprobaría pero termina fuera de plazo no se aprueba', () => {
    expect(verificar(A1, R1, { ahora: relojConSalto(60_000) }).estado).toBe('no_verificado');
  });
  it('un resumen que se rechazaría pero termina fuera de plazo da no_verificado, no rechazado', () => {
    expect(verificar(A1, 'Alerta naranja en Arequipa.', { ahora: relojConSalto(5001) }).estado).toBe('no_verificado');
  });
  it('un plazo menor solo acorta el límite', () => {
    const r = verificar(A1, R1, { ahora: relojConSalto(101), plazoMs: 100 });
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('100 ms');
    expect(verificar(A1, R1, { ahora: relojConSalto(100), plazoMs: 100 })).toEqual({ estado: 'aprobado' });
  });
  it('un plazo mayor que 5 s se recorta a 5 s', () => {
    const r = verificar(A1, R1, { ahora: relojConSalto(5001), plazoMs: 60_000 });
    expect(r.estado).toBe('no_verificado');
    expect(motivoDe(r)).toContain('5000 ms');
  });
  it.each([[Number.NaN], [0], [-5], [Number.POSITIVE_INFINITY], ['100'], [null], [undefined]])('un plazo inválido (%s) usa el de 5 s', (plazoMs) => {
    expect(verificar(A1, R1, { ahora: relojConSalto(5000), plazoMs: plazoMs as never })).toEqual({ estado: 'aprobado' });
    expect(verificar(A1, R1, { ahora: relojConSalto(5001), plazoMs: plazoMs as never }).estado).toBe('no_verificado');
  });
  it('un reloj inválido da no_verificado en lugar de aprobar', () => {
    for (const ahora of [() => Number.NaN, () => Number.POSITIVE_INFINITY, () => '5' as never, () => undefined as never, () => { throw new Error('sin reloj'); }]) {
      const r = verificar(A1, R1, { ahora });
      expect(r, String(ahora)).toEqual({ estado: 'no_verificado', motivo: 'reloj no válido' });
    }
  });
  it('un reloj que deja de ser válido a mitad de la verificación da no_verificado', () => {
    let lecturas = 0;
    const r = verificar(A1, R1, { ahora: () => (++lecturas > 3 ? Number.NaN : 0) });
    expect(r).toEqual({ estado: 'no_verificado', motivo: 'reloj no válido' });
  });
  it('sin reloj inyectado usa el reloj del sistema y funciona', () => {
    expect(verificar(A1, R1)).toEqual({ estado: 'aprobado' });
    expect(verificar(A1, 'Alerta naranja en Arequipa.').estado).toBe('rechazado');
  });
  it('dependencias que no son un objeto se ignoran', () => {
    expect(verificar(A1, R1, null as never)).toEqual({ estado: 'aprobado' });
    expect(verificar(A1, R1, 5 as never)).toEqual({ estado: 'aprobado' });
  });
});

describe('Tiempo real con entradas de tamaño máximo y casos adversos', () => {
  const recomendaciones = [rec('a', 'abrigarse'), rec('b', 'proteger los cultivos'), rec('c', 'mantener la calma')];
  const adversos: [string, string, string][] = [
    ['dígitos', '1'.repeat(20_000), '1'.repeat(2_000)],
    ['números con separadores', '1.'.repeat(10_000), '1.'.repeat(1_000)],
    ['fechas incompletas', '9 de '.repeat(4_000), '9 de '.repeat(400)],
    ['contextos de nivel', 'alerta de nivel '.repeat(1_250), 'alerta de nivel '.repeat(125)],
    ['unidades', '5 mm '.repeat(4_000), '5 mm '.repeat(400)],
    ['lugares', 'Puno '.repeat(4_000), 'Cusco '.repeat(330)],
    ['una letra', 'a'.repeat(20_000), 'a'.repeat(2_000)],
    ['espacios', ' '.repeat(19_000) + 'x', ' '.repeat(1_900) + 'x'],
  ];
  it.each(adversos)('termina muy por debajo de un segundo con %s', (_nombre, textoAviso, textoResumen) => {
    const antes = performance.now();
    const r = verificar(aviso(textoAviso, ...recomendaciones), textoResumen);
    const duracion = performance.now() - antes;
    expect(['aprobado', 'rechazado', 'no_verificado']).toContain(r.estado);
    expect(duracion).toBeLessThan(1000);
  });
  it('termina rápido con miles de recomendaciones', () => {
    const muchas = Array.from({ length: 5_000 }, (_, i) => rec(`r${i}`, `frase número ${i}`, `otra frase ${i}`));
    const antes = performance.now();
    const r = verificar(aviso('Alerta naranja.', ...muchas), 'Alerta naranja. Abrigarse.');
    expect(r.estado).toBe('rechazado');
    expect(performance.now() - antes).toBeLessThan(1000);
  });
  it('una frase de recomendación repetida en todo el resumen no se vuelve cuadrática', () => {
    const antes = performance.now();
    const r = verificar(aviso('Alerta.', rec('a', 'a')), 'a'.repeat(MAX_CARACTERES_RESUMEN));
    expect(['aprobado', 'rechazado', 'no_verificado']).toContain(r.estado);
    expect(performance.now() - antes).toBeLessThan(500);
  });
});

describe('Motivo: máximo 500 caracteres y tipo de rechazo al principio (Requisito 12.8)', () => {
  it('con muchos datos añadidos recorta a 500 y conserva el tipo del primer rechazo', () => {
    const muchos = Array.from({ length: 200 }, (_, i) => `${i + 100} mm`).join(' ');
    const r = ver(A1, `${muchos} Abrigue a los niños y proteja los cultivos.`.slice(0, MAX_CARACTERES_RESUMEN));
    expect(r.estado).toBe('rechazado');
    expect(motivoDe(r).length).toBeLessThanOrEqual(500);
    expect(motivoDe(r)).toMatch(/^añadido:cifra "/);
  });
  it('un detalle con letras fuera del plano básico se recorta sin partir un carácter', () => {
    const resumen = `Habrá 5 ${'𝒜'.repeat(400)}. Abrigue a los niños y proteja los cultivos.`;
    const r = ver(A1, resumen);
    expect(r.estado).toBe('rechazado');
    const motivo = motivoDe(r);
    expect(motivo.length).toBeLessThanOrEqual(500);
    expect(motivo).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(motivo).toMatch(/^añadido:cifra "5 palabra:/);
  });
  it('un motivo corto no se recorta ni se altera', () => {
    expect(motivoDe(ver(A1, 'Alerta naranja en Arequipa. Abrigue a los niños y proteja los cultivos.'))).toBe('añadido:lugar "arequipa"');
  });
  it('un rechazo siempre tiene un motivo no vacío que empieza por un tipo conocido', () => {
    const resumenes = [
      'Alerta roja.',
      'Cusco y Tacna.',
      '5 mm.',
      'Hoy.',
      'A las 8:00.',
      'Abrigue a los niños.',
      'En enero.',
      'Alerta naranja en Puno. Abrigue a los niños y proteja los cultivos. Dos días.',
    ];
    for (const resumen of resumenes) {
      const r = ver(A1, resumen);
      expect(r.estado, resumen).toBe('rechazado');
      expect(motivoDe(r), resumen).toMatch(/^(añadido:(cifra|fecha|hora|lugar|nivel)|modificado:(cifra|fecha)|omision:recomendacion) /);
    }
  });
});

describe('Registro de la verificación (Requisito 12.8)', () => {
  it('el registro de una verificación aprobada tiene la fecha en UTC con segundos', () => {
    const r = verificar(A1, R1, { ahora: () => T0 + 400 });
    expect(registrarVerificacion(r, T0 + 400)).toEqual({ estado: 'aprobado', verificadoEn: '2026-11-16T12:00:00Z' });
  });
  it('el registro de un rechazo lleva el motivo', () => {
    const r = ver(A1, 'Alerta naranja en Arequipa.');
    expect(registrarVerificacion(r, T0)).toEqual({ estado: 'rechazado', motivo: motivoDe(r), verificadoEn: '2026-11-16T12:00:00Z' });
  });
  it('el registro de un no verificado lleva el motivo', () => {
    const r = verificar(A1, R1, { ahora: relojConSalto(9_000) });
    expect(registrarVerificacion(r, T0)).toEqual({ estado: 'no_verificado', motivo: motivoDe(r), verificadoEn: '2026-11-16T12:00:00Z' });
  });
});

describe('Determinismo y ausencia de efectos', () => {
  it('no modifica el aviso ni el resumen y devuelve resultados congelados', () => {
    const congelado = JSON.parse(JSON.stringify(A1)) as AvisoVerificable;
    for (const r of congelado.recomendaciones) Object.freeze(r.frases), Object.freeze(r);
    Object.freeze(congelado.recomendaciones);
    Object.freeze(congelado);
    const antes = JSON.stringify(congelado);
    const r1 = ver(congelado, R1);
    const r2 = ver(congelado, 'Alerta naranja en Arequipa.');
    expect(JSON.stringify(congelado)).toBe(antes);
    expect(Object.isFrozen(r1)).toBe(true);
    expect(Object.isFrozen(r2)).toBe(true);
  });
  it('da el mismo resultado en llamadas repetidas y alternadas', () => {
    const esperado = [ver(A1, R1), ver(A1, 'Alerta roja.'), ver(A3, R3)];
    for (let i = 0; i < 5; i++) expect([ver(A1, R1), ver(A1, 'Alerta roja.'), ver(A3, R3)]).toEqual(esperado);
  });
  it('el orden de las recomendaciones y de las frases no cambia el resultado', () => {
    const invertido: AvisoVerificable = {
      textoOriginal: A3.textoOriginal,
      recomendaciones: [...A3.recomendaciones].reverse().map((r) => ({ clave: r.clave, frases: [...r.frases].reverse() })),
    };
    expect(ver(invertido, R3)).toEqual(ver(A3, R3));
    expect(ver(invertido, 'Alerta roja en Piura.').estado).toBe('rechazado');
  });
});

describe('LÍMITES CONOCIDOS: aprobar significa "no se detectó ningún cambio"', () => {
  // Estas pruebas dejan por escrito lo que el verificador NO detecta. Un resumen aprobado puede contener estos cambios.
  it('no detecta un lugar fuera del catálogo de Departamentos', () => {
    expect(ver(A1, 'Alerta naranja por helada en Puno y Cusco, y en Azángaro. Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('no detecta una instrucción añadida que no es una recomendación del aviso', () => {
    expect(ver(A1, `${R1} Lleve agua y evacúe la zona.`)).toEqual({ estado: 'aprobado' });
  });
  it('no detecta un cambio de significado sin datos críticos', () => {
    expect(ver(A1, `${R1} La helada será leve y pasajera.`)).toEqual({ estado: 'aprobado' });
  });
  it('no detecta un nivel escrito fuera de un contexto reconocido', () => {
    expect(ver(A1, 'Riesgo extremo por helada en Puno y Cusco. Abrigue a los niños y proteja los cultivos.')).toEqual({ estado: 'aprobado' });
  });
  it('no detecta "un", "una" ni "uno" cuando no los sigue una unidad', () => {
    expect(ver(A1, `${R1} Solo uno de los distritos.`)).toEqual({ estado: 'aprobado' });
  });
  it('no detecta un nombre propio que no es un Departamento', () => {
    expect(ver(A1, `${R1} Informa el señor Pedro Ramírez.`)).toEqual({ estado: 'aprobado' });
  });
});

describe('Pureza del módulo y de la API pública', () => {
  const fuente = readFileSync(new URL('./verificar.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no usa red, almacenamiento, temporizadores ni azar, y solo lee el reloj en un punto', () => {
    for (const prohibido of ['window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'Math.random', 'performance', 'console', 'process', 'readFileSync']) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
    expect(fuente.match(/Date\.now\(\)/g)).toHaveLength(1);
    expect(fuente).not.toContain('new Date');
  });
  it('solo importa del modelo (tipos), de criticos y de registro: nada de apps/web, tools ni workers', () => {
    expect([...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual(['@teletexto/modelo', './criticos.ts', './registro.ts']);
    expect(fuente).not.toMatch(/apps\/|tools\/|workers\//);
  });
  it('index exporta la API pública del verificador', () => {
    for (const nombre of [
      'extraerCriticos',
      'verificar',
      'registrarVerificacion',
      'acotarMotivo',
      'formatearUtcSegundos',
      'normalizarTexto',
      'contieneMarcadoresDeInstruccion',
      'LUGARES',
      'PLAZO_VERIFICACION_MS',
      'MAX_CARACTERES_AVISO',
      'MAX_CARACTERES_RESUMEN',
      'MAX_CARACTERES_MOTIVO',
      'MOTIVO_NO_DISPONIBLE',
    ]) {
      expect(api, nombre).toHaveProperty(nombre);
    }
    expect(api.verificar).toBe(verificar);
  });
});
