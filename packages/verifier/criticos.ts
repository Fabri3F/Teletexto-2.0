// Extracción de Datos_Críticos (tarea 10.1). Requisitos 11.3, 12.1, 12.2 y 12.4.
//
// `extraerCriticos(texto)` devuelve, sin repetidos y en un orden fijo, las cifras, fechas, horas, lugares y niveles que reconoce. Es
// determinista, no usa red ni modelos de lenguaje y solo conoce los patrones de este archivo. Lo que no reconoce NO se detecta: el
// verificador no puede afirmar que "no se detectó nada" significa "no cambió nada" (ver los límites en `verificar.ts`).
//
// Reglas de normalización, todas listadas aquí y ninguna más:
// - Texto: Unicode NFC, minúsculas y espacios colapsados. No se quitan tildes, no se unifican sinónimos y los signos de puntuación
//   solo separan.
// - Fechas: formatos cerrados (`DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`, `D de <mes> [de AAAA]`, `<mes> de AAAA`, `<mes>`). Se guardan
//   como `AAAA-MM-DD` o como una versión truncada con solo los componentes escritos (`2026-11`, `--11-16`, `--11`). Nunca se completa un
//   componente ausente. Una fecha imposible (30 de febrero) no se interpreta y sus números quedan como cifras literales.
// - Horas: `H:mm` o `HH:mm`, con `a. m.`, `p. m.`, `h` u `horas` opcionales. Se guardan como `HH:mm` de 24 horas.
// - Niveles: solo una palabra de nivel o de color dentro de un contexto ("nivel", "alerta", "alarma", "aviso" o "semáforo"). El color
//   y el nivel normalizado son valores distintos: "naranja" NO equivale a "alto". Solo se unifica el género (rojo/roja).
// - Lugares: solo el catálogo cerrado de los 25 Departamentos (`lugares.ts`). Las variantes ortográficas de un nombre dan el mismo valor.
// - Cifras: el número se guarda tal como está escrito (`1.000`, `1,000` y `1000` son tres valores distintos), con su signo explícito
//   ("-", "−", "–", "+", o la palabra "menos" justo delante, o "bajo cero" detrás). Su unidad sale de una tabla cerrada de abreviaturas
//   y nombres de unidad (sin convertir magnitudes); si no está en la tabla, la unidad es la palabra siguiente, comparada tal cual.
// - Números en palabras: solo un vocabulario cerrado, comparado tal cual ("dos" no equivale a "2"). "un", "una" y "uno" son ambiguos y
//   solo cuentan cuando les sigue una unidad de la tabla ("una hora").
// - Expresiones relativas ("hoy", "mañana", "esta noche"…): se guardan literales como fecha relativa. No se convierten en fechas.
//
// Los patrones usan alternativas de literales y cuantificadores simples, sin cuantificadores anidados, así que no tienen retroceso
// catastrófico. Las entradas de `verificar` están acotadas aparte.
import { LUGARES } from './lugares.ts';

export type TipoDato = 'cifra' | 'fecha' | 'hora' | 'lugar' | 'nivel';

/** Un Dato_Crítico. `unidad` solo existe en las cifras que la tienen. */
export type DatoCritico =
  | { readonly tipo: 'cifra'; readonly valor: string; readonly unidad?: string }
  | { readonly tipo: 'fecha'; readonly valor: string }
  | { readonly tipo: 'hora'; readonly valor: string }
  | { readonly tipo: 'lugar'; readonly valor: string }
  | { readonly tipo: 'nivel'; readonly valor: string };

const ORDEN_TIPO: Readonly<Record<TipoDato, number>> = { cifra: 0, fecha: 1, hora: 2, lugar: 3, nivel: 4 };

/** Texto en NFC, en minúsculas y con los espacios colapsados. Es la única normalización del texto. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const LETRAS = '\\p{L}\\p{N}';
const ANTES = `(?<![${LETRAS}])`;
const DESPUES = `(?![${LETRAS}])`;

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Alternativa de literales, la más larga primero para que gane el nombre completo. */
function alternar(formas: readonly string[]): string {
  return [...formas].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map(escapar).join('|');
}

