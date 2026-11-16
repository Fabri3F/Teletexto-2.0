// Validación con Ajv de los archivos de datos contra los esquemas de @teletexto/modelo, y traducción
// de los errores de Ajv a ParseError (archivo, campo y regla, en español).

import type { DatasetAlertas, Page } from '@teletexto/modelo';
import { ESQUEMAS, ID_ESQUEMA_ALERTAS, ID_ESQUEMA_PAGE } from '@teletexto/modelo/esquemas';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { ParseError } from './tipos.ts';

const ajv = new Ajv({ allErrors: true, strict: true });
for (const esquema of ESQUEMAS) ajv.addSchema(esquema);

function compilar<T>(id: string): ValidateFunction<T> {
  const validar = ajv.getSchema<T>(id);
  if (!validar) throw new Error(`El esquema ${id} no está registrado en Ajv.`);
  return validar;
}

export const validarPage = compilar<Page>(ID_ESQUEMA_PAGE);
export const validarAlertas = compilar<DatasetAlertas>(ID_ESQUEMA_ALERTAS);

/** Convierte un JSON Pointer ("/alertas/0/vigencia/fin") en una ruta legible ("alertas[0].vigencia.fin"). */
export function aRuta(puntero: string): string {
  return puntero
    .split('/')
    .slice(1)
    .map((segmento) => segmento.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((ruta, segmento) => {
      if (/^\d+$/.test(segmento)) return `${ruta}[${segmento}]`;
      return ruta === '' ? segmento : `${ruta}.${segmento}`;
    }, '');
}

function unir(ruta: string, propiedad: unknown): string {
  return ruta === '' ? String(propiedad) : `${ruta}.${String(propiedad)}`;
}

const NOMBRES_TIPO: Record<string, string> = {
  string: 'texto',
  integer: 'número entero',
  number: 'número',
  boolean: 'verdadero o falso',
  object: 'objeto',
  array: 'lista',
  null: 'nulo',
};

function describirTipo(tipo: unknown): string {
  const tipos = Array.isArray(tipo) ? tipo : [tipo];
  return tipos.map((t) => NOMBRES_TIPO[String(t)] ?? String(t)).join(' o ');
}

function describirValores(valores: unknown): string {
  if (!Array.isArray(valores)) return 'uno de los valores permitidos';
  const textos = valores.map((v) => JSON.stringify(v));
  if (textos.length <= 8) return `uno de: ${textos.join(', ')}`;
  return `uno de los ${textos.length} valores permitidos (de ${textos[0]} a ${textos[textos.length - 1]})`;
}

// Ajv entrega `schemaPath` relativo al subesquema referenciado, así que para distinguir los casos se
// usa la ruta del campo en los datos (`instancePath`), que sí es parte del contrato del modelo. Las
// fechas se reconocen por la definición compartida de comun.schema.json.
function describirPatron(e: ErrorObject): string {
  if (e.schemaPath.includes('fechaHoraUtc')) {
    return 'Debe ser una fecha y hora UTC ISO 8601 con sufijo Z, por ejemplo 2026-03-01T14:30:00Z';
  }
  if (e.schemaPath.includes('fechaCalendario')) return 'Debe ser una fecha de calendario AAAA-MM-DD';
  if (e.instancePath.endsWith('/resumen/texto')) {
    return 'El resumen debe tener de 1 a 60 palabras, sin espacios al inicio ni al final';
  }
  if (e.instancePath.endsWith('/hashFuente')) return 'Debe ser un SHA-256 en hexadecimal minúscula (64 caracteres)';
  if (e.instancePath.endsWith('/urlOriginal')) return 'Debe ser un enlace http o https, sin espacios';
  return 'No cumple el formato esperado';
}

/** Regla incumplida, en español, para un error del esquema. */
function describirRegla(e: ErrorObject): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return `Falta la propiedad obligatoria "${String(p['missingProperty'])}"`;
    case 'additionalProperties':
      return `La propiedad "${String(p['additionalProperty'])}" no está permitida`;
    case 'type':
      return `Debe ser de tipo ${describirTipo(p['type'])}`;
    case 'enum':
      return `Debe ser ${describirValores(p['allowedValues'])}`;
    case 'const':
      return `Debe ser ${JSON.stringify(p['allowedValue'])}`;
    case 'pattern':
      return describirPatron(e);
    case 'minimum':
      return `Debe ser mayor o igual a ${String(p['limit'])}`;
    case 'maximum':
      return `Debe ser menor o igual a ${String(p['limit'])}`;
    case 'minLength':
      return p['limit'] === 1 ? 'No puede estar vacío' : `Debe tener al menos ${String(p['limit'])} caracteres`;
    case 'maxLength':
      return `Debe tener como máximo ${String(p['limit'])} caracteres`;
    case 'minItems':
      return p['limit'] === 1 ? 'Debe tener al menos un elemento' : `Debe tener al menos ${String(p['limit'])} elementos`;
    case 'maxItems':
      return `Debe tener como máximo ${String(p['limit'])} elementos`;
    case 'uniqueItems':
      return `No puede repetir elementos (posiciones ${String(p['j'])} y ${String(p['i'])})`;
    case 'false schema':
      return 'Esta propiedad no se permite en este tipo de página';
    case 'anyOf':
      if (e.instancePath.endsWith('/aviso')) return 'Debe incluir "urlOriginal" o "referencia"';
      if (e.instancePath.endsWith('/precioCentimos')) {
        return 'Debe ser un entero en céntimos mayor o igual a 0, o nulo cuando no hay dato';
      }
      return 'Debe cumplir al menos una de las alternativas permitidas';
    default:
      return e.message ?? `Incumple la regla "${e.keyword}"`;
  }
}

/** Ruta del campo afectado por el error. Para propiedades que faltan o sobran, la de esa propiedad. */
function campoDe(e: ErrorObject): string {
  const ruta = aRuta(e.instancePath);
  const p = e.params as Record<string, unknown>;
  if (e.keyword === 'required') return unir(ruta, p['missingProperty']);
  if (e.keyword === 'additionalProperties') return unir(ruta, p['additionalProperty']);
  return ruta;
}

/**
 * Traduce los errores de Ajv a ParseError. Descarta el ruido que Ajv añade en las condiciones
 * ("if") y en las alternativas ("anyOf"), porque el error de la alternativa ya explica el problema.
 */
export function erroresDeEsquema(archivo: string, errores: readonly ErrorObject[] | null | undefined): ParseError[] {
  const vistos = new Set<string>();
  const resultado: ParseError[] = [];
  for (const e of errores ?? []) {
    if (e.keyword === 'if' || e.schemaPath.includes('/anyOf/')) continue;
    const campo = campoDe(e);
    const regla = describirRegla(e);
    const clave = `${campo}|${regla}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(
      campo === ''
        ? { archivo, causa: 'El problema afecta a todo el contenido del archivo.', regla }
        : { archivo, campo, regla },
    );
  }
  return resultado;
}
