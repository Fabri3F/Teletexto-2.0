import { readFileSync } from 'node:fs';
import { CODIGOS_DEPARTAMENTO } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { normalizarTexto } from './criticos.ts';
import { LUGARES } from './lugares.ts';
// Tarea 10.1. Requisito 11.3. El catálogo cerrado de lugares del Verificador.

describe('Catálogo de lugares', () => {
  it('tiene exactamente los 25 códigos de Departamento del modelo', () => {
    // Object.keys pone primero las claves que parecen enteros ("10" a "25"), por eso se ordena antes de comparar.
    expect(Object.keys(LUGARES).sort()).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(Object.keys(LUGARES)).toHaveLength(25);
  });
  it('cada Departamento incluye su nombre oficial entre sus variantes, en minúsculas y normalizadas', () => {
    for (const [codigo, lugar] of Object.entries(LUGARES)) {
      expect(lugar.variantes, codigo).toContain(normalizarTexto(lugar.nombre));
      for (const variante of lugar.variantes) expect(variante, `${codigo} ${variante}`).toBe(normalizarTexto(variante));
    }
  });
  it('no repite ninguna variante, dentro de un Departamento ni entre Departamentos', () => {
    const todas = Object.values(LUGARES).flatMap((l) => l.variantes);
    expect(new Set(todas).size).toBe(todas.length);
  });
  it('los nombres oficiales son únicos y no están vacíos', () => {
    const nombres = Object.values(LUGARES).map((l) => l.nombre);
    expect(new Set(nombres).size).toBe(25);
    for (const nombre of nombres) expect(nombre.trim()).not.toBe('');
  });
  it('las variantes de un Departamento solo difieren en la ortografía: sin tildes dan el mismo nombre', () => {
    const sinTildes = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '');
    for (const [codigo, lugar] of Object.entries(LUGARES)) {
      const base = sinTildes(normalizarTexto(lugar.nombre));
      for (const variante of lugar.variantes) {
        // La única variante que no es el nombre sin tildes es una grafía histórica registrada a propósito (Cuzco).
        if (sinTildes(variante) !== base) expect([codigo, variante], `${codigo} ${variante}`).toEqual(['08', 'cuzco']);
      }
    }
  });
  it('coincide con la tabla de nombres de apps/web (leída como texto, sin importarla)', () => {
    const fuente = readFileSync(new URL('../../apps/web/risk/departamentos/index.ts', import.meta.url), 'utf8');
    const filas = [...fuente.matchAll(/\{\s*codigo:\s*'(\d{2})',\s*nombre:\s*'([^']+)'\s*\}/g)].map((m) => [m[1], m[2]]);
    expect(filas).toHaveLength(25);
    for (const [codigo, nombre] of filas) {
      expect(LUGARES[codigo as keyof typeof LUGARES]?.nombre, String(codigo)).toBe(nombre);
    }
  });
  it('los datos no se pueden modificar', () => {
    expect(Object.isFrozen(LUGARES)).toBe(true);
  });
});

describe('Pureza del catálogo', () => {
  const fuente = readFileSync(new URL('./lugares.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('solo importa tipos del modelo y no contiene lógica de red ni de reloj', () => {
    expect([...fuente.matchAll(/^import\s+(type\s+)?.*from\s+'([^']+)'/gm)].map((m) => [m[1]?.trim(), m[2]])).toEqual([['type', '@teletexto/modelo']]);
    for (const prohibido of ['fetch', 'Date', 'window', 'document', 'apps/web']) expect(fuente, prohibido).not.toContain(prohibido);
  });
});