type Grupos = Readonly<Record<string, string | undefined>>;
type Interpretar = (coincidencia: string, grupos: Grupos, desplazamiento: number, completo: string) => readonly DatoCritico[] | null;

/**
 * Busca `regex` en `texto`. Cada coincidencia que `interpretar` acepta añade sus datos a `salida` y se sustituye por espacios, para
 * que las fases siguientes no la vuelvan a leer. Una coincidencia rechazada (`null`) se deja intacta.
 */
function consumir(texto: string, regex: RegExp, interpretar: Interpretar, salida: DatoCritico[], controlar: () => void): string {
  controlar();
  let contador = 0;
  return texto.replace(regex, (...args: unknown[]) => {
    if (++contador % 200 === 0) controlar();
    const coincidencia = args[0] as string;
    const grupos = (args[args.length - 1] ?? {}) as Grupos;
    const completo = args[args.length - 2] as string;
    const desplazamiento = args[args.length - 3] as number;
    const datos = interpretar(coincidencia, grupos, desplazamiento, completo);
    if (datos === null) return coincidencia;
    salida.push(...datos);
    return ' '.repeat(coincidencia.length);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Fechas

const MESES: ReadonlyMap<string, number> = new Map([
  ['enero', 1], ['febrero', 2], ['marzo', 3], ['abril', 4], ['mayo', 5], ['junio', 6], ['julio', 7], ['agosto', 8],
  ['septiembre', 9], ['setiembre', 9], ['octubre', 10], ['noviembre', 11], ['diciembre', 12],
]);
const MESES_ALT = alternar([...MESES.keys()]);

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

function diasEnMes(mes: number, anio: number | undefined): number {
  if (mes === 2) {
    if (anio === undefined) return 29;
    return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0) ? 29 : 28;
  }
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

/** Fecha con los componentes escritos, o `null` si el calendario no la admite. No completa ningún componente ausente. */
function fecha(dia: number | undefined, mes: number | undefined, anio: number | undefined): readonly DatoCritico[] | null {
  if (mes === undefined || mes < 1 || mes > 12) return null;
  if (dia !== undefined && (dia < 1 || dia > diasEnMes(mes, anio))) return null;
  const m = dosDigitos(mes);
  const a = anio === undefined ? undefined : String(anio).padStart(4, '0');
  let valor: string;
  if (a !== undefined && dia !== undefined) valor = `${a}-${m}-${dosDigitos(dia)}`;
  else if (a !== undefined) valor = `${a}-${m}`;
  else if (dia !== undefined) valor = `--${m}-${dosDigitos(dia)}`;
  else valor = `--${m}`;
  return [{ tipo: 'fecha', valor }];
}

function entero(texto: string | undefined): number | undefined {
  return texto === undefined ? undefined : Number.parseInt(texto, 10);
}

const FECHA_ISO = new RegExp(`${ANTES}(?<a>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})${DESPUES}`, 'gu');
const FECHA_NUMERICA = new RegExp(`${ANTES}(?<d>\\d{1,2})[/-](?<m>\\d{1,2})[/-](?<a>\\d{4})${DESPUES}`, 'gu');
const FECHA_TEXTO = new RegExp(`${ANTES}(?<d>\\d{1,2}) de (?<mes>${MESES_ALT})(?: (?:de|del) (?<a>\\d{4}))?${DESPUES}`, 'gu');
const FECHA_MES_ANIO = new RegExp(`${ANTES}(?<mes>${MESES_ALT}) (?:de|del) (?<a>\\d{4})${DESPUES}`, 'gu');
const FECHA_MES = new RegExp(`${ANTES}(?<mes>${MESES_ALT})${DESPUES}`, 'gu');

// ---------------------------------------------------------------------------------------------------------------------------------
// Horas

const HORA = new RegExp(
  `${ANTES}(?<h>\\d{1,2}):(?<mi>\\d{2})(?: ?(?<suf>a\\.? ?m\\.?|p\\.? ?m\\.?|horas|hrs|hs|h))?${DESPUES}`,
  'gu',
);

function hora(grupos: Grupos): readonly DatoCritico[] | null {
  const h = entero(grupos['h']);
  const mi = entero(grupos['mi']);
  if (h === undefined || mi === undefined || mi > 59) return null;
  const sufijo = grupos['suf'];
  let h24 = h;
  if (sufijo !== undefined && (sufijo.startsWith('a') || sufijo.startsWith('p'))) {
    if (h < 1 || h > 12) return null;
    const pasado = sufijo.startsWith('p');
    h24 = pasado ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
  } else if (h > 23) {
    return null;
  }
  return [{ tipo: 'hora', valor: `${dosDigitos(h24)}:${dosDigitos(mi)}` }];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Niveles

const NIVEL = new RegExp(
  `${ANTES}(?:nivel|alerta|alarma|aviso|sem[aá]foro)(?: (?:de|en))?(?: (?:nivel|alerta|color))? ` +
    `(?<v>muy alt[oa]|verde|amarill[oa]|naranja|roj[oa]|baj[oa]|moderad[oa]|alt[oa])${DESPUES}`,
  'gu',
);
const NIVEL_DE_COLOR: ReadonlySet<string> = new Set(['verde', 'amarillo', 'naranja', 'rojo']);

function nivel(valorEscrito: string): readonly DatoCritico[] {
  const v = valorEscrito
    .replace(/^muy alt[oa]$/, 'muy alto')
    .replace(/^amarill[oa]$/, 'amarillo')
    .replace(/^roj[oa]$/, 'rojo')
    .replace(/^baj[oa]$/, 'bajo')
    .replace(/^moderad[oa]$/, 'moderado')
    .replace(/^alt[oa]$/, 'alto');
  return [{ tipo: 'nivel', valor: NIVEL_DE_COLOR.has(v) ? `color:${v}` : `nivel:${v}` }];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lugares

const LUGAR_POR_FORMA: ReadonlyMap<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const lugar of Object.values(LUGARES)) {
    const canonico = normalizarTexto(lugar.nombre);
    for (const variante of lugar.variantes) mapa.set(normalizarTexto(variante), canonico);
    mapa.set(canonico, canonico);
  }
  return mapa;
})();
const LUGAR = new RegExp(`${ANTES}(?<l>${alternar([...LUGAR_POR_FORMA.keys()])})${DESPUES}`, 'gu');

// ---------------------------------------------------------------------------------------------------------------------------------
// Expresiones relativas de tiempo (literales, sin convertir)

const RELATIVA = new RegExp(`${ANTES}(?<e>pasado mañana|anteayer|anoche|esta (?:noche|tarde|mañana|madrugada)|hoy|mañana|ayer)${DESPUES}`, 'gu');

// ---------------------------------------------------------------------------------------------------------------------------------
// Cifras, unidades y números en palabras

/** Tabla cerrada de unidades: identificador y las formas escritas que lo designan. No se convierte ninguna magnitud. */
const TABLA_UNIDADES: readonly (readonly [string, readonly string[]])[] = [
  ['%', ['%', 'por ciento', 'porciento']],
  ['°c', ['°c', 'º c', 'ºc', '° c', 'grados celsius', 'grados centígrados', 'grados centigrados', 'grado celsius', 'grado centígrado', 'grado centigrado']],
  ['°f', ['°f', 'º f', 'ºf', '° f', 'grados fahrenheit', 'grado fahrenheit']],
  ['grados', ['grados', 'grado', '°', 'º']],
  ['mm', ['mm', 'milímetro', 'milímetros', 'milimetro', 'milimetros']],
  ['cm', ['cm', 'centímetro', 'centímetros', 'centimetro', 'centimetros']],
  ['m', ['m', 'metro', 'metros']],
  ['km', ['km', 'kilómetro', 'kilómetros', 'kilometro', 'kilometros']],
  ['m/s', ['m/s', 'metros por segundo']],
  ['km/h', ['km/h', 'kilómetros por hora', 'kilometros por hora', 'km por hora']],
  ['mm/h', ['mm/h', 'milímetros por hora', 'milimetros por hora']],
  ['l/m²', ['l/m²', 'l/m2', 'litros por metro cuadrado', 'litros por m²', 'litros por m2']],
  ['m³/s', ['m³/s', 'm3/s', 'metros cúbicos por segundo', 'metros cubicos por segundo']],
  ['hpa', ['hpa', 'hectopascal', 'hectopascales']],
  ['h', ['h', 'hs', 'hrs', 'hora', 'horas']],
  ['min', ['min', 'minuto', 'minutos']],
  ['seg', ['seg', 'segundo', 'segundos']],
  ['día', ['día', 'días', 'dia', 'dias']],
  ['semana', ['semana', 'semanas']],
  ['mes', ['mes', 'meses']],
  ['año', ['año', 'años', 'ano', 'anos']],
  ['ha', ['ha', 'hectárea', 'hectáreas', 'hectarea', 'hectareas']],
  ['kg', ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos']],
  ['litro', ['litro', 'litros']],
  ['tonelada', ['tonelada', 'toneladas']],
];
const UNIDAD_POR_FORMA: ReadonlyMap<string, string> = new Map(TABLA_UNIDADES.flatMap(([id, formas]) => formas.map((f) => [f, id] as const)));
const UNIDADES_ALT = alternar([...UNIDAD_POR_FORMA.keys()]);
const UNIDADES_EN_PALABRAS_ALT = alternar([...UNIDAD_POR_FORMA.keys()].filter((f) => /^\p{L}{3,}$/u.test(f)));

/** Palabras que no se toman como unidad cuando siguen a un número ("5 de los niños"). */
const PALABRAS_FUNCIONALES: ReadonlySet<string> = new Set([
  'a', 'al', 'ante', 'bajo', 'como', 'con', 'contra', 'de', 'del', 'desde', 'durante', 'e', 'el', 'en', 'entre', 'hacia', 'hasta', 'la',
  'las', 'lo', 'los', 'más', 'mas', 'ni', 'o', 'para', 'pero', 'por', 'que', 'se', 'sin', 'sobre', 'su', 'sus', 'tras', 'u', 'un', 'una',
  'unas', 'uno', 'unos', 'y',
]);

/** Vocabulario cerrado de números en palabras. Cada forma da su escritura canónica (solo se unifica la tilde). */
const PALABRAS_NUMERO: ReadonlyMap<string, string> = new Map([
  ['cero', 'cero'], ['dos', 'dos'], ['tres', 'tres'], ['cuatro', 'cuatro'], ['cinco', 'cinco'], ['seis', 'seis'], ['siete', 'siete'],
  ['ocho', 'ocho'], ['nueve', 'nueve'], ['diez', 'diez'], ['once', 'once'], ['doce', 'doce'], ['trece', 'trece'], ['catorce', 'catorce'],
  ['quince', 'quince'], ['dieciséis', 'dieciséis'], ['dieciseis', 'dieciséis'], ['diecisiete', 'diecisiete'], ['dieciocho', 'dieciocho'],
  ['diecinueve', 'diecinueve'], ['veinte', 'veinte'], ['veintiuno', 'veintiuno'], ['veintidós', 'veintidós'], ['veintidos', 'veintidós'],
  ['veintitrés', 'veintitrés'], ['veintitres', 'veintitrés'], ['veinticuatro', 'veinticuatro'], ['veinticinco', 'veinticinco'],
  ['veintiséis', 'veintiséis'], ['veintiseis', 'veintiséis'], ['veintisiete', 'veintisiete'], ['veintiocho', 'veintiocho'],
  ['veintinueve', 'veintinueve'], ['treinta', 'treinta'], ['cuarenta', 'cuarenta'], ['cincuenta', 'cincuenta'], ['sesenta', 'sesenta'],
  ['setenta', 'setenta'], ['ochenta', 'ochenta'], ['noventa', 'noventa'], ['cien', 'cien'], ['ciento', 'ciento'],
  ['doscientos', 'doscientos'], ['doscientas', 'doscientas'], ['trescientos', 'trescientos'], ['trescientas', 'trescientas'],
  ['cuatrocientos', 'cuatrocientos'], ['cuatrocientas', 'cuatrocientas'], ['quinientos', 'quinientos'], ['quinientas', 'quinientas'],
  ['seiscientos', 'seiscientos'], ['seiscientas', 'seiscientas'], ['setecientos', 'setecientos'], ['setecientas', 'setecientas'],
  ['ochocientos', 'ochocientos'], ['ochocientas', 'ochocientas'], ['novecientos', 'novecientos'], ['novecientas', 'novecientas'],
  ['mil', 'mil'], ['millón', 'millón'], ['millon', 'millón'], ['millones', 'millones'],
]);

const CIFRA = new RegExp(
  `(?<![${LETRAS}.,])(?<sg>[+\\-−–]?)(?<n>\\d+(?:[.,]\\d+)*)(?:(?<sp> ?)(?<u>${UNIDADES_ALT})(?![${LETRAS}]))?`,
  'gu',
);
const PALABRA_NUMERO = new RegExp(
  `${ANTES}(?<w>${alternar([...PALABRAS_NUMERO.keys()])})${DESPUES}(?: (?<u>${UNIDADES_ALT})(?![${LETRAS}]))?`,
  'gu',
);
const ARTICULO_CON_UNIDAD = new RegExp(`${ANTES}(?<w>un|una|uno) (?<u>${UNIDADES_EN_PALABRAS_ALT})${DESPUES}`, 'gu');
const PALABRA_SIGUIENTE = /^ (\p{L}+)(?![\p{L}\p{N}])/u;

/** Unidad de una cifra: la de la tabla si está pegada al número; si no, la palabra siguiente, comparada tal cual. */
function unidadDe(grupos: Grupos, resto: string): string | undefined {
  const forma = grupos['u'];
  if (forma !== undefined) return UNIDAD_POR_FORMA.get(forma);
  const palabra = PALABRA_SIGUIENTE.exec(resto)?.[1];
  if (palabra === undefined || PALABRAS_FUNCIONALES.has(palabra)) return undefined;
  return `palabra:${palabra}`;
}

function cifra(valor: string, unidad: string | undefined): readonly DatoCritico[] {
  return [unidad === undefined ? { tipo: 'cifra', valor } : { tipo: 'cifra', valor, unidad }];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// API

/** Equivalente a `extraerCriticos`, con una función que se llama entre las fases y puede lanzar para abortar (plazo de `verificar`). */
export function extraerCriticosControlado(texto: string, controlar: () => void): DatoCritico[] {
  if (typeof texto !== 'string') return [];
  const datos: DatoCritico[] = [];
  let t = normalizarTexto(texto);

  t = consumir(t, FECHA_ISO, (_m, g) => fecha(entero(g['d']), entero(g['m']), entero(g['a'])), datos, controlar);
  t = consumir(t, FECHA_NUMERICA, (_m, g) => fecha(entero(g['d']), entero(g['m']), entero(g['a'])), datos, controlar);
  t = consumir(t, FECHA_TEXTO, (_m, g) => fecha(entero(g['d']), MESES.get(g['mes'] ?? ''), entero(g['a'])), datos, controlar);
  t = consumir(t, FECHA_MES_ANIO, (_m, g) => fecha(undefined, MESES.get(g['mes'] ?? ''), entero(g['a'])), datos, controlar);
  t = consumir(t, FECHA_MES, (_m, g) => fecha(undefined, MESES.get(g['mes'] ?? ''), undefined), datos, controlar);
  t = consumir(t, HORA, (_m, g) => hora(g), datos, controlar);
  t = consumir(t, NIVEL, (_m, g) => nivel(g['v'] ?? ''), datos, controlar);
  t = consumir(t, LUGAR, (_m, g) => [{ tipo: 'lugar', valor: LUGAR_POR_FORMA.get(g['l'] ?? '') ?? (g['l'] ?? '') }], datos, controlar);
  t = consumir(t, RELATIVA, (_m, g) => [{ tipo: 'fecha', valor: `relativa:${g['e'] ?? ''}` }], datos, controlar);
  t = consumir(
    t,
    CIFRA,
    (m, g, desplazamiento, completo) => {
      let signo = g['sg'] === undefined || g['sg'] === '' ? '' : g['sg'] === '+' ? '+' : '-';
      if (signo === '' && completo.slice(0, desplazamiento).endsWith('menos ')) signo = '-';
      const resto = completo.slice(desplazamiento + m.length);
      if (signo === '' && resto.startsWith(' bajo cero')) signo = '-';
      return cifra(`${signo}${g['n'] ?? ''}`, unidadDe(g, resto));
    },
    datos,
    controlar,
  );
  t = consumir(
    t,
    PALABRA_NUMERO,
    (m, g, desplazamiento, completo) => cifra(PALABRAS_NUMERO.get(g['w'] ?? '') ?? (g['w'] ?? ''), unidadDe(g, completo.slice(desplazamiento + m.length))),
    datos,
    controlar,
  );
  consumir(t, ARTICULO_CON_UNIDAD, (_m, g) => cifra(g['w'] ?? '', UNIDAD_POR_FORMA.get(g['u'] ?? '')), datos, controlar);
  controlar();

  const vistos = new Set<string>();
  const unicos: DatoCritico[] = [];
  for (const dato of datos) {
    const clave = claveDe(dato);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(Object.freeze(dato));
  }
  return unicos.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || (claveDe(a) < claveDe(b) ? -1 : claveDe(a) > claveDe(b) ? 1 : 0));
}

/** Clave única de un dato (tipo, valor y unidad). */
export function claveDe(dato: DatoCritico): string {
  return `${dato.tipo}\u0000${dato.valor}\u0000${dato.tipo === 'cifra' ? (dato.unidad ?? '') : ''}`;
}

/**
 * Datos críticos de un texto: cifras, fechas, horas, lugares y niveles, sin repetidos y en orden fijo (por tipo, valor y unidad).
 * Un valor que no es texto da una lista vacía. Esa lista vacía no significa que el texto no tenga datos críticos: `verificar` valida
 * antes que las entradas sean texto.
 */
export function extraerCriticos(texto: string): DatoCritico[] {
  return extraerCriticosControlado(texto, () => undefined);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Marcadores de instrucción

/** Expresiones cerradas con las que un aviso suele dar una instrucción. La lista no es exhaustiva: no detecta todas las instrucciones. */
const MARCADORES_INSTRUCCION = new RegExp(
  `${ANTES}(?:${alternar([
    'se recomienda', 'se recomiendan', 'recomendamos', 'se recomienda que', 'se sugiere', 'sugerimos', 'se aconseja', 'aconsejamos', 'se debe',
    'se deben', 'debe', 'deben', 'debes', 'deberá', 'deberán', 'es necesario', 'es importante', 'evite', 'eviten', 'evita', 'evitar', 'se exhorta',
    'exhortamos', 'se solicita', 'se pide', 'se prohíbe', 'queda prohibido',
  ])})${DESPUES}`,
  'u',
);

/** `true` si el texto contiene alguno de los marcadores cerrados de instrucción. No detecta todas las instrucciones posibles. */
export function contieneMarcadoresDeInstruccion(texto: string): boolean {
  return typeof texto === 'string' && MARCADORES_INSTRUCCION.test(normalizarTexto(texto));
}
