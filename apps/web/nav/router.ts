// Router del cliente (tarea 4.6): número de página, URL y resolución contra el manifiesto.
// Requisitos 5.4, 5.6, 5.11, 5.12, 5.13, 6.7, 6.8 y 17.2.
//
// Todo es lógica pura: no lee `window`, `location` ni `history`, no usa el reloj ni la red. Quien navega (el shell) pasa
// aquí el `pathname` y el manifiesto ya cargado, y recibe un resultado que decide qué mostrar.

import {
  MAX_TITULO_PAGINA,
  NUMERO_PAGINA_MAXIMO,
  NUMERO_PAGINA_MINIMO,
  type EntradaManifiestoPagina,
  type Manifiesto,
  type PageNumber,
} from '@teletexto/modelo';

/** La Portada es la Página 100 (Requisitos 1.1 y 5.6). Es la única página que no necesita estar en el manifiesto. */
export const NUMERO_PORTADA: PageNumber = 100;

/** Una ruta de página es `/` seguida de exactamente tres dígitos ASCII, con una barra final opcional. */
const RUTA_DE_PAGINA = /^\/(\d{3})\/?$/;

/**
 * Verdadero si el valor es un Número_de_Página válido: un entero de tres dígitos, de 100 a 999 (Requisito 17.3).
 * Acepta cualquier valor y devuelve falso para textos como `'101'`, decimales, `NaN`, infinitos, `null` y `undefined`.
 */
export function isValidPageNumber(n: unknown): n is PageNumber {
  return Number.isInteger(n) && (n as number) >= NUMERO_PAGINA_MINIMO && (n as number) <= NUMERO_PAGINA_MAXIMO;
}

/**
 * URL canónica de una página: `/NNN`, sin prefijo ni hash (por ejemplo `/101`). Devuelve `undefined` si el número no es
 * un Número_de_Página válido. Cada página tiene una sola URL canónica (Requisito 5.11).
 */
export function pageToUrl(n: number): string | undefined {
  return isValidPageNumber(n) ? `/${n}` : undefined;
}

/**
 * Número de página de un `pathname`, o `undefined` si la ruta no corresponde a ninguna página con forma válida.
 * Acepta `/NNN` y `/NNN/`. La cadena vacía y `/` son la Portada (100), porque abrir el cliente sin número muestra la
 * Portada (Requisito 1.1). No decide si la página existe: para eso está `resolverRuta`.
 *
 * Recibe solo la ruta: una consulta (`?x`), un hash (`#x`), espacios, porcentajes, otros prefijos, extensiones
 * (`/101.json`), ceros de más (`/0101`) o números fuera de 100 a 999 no corresponden a ninguna página.
 */
export function urlToPage(path: string): PageNumber | undefined {
  if (typeof path !== 'string') return undefined;
  if (path === '' || path === '/') return NUMERO_PORTADA;
  const coincidencia = RUTA_DE_PAGINA.exec(path);
  if (coincidencia === null) return undefined;
  const numero = Number(coincidencia[1]);
  return isValidPageNumber(numero) ? numero : undefined;
}

/** Resultado de resolver un número o una ruta contra el manifiesto. */
export type Resolucion =
  /** Es la Portada (100). `entrada` es la del manifiesto si existe y está completa; no se inventa ninguna ni se supone una ruta de contenido. */
  | { readonly tipo: 'portada'; readonly numero: PageNumber; readonly entrada: EntradaManifiestoPagina | undefined }
  /** Es otra página que está en el manifiesto. */
  | { readonly tipo: 'pagina'; readonly numero: PageNumber; readonly entrada: EntradaManifiestoPagina }
  /**
   * La página no existe: la vista muestra "Página no encontrada" con la opción de volver a la Portada y conserva la página
   * anterior (Requisitos 5.4, 5.13 y 6.8). `numero` es el número pedido si era un número finito, aunque no sea válido.
   */
  | { readonly tipo: 'no_encontrada'; readonly numero: number | undefined };

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Texto con al menos un carácter. */
const esTextoNoVacio = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;

/** Entero (seguro) igual o mayor que `minimo`. Rechaza decimales, `NaN`, infinitos y todo lo que no sea un número. */
const esEnteroDesde = (valor: unknown, minimo: number): valor is number => Number.isSafeInteger(valor) && (valor as number) >= minimo;

