import { describe, expect, it } from 'vitest';
import {
  CODIGOS_DEPARTAMENTO,
  FUENTES,
  FUENTES_ALERTA,
  FUENTES_METADATOS,
  IDS_RECURSO,
  NIVELES_RIESGO,
  NUMERO_PAGINA_MAXIMO,
  NUMERO_PAGINA_MINIMO,
  TIPOS_PAGINA,
} from './index.ts';

describe('Constantes del modelo de datos', () => {
  it('define exactamente los 25 códigos de Departamento "01" a "25", sin repetir', () => {
    expect(CODIGOS_DEPARTAMENTO).toHaveLength(25);
    expect(new Set(CODIGOS_DEPARTAMENTO).size).toBe(25);
    CODIGOS_DEPARTAMENTO.forEach((codigo, indice) => {
      expect(codigo).toBe(String(indice + 1).padStart(2, '0'));
    });
  });

  it('ordena los niveles de riesgo de menor a mayor severidad', () => {
    expect([...NIVELES_RIESGO]).toEqual(['Bajo', 'Moderado', 'Alto', 'Muy alto']);
  });

  it('limita las fuentes oficiales a SENAMHI, INDECI y MIDAGRI', () => {
    expect([...FUENTES]).toEqual(['SENAMHI', 'INDECI', 'MIDAGRI']);
    expect([...FUENTES_ALERTA]).toEqual(['SENAMHI', 'INDECI']);
    expect([...FUENTES_METADATOS]).toEqual(['SENAMHI', 'INDECI', 'MIDAGRI', 'VARIAS']);
  });

  it('define los cuatro tipos de página del MVP y no incluye salud', () => {
    expect([...TIPOS_PAGINA]).toEqual(['portada', 'alertas', 'precios', 'mapa']);
    expect([...FUENTES_METADATOS]).not.toContain('MINSA');
  });

  it('define el rango del número de página y los recursos del manifiesto', () => {
    expect(NUMERO_PAGINA_MINIMO).toBe(100);
    expect(NUMERO_PAGINA_MAXIMO).toBe(999);
    expect([...IDS_RECURSO]).toEqual(['alertas', 'geo']);
  });
});
