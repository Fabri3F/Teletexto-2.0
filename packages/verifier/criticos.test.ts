import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contieneMarcadoresDeInstruccion, extraerCriticos, extraerCriticosControlado, normalizarTexto, type DatoCritico } from './criticos.ts';
import { LUGARES } from './lugares.ts';
// Tarea 10.1. Requisitos 11.3, 12.1, 12.2 y 12.4. Pruebas unitarias del extractor de Datos_Críticos.

/** Cada dato como texto corto: `cifra=valor|unidad` o `tipo=valor`. */
function texto(datos: readonly DatoCritico[]): string[] {
  return datos.map((d) => (d.tipo === 'cifra' ? `cifra=${d.valor}${d.unidad === undefined ? '' : `|${d.unidad}`}` : `${d.tipo}=${d.valor}`));
}
const ext = (t: string): string[] => texto(extraerCriticos(t));

describe('normalizarTexto', () => {
  it('pasa a NFC, a minúsculas y colapsa los espacios, sin quitar tildes', () => {
    expect(normalizarTexto('  ÁNCASH \n\t Puno  ')).toBe('áncash puno');
    expect(normalizarTexto('A\u0301ncash')).toBe('áncash');
    expect(normalizarTexto('Junín')).not.toBe(normalizarTexto('Junin'));
  });
  it('trata el espacio de no separación como un espacio', () => {
    expect(normalizarTexto('16\u00a0de\u00a0noviembre')).toBe('16 de noviembre');
  });
});

describe('Fechas', () => {
  it.each([
    ['16/11/2026'],
    ['16-11-2026'],
    ['2026-11-16'],
    ['16 de noviembre de 2026'],
    ['16 de noviembre del 2026'],
    ['16 DE NOVIEMBRE DE 2026'],
    ['6/11/2026', '2026-11-06'],
    ['16/1/2026', '2026-01-16'],
  ])('%s se normaliza a una fecha completa', (entrada, esperado = '2026-11-16') => {
    expect(ext(entrada)).toEqual([`fecha=${esperado}`]);
  });
  it('las fechas parciales solo guardan los componentes escritos, sin completar ninguno', () => {
    expect(ext('16 de noviembre')).toEqual(['fecha=--11-16']);
    expect(ext('noviembre de 2026')).toEqual(['fecha=2026-11']);
    expect(ext('en noviembre')).toEqual(['fecha=--11']);
    expect(ext('29 de febrero')).toEqual(['fecha=--02-29']);
  });
  it('septiembre y setiembre son el mismo mes', () => {
    expect(ext('setiembre')).toEqual(ext('septiembre'));
    expect(ext('setiembre')).toEqual(['fecha=--09']);
  });
  it('acepta el 29 de febrero solo en años bisiestos', () => {
    expect(ext('29/02/2024')).toEqual(['fecha=2024-02-29']);
    expect(ext('29/02/2000')).toEqual(['fecha=2000-02-29']);
    expect(ext('29/02/2026')).not.toContain('fecha=2026-02-29');
    expect(ext('29/02/1900')).not.toContain('fecha=1900-02-29');
  });
  it('una fecha imposible no se interpreta: sus números quedan como cifras literales', () => {
    expect(ext('29/02/2026')).toEqual(['cifra=02', 'cifra=2026', 'cifra=29']);
    expect(ext('32/01/2026')).toEqual(['cifra=01', 'cifra=2026', 'cifra=32']);
    expect(ext('16/13/2026')).toEqual(['cifra=13', 'cifra=16', 'cifra=2026']);
    expect(ext('31 de abril')).toEqual(['cifra=31', 'fecha=--04']);
  });
  it('los números de una fecha no cuentan además como cifras', () => {
    expect(ext('del 16/11/2026 al 15/12/2026')).toEqual(['fecha=2026-11-16', 'fecha=2026-12-15']);
  });
  it('las expresiones relativas se guardan literales y no se convierten en fechas', () => {
    expect(ext('hoy')).toEqual(['fecha=relativa:hoy']);
    expect(ext('mañana')).toEqual(['fecha=relativa:mañana']);
    expect(ext('esta noche')).toEqual(['fecha=relativa:esta noche']);
    expect(ext('pasado mañana')).toEqual(['fecha=relativa:pasado mañana']);
    expect(ext('anoche y ayer')).toEqual(['fecha=relativa:anoche', 'fecha=relativa:ayer']);
    expect(ext('esta tarde')).toEqual(['fecha=relativa:esta tarde']);
  });
  it('"mañana" cuenta aunque se use como parte del día: se compara como texto', () => {
    expect(ext('por la mañana')).toEqual(['fecha=relativa:mañana']);
  });
});