/**
 * Verdadero solo si el valor tiene TODOS los campos de `EntradaManifiestoPagina`, propios y con su tipo y restricciones:
 * - `numero`: un Número_de_Página válido (entero de 100 a 999, igual que `comun.schema.json`).
 * - `titulo`: texto de 1 a 40 caracteres (`MAX_TITULO_PAGINA`; la misma regla que el título de la página en `page.schema.json`,
 *   que cuenta caracteres Unicode y no unidades UTF-16).
 * - `ruta` y `hash`: textos no vacíos. El proyecto no define su formato, así que no se inventa ninguno.
 * - `bytes`: entero no negativo (es un tamaño en bytes). El proyecto no define un máximo, así que no se inventa ninguno.
 * - `umbralHoras`: entero de 1 o más (igual que `page.schema.json`; el valor concreto lo fijan los datos).
 * Los campos de más se aceptan. Un arreglo o un objeto que solo hereda los campos no es una entrada.
 */
function esEntradaCompleta(entrada: unknown): entrada is EntradaManifiestoPagina {
  if (!esObjeto(entrada)) return false;
  const campos = ['numero', 'titulo', 'ruta', 'hash', 'bytes', 'umbralHoras'];
  if (!campos.every((campo) => Object.hasOwn(entrada, campo))) return false;
  const { numero, titulo, ruta, hash, bytes, umbralHoras } = entrada;
  return (
    isValidPageNumber(numero) &&
    esTextoNoVacio(titulo) &&
    Array.from(titulo).length <= MAX_TITULO_PAGINA &&
    esTextoNoVacio(ruta) &&
    esTextoNoVacio(hash) &&
    esEnteroDesde(bytes, 0) &&
    esEnteroDesde(umbralHoras, 1)
  );
}

/**
 * Primera entrada COMPLETA del manifiesto con ese número, o `undefined`. El manifiesto viene de la red y no se confía en él:
 * una entrada con el número correcto pero con campos ausentes o de otro tipo no cuenta, y si hay entradas repetidas se
 * ignoran las incompletas y vale la primera completa. Del manifiesto solo se lee `paginas`: `version`, `generadoEn` y
 * `recursos` no hacen falta para resolver páginas.
 */
function entradaDelManifiesto(manifiesto: Manifiesto | null | undefined, numero: PageNumber): EntradaManifiestoPagina | undefined {
  const paginas: unknown = manifiesto?.paginas;
  if (!Array.isArray(paginas)) return undefined;
  return paginas.find((entrada): entrada is EntradaManifiestoPagina => esEntradaCompleta(entrada) && entrada.numero === numero);
}
/**
 * Decide qué hacer con un número de página pedido por el teclado, el menú o una URL:
 * - 100 es siempre la Portada, esté o no en el manifiesto (Requisito 5.6).
 * - Cualquier otro número válido debe estar en el manifiesto. No hay una lista fija de páginas, así que agregar una
 *   página con datos y configuración la hace alcanzable sin tocar este código (Requisito 17.2).
 * - Todo lo demás es "no encontrada" (Requisitos 5.4 y 6.8).
 * Solo cuenta una entrada del manifiesto completa y bien tipada (ver `esEntradaCompleta`): una entrada con el número correcto
 * pero incompleta es como si no existiera. Si el manifiesto repite el número, vale la primera entrada completa. Para la Portada,
 * si no hay una entrada completa, se resuelve igual con `entrada: undefined`. No modifica el manifiesto.
 */
export function resolverPagina(manifiesto: Manifiesto | null | undefined, numero: number): Resolucion {
  if (!isValidPageNumber(numero)) {
    return { tipo: 'no_encontrada', numero: typeof numero === 'number' && Number.isFinite(numero) ? numero : undefined };
  }
  const entrada = entradaDelManifiesto(manifiesto, numero);
  if (numero === NUMERO_PORTADA) return { tipo: 'portada', numero, entrada };
  if (entrada === undefined) return { tipo: 'no_encontrada', numero };
  return { tipo: 'pagina', numero, entrada };
}

/**
 * Resuelve un `pathname` (la URL que abrió o compartió el usuario) contra el manifiesto. Una ruta que no tiene forma de
 * página (`/abc`, `/099`, `/1000`, `/101.json`) y una ruta con forma válida pero ausente del manifiesto dan "no encontrada"
 * (Requisitos 5.12 y 5.13). `/` y la cadena vacía son la Portada.
 */
export function resolverRuta(manifiesto: Manifiesto | null | undefined, path: string): Resolucion {
  const numero = urlToPage(path);
  if (numero === undefined) return { tipo: 'no_encontrada', numero: undefined };
  return resolverPagina(manifiesto, numero);
}
