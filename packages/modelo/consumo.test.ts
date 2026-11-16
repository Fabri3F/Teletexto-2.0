import { describe, expect, it } from 'vitest';
import web from '../../apps/web/package.json' with { type: 'json' };
import geo from '../../tools/geo/package.json' with { type: 'json' };
import ingest from '../../tools/ingest/package.json' with { type: 'json' };
import verifier from '../../packages/verifier/package.json' with { type: 'json' };
import modelo from './package.json' with { type: 'json' };

// El modelo de datos es único (structure.md, regla 6): estos paquetes deben importarlo de
// @teletexto/modelo en lugar de redefinir tipos o esquemas.
const CONSUMIDORES = [
  ['apps/web', web],
  ['tools/ingest', ingest],
  ['tools/geo', geo],
  ['packages/verifier', verifier],
] as const;

describe('Consumo del paquete @teletexto/modelo', () => {
  it.each(CONSUMIDORES)('%s declara la dependencia de @teletexto/modelo', (_ruta, paquete) => {
    expect(paquete.dependencies).toHaveProperty('@teletexto/modelo');
  });

  it('el paquete expone los tipos y constantes en "." y los esquemas en "./esquemas"', () => {
    expect(modelo.exports).toEqual({ '.': './index.ts', './esquemas': './esquemas/index.ts' });
  });

  it('no depende de ningún otro paquete del proyecto', () => {
    expect(Object.keys((modelo as { dependencies?: object }).dependencies ?? {})).toEqual([]);
  });
});