describe('Horas', () => {
  it.each([
    ['7:30', '07:30'],
    ['07:30', '07:30'],
    ['19:30', '19:30'],
    ['07:30 horas', '07:30'],
    ['7:30 h', '07:30'],
    ['7:30h', '07:30'],
    ['7:30 a. m.', '07:30'],
    ['7:30 a.m.', '07:30'],
    ['7:30 p. m.', '19:30'],
    ['7:30 P. M.', '19:30'],
    ['12:00 a. m.', '00:00'],
    ['12:30 p. m.', '12:30'],
    ['0:05', '00:05'],
    ['23:59', '23:59'],
  ])('%s se normaliza a %s', (entrada, esperado) => {
    expect(ext(entrada)).toEqual([`hora=${esperado}`]);
  });
  it('una hora imposible no se interpreta y queda como cifras literales', () => {
    expect(ext('24:00')).not.toContain('hora=24:00');
    expect(ext('24:00')).toEqual(['cifra=00', 'cifra=24']);
    expect(ext('7:75')).toEqual(['cifra=7', 'cifra=75']);
    expect(ext('13:00 p. m.')).not.toContain('hora=01:00');
  });
  it('"a" y "p" sueltos no se toman como meridiano', () => {
    expect(ext('a las 7:30 a mi casa')).toEqual(['hora=07:30']);
    expect(ext('7:30 hasta las 9:00')).toEqual(['hora=07:30', 'hora=09:00']);
  });
});

describe('Niveles (en contexto, sin equiparar colores con niveles)', () => {
  it.each([
    ['alerta naranja', 'color:naranja'],
    ['de nivel naranja', 'color:naranja'],
    ['alerta roja', 'color:rojo'],
    ['nivel rojo', 'color:rojo'],
    ['alerta amarilla', 'color:amarillo'],
    ['nivel amarillo', 'color:amarillo'],
    ['nivel verde', 'color:verde'],
    ['aviso de nivel rojo', 'color:rojo'],
    ['semáforo rojo', 'color:rojo'],
    ['alerta de color naranja', 'color:naranja'],
    ['alerta de nivel alto', 'nivel:alto'],
    ['nivel alta', 'nivel:alto'],
    ['nivel muy alto', 'nivel:muy alto'],
    ['nivel muy alta', 'nivel:muy alto'],
    ['nivel moderado', 'nivel:moderado'],
    ['nivel bajo', 'nivel:bajo'],
    ['ALERTA NARANJA', 'color:naranja'],
  ])('%s da %s', (entrada, esperado) => {
    expect(ext(entrada)).toEqual([`nivel=${esperado}`]);
  });
  it('el color y el nivel normalizado son valores distintos: naranja no equivale a alto', () => {
    expect(ext('nivel naranja')).not.toEqual(ext('nivel alto'));
    expect(ext('alerta roja')).not.toEqual(ext('nivel muy alto'));
    expect(ext('nivel amarillo')).not.toEqual(ext('nivel moderado'));
    expect(ext('nivel verde')).not.toEqual(ext('nivel bajo'));
  });
  it('solo cambia el género: roja y rojo, amarilla y amarillo', () => {
    expect(ext('alerta roja')).toEqual(ext('nivel rojo'));
    expect(ext('alerta amarilla')).toEqual(ext('nivel amarillo'));
  });
  it('una palabra de color o de nivel fuera de contexto no se toma como nivel', () => {
    expect(ext('la zona roja')).toEqual([]);
    expect(ext('temperatura alta')).toEqual([]);
    expect(ext('cielo naranja')).toEqual([]);
    expect(ext('un río bajo')).toEqual([]);
  });
});

