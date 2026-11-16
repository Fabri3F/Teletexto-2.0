// Parser_de_Contenido (design.md, "Servicio_Contenido"): convierte archivos de datos JSON en objetos
// Página y DatasetAlertas validados contra los esquemas de @teletexto/modelo (Requisitos 13.1 a 13.4,
// 13.8 y 17.3). Es una función pura: no escribe nada ni conserva estado, así que un rechazo nunca
// altera el contenido publicado previamente.

import {
  NUMERO_PAGINA_MAXIMO,
  NUMERO_PAGINA_MINIMO,
  type DatasetAlertas,
  type Page,
  type Precio,
} from '@teletexto/modelo';
import { esFechaCalendarioReal, esFechaHoraUtcReal, instanteUtc } from './fechas.ts';
import { err, ok, type Result } from './result.ts';
import type { ConfigError, ConfigProblema, ContentSet, FileInput, PageConfig, ParseError } from './tipos.ts';
import { erroresDeEsquema, validarAlertas, validarPage } from './validacion.ts';

/** Tamaño máximo de un archivo de datos: 1 MB, entendido como 1 MiB (1 048 576 bytes) de UTF-8 (Requisito 13.1). */
export const TAMANO_MAXIMO_ARCHIVO_BYTES = 1_048_576;

/** Nombre del archivo del conjunto único de alertas. Cualquier otro archivo de `loadAll` es una página. */
export const NOMBRE_ARCHIVO_ALERTAS = 'alertas.json';

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

// ------------------------------------------------------------------------------------------------
// Lectura del archivo: vacío, tamaño y JSON válido
// ------------------------------------------------------------------------------------------------

function leerJson(texto: string, archivo: string): Result<unknown, ParseError[]> {
  // Un BOM al inicio no es parte del JSON. Algunos editores de Windows lo añaden al guardar.
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;

  if (contenido.trim().length === 0) {
    return err([{ archivo, causa: 'El archivo no tiene contenido.', regla: 'El archivo no puede estar vacío' }]);
  }

  const bytes = Buffer.byteLength(contenido, 'utf8');
  if (bytes > TAMANO_MAXIMO_ARCHIVO_BYTES) {
    return err([
      {
        archivo,
        causa: `El archivo pesa ${bytes} bytes y el máximo es ${TAMANO_MAXIMO_ARCHIVO_BYTES} bytes (1 MB).`,
        regla: 'El archivo no puede superar 1 MB',
      },
    ]);
  }

  try {
    return ok(JSON.parse(contenido) as unknown);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return err([{ archivo, causa: detalle, regla: 'El contenido debe ser JSON válido' }]);
  }
}

// ------------------------------------------------------------------------------------------------
// esDatoDePrueba ausente o inválido => true (Requisito 10.3)
// ------------------------------------------------------------------------------------------------

/** Un valor ausente o que no sea booleano se trata como dato de prueba. Un `false` explícito se conserva. */
function marcarComoPruebaSiFalta(objeto: Objeto): void {
  if (typeof objeto['esDatoDePrueba'] !== 'boolean') objeto['esDatoDePrueba'] = true;
}

function normalizarRegistros(raiz: unknown, propiedad: 'registros' | 'alertas'): void {
  if (!esObjeto(raiz)) return;
  marcarComoPruebaSiFalta(raiz);
  const elementos = raiz[propiedad];
  if (!Array.isArray(elementos)) return;
  for (const elemento of elementos) {
    if (esObjeto(elemento)) marcarComoPruebaSiFalta(elemento);
  }
}

// ------------------------------------------------------------------------------------------------
// Comprobaciones de fechas que el esquema no puede hacer
// ------------------------------------------------------------------------------------------------

const REGLA_FECHA_HORA_REAL =
  'Debe ser una fecha y hora que exista en el calendario (por ejemplo, el 30 de febrero no existe)';
const REGLA_FECHA_REAL = 'Debe ser una fecha que exista en el calendario (por ejemplo, el 30 de febrero no existe)';

function comprobarFechaHora(archivo: string, campo: string, valor: string, errores: ParseError[]): boolean {
  if (esFechaHoraUtcReal(valor)) return true;
  errores.push({ archivo, campo, regla: REGLA_FECHA_HORA_REAL });
  return false;
}

