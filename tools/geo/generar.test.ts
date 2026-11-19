import { describe, expect, it, vi } from 'vitest';
import { EXCEPCIONES_AUTORIZADAS, LIMITE_COMPRIMIDO_BYTES, OBJETIVO_COMPRIMIDO_BYTES, PARAMETROS_APROBADOS, type ExcepcionAutorizada } from './constantes.ts';

// Varias pruebas construyen geometrías sintéticas de decenas de miles de vértices para forzar los límites de tamaño.
// Con toda la suite en paralelo pueden acercarse al límite por defecto de 5 s, así que se declara uno propio.
vi.setConfig({ testTimeout: 60_000 });
import { PARAMETROS_PRUEBA, TABLA_EJEMPLO, comoFeatureCollection, rectangulo, unidadesEjemplo } from './datos-prueba.ts';
import { construirGeometria, huellaDeAnillo } from './construir.ts';
import { camposDeLaFuente, esperadoDeLaFuente, finalizar, generarGeometria, serializar, type Dependencias, type Entradas } from './generar.ts';
import type { UnidadCruda } from './geojson.ts';
import { fallo, ok, type Resultado } from './result.ts';
import { errorDeLimite, tamanoComprimido } from './tamano.ts';
import fuenteReal from './fuente.config.json' with { type: 'json' };
import mapaReal from './mapa.config.json' with { type: 'json' };

// Pruebas del orquestador con un Mapshaper SIMULADO: los tiempos de la simplificación real no importan aquí y cada
// fallo se provoca a voluntad. La simplificación real se ejercita en simplificacion.real.test.ts.

/** Fila de esperadoPorDepartamento: partes, vértices, anillos exteriores y huecos. */
const fila = (codigo: string, partes: number, vertices: number, anillosExteriores: number, huecos: number) => ({ codigo, partes, vertices, anillosExteriores, huecos });

/** Configuración de la fuente de prueba: la real, con las partes y los vértices de las unidades de ejemplo. */
function fuentePrueba(cambiar: (c: any) => void = () => {}): unknown {
  const c = JSON.parse(JSON.stringify(fuenteReal));
  c.verificacion.esperadoPorDepartamento = [
    fila('01', 1, 5, 1, 0),
    fila('02', 2, 10, 2, 0),
    fila('03', 2, 10, 1, 1),
  ];
  // Las excepciones de la fuente real (21#6.2) no existen en las unidades de ejemplo: se parte sin ninguna.
  delete c.partesNoRepresentables;
  cambiar(c);
  return c;
}

const mapaPrueba = (cambiar: (c: any) => void = () => {}): unknown => {
  const c = {
    aprobadoPorEquipo: true,
    version: PARAMETROS_PRUEBA.version,
    proyeccion: { ...PARAMETROS_PRUEBA.proyeccion },
    viewBox: [...PARAMETROS_PRUEBA.viewBox],
  };
  cambiar(c);
  return c;
};

const entradas = (fuente: unknown = fuentePrueba(), mapa: unknown = mapaPrueba(), extra: Partial<Entradas> = {}): Entradas => ({
  fuente,
  mapa,
  tabla: TABLA_EJEMPLO,
  aprobados: PARAMETROS_PRUEBA,
  excepcionesAutorizadas: [],
  ...extra,
});

/** Mapshaper simulado: devuelve las unidades dadas, sin simplificar, para cualquier porcentaje. */
function simulado(unidades: readonly UnidadCruda[] | ((porcentaje: number) => readonly UnidadCruda[]), registro: number[] = []): Dependencias {
  return {
    leerZip: () => new Uint8Array([1, 2, 3]),
    simplificar: async (_zip, porcentaje): Promise<Resultado<unknown>> => {
      registro.push(porcentaje);
      return ok(comoFeatureCollection(typeof unidades === 'function' ? unidades(porcentaje) : unidades));
    },
  };
}