describe('Lugares (catálogo cerrado de los 25 Departamentos)', () => {
  it.each(Object.entries(LUGARES))('reconoce el departamento %s (%o)', (_codigo, lugar) => {
    expect(ext(`Lluvias en ${lugar.nombre}.`)).toEqual([`lugar=${normalizarTexto(lugar.nombre)}`]);
    for (const variante of lugar.variantes) {
      expect(ext(`Lluvias en ${variante}.`), variante).toEqual([`lugar=${normalizarTexto(lugar.nombre)}`]);
    }
  });
  it('las variantes de un nombre dan el mismo valor', () => {
    expect(ext('San Martin')).toEqual(ext('San Martín'));
    expect(ext('Ancash')).toEqual(ext('Áncash'));
    expect(ext('Cuzco')).toEqual(ext('Cusco'));
    expect(ext('Junin')).toEqual(['lugar=junín']);
  });
  it('reconoce varios lugares y los nombres de varias palabras como uno solo', () => {
    expect(ext('Puno y Cusco')).toEqual(['lugar=cusco', 'lugar=puno']);
    expect(ext('La Libertad y Madre de Dios')).toEqual(['lugar=la libertad', 'lugar=madre de dios']);
    expect(ext('Cusco y Puno')).toEqual(ext('Puno y Cusco'));
  });
  it('exige palabras completas', () => {
    expect(ext('Limache')).toEqual([]);
    expect(ext('práctica')).toEqual([]);
    expect(ext('pascoa')).toEqual([]);
    expect(ext('Lima, Perú')).toEqual(['lugar=lima']);
  });
  it('LÍMITE: un lugar que no está en el catálogo no se detecta (provincias, distritos, otros países)', () => {
    expect(ext('Azángaro')).toEqual([]);
    expect(ext('Juliaca, Perú')).toEqual([]);
    expect(ext('Bolivia')).toEqual([]);
  });
  it('no usa heurísticas de nombres propios: una palabra con mayúscula no es un lugar', () => {
    expect(ext('Se informa que Pedro Ramírez vive en Villa Rica.')).toEqual([]);
  });
});

