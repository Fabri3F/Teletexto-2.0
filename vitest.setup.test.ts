import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('Configuración de las pruebas de propiedades', () => {
  it('fast-check usa 100 iteraciones por defecto', () => {
    expect(fc.readConfigureGlobal().numRuns).toBe(100);

    let ejecuciones = 0;
    fc.assert(
      fc.property(fc.integer(), () => {
        ejecuciones += 1;
        return true;
      }),
    );
    expect(ejecuciones).toBe(100);
  });
});
