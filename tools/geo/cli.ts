// Entrada de línea de comandos de tools/geo. Por ahora solo aplica la puerta de confirmación de la
// fuente (tarea 3.1). La preparación de la geometría (leer, simplificar, proyectar y escribir
// public/geo/departamentos.json) se implementa en la tarea 3.2 y no existe todavía.
//
// Uso:  node tools/geo/cli.ts [--config <ruta a fuente.config.json>]
// (Node ejecuta TypeScript directamente desde la versión 22.18; el proyecto usa Node 24.)

import { readFileSync } from 'node:fs';
import { camposDeGeometria, evaluarPuerta } from './fuente.ts';

const CONFIG_POR_DEFECTO = new URL('./fuente.config.json', import.meta.url);

/** Lee `--config <ruta>`. Devuelve un texto de error si los argumentos no son válidos. */
function leerArgumentos(args: readonly string[]): { ruta: string | URL } | { error: string } {
  let ruta: string | URL = CONFIG_POR_DEFECTO;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') {
      const valor = args[i + 1];
      if (valor === undefined || valor.startsWith('--')) return { error: 'Falta la ruta después de --config.' };
      ruta = valor;
      i++;
    } else {
      return { error: `Argumento no reconocido: ${args[i]}. Solo se admite --config <ruta>.` };
    }
  }
  return { ruta };
}

function main(args: readonly string[]): number {
  const argumentos = leerArgumentos(args);
  if ('error' in argumentos) {
    console.error(`tools/geo: ${argumentos.error}`);
    return 1;
  }

  let contenido: unknown;
  try {
    contenido = JSON.parse(readFileSync(argumentos.ruta, 'utf8'));
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error(`tools/geo: no se pudo leer fuente.config.json. ${detalle}`);
    return 1;
  }

  const puerta = evaluarPuerta(contenido);

  if (!puerta.permitido) {
    console.error('tools/geo NO se ejecuta.');
    console.error(puerta.motivo);
    for (const error of puerta.errores) console.error(`  - ${error}`);
    console.error('\nDatos pendientes de confirmar por el Equipo:');
    for (const linea of puerta.resumen) console.error(`  ${linea}`);
    return 1;
  }

  const { fuente, licencia } = camposDeGeometria(puerta.config);
  console.log('Fuente confirmada por el Equipo.');
  for (const linea of puerta.resumen) console.log(`  ${linea}`);
  console.log('\nCampos que recibirá la Geometría:');
  console.log(`  fuente:   ${fuente}`);
  console.log(`  licencia: ${licencia}`);
  console.log('\nNo se generó ninguna geometría: la preparación del mapa se implementa en la tarea 3.2.');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