describe('Cifras', () => {
  it('guarda el número tal como está escrito: 1.000, 1,000 y 1000 son valores distintos', () => {
    expect(ext('1.000')).toEqual(['cifra=1.000']);
    expect(ext('1,000')).toEqual(['cifra=1,000']);
    expect(ext('1000')).toEqual(['cifra=1000']);
    expect(ext('2.5')).not.toEqual(ext('2,5'));
    expect(ext('02')).toEqual(['cifra=02']);
    expect(ext('1 000')).toEqual(['cifra=000', 'cifra=1']);
  });
  it('un número con separadores raros se guarda entero y literal', () => {
    expect(ext('1.2.3')).toEqual(['cifra=1.2.3']);
    expect(ext('3,5,2')).toEqual(['cifra=3,5,2']);
  });
  it('toma la unidad de la tabla cerrada, pegada o separada, con sus formas escritas', () => {
    expect(ext('15 mm')).toEqual(['cifra=15|mm']);
    expect(ext('15mm')).toEqual(['cifra=15|mm']);
    expect(ext('15 milímetros')).toEqual(['cifra=15|mm']);
    expect(ext('15 milimetros')).toEqual(['cifra=15|mm']);
    expect(ext('15 cm')).toEqual(['cifra=15|cm']);
    expect(ext('30%')).toEqual(['cifra=30|%']);
    expect(ext('30 %')).toEqual(['cifra=30|%']);
    expect(ext('30 por ciento')).toEqual(['cifra=30|%']);
    expect(ext('80 km/h')).toEqual(['cifra=80|km/h']);
    expect(ext('80 kilómetros por hora')).toEqual(['cifra=80|km/h']);
    expect(ext('3 días')).toEqual(['cifra=3|día']);
    expect(ext('3 dias')).toEqual(['cifra=3|día']);
    expect(ext('48 horas')).toEqual(['cifra=48|h']);
    expect(ext('5 m')).toEqual(['cifra=5|m']);
    expect(ext('5 metros')).toEqual(['cifra=5|m']);
    expect(ext('2 hectáreas')).toEqual(['cifra=2|ha']);
  });
  it('no convierte magnitudes ni unidades: mm, cm y m son unidades distintas', () => {
    expect(ext('5 mm')).not.toEqual(ext('5 cm'));
    expect(ext('5 cm')).not.toEqual(ext('5 m'));
    expect(ext('5 km')).not.toEqual(ext('5000 m'));
    expect(ext('5 horas')).not.toEqual(ext('5 días'));
    expect(ext('5 °C')).not.toEqual(ext('5 °F'));
  });
  it('los grados Celsius tienen varias formas pero una sola unidad', () => {
    for (const forma of ['5 °C', '5°C', '5 ºC', '5 grados Celsius', '5 grados centígrados', '5 grados centigrados']) {
      expect(ext(forma), forma).toEqual(['cifra=5|°c']);
    }
    expect(ext('5 grados')).toEqual(['cifra=5|grados']);
  });
  it('conserva el signo explícito', () => {
    expect(ext('-5 °C')).toEqual(['cifra=-5|°c']);
    expect(ext('−5 °C')).toEqual(['cifra=-5|°c']);
    expect(ext('–5 °C')).toEqual(['cifra=-5|°c']);
    expect(ext('+5 °C')).toEqual(['cifra=+5|°c']);
    expect(ext('5 °C')).toEqual(['cifra=5|°c']);
    expect(ext('-5 °C')).not.toEqual(ext('5 °C'));
    expect(ext('+5 °C')).not.toEqual(ext('5 °C'));
  });
  it('reconoce "menos" justo delante y "bajo cero" detrás como signo negativo', () => {
    expect(ext('menos 5 grados')).toEqual(['cifra=-5|grados']);
    expect(ext('menos 5 °C')).toEqual(['cifra=-5|°c']);
    expect(ext('5 grados bajo cero')).toEqual(['cifra=-5|grados', 'cifra=cero']);
    expect(ext('menos de 5 días')).toEqual(['cifra=5|día']);
  });
  it('un guion dentro de una palabra no es un signo', () => {
    expect(ext('covid-19')).toEqual(['cifra=19']);
    expect(ext('5-10 mm')).toEqual(['cifra=10|mm', 'cifra=5']);
  });
  it('sin unidad de la tabla, la unidad es la palabra siguiente, comparada tal cual', () => {
    expect(ext('5 niños')).toEqual(['cifra=5|palabra:niños']);
    expect(ext('5 niños')).not.toEqual(ext('5 familias'));
    expect(ext('12 viviendas')).toEqual(['cifra=12|palabra:viviendas']);
  });
  it('las palabras funcionales no se toman como unidad', () => {
    expect(ext('5 de los niños')).toEqual(['cifra=5']);
    expect(ext('5 y 6')).toEqual(['cifra=5', 'cifra=6']);
    expect(ext('Teletexto 2.0 para probar')).toEqual(['cifra=2.0']);
  });
  it('un número al final del texto no tiene unidad', () => {
    expect(ext('hasta 5')).toEqual(['cifra=5']);
    expect(ext('5.')).toEqual(['cifra=5']);
  });
});

