// Tipos del modelo de datos (design.md, "Data Models"). Son la única definición de estos tipos:
// el cliente, la ingesta, la geometría y el verificador los importan de aquí.

import type {
  CodigoDepartamento,
  Fuente,
  FuenteAlerta,
  FuenteMetadatos,
  IdRecurso,
  NivelRiesgo,
  TipoPagina,
} from './constantes.ts';

/** Instante en UTC ISO 8601, por ejemplo "2026-03-01T14:30:00Z". La conversión a hora de Perú ocurre solo en el cliente. */
export type FechaHoraUtc = string;

/** Fecha de calendario "AAAA-MM-DD", sin hora ni zona (se usa en la fecha de un precio). */
export type FechaCalendario = string;

/** Número de página: entero de 100 a 999. */
export type PageNumber = number;

/** Metadatos_de_Página (Requisito 9.1). */
export interface Metadatos {
  fuente: FuenteMetadatos;
  publicadoEn: FechaHoraUtc;
  actualizadoEn: FechaHoraUtc;
}

/** Atributos comunes de todo registro (Requisitos 10.2 y 10.6). */
export interface Base {
  id: string;
  /** Nunca nulo. Ausente o inválido al cargar equivale a `true` (Requisito 10.3). */
  esDatoDePrueba: boolean;
}

/** Entrada del menú de la Portada. */
export interface EntradaMenu extends Base {
  numero: PageNumber;
  /** Máximo 40 caracteres. */
  nombre: string;
}

/** Precio agrícola (Página 200). */
export interface Precio extends Base {
  producto: string;
  mercado: string;
  unidad: string;
  /** Entero en céntimos de sol. `null` significa "Sin dato" y nunca se estima. */
  precioCentimos: number | null;
  fecha: FechaCalendario;
}

export type Registro = EntradaMenu | Precio;

/** Archivo `/p/NNN.json`. */
export interface Page {
  numero: PageNumber;
  /** Máximo 40 caracteres. */
  titulo: string;
  tipo: TipoPagina;
  esDatoDePrueba: boolean;
  /** Umbral_de_Desactualización en horas: 6 para las páginas 101 y 400, 24 para la 100 y la 200. */
  umbralHoras: number;
  metadatos: Metadatos;
  /** Las páginas 101 y 400 leen `/d/alertas.json`. */
  datos?: 'alertas';
  /** Contenido propio de las páginas 100 y 200. */
  registros?: Registro[];
}

export interface Recomendacion {
  /** Identificador canónico de la recomendación, por ejemplo "abrigar-ninos". */
  clave: string;
  /** Frases aceptadas, normalizadas, con las que el Verificador reconoce la recomendación en un resumen. */
  frases: string[];
}

export interface ResumenAviso {
  /** De 1 a 60 palabras. */
  texto: string;
  /** SHA-256 del `textoOriginal` normalizado, en hexadecimal minúscula. */
  hashFuente: string;
  /** Solo se publican resúmenes aprobados. Los estados rechazado y no verificado quedan en `logs/`. */
  verificacion: { estado: 'aprobado'; verificadoEn: FechaHoraUtc };
}

/** Aviso_Oficial: texto de una Fuente_Oficial con su referencia verificable. */
export interface AvisoOficial {
  id: string;
  textoOriginal: string;
  /** Enlace http(s) al documento oficial. */
  urlOriginal?: string;
  /** Referencia textual al documento, de máximo 200 caracteres. */
  referencia?: string;
  recomendaciones: Recomendacion[];
  resumen?: ResumenAviso;
}

/** Nivel de la escala original de la fuente, tal como la publica. */
export interface NivelOficial {
  texto: string;
  /** Verdadero si es el nivel más alto de la escala de esa fuente. */
  esMaximo: boolean;
}

export interface VigenciaAlerta {
  inicio: FechaHoraUtc;
  /** Igual o posterior a `inicio`. */
  fin: FechaHoraUtc;
}

/** Alerta_de_Riesgo: fuente única de las Páginas 101 y 400. */
export interface AlertaRiesgo extends Base {
  /** Máximo 100 caracteres. */
  titulo: string;
  /** Por ejemplo "Helada" o "Lluvia intensa". */
  tipoRiesgo: string;
  /** Normalizado por la capa de mapeo de los conectores. Nunca existe un valor por defecto. */
  nivel: NivelRiesgo;
  nivelOficial: NivelOficial;
  /** De 1 a 25 códigos, sin duplicados. */
  departamentos: CodigoDepartamento[];
  vigencia: VigenciaAlerta;
  publicadoEn: FechaHoraUtc;
  actualizadoEn: FechaHoraUtc;
  fuente: FuenteAlerta;
  aviso: AvisoOficial;
}

/** Archivo `/d/alertas.json`. */
export interface DatasetAlertas {
  metadatos: Metadatos;
  esDatoDePrueba: boolean;
  alertas: AlertaRiesgo[];
}

/** Un Departamento dentro de la Geometría_del_Mapa. */
export interface DepartamentoGeometria {
  codigo: CodigoDepartamento;
  nombre: string;
  /** Ruta SVG (atributo `d`) ya proyectada al `viewBox`. */
  d: string;
  centroide: [number, number];
}

/** Archivo `/geo/departamentos.json` (80 KB comprimidos como máximo). */
export interface Geometria {
  version: string;
  fuente: string;
  /** Licencia de la fuente. La atribución se muestra en la Página 400 cuando la licencia lo exija. */
  licencia: string;
  viewBox: [number, number, number, number];
  /** Exactamente 25. */
  departamentos: DepartamentoGeometria[];
}

export interface EntradaManifiestoPagina {
  numero: PageNumber;
  titulo: string;
  ruta: string;
  hash: string;
  bytes: number;
  umbralHoras: number;
}

export interface RecursoManifiesto {
  id: IdRecurso;
  ruta: string;
  hash: string;
  bytes: number;
}

/** Archivo `/manifest.json`: qué páginas existen, sus umbrales y los recursos compartidos. */
export interface Manifiesto {
  version: string;
  generadoEn: FechaHoraUtc;
  paginas: EntradaManifiestoPagina[];
  recursos: RecursoManifiesto[];
}

// Reexportación de los tipos derivados de las constantes para que se importen desde un solo lugar.
export type { CodigoDepartamento, Fuente, FuenteAlerta, FuenteMetadatos, IdRecurso, NivelRiesgo, TipoPagina };
