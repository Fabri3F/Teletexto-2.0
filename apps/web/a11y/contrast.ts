// Contraste de color WCAG (tarea 5.16). Requisitos 6.5, 18.1, 18.3 y 18.10.
//
// Función pura, sin DOM ni dependencias. Se usa en las pruebas de la paleta, la leyenda, los bordes y el foco. Implementa la
// fórmula de WCAG 2.1: luminancia relativa sRGB y razón (L1 + 0.05) / (L2 + 0.05), con L1 la luminancia mayor.

/** Colores aceptados: `#rgb` o `#rrggbb`, sin distinguir mayúsculas. */
const COLOR_HEXADECIMAL = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Canal sRGB de 0 a 255 convertido a luz lineal. 0.03928 es el umbral de WCAG 2.1 (con canales de 8 bits equivale a 0.04045). */
function canalLineal(canal: number): number {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (0 a 1) de un color `#rgb` o `#rrggbb`, o `NaN` si el texto no es un color válido. */
function luminanciaRelativa(color: unknown): number {
  if (typeof color !== 'string') return Number.NaN;
  const coincidencia = COLOR_HEXADECIMAL.exec(color);
  const digitos = coincidencia?.[1];
  if (digitos === undefined) return Number.NaN;
  const completo = digitos.length === 3 ? [...digitos].map((d) => d + d).join('') : digitos;
  const rojo = parseInt(completo.slice(0, 2), 16);
  const verde = parseInt(completo.slice(2, 4), 16);
  const azul = parseInt(completo.slice(4, 6), 16);
  return 0.2126 * canalLineal(rojo) + 0.7152 * canalLineal(verde) + 0.0722 * canalLineal(azul);
}

/**
 * Razón de contraste WCAG entre dos colores, de 1 (iguales) a 21 (negro sobre blanco). Es simétrica y no se redondea: quien la
 * compara con un umbral (3, 4.5 o 7) usa el valor exacto. Acepta `#rgb` y `#rrggbb` sin distinguir mayúsculas. Si alguno de los
 * dos colores no es válido devuelve `NaN`, de modo que cualquier comparación con un umbral (`>= 3`) es falsa.
 */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminanciaRelativa(fg);
  const b = luminanciaRelativa(bg);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