describe('Números en palabras (vocabulario cerrado)', () => {
  it('reconoce los números del vocabulario y los compara tal cual', () => {
    expect(ext('dos días')).toEqual(['cifra=dos|día']);
    expect(ext('tres niños')).toEqual(['cifra=tres|palabra:niños']);
    expect(ext('treinta y cinco')).toEqual(['cifra=cinco', 'cifra=treinta']);
    expect(ext('cien personas')).toEqual(['cifra=cien|palabra:personas']);
    expect(ext('mil familias')).toEqual(['cifra=mil|palabra:familias']);
    expect(ext('veinte')).toEqual(['cifra=veinte']);
  });
  it('"dos" no equivale a "2": son valores distintos', () => {
    expect(ext('dos días')).not.toEqual(ext('2 días'));
    expect(ext('cinco')).not.toEqual(ext('5'));
  });
  it('solo se unifica la tilde de una misma palabra', () => {
    expect(ext('veintidos')).toEqual(ext('veintidós'));
    expect(ext('dieciseis')).toEqual(['cifra=dieciséis']);
    expect(ext('doscientos')).not.toEqual(ext('doscientas'));
  });
  it('"un", "una" y "uno" son ambiguos y solo cuentan seguidos de una unidad de la tabla', () => {
    expect(ext('un aviso')).toEqual([]);
    expect(ext('una vez')).toEqual([]);
    expect(ext('uno de los dos')).toEqual(['cifra=dos']);
    expect(ext('una hora')).toEqual(['cifra=una|h']);
    expect(ext('un día')).toEqual(['cifra=un|día']);
    expect(ext('un día')).not.toEqual(ext('1 día'));
  });
  it('no toma como número las palabras ambiguas (segundo, medio, par)', () => {
    expect(ext('el segundo aviso, a medio camino, un par de casas')).toEqual([]);
  });
});

describe('Orden, repetidos y entradas no válidas', () => {
  it('no repite los datos y los devuelve en un orden fijo (cifra, fecha, hora, lugar, nivel)', () => {
    expect(ext('Nivel naranja en Puno. Alerta naranja en Puno a las 7:30 y a las 07:30, 5 mm y 5 mm el 16/11/2026 y el 16/11/2026.')).toEqual([
      'cifra=5|mm',
      'fecha=2026-11-16',
      'hora=07:30',
      'lugar=puno',
      'nivel=color:naranja',
    ]);
  });
  it('el orden de aparición en el texto no cambia el resultado', () => {
    expect(ext('Cusco, Puno, 5 mm, 3 días')).toEqual(ext('3 días, 5 mm, Puno, Cusco'));
  });
  it('es determinista y no comparte estado entre llamadas', () => {
    const t = 'Alerta roja en Piura el 20/12/2026 a las 8:00, 30 mm.';
    const primera = ext(t);
    ext('16/11/2026 Cusco 5 mm nivel alto');
    expect(ext(t)).toEqual(primera);
  });
  it('los datos son objetos congelados', () => {
    const [dato] = extraerCriticos('5 mm');
    expect(Object.isFrozen(dato)).toBe(true);
  });
  it('un valor que no es texto da una lista vacía y un texto sin datos también', () => {
    for (const valor of [undefined, null, 5, {}, []]) expect(extraerCriticos(valor as never)).toEqual([]);
    expect(extraerCriticos('')).toEqual([]);
    expect(ext('Se pide calma a la población.')).toEqual([]);
  });
});

describe('Control del plazo durante la extracción', () => {
  it('llama a la función de control varias veces y propaga lo que lance', () => {
    let llamadas = 0;
    extraerCriticosControlado('16/11/2026 Puno 5 mm', () => {
      llamadas += 1;
    });
    expect(llamadas).toBeGreaterThanOrEqual(10);
    expect(() =>
      extraerCriticosControlado('16/11/2026', () => {
        throw new Error('abortar');
      }),
    ).toThrow('abortar');
  });
});

describe('Marcadores de instrucción', () => {
  it.each([
    ['Se recomienda abrigar a los niños'],
    ['Recomendamos evitar salir'],
    ['El personal debe permanecer en casa'],
    ['Evite cruzar los ríos'],
    ['Es importante mantener la calma'],
    ['Se debe proteger los cultivos'],
  ])('detecta un marcador en "%s"', (entrada) => {
    expect(contieneMarcadoresDeInstruccion(entrada)).toBe(true);
  });
  it('no detecta un texto sin marcadores', () => {
    expect(contieneMarcadoresDeInstruccion('Alerta naranja por helada en Puno el 16/11/2026.')).toBe(false);
    expect(contieneMarcadoresDeInstruccion('')).toBe(false);
    expect(contieneMarcadoresDeInstruccion(undefined as never)).toBe(false);
  });
  it('LÍMITE: no detecta todas las instrucciones, solo las expresiones cerradas', () => {
    expect(contieneMarcadoresDeInstruccion('Abrigue a los niños y proteja los cultivos.')).toBe(false);
  });
});

