import { describe, expect, it } from 'vitest';
import { PARAMETROS_APROBADOS } from './constantes.ts';
import fuenteReal from './fuente.config.json' with { type: 'json' };
import { diferenciasConLosAprobados, evaluarParametros } from './parametros.ts';
import mapaReal from './mapa.config.json' with { type: 'json' };

// Los parámetros de PRUEBA siguientes no son los del proyecto (que la spec no define): solo ejercitan la puerta.
const completo = (): Record<string, unknown> => ({
  aprobadoPorEquipo: true,
  version: ' 1 ',
  proyeccion: {
    tipo: 'equirrectangular',
    paraleloEstandarGrados: -9,
    unidadesPorGrado: 100,
    longitudOrigenGrados: -82,
    latitudOrigenGrados: 0,
  },
  viewBox: [0, 0, 1300, 1900],
});

/** Copia profunda con una modificación. `any` es deliberado: se rompe el contrato a propósito. */
function con(cambiar: (copia: any) => void): unknown {
  const copia = JSON.parse(JSON.stringify(completo())) as unknown;
  cambiar(copia);
  return copia;
}

describe('mapa.config.json real: parámetros aprobados por el Equipo (tarea 3.2)', () => {
  it('trae exactamente los valores que el Equipo aprobó', () => {
    expect(mapaReal.aprobadoPorEquipo).toBe(true);
    expect(mapaReal.version).toBe('1');
    expect(mapaReal.proyeccion).toEqual({
      tipo: 'equirrectangular',
      paraleloEstandarGrados: -13,
      unidadesPorGrado: 500,
      longitudOrigenGrados: -81.379,
      latitudOrigenGrados: 0.012,
    });
    expect(mapaReal.viewBox).toEqual([0, 0, 6225, 9207]);
  });

  it('la puerta lo deja pasar, y sus valores coinciden con las constantes aprobadas del código', () => {
    const puerta = evaluarParametros(mapaReal);
    expect(puerta.permitido).toBe(true);
    if (!puerta.permitido) return;
    expect(puerta.parametros).toEqual(PARAMETROS_APROBADOS);
    expect(diferenciasConLosAprobados(puerta.parametros, PARAMETROS_APROBADOS)).toEqual([]);
  });

  it('el viewBox y los orígenes salen de la extensión de la fuente más 0,05° de margen, redondeado hacia afuera a 3 decimales', () => {
    const { xmin, xmax, ymin, ymax } = fuenteReal.verificacion.extensionLongitudLatitud;
    const abajo = (v: number): number => Math.floor(v * 1000 + 1e-9) / 1000;
    const arriba = (v: number): number => Math.ceil(v * 1000 - 1e-9) / 1000;
    const lon0 = abajo(xmin - 0.05);
    const lon1 = arriba(xmax + 0.05);
    const lat0 = arriba(ymax + 0.05);
    const lat1 = abajo(ymin - 0.05);
    expect([lon0, lat0]).toEqual([-81.379, 0.012]);
    const { proyeccion, viewBox } = PARAMETROS_APROBADOS;
    expect(proyeccion.longitudOrigenGrados).toBe(lon0);
    expect(proyeccion.latitudOrigenGrados).toBe(lat0);
    expect(viewBox[2]).toBe(Math.ceil((lon1 - lon0) * Math.cos((proyeccion.paraleloEstandarGrados * Math.PI) / 180) * proyeccion.unidadesPorGrado));
    expect(viewBox[3]).toBe(Math.ceil((lat0 - lat1) * proyeccion.unidadesPorGrado));
  });
});

