// Paleta del estilo teletexto, estilos del mapa por Nivel_de_Riesgo y foco (tarea 5.16). Requisitos 4.4, 4.5, 6.5, 18.1, 18.3 y 18.10.
//
// Solo son datos y una búsqueda sin lógica de riesgo. Los componentes (Portada, alertas, mapa, leyenda) leen estos valores y las
// pruebas de `paleta.test.ts` comprueban sus contrastes con `contrastRatio`. Las ocho variables de `styles.css` deben coincidir con
// `COLORES_TELETEXTO` (lo comprueba una prueba).
//
// Los patrones se identifican por nombre. Su geometría SVG (`<pattern>`) la define el componente del mapa (tarea 12.1). El contraste
// de un patrón se acuerda como el de su tinta frente a su relleno, porque no se puede medir un patrón entero.
//
// Nunca se asigna un nivel por defecto: un Departamento sin alertas vigentes (nivel `null`) recibe el Estilo_Neutro, que no reutiliza
// ningún relleno ni patrón de los cuatro niveles y añade una línea interior propia.
//
// Bordes. El borde de todos los estilos es negro: es el color estructural del mapa, y es el único que tiene 3:1 frente a los cinco
// rellenos (un borde claro, como el blanco, no llega a 3:1 frente al amarillo, el verde ni el naranja). El trazo se centra sobre la
// arista compartida, así que parte de él cae sobre el relleno del vecino. Por eso el borde negro cumple 3:1 frente al relleno de
// cualquier estilo, sea cual sea el orden de pintado. El Estilo_Neutro se distingue por una línea interior cian dentro de su propio
// relleno, no por el color de su borde.
import type { NivelRiesgo } from '@teletexto/modelo';

/** Los ocho colores del teletexto clásico. Los mismos valores están en las variables `--negro`, `--rojo`, etc. de `styles.css`. */
export const COLORES_TELETEXTO = Object.freeze({
  negro: '#000000',
  rojo: '#ff0000',
  verde: '#00ff00',
  amarillo: '#ffff00',
  azul: '#0000ff',
  magenta: '#ff00ff',
  cian: '#00ffff',
  blanco: '#ffffff',
} as const);

/** Naranja del nivel "Alto". No es un color del teletexto clásico. */
export const COLOR_NARANJA = '#ff8000';
/** Gris del relleno del Estilo_Neutro. */
export const COLOR_GRIS_NEUTRO = '#666666';
/** Fondo del mapa. */
export const FONDO_MAPA = COLORES_TELETEXTO.negro;

/** Nombres de los patrones de relleno. Cada estilo usa uno distinto. */
export type PatronRelleno = 'puntos' | 'rayas-horizontales' | 'rayas-diagonales' | 'cuadros' | 'rayas-verticales';

/** Aspecto de un Departamento en el mapa y de su entrada en la leyenda: relleno, tinta del patrón, borde, patrón y línea interior. */
export interface EstiloVisual {
  readonly relleno: string;
  /** Color de las marcas del patrón sobre el relleno. Queda dentro del relleno, así que solo debe contrastar con él. */
  readonly tinta: string;
  /** Borde exterior, junto a los vecinos. Es negro en todos los estilos. */
  readonly borde: string;
  readonly patron: PatronRelleno;
  /** Línea dentro del relleno, junto al borde. Solo la tiene el Estilo_Neutro. Debe contrastar con el relleno y con el borde. */
  readonly lineaInterior?: string;
}

/**
 * Estilo de cada Nivel_de_Riesgo. La escala aprobada es verde (Bajo), amarillo (Moderado), naranja (Alto) y rojo (Muy alto). El tipo
 * `Record<NivelRiesgo, …>` obliga a definir todos los niveles.
 */