const textoDe = (r: { ok: boolean; errores?: string[] }): string => (r.ok ? '' : (r.errores ?? []).join('\n'));

/** Un Departamento con muchos vértices casi aleatorios (no comprimibles) para forzar un archivo grande. */
const pesada = (codigo: string, nombre: string, vertices: number): UnidadCruda => {
  const anillo: [number, number][] = [];
  let semilla = Number(codigo) * 7919;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < vertices; i++) anillo.push([azar() * 2.9, azar() * 5.9]);
  return { codigo, nombre, poligonos: [[[...anillo, anillo[0] as [number, number]]]] };
};

describe('Generación: caso normal', () => {
  it('genera la geometría con los 25... (aquí 3) Departamentos de la tabla, todas sus partes y los campos pedidos', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    expect(r.ok, textoDe(r)).toBe(true);
    if (!r.ok) return;
    const g = r.valor.geometria;
    expect(Object.keys(g).sort()).toEqual(['departamentos', 'fuente', 'licencia', 'version', 'viewBox']);
    expect(g.departamentos.map((d) => d.codigo)).toEqual(['01', '02', '03']);
    expect(g.viewBox).toEqual([0, 0, 30, 70]);
    expect(r.valor.registro.resumen).toMatchObject({ departamentos: 3, partes: 5, partesOmitidas: 0 });
  });

  it('pasa la licencia y la atribución de la fuente al campo licencia, y la procedencia al campo fuente (tarea 3.1)', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    if (!r.ok) throw new Error(textoDe(r));
    const { fuente, licencia } = r.valor.geometria;
    expect(fuente).toContain('Instituto Geográfico Nacional (IGN), Perú');
    expect(fuente).toContain('6c5c52fd-047d-4ba7-9ac7-3865860118c2');
    expect(fuente).toContain('Fuente indicada en los datos: INEI');
    expect(fuente).toContain('referencial');
    expect(licencia).toContain('ODC-By');
    expect(licencia).toContain('https://opendatacommons.org/licenses/by/1.0/');
    expect(licencia).toContain('no deben tomarse como límites legales definitivos');
  });

  it('el texto es JSON válido con un salto de línea final y se vuelve a leer igual', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    if (!r.ok) throw new Error(textoDe(r));
    expect(r.valor.texto.endsWith('}\n')).toBe(true);
    expect(JSON.parse(r.valor.texto)).toEqual(r.valor.geometria);
    expect(r.valor.texto).toBe(serializar(r.valor.geometria));
  });

  it('registra el tamaño comprimido real del texto escrito, que está dentro del límite', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    if (!r.ok) throw new Error(textoDe(r));
    expect(r.valor.registro.bytes).toBe(Buffer.byteLength(r.valor.texto));
    expect(r.valor.registro.comprimidoBytes).toBeGreaterThan(0);
    expect(r.valor.registro.comprimidoBytes).toBeLessThanOrEqual(LIMITE_COMPRIMIDO_BYTES);
  });

  it('registra el objetivo operativo de 76 800 bytes y si se cumplió', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    if (!r.ok) throw new Error(textoDe(r));
    expect(r.valor.registro.objetivoBytes).toBe(76_800);
    expect(r.valor.registro.objetivoBytes).toBe(OBJETIVO_COMPRIMIDO_BYTES);
    expect(r.valor.registro.objetivoCumplido).toBe(true);
    expect(r.valor.registro.excepciones).toEqual([]);
  });
  it('si la fuente ya cumple el objetivo no la simplifica (100 %)', async () => {
    const llamadas: number[] = [];
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo(), llamadas));
    if (!r.ok) throw new Error(textoDe(r));
    expect(r.valor.registro.porcentajeConservado).toBe(100);
    expect(new Set(llamadas)).toEqual(new Set([100]));
  });

  it('es determinista', async () => {
    const a = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    const b = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    expect(a.ok && b.ok && a.valor.texto === b.valor.texto).toBe(true);
  });
});