function comprobarFechasPage(archivo: string, page: Page): ParseError[] {
  const errores: ParseError[] = [];
  comprobarFechaHora(archivo, 'metadatos.publicadoEn', page.metadatos.publicadoEn, errores);
  comprobarFechaHora(archivo, 'metadatos.actualizadoEn', page.metadatos.actualizadoEn, errores);
  if (page.tipo === 'precios') {
    (page.registros as Precio[] | undefined)?.forEach((precio, i) => {
      if (!esFechaCalendarioReal(precio.fecha)) {
        errores.push({ archivo, campo: `registros[${i}].fecha`, regla: REGLA_FECHA_REAL });
      }
    });
  }
  return errores;
}

function comprobarFechasAlertas(archivo: string, dataset: DatasetAlertas): ParseError[] {
  const errores: ParseError[] = [];
  comprobarFechaHora(archivo, 'metadatos.publicadoEn', dataset.metadatos.publicadoEn, errores);
  comprobarFechaHora(archivo, 'metadatos.actualizadoEn', dataset.metadatos.actualizadoEn, errores);

  dataset.alertas.forEach((alerta, i) => {
    const base = `alertas[${i}]`;
    comprobarFechaHora(archivo, `${base}.publicadoEn`, alerta.publicadoEn, errores);
    comprobarFechaHora(archivo, `${base}.actualizadoEn`, alerta.actualizadoEn, errores);
    const inicioValido = comprobarFechaHora(archivo, `${base}.vigencia.inicio`, alerta.vigencia.inicio, errores);
    const finValido = comprobarFechaHora(archivo, `${base}.vigencia.fin`, alerta.vigencia.fin, errores);
    if (alerta.aviso.resumen) {
      comprobarFechaHora(archivo, `${base}.aviso.resumen.verificacion.verificadoEn`, alerta.aviso.resumen.verificacion.verificadoEn, errores);
    }
    // Requisito 13.8: la fecha de fin no puede ser anterior a la de inicio (igual sí se admite).
    if (inicioValido && finValido && instanteUtc(alerta.vigencia.fin) < instanteUtc(alerta.vigencia.inicio)) {
      errores.push({
        archivo,
        campo: `${base}.vigencia.fin`,
        causa: `Inicio: ${alerta.vigencia.inicio}. Fin: ${alerta.vigencia.fin}.`,
        regla: 'La fecha de fin no puede ser anterior a la fecha de inicio',
      });
    }
  });
  return errores;
}

// ------------------------------------------------------------------------------------------------
// Análisis de un archivo (devuelve todos los errores) y API pública de un archivo
// ------------------------------------------------------------------------------------------------

function analizarPage(texto: string, archivo: string): Result<Page, ParseError[]> {
  const json = leerJson(texto, archivo);
  if (!json.ok) return json;
  normalizarRegistros(json.valor, 'registros');
  if (!validarPage(json.valor)) return err(erroresDeEsquema(archivo, validarPage.errors));
  const errores = comprobarFechasPage(archivo, json.valor);
  return errores.length > 0 ? err(errores) : ok(json.valor);
}

function analizarAlertas(texto: string, archivo: string): Result<DatasetAlertas, ParseError[]> {
  const json = leerJson(texto, archivo);
  if (!json.ok) return json;
  normalizarRegistros(json.valor, 'alertas');
  if (!validarAlertas(json.valor)) return err(erroresDeEsquema(archivo, validarAlertas.errors));
  const errores = comprobarFechasAlertas(archivo, json.valor);
  return errores.length > 0 ? err(errores) : ok(json.valor);
}

function primerError(errores: ParseError[], archivo: string): ParseError {
  return errores[0] ?? { archivo, causa: 'Error desconocido.', regla: 'El archivo no es válido' };
}

/**
 * Convierte el texto de un archivo de página (`NNN.json`) en una Página validada. Si hay varios
 * problemas devuelve el primero; `loadAll` devuelve todos.
 */
export function parsePage(texto: string, nombreArchivo: string): Result<Page, ParseError> {
  const r = analizarPage(texto, nombreArchivo);
  return r.ok ? r : err(primerError(r.error, nombreArchivo));
}

/**
 * Convierte el texto de `alertas.json` en un conjunto de alertas validado. Rechaza el archivo completo
 * si una alerta no tiene un Departamento, un nivel o unas fechas válidos, o si su fin es anterior a su
 * inicio. Nunca asigna un nivel por defecto.
 */
