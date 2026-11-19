// Entrada de línea de comandos de tools/geo (tareas 3.1 y 3.2).
//
// Lee la fuente confirmada (fuente.config.json, tarea 3.1), los parámetros aprobados del mapa (mapa.config.json) y
// la tabla de Departamentos (tarea 1.4); simplifica con Mapshaper, proyecta y escribe public/geo/departamentos.json.
// No escribe nada si cualquier comprobación falla.
//
// Uso:  node tools/geo/cli.ts [--config <fuente.config.json>] [--mapa <mapa.config.json>] [--salida <archivo>]
//       node tools/geo/cli.ts --verificar     (solo la puerta de la fuente, sin generar nada)
// (Node ejecuta TypeScript directamente desde la versión 22.18; el proyecto usa Node 24.)

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPARTAMENTOS } from '../../apps/web/risk/departamentos/index.ts';
import { EXCEPCIONES_AUTORIZADAS, LIMITE_COMPRIMIDO_BYTES, NIVEL_GZIP, PARAMETROS_APROBADOS } from './constantes.ts';
import { camposDeGeometria, evaluarPuerta } from './fuente.ts';
import { dependenciasReales, generarGeometria } from './generar.ts';


const RAIZ = new URL('../../', import.meta.url);
const CONFIG_POR_DEFECTO = new URL('./fuente.config.json', import.meta.url);
const MAPA_POR_DEFECTO = new URL('./mapa.config.json', import.meta.url);
const SALIDA_POR_DEFECTO = new URL('./public/geo/departamentos.json', RAIZ);

interface Argumentos {
  config: string | URL;
  mapa: string | URL;
  salida: string | URL;
  soloVerificar: boolean;
}

/** Lee los argumentos. Devuelve un texto de error si no son válidos. */
function leerArgumentos(args: readonly string[]): Argumentos | { error: string } {
  const resultado: Argumentos = {
    config: CONFIG_POR_DEFECTO,
    mapa: MAPA_POR_DEFECTO,
    salida: SALIDA_POR_DEFECTO,
    soloVerificar: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verificar') {
      resultado.soloVerificar = true;
    } else if (arg === '--config' || arg === '--mapa' || arg === '--salida') {
      const valor = args[i + 1];
      if (valor === undefined || valor.startsWith('--')) return { error: `Falta la ruta después de ${arg}.` };
      if (arg === '--config') resultado.config = valor;
      else if (arg === '--mapa') resultado.mapa = valor;
      else resultado.salida = valor;
      i++;
    } else {
      return { error: `Argumento no reconocido: ${arg}. Se admiten --config, --mapa, --salida y --verificar.` };
    }
  }
  return resultado;
}

function leerJson(ruta: string | URL, que: string): { valor: unknown } | { error: string } {
  try {
    return { valor: JSON.parse(readFileSync(ruta, 'utf8')) as unknown };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { error: `no se pudo leer ${que}. ${detalle}` };
  }
}

/** Escribe el archivo sin dejar nunca uno a medias: primero un temporal y después se renombra. */
function escribirAtomico(ruta: string | URL, texto: string): void {
  const destino = typeof ruta === 'string' ? ruta : fileURLToPath(ruta);
  mkdirSync(dirname(destino), { recursive: true });
  const temporal = `${destino}.tmp`;
  try {
    writeFileSync(temporal, texto, 'utf8');
    renameSync(temporal, destino);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
}

async function main(args: readonly string[]): Promise<number> {
  const argumentos = leerArgumentos(args);
  if ('error' in argumentos) {
    console.error(`tools/geo: ${argumentos.error}`);
    return 1;
  }

  const fuente = leerJson(argumentos.config, 'fuente.config.json');
  if ('error' in fuente) {
    console.error(`tools/geo: ${fuente.error}`);
    return 1;
  }

  // Puerta de la fuente (tarea 3.1): se evalúa siempre primero y con los mismos mensajes. Sin confirmación del Equipo no se hace nada.
  const puerta = evaluarPuerta(fuente.valor);
  if (!puerta.permitido) {
    console.error('tools/geo NO se ejecuta.');
    console.error(puerta.motivo);
    for (const error of puerta.errores) console.error(`  - ${error}`);
    console.error('\nDatos pendientes de confirmar por el Equipo:');
    for (const linea of puerta.resumen) console.error(`  ${linea}`);
    return 1;
  }

  if (argumentos.soloVerificar) {
    const { fuente: campoFuente, licencia } = camposDeGeometria(puerta.config);
    console.log('Fuente confirmada por el Equipo.');
    for (const linea of puerta.resumen) console.log(`  ${linea}`);
    console.log('\nCampos que recibirá la Geometría:');
    console.log(`  fuente:   ${campoFuente}`);
    console.log(`  licencia: ${licencia}`);
    console.log('\nSolo se verificó la fuente: no se generó ninguna geometría.');
    return 0;
  }

  const mapa = leerJson(argumentos.mapa, 'mapa.config.json');
  if ('error' in mapa) {
    console.error(`tools/geo: ${mapa.error}`);
    return 1;
  }

  const resultado = await generarGeometria(
    {
      fuente: fuente.valor,
      mapa: mapa.valor,
      tabla: DEPARTAMENTOS,
      aprobados: PARAMETROS_APROBADOS,
      excepcionesAutorizadas: EXCEPCIONES_AUTORIZADAS,
    },
    dependenciasReales((ruta) => readFileSync(new URL(ruta, RAIZ))),
  );

  if (!resultado.ok) {
    console.error('tools/geo NO generó la geometría. No se escribió ningún archivo.\n');
    for (const error of resultado.errores) console.error(`  - ${error}`);
    return 1;
  }

  const { texto, registro } = resultado.valor;
  escribirAtomico(argumentos.salida, texto);
  console.log('Geometría escrita.');
  console.log(`  Departamentos: ${registro.resumen.departamentos}`);
  console.log(`  Partes: ${registro.resumen.partes} (fuente original: ${registro.fuenteOriginal.partes})`);
  console.log(`  Vértices: ${registro.resumen.verticesSalida} (fuente original: ${registro.fuenteOriginal.puntos} puntos)`);
  console.log(`  Simplificación: se conserva el ${Number(registro.porcentajeConservado.toPrecision(4))} % de los vértices`);
  if (registro.excepciones.length > 0) {
    console.log(`  Partes no dibujadas por excepción autorizada: ${registro.excepciones.join(', ')} (fuente.config.json, partesNoRepresentables)`);
  }
  const margen = LIMITE_COMPRIMIDO_BYTES - registro.comprimidoBytes;
  console.log(`  Tamaño del JSON: ${registro.bytes} bytes`);
  console.log(`  Tamaño comprimido (gzip de zlib, nivel ${NIVEL_GZIP}): ${registro.comprimidoBytes} bytes`);
  console.log(`  Objetivo operativo: ${registro.objetivoBytes} bytes (${registro.objetivoCumplido ? 'cumplido' : 'NO cumplido'}). Límite absoluto: ${LIMITE_COMPRIMIDO_BYTES} bytes. Margen: ${margen} bytes.`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
