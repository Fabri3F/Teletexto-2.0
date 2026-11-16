import { CODIGOS_DEPARTAMENTO } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { DEPARTAMENTOS } from './index.ts';

// Tarea 1.4. Requisitos 4.1 y 4.5: el mapa representa 25 unidades (24 departamentos y el Callao).

describe('Tabla de Departamentos (risk/departamentos)', () => {
  it('contiene exactamente 25 Departamentos', () => {
    expect(DEPARTAMENTOS).toHaveLength(25);
  });

  it('no repite ningún código', () => {
    const codigos = DEPARTAMENTOS.map((d) => d.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('los códigos van de "01" a "25", en orden y con dos dígitos', () => {
    const esperados = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0'));
    expect(DEPARTAMENTOS.map((d) => d.codigo)).toEqual(esperados);
    expect(esperados[0]).toBe('01');
    expect(esperados[24]).toBe('25');
  });

  it('usa exactamente los mismos códigos que define @teletexto/modelo, sin duplicar el conjunto', () => {
    expect(DEPARTAMENTOS.map((d) => d.codigo)).toEqual([...CODIGOS_DEPARTAMENTO]);
  });

  it('el Callao tiene el código "07"', () => {
    expect(DEPARTAMENTOS.find((d) => d.nombre === 'Callao')).toEqual({ codigo: '07', nombre: 'Callao' });
    expect(DEPARTAMENTOS.find((d) => d.codigo === '07')?.nombre).toBe('Callao');
  });

  it('cada registro contiene únicamente "codigo" y "nombre"', () => {
    for (const departamento of DEPARTAMENTOS) {
      expect(Object.keys(departamento).sort(), departamento.codigo).toEqual(['codigo', 'nombre']);
    }
  });

  it('no incluye niveles de riesgo, colores ni alertas', () => {
    const texto = JSON.stringify(DEPARTAMENTOS);
    for (const prohibido of ['nivel', 'color', 'alerta', 'riesgo', 'Bajo', 'Moderado', 'Muy alto']) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });

  it('los nombres son textos no vacíos, sin espacios sobrantes y sin repetir', () => {
    const nombres = DEPARTAMENTOS.map((d) => d.nombre);
    for (const nombre of nombres) {
      expect(typeof nombre).toBe('string');
      expect(nombre.trim().length).toBeGreaterThan(0);
      expect(nombre).toBe(nombre.trim());
    }
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('asocia cada código con su nombre en casos de referencia, para detectar desplazamientos', () => {
    const porCodigo = new Map(DEPARTAMENTOS.map((d) => [d.codigo, d.nombre]));
    expect(porCodigo.get('01')).toBe('Amazonas');
    expect(porCodigo.get('08')).toBe('Cusco');
    expect(porCodigo.get('15')).toBe('Lima');
    expect(porCodigo.get('21')).toBe('Puno');
    expect(porCodigo.get('25')).toBe('Ucayali');
  });
});