export const ESTILOS_NIVEL: Readonly<Record<NivelRiesgo, EstiloVisual>> = Object.freeze({
  Bajo: Object.freeze({ relleno: COLORES_TELETEXTO.verde, tinta: COLORES_TELETEXTO.negro, borde: COLORES_TELETEXTO.negro, patron: 'puntos' }),
  Moderado: Object.freeze({
    relleno: COLORES_TELETEXTO.amarillo,
    tinta: COLORES_TELETEXTO.negro,
    borde: COLORES_TELETEXTO.negro,
    patron: 'rayas-horizontales',
  }),
  Alto: Object.freeze({ relleno: COLOR_NARANJA, tinta: COLORES_TELETEXTO.negro, borde: COLORES_TELETEXTO.negro, patron: 'rayas-diagonales' }),
  'Muy alto': Object.freeze({ relleno: COLORES_TELETEXTO.rojo, tinta: COLORES_TELETEXTO.negro, borde: COLORES_TELETEXTO.negro, patron: 'cuadros' }),
});

/**
 * Estilo_Neutro: se aplica a un Departamento sin Alertas_Vigentes ("Sin información disponible"). No es ningún nivel. Su relleno
 * es gris, su borde negro como el de todos, su tinta blanca y su línea interior cian. El cian no lo usa ningún nivel ni el foco.
 */
export const ESTILO_NEUTRO: EstiloVisual = Object.freeze({
  relleno: COLOR_GRIS_NEUTRO,
  tinta: COLORES_TELETEXTO.blanco,
  borde: COLORES_TELETEXTO.negro,
  patron: 'rayas-verticales',
  lineaInterior: COLORES_TELETEXTO.cian,
});

/**
 * Estilo que corresponde a un nivel. Con `null` (sin alertas vigentes) devuelve el Estilo_Neutro. Un valor que no sea uno de los
 * cuatro niveles (datos corruptos) también recibe el Estilo_Neutro: nunca se inventa un nivel ni un color de riesgo.
 */
export function estiloDeNivel(nivel: NivelRiesgo | null): EstiloVisual {
  if (nivel === null || typeof nivel !== 'string' || !Object.hasOwn(ESTILOS_NIVEL, nivel)) return ESTILO_NEUTRO;
  return ESTILOS_NIVEL[nivel];
}

/** Una combinación de texto y fondo del estilo teletexto. Todas cumplen 7:1 (Requisito 6.5). */
export interface CombinacionTexto {
  readonly uso: string;
  readonly texto: string;
  readonly fondo: string;
}

/**
 * Combinaciones de texto y fondo permitidas, todas con contraste de al menos 7:1. El rojo, el magenta y el azul no alcanzan 7:1 como texto
 * sobre negro, así que no se usan como texto. Sobre azul solo sirven el blanco y el amarillo.
 */
export const COMBINACIONES_TEXTO: readonly CombinacionTexto[] = Object.freeze([
  Object.freeze({ uso: 'cuerpo', texto: COLORES_TELETEXTO.blanco, fondo: COLORES_TELETEXTO.negro }),
  Object.freeze({ uso: 'titulo', texto: COLORES_TELETEXTO.amarillo, fondo: COLORES_TELETEXTO.negro }),
  Object.freeze({ uso: 'resalte', texto: COLORES_TELETEXTO.cian, fondo: COLORES_TELETEXTO.negro }),
  Object.freeze({ uso: 'confirmacion', texto: COLORES_TELETEXTO.verde, fondo: COLORES_TELETEXTO.negro }),
  Object.freeze({ uso: 'cabecera', texto: COLORES_TELETEXTO.blanco, fondo: COLORES_TELETEXTO.azul }),
  Object.freeze({ uso: 'cabeceraDestacada', texto: COLORES_TELETEXTO.amarillo, fondo: COLORES_TELETEXTO.azul }),
  Object.freeze({ uso: 'etiquetaDePrueba', texto: COLORES_TELETEXTO.negro, fondo: COLORES_TELETEXTO.amarillo }),
]);

/** Grosor mínimo del indicador de foco en píxeles (Requisito 18.3). */
export const GROSOR_MINIMO_FOCO_PX = 2;

/**
 * Indicador de foco de dos tonos: una línea blanca flanqueada por un contorno negro. No existe un único color a 3:1 de todos los
 * rellenos y del fondo negro, así que la línea blanca queda siempre junto al contorno negro, y el contorno negro junto al relleno.
 */
export const FOCO = Object.freeze({
  linea: COLORES_TELETEXTO.blanco,
  contorno: COLORES_TELETEXTO.negro,
  grosorLineaPx: GROSOR_MINIMO_FOCO_PX,
  grosorContornoPx: GROSOR_MINIMO_FOCO_PX,
});