export function parseAlertas(texto: string, nombreArchivo: string): Result<DatasetAlertas, ParseError> {
  const r = analizarAlertas(texto, nombreArchivo);
  return r.ok ? r : err(primerError(r.error, nombreArchivo));
}

// ------------------------------------------------------------------------------------------------
// Configuración de páginas (Requisito 17.3)
// ------------------------------------------------------------------------------------------------

const REGLA_RANGO = `Debe ser un número entero de tres dígitos, entre ${NUMERO_PAGINA_MINIMO} y ${NUMERO_PAGINA_MAXIMO}`;

/**
 * Comprueba que los números de página sean enteros entre 100 y 999 y que no se repitan. Si no, rechaza
 * la lista con el motivo; quien la llama conserva las páginas existentes sin cambios.
 */
export function validatePageConfig(configs: readonly PageConfig[]): Result<void, ConfigError> {
  const problemas: ConfigProblema[] = [];
  const primeraPosicion = new Map<number, number>();

  configs.forEach((config, indice) => {
    const numero: unknown = config?.numero;
    if (!Number.isInteger(numero) || (numero as number) < NUMERO_PAGINA_MINIMO || (numero as number) > NUMERO_PAGINA_MAXIMO) {
      problemas.push({ indice, numero, regla: REGLA_RANGO });
      return;
    }
    const anterior = primeraPosicion.get(numero as number);
    if (anterior === undefined) {
      primeraPosicion.set(numero as number, indice);
    } else {
      problemas.push({ indice, numero, regla: `El número ${String(numero)} está repetido (ya se usó en la posición ${anterior})` });
    }
  });

  if (problemas.length === 0) return ok(undefined);
  const detalle = problemas.map((p) => `posición ${p.indice}: ${p.regla}`).join('; ');
  return err({ motivo: `Se rechazó la configuración de páginas. ${detalle}.`, problemas });
}

// ------------------------------------------------------------------------------------------------
// Carga de todo o nada (Requisitos 13.2 y 13.3)
// ------------------------------------------------------------------------------------------------

const nombreBase = (nombre: string): string => nombre.split(/[\\/]/).pop() ?? nombre;

/**
 * Carga un conjunto de archivos de datos. Es de todo o nada: si un solo archivo es inválido, devuelve
 * los errores de todos los archivos (con archivo, campo y regla) y ningún contenido. `alertas.json` es
 * el conjunto de alertas; los demás archivos son páginas, sin repetir número de página.
 */
export function loadAll(archivos: readonly FileInput[]): Result<ContentSet, ParseError[]> {
  const errores: ParseError[] = [];
  const paginas: { archivo: string; page: Page }[] = [];
  let alertas: DatasetAlertas | undefined;
  let archivoAlertas: string | undefined;

  for (const archivo of archivos) {
    if (nombreBase(archivo.nombre) === NOMBRE_ARCHIVO_ALERTAS) {
      if (archivoAlertas !== undefined) {
        errores.push({
          archivo: archivo.nombre,
          causa: `Ya se recibió otro archivo de alertas: ${archivoAlertas}.`,
          regla: 'Solo puede haber un archivo de alertas',
        });
        continue;
      }
      archivoAlertas = archivo.nombre;
      const r = analizarAlertas(archivo.texto, archivo.nombre);
      if (r.ok) alertas = r.valor;
      else errores.push(...r.error);
    } else {
      const r = analizarPage(archivo.texto, archivo.nombre);
      if (r.ok) paginas.push({ archivo: archivo.nombre, page: r.valor });
      else errores.push(...r.error);
    }
  }

  const config = validatePageConfig(paginas.map(({ page }) => ({ numero: page.numero })));
  if (!config.ok) {
    for (const problema of config.error.problemas) {
      const origen = paginas[problema.indice];
      if (origen) errores.push({ archivo: origen.archivo, campo: 'numero', regla: problema.regla });
    }
  }

  if (errores.length > 0) return err(errores);

  const contenido: ContentSet = { paginas: paginas.map(({ page }) => page).sort((a, b) => a.numero - b.numero) };
  if (alertas !== undefined) contenido.alertas = alertas;
  return ok(contenido);
}
