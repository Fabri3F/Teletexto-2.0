import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import configReal from './fuente.config.json' with { type: 'json' };

// Ejecuta la CLI real como un proceso aparte, para comprobar la negativa a ejecutarse, el código de
// salida y que no escribe ningún archivo de geometría (tarea 3.1).

const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SALIDA_DE_GEOMETRIA = fileURLToPath(new URL('../../public/geo/departamentos.json', import.meta.url));

const carpeta = mkdtempSync(join(tmpdir(), 'tt-geo-prueba-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

function escribirConfig(nombre: string, cambiar: (copia: Record<string, unknown>) => void = () => {}): string {
  const copia = JSON.parse(JSON.stringify(configReal)) as Record<string, unknown>;
  cambiar(copia);
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, JSON.stringify(copia), 'utf8');
  return ruta;
}

function ejecutar(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: RAIZ, encoding: 'utf8', timeout: 30_000 });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

describe('CLI de tools/geo: puerta de confirmación', () => {
  const generaba = existsSync(SALIDA_DE_GEOMETRIA);

  it('con la configuración real (confirmada) continúa, muestra los datos y no genera ninguna geometría', () => {
    const r = ejecutar();
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('Fuente confirmada por el Equipo.');
    expect(r.salida).toContain('Instituto Geográfico Nacional (IGN), Perú');
    expect(r.salida).toContain('Campos que recibirá la Geometría:');
    expect(r.salida).toContain('No se generó ninguna geometría');
    expect(r.error).toBe('');
  });

  it('se niega a ejecutarse con confirmadoPorEquipo en false: sale con error e imprime lo pendiente de confirmar', () => {
    const r = ejecutar('--config', escribirConfig('sin-confirmar.json', (c) => (c['confirmadoPorEquipo'] = false)));
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('tools/geo NO se ejecuta.');
    expect(r.error).toContain('no confirmó la fuente');
    expect(r.error).toContain('Datos pendientes de confirmar por el Equipo:');
    expect(r.error).toContain('Instituto Geográfico Nacional (IGN), Perú');
    expect(r.error).toContain('Open Data Commons Attribution License (ODC-By)');
    expect(r.error).toContain('UBIGEO');
    expect(r.salida).toBe('');
  });

  it('se niega a ejecutarse si la confirmación no es exactamente el booleano true', () => {
    for (const valor of ['true', 1, null]) {
      const r = ejecutar('--config', escribirConfig('texto.json', (c) => (c['confirmadoPorEquipo'] = valor)));
      expect(r.codigo, JSON.stringify(valor)).toBe(1);
      expect(r.error).toContain('tools/geo NO se ejecuta.');
    }
  });

  it('se niega a ejecutarse si falta el campo de confirmación', () => {
    const r = ejecutar('--config', escribirConfig('sin-campo.json', (c) => delete c['confirmadoPorEquipo']));
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('no confirmó la fuente');
  });

  it('se niega a ejecutarse con una fuente confirmada pero incompleta, e indica qué falta', () => {
    const r = ejecutar('--config', escribirConfig('incompleta.json', (c) => delete c['licencia']));
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('incompleto');
    expect(r.error).toContain('Falta "licencia.nombre"');
  });

  it('falla con un mensaje claro si el archivo no existe o no es JSON', () => {
    const noExiste = ejecutar('--config', join(carpeta, 'no-existe.json'));
    expect(noExiste.codigo).toBe(1);
    expect(noExiste.error).toContain('no se pudo leer fuente.config.json');

    const ruta = join(carpeta, 'roto.json');
    writeFileSync(ruta, '{ no es json', 'utf8');
    const roto = ejecutar('--config', ruta);
    expect(roto.codigo).toBe(1);
    expect(roto.error).toContain('no se pudo leer fuente.config.json');
  });

  it('rechaza argumentos desconocidos o incompletos', () => {
    expect(ejecutar('--rapido').codigo).toBe(1);
    expect(ejecutar('--rapido').error).toContain('Argumento no reconocido');
    const r = ejecutar('--config');
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('Falta la ruta después de --config');
  });

  it('en ningún caso escribe public/geo/departamentos.json (la generación es la tarea 3.2)', () => {
    expect(existsSync(SALIDA_DE_GEOMETRIA)).toBe(generaba);
  });
});