describe('Avisos reales de data/prueba', () => {
  const datos = JSON.parse(readFileSync(new URL('../../data/prueba/alertas.json', import.meta.url), 'utf8')) as {
    alertas: { id: string; aviso: { textoOriginal: string } }[];
  };
  it('el primer aviso da exactamente sus fechas, lugares, nivel y la cifra de "Teletexto 2.0"', () => {
    expect(ext(datos.alertas[0]?.aviso.textoOriginal ?? '')).toEqual([
      'cifra=2.0',
      'fecha=2026-11-16',
      'fecha=2026-12-15',
      'lugar=cusco',
      'lugar=puno',
      'nivel=color:naranja',
    ]);
  });
  it('los cuatro avisos tienen su nivel en color, al menos una fecha y un lugar', () => {
    expect(datos.alertas).toHaveLength(4);
    const colores = datos.alertas.map((a) => ext(a.aviso.textoOriginal).find((d) => d.startsWith('nivel=')));
    expect(colores).toEqual(['nivel=color:naranja', 'nivel=color:amarillo', 'nivel=color:rojo', 'nivel=color:verde']);
    for (const alerta of datos.alertas) {
      const extraidos = ext(alerta.aviso.textoOriginal);
      expect(extraidos.some((d) => d.startsWith('fecha=2026-')), alerta.id).toBe(true);
      expect(extraidos.some((d) => d.startsWith('lugar=')), alerta.id).toBe(true);
    }
  });
  it('los nombres de las fuentes (SENAMHI, INDECI) no se toman como lugares', () => {
    for (const alerta of datos.alertas) {
      expect(ext(alerta.aviso.textoOriginal).filter((d) => d.startsWith('lugar=')).every((d) => !/senamhi|indeci/.test(d))).toBe(true);
    }
  });
});

describe('Tiempo de extracción con textos de tamaño máximo y casos adversos', () => {
  const adversos: [string, string][] = [
    ['dígitos', '1'.repeat(20_000)],
    ['números con separadores', '1.'.repeat(10_000)],
    ['coma y punto alternados', '1,2.'.repeat(5_000)],
    ['espacios', ' '.repeat(20_000)],
    ['letras', 'a'.repeat(20_000)],
    ['fechas incompletas', '9 de '.repeat(4_000)],
    ['contextos de nivel', 'alerta de nivel '.repeat(1_250)],
    ['"nivel" repetido', 'nivel '.repeat(3_300)],
    ['guiones y barras', '1-2/3-'.repeat(3_300)],
    ['horas incompletas', '12:'.repeat(6_600)],
    ['unidades', '5 mm '.repeat(4_000)],
    ['lugares', 'Puno '.repeat(4_000)],
    ['una palabra larga repetida', 'treinta '.repeat(2_500)],
  ];
  it.each(adversos)('termina muy por debajo de un segundo con %s', (_nombre, entrada) => {
    expect(entrada.length).toBeLessThanOrEqual(20_000);
    const antes = performance.now();
    const datosExtraidos = extraerCriticos(entrada);
    const duracion = performance.now() - antes;
    expect(Array.isArray(datosExtraidos)).toBe(true);
    expect(duracion).toBeLessThan(1000);
  });
});

describe('Pureza del módulo', () => {
  const fuente = readFileSync(new URL('./criticos.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no usa red, almacenamiento, reloj, temporizadores ni azar', () => {
    for (const prohibido of [
      'window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'Date', 'performance',
      'setTimeout', 'setInterval', 'Math.random', 'process', 'require(', 'console', 'readFileSync', 'node:',
    ]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });
  it('solo importa el catálogo de lugares', () => {
    expect([...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual(['./lugares.ts']);
  });
});
