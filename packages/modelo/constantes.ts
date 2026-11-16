// Conjuntos cerrados del modelo de datos (design.md, "Data Models").
// Son la única definición en código: los tipos se derivan de estas listas y las pruebas
// comprueban que los esquemas JSON declaran exactamente los mismos valores.

/** Fuentes oficiales de contenido (glosario: Fuente_Oficial). */
export const FUENTES = ['SENAMHI', 'INDECI', 'MIDAGRI'] as const;
export type Fuente = (typeof FUENTES)[number];

/** Fuentes que originan Alertas_de_Riesgo. */
export const FUENTES_ALERTA = ['SENAMHI', 'INDECI'] as const;
export type FuenteAlerta = (typeof FUENTES_ALERTA)[number];

/** Valores válidos de `metadatos.fuente`: una fuente oficial o "VARIAS" cuando una página combina varias. */
export const FUENTES_METADATOS = [...FUENTES, 'VARIAS'] as const;
export type FuenteMetadatos = (typeof FUENTES_METADATOS)[number];

/** Tipos de página del MVP: 100 portada, 101 alertas, 200 precios, 400 mapa. */
export const TIPOS_PAGINA = ['portada', 'alertas', 'precios', 'mapa'] as const;
export type TipoPagina = (typeof TIPOS_PAGINA)[number];

/** Nivel_de_Riesgo normalizado, en orden de severidad ascendente (glosario). */
export const NIVELES_RIESGO = ['Bajo', 'Moderado', 'Alto', 'Muy alto'] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number];

/**
 * Códigos de los 25 Departamentos (24 departamentos y el Callao), según la codificación UBIGEO
 * del INEI. Es un supuesto por confirmar junto con la fuente de la geometría (tarea 3.1).
 * Aquí solo se fija el conjunto cerrado de códigos; los nombres están en `risk/departamentos` (tarea 1.4).
 */
export const CODIGOS_DEPARTAMENTO = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13',
  '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25',
] as const;
export type CodigoDepartamento = (typeof CODIGOS_DEPARTAMENTO)[number];

/** Rango válido del Número_de_Página (tres dígitos, Requisito 17.3). */
export const NUMERO_PAGINA_MINIMO = 100;
export const NUMERO_PAGINA_MAXIMO = 999;

/** Longitudes máximas de los textos (Requisitos 1.2, 2.1 y 9.4). */
export const MAX_TITULO_PAGINA = 40;
export const MAX_NOMBRE_MENU = 40;
export const MAX_TITULO_ALERTA = 100;
export const MAX_REFERENCIA = 200;

/** Longitud máxima del resumen generado con IA, en palabras (Requisito 11.2). */
export const MAX_PALABRAS_RESUMEN = 60;

/** Recursos adicionales que lista el manifiesto además de las páginas. */
export const IDS_RECURSO = ['alertas', 'geo'] as const;
export type IdRecurso = (typeof IDS_RECURSO)[number];
