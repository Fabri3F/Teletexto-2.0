// Formato de moneda del cliente (tarea 4.1). Requisitos 3.2 y 3.5.
//
// Los precios se guardan como céntimos enteros y nunca se manejan con coma flotante. Esta función solo usa aritmética
// entera: no redondea, no estima y no cambia el valor.

/** Texto que se muestra cuando no hay un precio válido (Requisito 3.5). */
export const SIN_DATO = 'Sin dato';

/**
 * Precio en soles con el prefijo "S/", punto decimal y exactamente dos decimales, sin separador de miles: 250 es "S/ 2.50".
 * Devuelve "Sin dato" si el valor es `null` o no es un entero seguro no negativo (negativo, decimal, NaN, infinito o mayor
 * que `Number.MAX_SAFE_INTEGER`). Nunca redondea ni estima.
 */
export function formatSoles(centimos: number | null): string {
  if (typeof centimos !== 'number' || !Number.isSafeInteger(centimos) || centimos < 0) return SIN_DATO;
  const resto = centimos % 100;
  const soles = (centimos - resto) / 100; // división exacta: el numerador es múltiplo de 100
  return `S/ ${soles}.${String(resto).padStart(2, '0')}`;
}