describe('Parámetros aprobados: no se pueden modificar en silencio', () => {
  const aprobado = (): Record<string, any> => JSON.parse(JSON.stringify({ ...mapaReal })) as Record<string, any>;
  const puertaDe = (config: unknown) => {
    const puerta = evaluarParametros(config);
    if (!puerta.permitido) throw new Error(puerta.motivo);
    return puerta.parametros;
  };

  it.each([
    ['version', (c: any) => (c.version = '2'), 'version'],
    ['paralelo estándar', (c: any) => (c.proyeccion.paraleloEstandarGrados = -9.2), 'proyeccion.paraleloEstandarGrados'],
    ['paralelo estándar a 0', (c: any) => (c.proyeccion.paraleloEstandarGrados = 0), 'proyeccion.paraleloEstandarGrados'],
    ['escala', (c: any) => (c.proyeccion.unidadesPorGrado = 501), 'proyeccion.unidadesPorGrado'],
    ['origen de longitud', (c: any) => (c.proyeccion.longitudOrigenGrados = -81.38), 'proyeccion.longitudOrigenGrados'],
    ['origen de latitud', (c: any) => (c.proyeccion.latitudOrigenGrados = 0.013), 'proyeccion.latitudOrigenGrados'],
    ['ancho del viewBox', (c: any) => (c.viewBox = [0, 0, 6226, 9207]), 'viewBox'],
    ['alto del viewBox', (c: any) => (c.viewBox = [0, 0, 6225, 9208]), 'viewBox'],
    ['origen del viewBox', (c: any) => (c.viewBox = [1, 0, 6225, 9207]), 'viewBox'],
  ])('un cambio en %s, aunque siga aprobado y válido, se detecta y se nombra', (_etiqueta, cambiar, campo) => {
    const config = aprobado();
    cambiar(config);
    const parametros = puertaDe(config); // sigue pasando la puerta estructural: por eso hace falta la comparación
    const diferencias = diferenciasConLosAprobados(parametros, PARAMETROS_APROBADOS);
    expect(diferencias).toHaveLength(1);
    expect(diferencias[0]).toContain(`${campo}:`);
    expect(diferencias[0]).toContain('el Equipo aprobó');
  });

  it('informa todas las diferencias a la vez', () => {
    const config = aprobado();
    config['proyeccion'].unidadesPorGrado = 1000;
    config['viewBox'] = [0, 0, 100, 100];
    expect(diferenciasConLosAprobados(puertaDe(config), PARAMETROS_APROBADOS)).toHaveLength(2);
  });

  it('ignora la forma del texto de la versión (espacios), porque la puerta ya la normaliza', () => {
    const config = aprobado();
    config['version'] = ' 1 ';
    expect(diferenciasConLosAprobados(puertaDe(config), PARAMETROS_APROBADOS)).toEqual([]);
  });

  it('las constantes aprobadas no se pueden confundir con otros valores: paralelo -13, 500 u/°, orígenes y viewBox', () => {
    expect(PARAMETROS_APROBADOS).toEqual({
      version: '1',
      proyeccion: { tipo: 'equirrectangular', paraleloEstandarGrados: -13, unidadesPorGrado: 500, longitudOrigenGrados: -81.379, latitudOrigenGrados: 0.012 },
      viewBox: [0, 0, 6225, 9207],
    });
  });
});

