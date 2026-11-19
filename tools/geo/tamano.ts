// Tamaño comprimido de la Geometría_del_Mapa (requisito 4.17).
//
// El proyecto mide el tamaño comprimido con `zlib` (design.md, "Pruebas de integración y humo": "Script de CI
// con `zlib` sobre `dist/`"). Aquí se usa gzip de zlib con nivel 6 (el nivel por defecto de zlib), que fijó el Equipo en la
// tarea 3.2; la tarea 14.4 (script de CI) debe usar el mismo criterio. El diseño no fija el nivel.

import { gzipSync } from 'node:zlib';
import { KB, LIMITE_COMPRIMIDO_BYTES, NIVEL_GZIP, OBJETIVO_COMPRIMIDO_BYTES } from './constantes.ts';

/** Bytes del texto UTF-8 comprimido con gzip de zlib, nivel 6. */
export function tamanoComprimido(texto: string): number {
  return gzipSync(Buffer.from(texto, 'utf8'), { level: NIVEL_GZIP }).length;
}

/** "50.0 KB" para mensajes (1 KB = 1024 bytes). */
export function formatoKB(bytes: number): string {
  return `${(bytes / KB).toFixed(1)} KB`;
}

/** Texto del error si el tamaño supera el límite de 80 KB, o `undefined` si lo cumple. */
export function errorDeLimite(comprimidoBytes: number): string | undefined {
  if (comprimidoBytes <= LIMITE_COMPRIMIDO_BYTES) return undefined;
  return (
    `El archivo comprimido pesa ${formatoKB(comprimidoBytes)} y el límite es ${formatoKB(LIMITE_COMPRIMIDO_BYTES)} ` +
    '(requisito 4.17).'
  );
}

/** Verdadero si cumple el objetivo operativo de 76 800 bytes (75 KB). */
export function cumpleObjetivo(comprimidoBytes: number): boolean {
  return comprimidoBytes <= OBJETIVO_COMPRIMIDO_BYTES;
}