describe('Generación: puertas', () => {
  it('se niega si la fuente no está confirmada (puerta de la tarea 3.1) y no lee ni simplifica nada', async () => {
    let leyo = false;
    const dep: Dependencias = { leerZip: () => ((leyo = true), new Uint8Array()), simplificar: async () => ok(null) };
    const r = await generarGeometria(entradas(fuentePrueba((c) => (c.confirmadoPorEquipo = false))), dep);
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('no confirmó la fuente');
    expect(leyo).toBe(false);
  });

  it('se niega si los parámetros del mapa no están aprobados (la spec no los define) y no lee ni simplifica nada', async () => {
    let leyo = false;
    const dep: Dependencias = { leerZip: () => ((leyo = true), new Uint8Array()), simplificar: async () => ok(null) };
    const r = await generarGeometria(entradas(fuentePrueba(), mapaPrueba((c) => (c.aprobadoPorEquipo = false))), dep);
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('no aprobó los parámetros del mapa');
    expect(leyo).toBe(false);
  });

  it('con el mapa.config.json real y los parámetros aprobados del código, la puerta de parámetros no es el motivo del fallo', async () => {
    // Las unidades de ejemplo no son las del IGN, así que la generación falla más adelante (códigos, partes): lo que se
    // comprueba es que los parámetros reales y los aprobados coinciden y la puerta los deja pasar.
    const r = await generarGeometria(entradas(fuentePrueba(), mapaReal, { aprobados: PARAMETROS_APROBADOS }), simulado(unidadesEjemplo()));
    expect(textoDe(r)).not.toContain('no coinciden con los que aprobó el Equipo');
    expect(textoDe(r)).not.toContain('aprobadoPorEquipo');
  });

  it.each([
    ['la escala', (c: any) => (c.proyeccion.unidadesPorGrado = 11), 'proyeccion.unidadesPorGrado'],
    ['el paralelo estándar', (c: any) => (c.proyeccion.paraleloEstandarGrados = -13), 'proyeccion.paraleloEstandarGrados'],
    ['el origen de longitud', (c: any) => (c.proyeccion.longitudOrigenGrados = 1), 'proyeccion.longitudOrigenGrados'],
    ['el origen de latitud', (c: any) => (c.proyeccion.latitudOrigenGrados = 7), 'proyeccion.latitudOrigenGrados'],
    ['el viewBox', (c: any) => (c.viewBox = [0, 0, 31, 70]), 'viewBox'],
    ['la versión', (c: any) => (c.version = '9'), 'version'],
  ])(
    'se niega si alguien cambia %s en mapa.config.json aunque siga aprobado y válido: no coincide con lo aprobado y no lee ni simplifica nada',
    async (_etiqueta, cambiar, campo) => {
      let leyo = false;
      const dep: Dependencias = { leerZip: () => ((leyo = true), new Uint8Array()), simplificar: async () => ok(null) };
      const r = await generarGeometria(entradas(fuentePrueba(), mapaPrueba(cambiar)), dep);
      expect(r.ok).toBe(false);
      expect(textoDe(r)).toContain('no coinciden con los que aprobó el Equipo');
      expect(textoDe(r)).toContain(`${campo}:`);
      expect(leyo).toBe(false);
    },
  );

  it('con aprobadoPorEquipo en true pero los valores aprobados del código distintos, tampoco genera', async () => {
    const r = await generarGeometria(entradas(fuentePrueba(), mapaPrueba(), { aprobados: PARAMETROS_APROBADOS }), simulado(unidadesEjemplo()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('proyeccion.unidadesPorGrado: el archivo tiene 10 y el Equipo aprobó 500.');
    expect(textoDe(r)).toContain('viewBox: el archivo tiene [0,0,30,70] y el Equipo aprobó [0,0,6225,9207].');
  });
  it('se niega si falta un parámetro, aunque el mapa figure como aprobado', async () => {
    const r = await generarGeometria(entradas(fuentePrueba(), mapaPrueba((c) => delete c.viewBox)), simulado(unidadesEjemplo()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('incompleto o es inválido');
  });
});

describe('Generación: códigos contra la tabla de la tarea 1.4', () => {
  it('falla si falta un código e indica cuál', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo().filter((u) => u.codigo !== '02')));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('Falta el código 02 (Beta)');
  });

  it('falla si sobra un código', async () => {
    const r = await generarGeometria(entradas(), simulado([...unidadesEjemplo(), { codigo: '04', nombre: 'DELTA', poligonos: [[rectangulo(8, 1, 9, 2)]] }]));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('El código 04 de la fuente no está en la tabla de Departamentos (tarea 1.4): sobra.');
  });

  it('falla si un código está duplicado', async () => {
    const r = await generarGeometria(entradas(), simulado([...unidadesEjemplo(), { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(8, 1, 9, 2)]] }]));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('El código 03 está repetido');
  });

  it('falla si el nombre de la fuente no corresponde al de la tabla para ese código', async () => {
    const cambiado = unidadesEjemplo();
    cambiado[0] = { ...(cambiado[0] as UnidadCruda), nombre: 'NO ES ALFA' };
    const r = await generarGeometria(entradas(), simulado(cambiado));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('El código 01 se llama "NO ES ALFA" en la fuente y "Alfa" en la tabla');
  });
});

