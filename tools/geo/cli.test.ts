import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import configReal from './fuente.config.json' with { type: 'json' };
import mapaReal from './mapa.config.json' with { type: 'json' };

// Estas pruebas lanzan procesos reales de Node (cada uno tarda 1 a 3 s en arrancar cuando toda la suite corre en
// paralelo) y algunas lanzan varios seguidos. El límite por defecto de 5 s no alcanza, así que se declara uno propio
// en lugar de subir el de todo el proyecto.
vi.setConfig({ testTimeout: 60_000 });

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

function escribirMapa(nombre: string, cambiar: (copia: Record<string, any>) => void): string {
  const copia = JSON.parse(JSON.stringify(mapaReal)) as Record<string, any>;
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
  // Ninguna prueba de la CLI escribe en el repositorio: todas fallan antes de generar o escriben en una carpeta temporal.
  const antes = existsSync(SALIDA_DE_GEOMETRIA) ? readFileSync(SALIDA_DE_GEOMETRIA, 'utf8') : undefined;

  // Desde la tarea 3.2, ejecutar la CLI sin argumentos intenta generar la geometría; la comprobación de solo la
  // fuente de la tarea 3.1 es `--verificar`. La puerta de la fuente se evalúa siempre primero y con los mismos mensajes.
  it('con la configuración real (confirmada) y --verificar continúa, muestra los datos y no genera ninguna geometría', () => {
    const r = ejecutar('--verificar');
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('Fuente confirmada por el Equipo.');
    expect(r.salida).toContain('Instituto Geográfico Nacional (IGN), Perú');
    expect(r.salida).toContain('Campos que recibirá la Geometría:');
    expect(r.salida).toContain('no se generó ninguna geometría');
    expect(r.error).toBe('');
  });

  it('con la fuente confirmada pero con parámetros del mapa sin aprobar, no genera nada y dice qué falta (tarea 3.2)', () => {
    const salida = join(carpeta, 'no-debe-existir.json');
    const pendiente = escribirMapa('pendiente.json', (c) => {
      c['aprobadoPorEquipo'] = false;
      c['version'] = null;
      c['viewBox'] = null;
      c['proyeccion'].unidadesPorGrado = null;
    });
    const r = ejecutar('--mapa', pendiente, '--salida', salida);
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('tools/geo NO generó la geometría. No se escribió ningún archivo.');
    expect(r.error).toContain('"aprobadoPorEquipo" no es true en mapa.config.json');
    expect(r.error).toContain('proyeccion.unidadesPorGrado');
    expect(r.error).toContain('viewBox');
    expect(r.salida).toBe('');
    expect(existsSync(salida)).toBe(false);
  });

  it('se niega si mapa.config.json cambió un valor aprobado, aunque diga aprobadoPorEquipo: true', () => {
    for (const [nombre, cambiar, campo] of [
      ['escala', (c: Record<string, any>) => (c['proyeccion'].unidadesPorGrado = 501), 'proyeccion.unidadesPorGrado'],
      ['paralelo', (c: Record<string, any>) => (c['proyeccion'].paraleloEstandarGrados = 0), 'proyeccion.paraleloEstandarGrados'],
      ['viewBox', (c: Record<string, any>) => (c['viewBox'] = [0, 0, 6226, 9207]), 'viewBox'],
    ] as const) {
      const salida = join(carpeta, `${nombre}.json`);
      const r = ejecutar('--mapa', escribirMapa(`${nombre}-mapa.json`, cambiar), '--salida', salida);
      expect(r.codigo, nombre).toBe(1);
      expect(r.error, nombre).toContain('no coinciden con los que aprobó el Equipo');
      expect(r.error, nombre).toContain(`${campo}:`);
      expect(r.salida, nombre).toBe('');
      expect(existsSync(salida), nombre).toBe(false);
    }
  });

  it('se niega si la excepción registrada en la fuente no es la autorizada en el código', () => {
    const salida = join(carpeta, 'excepcion.json');
    const fuente = escribirConfig('excepcion-fuente.json', (c) => {
      ((c['partesNoRepresentables'] as Record<string, unknown>[])[0] as Record<string, unknown>)['sha256'] = 'f'.repeat(64);
    });
    const r = ejecutar('--config', fuente, '--salida', salida);
    expect(r.codigo).toBe(1);
    expect(r.error).toContain('no es una de las excepciones que el Equipo autorizó');
    expect(existsSync(salida)).toBe(false);
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

  it('las pruebas de la CLI no tocan public/geo/departamentos.json', () => {
    const despues = existsSync(SALIDA_DE_GEOMETRIA) ? readFileSync(SALIDA_DE_GEOMETRIA, 'utf8') : undefined;
    expect(despues).toBe(antes);
  });
});