describe('Parámetros pendientes: una configuración sin valores se sigue rechazando', () => {
  const pendiente = {
    aprobadoPorEquipo: false,
    version: null,
    proyeccion: { tipo: 'equirrectangular', paraleloEstandarGrados: null, unidadesPorGrado: null, longitudOrigenGrados: null, latitudOrigenGrados: null },
    viewBox: null,
  };

  it('la puerta la rechaza e indica cada parámetro que falta', () => {
    const puerta = evaluarParametros(pendiente);
    expect(puerta.permitido).toBe(false);
    if (puerta.permitido) return;
    expect(puerta.motivo).toContain('no aprobó los parámetros del mapa');
    expect(puerta.motivo).toContain('no se inventan');
    const texto = puerta.pendientes.join('\n');
    for (const campo of ['version', 'proyeccion.paraleloEstandarGrados', 'proyeccion.unidadesPorGrado', 'proyeccion.longitudOrigenGrados', 'proyeccion.latitudOrigenGrados', 'viewBox']) {
      expect(texto, campo).toContain(campo);
    }
  });
});
describe('Puerta de los parámetros del mapa (evaluarParametros)', () => {
  it('deja continuar con parámetros aprobados y completos, y los devuelve normalizados', () => {
    const puerta = evaluarParametros(completo());
    expect(puerta.permitido).toBe(true);
    if (!puerta.permitido) return;
    expect(puerta.parametros.version).toBe('1');
    expect(puerta.parametros.proyeccion).toEqual({
      tipo: 'equirrectangular',
      paraleloEstandarGrados: -9,
      unidadesPorGrado: 100,
      longitudOrigenGrados: -82,
      latitudOrigenGrados: 0,
    });
    expect(puerta.parametros.viewBox).toEqual([0, 0, 1300, 1900]);
  });

  it.each([['false', false], ['ausente', undefined], ['null', null], ['el texto "true"', 'true'], ['el número 1', 1], ['una lista', [true]]])(
    'se niega si aprobadoPorEquipo es %s, aunque los parámetros estén completos',
    (_etiqueta, valor) => {
      const puerta = evaluarParametros(
        con((c) => {
          if (valor === undefined) delete c.aprobadoPorEquipo;
          else c.aprobadoPorEquipo = valor;
        }),
      );
      expect(puerta.permitido).toBe(false);
      if (!puerta.permitido) {
        expect(puerta.motivo).toContain('"aprobadoPorEquipo" no es true');
        expect(puerta.pendientes).toEqual([]);
      }
    },
  );

  it.each([[null], [undefined], [[]], ['texto'], [42]])('rechaza una configuración que no es un objeto: %j', (config) => {
    const puerta = evaluarParametros(config);
    expect(puerta.permitido).toBe(false);
    if (!puerta.permitido) expect(puerta.motivo).toMatch(/no es un objeto JSON/);
  });

  it.each([
    ['version', (c: any) => delete c.version, 'version:'],
    ['version vacía', (c: any) => (c.version = '   '), 'version:'],
    ['version no es texto', (c: any) => (c.version = 3), 'version:'],
    ['proyección distinta', (c: any) => (c.proyeccion.tipo = 'mercator'), 'proyeccion.tipo'],
    ['paralelo de 90', (c: any) => (c.proyeccion.paraleloEstandarGrados = 90), 'paraleloEstandarGrados'],
    ['paralelo no numérico', (c: any) => (c.proyeccion.paraleloEstandarGrados = '9'), 'paraleloEstandarGrados'],
    ['escala cero', (c: any) => (c.proyeccion.unidadesPorGrado = 0), 'unidadesPorGrado'],
    ['escala negativa', (c: any) => (c.proyeccion.unidadesPorGrado = -1), 'unidadesPorGrado'],
    ['escala NaN', (c: any) => (c.proyeccion.unidadesPorGrado = Number.NaN), 'unidadesPorGrado'],
    ['longitud fuera de rango', (c: any) => (c.proyeccion.longitudOrigenGrados = 200), 'longitudOrigenGrados'],
    ['latitud fuera de rango', (c: any) => (c.proyeccion.latitudOrigenGrados = -91), 'latitudOrigenGrados'],
    ['viewBox ausente', (c: any) => delete c.viewBox, 'viewBox'],
    ['viewBox con 3 valores', (c: any) => (c.viewBox = [0, 0, 100]), 'viewBox'],
    ['viewBox con ancho cero', (c: any) => (c.viewBox = [0, 0, 0, 100]), 'viewBox'],
    ['viewBox con alto negativo', (c: any) => (c.viewBox = [0, 0, 100, -5]), 'viewBox'],
    ['viewBox con texto', (c: any) => (c.viewBox = [0, 0, '100', 100]), 'viewBox'],
    ['sin sección de proyección', (c: any) => delete c.proyeccion, 'proyeccion.unidadesPorGrado'],
  ])('rechaza parámetros aprobados pero inválidos: %s', (_etiqueta, cambiar, texto) => {
    const puerta = evaluarParametros(con(cambiar));
    expect(puerta.permitido).toBe(false);
    if (puerta.permitido) return;
    expect(puerta.motivo).toMatch(/incompleto o es inválido/);
    expect(puerta.pendientes.join('\n')).toContain(texto);
  });

  it('acepta valores límite válidos: paralelo 0, origen en 0 y viewBox con minX y minY negativos', () => {
    const puerta = evaluarParametros(
      con((c) => {
        c.proyeccion.paraleloEstandarGrados = 0;
        c.proyeccion.longitudOrigenGrados = 0;
        c.proyeccion.latitudOrigenGrados = 0;
        c.viewBox = [-10, -20, 100, 200];
      }),
    );
    expect(puerta.permitido).toBe(true);
  });

  it('no modifica la configuración recibida', () => {
    const entrada = completo();
    const copia = JSON.stringify(entrada);
    evaluarParametros(entrada);
    expect(JSON.stringify(entrada)).toBe(copia);
  });
});