describe('Generación: partes de las geometrías multiparte', () => {
  it('falla si la fuente original tiene menos partes que las registradas en fuente.config.json', async () => {
    const r = await generarGeometria(entradas(fuentePrueba((c) => (c.verificacion.esperadoPorDepartamento[1].partes = 3))), simulado(unidadesEjemplo()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('Fuente sin simplificar: el Departamento 02 (BETA) tiene 2 parte(s) y debe tener 3 (se perdieron 1).');
  });

  it('falla si la fuente original tiene otros puntos que los registrados', async () => {
    const r = await generarGeometria(entradas(fuentePrueba((c) => (c.verificacion.esperadoPorDepartamento[0].vertices = 99))), simulado(unidadesEjemplo()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('el Departamento 01 tiene 5 puntos y fuente.config.json registra 99');
  });

  /** Fuente con tanto detalle que supera el objetivo de 50 KB y obliga a simplificar: un anillo de vértices casi aleatorios. */
  const detalle = (porcentaje: number): UnidadCruda[] => {
    const base = unidadesEjemplo();
    if (porcentaje < 100) return base; // la versión "simplificada" es la de ejemplo
    const anillo: [number, number][] = [];
    let semilla = 12345;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 60_000; i++) anillo.push([azar() * 0.9, azar() * 0.9]);
    base[0] = { codigo: '01', nombre: 'ALFA', poligonos: [[[...anillo, anillo[0] as [number, number]]]] };
    return base;
  };
  const fuenteConDetalle = (c: any): void => {
    c.verificacion.esperadoPorDepartamento[0] = fila('01', 1, 60_001, 1, 0);
  };

  it('simplifica cuando la fuente supera el objetivo, y conserva todas las partes si la simplificación no pierde ninguna', async () => {
    const llamadas: number[] = [];
    const r = await generarGeometria(entradas(fuentePrueba(fuenteConDetalle)), simulado(detalle, llamadas));
    expect(r.ok, textoDe(r)).toBe(true);
    if (!r.ok) return;
    expect(r.valor.registro.porcentajeConservado).toBeLessThan(100);
    expect(llamadas.some((p) => p < 100)).toBe(true);
    expect(r.valor.registro.fuenteOriginal.puntos).toBe(60_001 + 5 + 5 + 10);
    expect(r.valor.registro.resumen.partes).toBe(5);
    expect(r.valor.registro.partesTrasSimplificar).toBe(5);
  });

  it('falla, sin escribir nada, si la simplificación pierde una parte (la isla de Beta)', async () => {
    const pierdeIsla = (porcentaje: number): UnidadCruda[] =>
      detalle(porcentaje).map((u) => (porcentaje < 100 && u.codigo === '02' ? { ...u, poligonos: [u.poligonos[0] as UnidadCruda['poligonos'][number]] } : u));
    const r = await generarGeometria(entradas(fuentePrueba(fuenteConDetalle)), simulado(pierdeIsla));
    expect(r.ok).toBe(false);
    const texto = textoDe(r);
    expect(texto).toMatch(/Simplificado al [\d.]+ %: el Departamento 02 \(BETA\) tiene 1 parte\(s\) y debe tener 2 \(se perdieron 1\)\./);
    expect(texto).toContain('No se escribió ningún archivo.');
    expect(texto).toContain('no se eliminan en silencio');
  });

  it('falla, sin descartarla, si una parte de la propia fuente es tan pequeña que no se puede dibujar a un decimal', async () => {
    // Como el hueco de 20 m de Puno o los islotes de Lima de la fuente real: la parte existe y está registrada,
    // pero con 10 unidades por grado mide menos de una décima. No se elimina: la herramienta se detiene.
    const conMinuscula = (porcentaje: number): UnidadCruda[] => {
      const base = detalle(porcentaje);
      base[1] = { ...(base[1] as UnidadCruda), poligonos: [...(base[1] as UnidadCruda).poligonos, [rectangulo(5, 5, 5.001, 5.001)]] };
      return base;
    };
    const r = await generarGeometria(
      entradas(
        fuentePrueba((c) => {
          fuenteConDetalle(c);
          c.verificacion.esperadoPorDepartamento[1] = fila('02', 3, 15, 3, 0);
        }),
      ),
      simulado(conMinuscula),
    );
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toMatch(/Departamento 02 \(Beta\), polígono 2, anillo exterior: se reduce a \d punto\(s\) distinto\(s\)/);
    expect(textoDe(r)).toContain('No se descarta');
    expect(textoDe(r)).toContain('No se escribió ningún archivo.');
  });
});

describe('Generación: límite de 80 KB comprimidos', () => {
  it('falla, sin ocultarlo, si ni la mayor simplificación permitida baja del límite', async () => {
    const enorme = (): UnidadCruda[] => [pesada('01', 'ALFA', 60_000), ...unidadesEjemplo().slice(1)];
    const r = await generarGeometria(
      entradas(fuentePrueba((c) => ((c.verificacion.esperadoPorDepartamento[0] = fila('01', 1, 60_001, 1, 0))))),
      simulado(enorme),
    );
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('Ni con la mayor simplificación probada');
  });

  it('falla con el tamaño real si el archivo final supera 80 KB comprimidos, aunque la búsqueda lo haya intentado', async () => {
    // Un Mapshaper simulado que NO simplifica nada (devuelve siempre la misma geometría pesada) deja la búsqueda sin
    // salida: la herramienta no escribe el archivo ni elimina geometrías para que quepa.
    const pesadaSiempre = (): UnidadCruda[] => [pesada('01', 'ALFA', 40_000), ...unidadesEjemplo().slice(1)];
    const r = await generarGeometria(
      entradas(fuentePrueba((c) => (c.verificacion.esperadoPorDepartamento[0] = fila('01', 1, 40_001, 1, 0)))),
      simulado(pesadaSiempre),
    );
    expect(r.ok).toBe(false);
    const texto = textoDe(r);
    expect(texto).toMatch(/Ni con la mayor simplificación probada|El archivo comprimido pesa/);
    expect(texto).not.toBe('');
  });

  it('finalizar falla con una geometría real que supera 80 KB comprimidos, y no devuelve texto', () => {
    // Dos Departamentos con 40 000 vértices casi aleatorios (incomprimibles): pesan muy por encima del límite.
    const unidades = [pesada('01', 'ALFA', 40_000), pesada('02', 'BETA', 40_000)];
    const construida = construirGeometria(unidades, TABLA_EJEMPLO.slice(0, 2), { ...PARAMETROS_PRUEBA, viewBox: [0, 0, 100, 100], proyeccion: { ...PARAMETROS_PRUEBA.proyeccion, unidadesPorGrado: 15 } }, { fuente: 'f', licencia: 'l' }, { tolerante: true });
    if (!construida.ok) throw new Error(construida.errores.join('\n'));
    const r = finalizar(construida.valor.geometria);
    expect(tamanoComprimido(serializar(construida.valor.geometria))).toBeGreaterThan(LIMITE_COMPRIMIDO_BYTES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toMatch(/^El archivo comprimido pesa [\d.]+ KB y el límite es 80\.0 KB \(requisito 4\.17\)\.$/);
  });

  it('finalizar acepta una geometría que cabe y devuelve el texto y su tamaño comprimido real', () => {
    const construida = construirGeometria(unidadesEjemplo(), TABLA_EJEMPLO, PARAMETROS_PRUEBA, { fuente: 'f', licencia: 'l' });
    if (!construida.ok) throw new Error(construida.errores.join('\n'));
    const r = finalizar(construida.valor.geometria);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.texto).toBe(serializar(construida.valor.geometria));
      expect(r.valor.comprimidoBytes).toBe(tamanoComprimido(r.valor.texto));
    }
  });

  it('el mensaje de límite da el tamaño real y cita el requisito 4.17', () => {
    expect(errorDeLimite(LIMITE_COMPRIMIDO_BYTES + 1024)).toBe(
      'El archivo comprimido pesa 81.0 KB y el límite es 80.0 KB (requisito 4.17).',
    );
  });

  it('nunca escribe un archivo que supere el límite: lo que se devuelve cabe en 80 KB comprimidos', async () => {
    const r = await generarGeometria(entradas(), simulado(unidadesEjemplo()));
    if (!r.ok) throw new Error(textoDe(r));
    expect(r.valor.registro.comprimidoBytes).toBeLessThanOrEqual(LIMITE_COMPRIMIDO_BYTES);
  });
});

describe('Generación: otros fallos de entrada', () => {
  it('falla con un mensaje claro si no se puede leer el ZIP', async () => {
    const dep: Dependencias = { leerZip: () => { throw new Error('ENOENT: no existe'); }, simplificar: async () => ok(null) };
    const r = await generarGeometria(entradas(), dep);
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('No se pudo leer data/fuentes/ign/DEPARTAMENTOS_LIMITES.zip: ENOENT: no existe');
  });

  it('falla si Mapshaper falla', async () => {
    const dep: Dependencias = { leerZip: () => new Uint8Array(), simplificar: async () => fallo('Mapshaper no pudo leer o simplificar la fuente: ZIP dañado') };
    const r = await generarGeometria(entradas(), dep);
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('ZIP dañado');
  });

  it('falla si lo que devuelve Mapshaper no es una FeatureCollection', async () => {
    const dep: Dependencias = { leerZip: () => new Uint8Array(), simplificar: async () => ok({ type: 'Topology' }) };
    const r = await generarGeometria(entradas(), dep);
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('no es una FeatureCollection de GeoJSON');
  });

  it('falla si fuente.config.json no indica los campos del código y del nombre o las partes esperadas', async () => {
    expect(camposDeLaFuente({}).ok).toBe(false);
    expect(camposDeLaFuente({ codificacion: { campoCodigo: 'A' } }).ok).toBe(false);
    expect(camposDeLaFuente(fuenteReal).ok).toBe(true);
    expect(esperadoDeLaFuente({}).ok).toBe(false);
    expect(esperadoDeLaFuente({ verificacion: { esperadoPorDepartamento: [{ codigo: '01' }] } }).ok).toBe(false);
    const real = esperadoDeLaFuente(fuenteReal);
    expect(real.ok && real.valor).toHaveLength(25);
  });
});

describe('Generación: excepción autorizada para una parte que no se puede dibujar (como 21#6.2 de Puno)', () => {
  /** Hueco diminuto de Gamma: con 10 unidades por grado se reduce a un punto, igual que el hueco de Puno con el mapa real. */
  const huecoDiminuto = rectangulo(1, 3, 1.001, 3.001);
  const conHuecoDiminuto = (): UnidadCruda[] => {
    const base = unidadesEjemplo();
    base[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), huecoDiminuto]] };
    return base;
  };
  const autorizada: ExcepcionAutorizada = { id: '03#0.1', codigo: '03', poligono: 0, anillo: 1, sha256: huellaDeAnillo(huecoDiminuto) };
  const registro = (cambiar: (r: Record<string, unknown>) => void = () => {}): Record<string, unknown> => {
    const r: Record<string, unknown> = {
      id: '03#0.1',
      codigo: '03',
      poligono: 0,
      anillo: 1,
      puntos: 5,
      sha256: autorizada.sha256,
      motivo: 'Hueco diminuto de prueba.',
      aprobadoPorEquipo: true,
    };
    cambiar(r);
    return r;
  };
  const fuenteConExcepcion = (r: Record<string, unknown> = registro()): unknown => fuentePrueba((c) => (c.partesNoRepresentables = [r]));
  const conExcepcion = (fuente: unknown = fuenteConExcepcion()): Entradas => entradas(fuente, mapaPrueba(), { excepcionesAutorizadas: [autorizada] });

  it('genera sin dibujar la parte excepcionada, y lo informa: 3 Departamentos, 4 partes de las 5 de la fuente', async () => {
    const r = await generarGeometria(conExcepcion(), simulado(conHuecoDiminuto()));
    expect(r.ok, textoDe(r)).toBe(true);
    if (!r.ok) return;
    expect(r.valor.registro.excepciones).toEqual(['03#0.1']);
    expect(r.valor.registro.fuenteOriginal.partes).toBe(5);
    expect(r.valor.registro.resumen).toMatchObject({ departamentos: 3, partes: 4, partesOmitidas: 0, partesExcepcion: ['03#0.1'] });
    expect((r.valor.geometria.departamentos[2]?.d.match(/m/g) ?? []).length).toBe(1);
  });

  it('da lo mismo que Mapshaper ya haya quitado esa parte al simplificar (lo que pasa con el hueco de Puno)', async () => {
    const quitaElHueco = (porcentaje: number): UnidadCruda[] => {
      const base = conHuecoDiminuto();
      if (porcentaje < 100) base[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4)]] };
      return base;
    };
    const con = await generarGeometria(conExcepcion(), simulado(conHuecoDiminuto()));
    const sin = await generarGeometria(conExcepcion(), simulado(quitaElHueco));
    expect(sin.ok, textoDe(sin)).toBe(true);
    if (con.ok && sin.ok) expect(sin.valor.geometria).toEqual(con.valor.geometria);
  });

  it('sin el registro de la excepción, la misma parte es un error y no se descarta', async () => {
    const r = await generarGeometria(entradas(fuentePrueba(), mapaPrueba(), { excepcionesAutorizadas: [autorizada] }), simulado(conHuecoDiminuto()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('Departamento 03 (Gamma), polígono 0, hueco 1:');
    expect(textoDe(r)).toContain('No se descarta');
  });

  it('un registro que el código no autoriza se rechaza, aunque diga aprobado por el Equipo', async () => {
    const r = await generarGeometria(entradas(fuenteConExcepcion(), mapaPrueba(), { excepcionesAutorizadas: [] }), simulado(conHuecoDiminuto()));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('no es una de las excepciones que el Equipo autorizó (ninguna)');
  });

  it('se rechaza si la fuente cambió: otras coordenadas con la misma identificación', async () => {
    const cambiada = conHuecoDiminuto();
    cambiada[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), rectangulo(1, 3, 1.002, 3.002)]] };
    const r = await generarGeometria(conExcepcion(), simulado(cambiada));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('las coordenadas de la fuente cambiaron');
  });

  it('se rechaza si el registro no está aprobado o no trae motivo', async () => {
    const sinAprobar = await generarGeometria(conExcepcion(fuenteConExcepcion(registro((r) => (r['aprobadoPorEquipo'] = false)))), simulado(conHuecoDiminuto()));
    expect(textoDe(sinAprobar)).toContain('"aprobadoPorEquipo" no es true');
    const sinMotivo = await generarGeometria(conExcepcion(fuenteConExcepcion(registro((r) => delete r['motivo']))), simulado(conHuecoDiminuto()));
    expect(textoDe(sinMotivo)).toContain('falta el motivo');
  });

  it('la excepción no oculta la pérdida de otra parte: si la simplificación pierde la isla de Beta, falla', async () => {
    // Con la fuente pesada la búsqueda tiene que simplificar; la versión simplificada pierde la isla de Beta y el hueco diminuto.
    const pierdeIslaYHueco = (porcentaje: number): UnidadCruda[] => {
      const base = conHuecoDiminuto();
      if (porcentaje >= 100) {
        base[0] = pesada('01', 'ALFA', 60_000);
        return base;
      }
      base[1] = { ...(base[1] as UnidadCruda), poligonos: [(base[1] as UnidadCruda).poligonos[0] as UnidadCruda['poligonos'][number]] };
      base[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4)]] };
      return base;
    };
    const fuente = fuentePrueba((c) => {
      c.verificacion.esperadoPorDepartamento[0] = fila('01', 1, 60_001, 1, 0);
      c.partesNoRepresentables = [registro()];
    });
    const r = await generarGeometria(entradas(fuente, mapaPrueba(), { excepcionesAutorizadas: [autorizada] }), simulado(pierdeIslaYHueco));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toMatch(/el Departamento 02 \(BETA\) tiene 1 parte\(s\) y debe tener 2 \(se perdieron 1\)\./);
    expect(textoDe(r)).not.toContain('el Departamento 03');
    expect(textoDe(r)).toContain('No se escribió ningún archivo.');
  });
  it('la excepción no sirve para otra parte: un segundo hueco diminuto es un error', async () => {
    const dos = conHuecoDiminuto();
    dos[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), huecoDiminuto, rectangulo(1.5, 3, 1.501, 3.001)]] };
    const fuente = fuentePrueba((c) => {
      c.verificacion.esperadoPorDepartamento[2] = fila('03', 3, 15, 1, 2);
      c.partesNoRepresentables = [registro()];
    });
    const r = await generarGeometria(entradas(fuente, mapaPrueba(), { excepcionesAutorizadas: [autorizada] }), simulado(dos));
    expect(r.ok).toBe(false);
    expect(textoDe(r)).toContain('Departamento 03 (Gamma), polígono 0, hueco 2:');
  });
});

describe('Generación: la configuración real de la fuente trae la excepción 21#6.2 y las constantes del código la autorizan', () => {
  it('el registro de fuente.config.json coincide con la única excepción autorizada en el código', () => {
    const registradas = (fuenteReal as { partesNoRepresentables: Record<string, unknown>[] }).partesNoRepresentables;
    expect(registradas).toHaveLength(1);
    const [una] = registradas as [Record<string, unknown>];
    expect(una).toMatchObject({
      id: '21#6.2',
      codigo: '21',
      poligono: 6,
      anillo: 2,
      puntos: 4,
      sha256: 'bd73b61b164180fcb36dd008ea4e42b6f0929bd73b732a889611b8d993b01522',
      aprobadoPorEquipo: true,
    });
    expect(String(una['motivo']).length).toBeGreaterThan(50);
    expect((una['aprobacion'] as { nota: string }).nota).toMatch(/No se registra quién/);
    expect(EXCEPCIONES_AUTORIZADAS).toEqual([{ id: '21#6.2', codigo: '21', poligono: 6, anillo: 2, sha256: una['sha256'] }]);
  });
});