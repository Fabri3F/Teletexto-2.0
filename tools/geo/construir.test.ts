import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  construirGeometria,
  decimalesMaximos,
  esLaExcepcion,
  huellaDeAnillo,
  verificarCodigos,
  verificarExcepciones,
  verificarNombres,
  verificarPartes,
  type ExcepcionActiva,
} from './construir.ts';
import { PARAMETROS_PRUEBA, TABLA_EJEMPLO, rectangulo, unidadesEjemplo } from './datos-prueba.ts';
import type { ExcepcionAutorizada } from './constantes.ts';
import { contarPartes, contarPuntos, type Anillo, type UnidadCruda } from './geojson.ts';

const CAMPOS = { fuente: 'Fuente de prueba', licencia: 'Licencia de prueba' };

const sinEl = (codigo: string): UnidadCruda[] => unidadesEjemplo().filter((u) => u.codigo !== codigo);

function errores(r: { ok: boolean; errores?: string[] }): string[] {
  return r.ok ? [] : (r.errores ?? []);
}

describe('Códigos contra la tabla de la tarea 1.4', () => {
  it('acepta exactamente los códigos de la tabla, en cualquier orden', () => {
    expect(verificarCodigos(unidadesEjemplo(), TABLA_EJEMPLO).ok).toBe(true);
    expect(verificarCodigos([...unidadesEjemplo()].reverse(), TABLA_EJEMPLO).ok).toBe(true);
  });

  it('falla si falta un código e indica cuál y a qué Departamento corresponde', () => {
    const r = verificarCodigos(sinEl('02'), TABLA_EJEMPLO);
    expect(r.ok).toBe(false);
    expect(errores(r)).toEqual([
      'Hay 2 unidades en la fuente y la tabla de Departamentos tiene 3.',
      'Falta el código 02 (Beta) de la tabla de Departamentos (tarea 1.4).',
    ]);
  });

  it('falla si sobra un código que no está en la tabla', () => {
    const r = verificarCodigos([...unidadesEjemplo(), { codigo: '99', nombre: 'EXTRA', poligonos: [[rectangulo(0, 0, 1, 1)]] }], TABLA_EJEMPLO);
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toContain('El código 99 de la fuente no está en la tabla de Departamentos (tarea 1.4): sobra.');
    expect(errores(r)[0]).toBe('Hay 4 unidades en la fuente y la tabla de Departamentos tiene 3.');
  });

  it('falla si un código está repetido', () => {
    const repetido = [...unidadesEjemplo(), { codigo: '01', nombre: 'ALFA', poligonos: [[rectangulo(9, 9, 10, 10)]] }];
    const r = verificarCodigos(repetido, TABLA_EJEMPLO);
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toContain('El código 01 está repetido: aparece en 2 registros.');
  });

  it('con 24 o 26 unidades de 25, falla con el recuento', () => {
    const tabla = Array.from({ length: 25 }, (_, i) => ({ codigo: String(i + 1).padStart(2, '0'), nombre: `D${i + 1}` }));
    const unidad = (codigo: string): UnidadCruda => ({ codigo, nombre: 'X', poligonos: [[rectangulo(0, 0, 1, 1)]] });
    const veinticinco = tabla.map((t) => unidad(t.codigo));
    expect(verificarCodigos(veinticinco, tabla).ok).toBe(true);
    expect(errores(verificarCodigos(veinticinco.slice(0, 24), tabla))[0]).toBe('Hay 24 unidades en la fuente y la tabla de Departamentos tiene 25.');
    expect(errores(verificarCodigos([...veinticinco, unidad('26')], tabla))[0]).toBe('Hay 26 unidades en la fuente y la tabla de Departamentos tiene 25.');
  });

  it('informa todos los problemas a la vez, no solo el primero', () => {
    const r = verificarCodigos([unidadesEjemplo()[0] as UnidadCruda, { codigo: '77', nombre: 'X', poligonos: [] }], TABLA_EJEMPLO);
    expect(errores(r).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Nombres de la fuente contra la tabla', () => {
  it('acepta nombres en mayúsculas y sin tildes que coinciden con la tabla', () => {
    const tabla = [{ codigo: '02', nombre: 'Áncash' }];
    const unidades = [{ codigo: '02', nombre: 'ANCASH', poligonos: [] }];
    expect(verificarNombres(unidades, tabla).ok).toBe(true);
  });

  it('falla si el nombre de la fuente no corresponde al de la tabla para ese código', () => {
    const r = verificarNombres([{ codigo: '01', nombre: 'OTRO', poligonos: [] }], TABLA_EJEMPLO);
    expect(errores(r)).toEqual(['El código 01 se llama "OTRO" en la fuente y "Alfa" en la tabla de Departamentos.']);
  });

  it('falla si un código no tiene dos dígitos', () => {
    expect(errores(verificarNombres([{ codigo: '1', nombre: 'ALFA', poligonos: [] }], TABLA_EJEMPLO))[0]).toContain('no tiene dos dígitos');
  });
});

describe('Conservación de las partes de las geometrías multiparte', () => {
  const esperado = [
    { codigo: '01', partes: 1, vertices: 5 },
    { codigo: '02', partes: 2, vertices: 10 },
    { codigo: '03', partes: 2, vertices: 10 },
  ];

  it('las unidades de ejemplo tienen las partes que se esperan', () => {
    expect(verificarPartes(unidadesEjemplo(), esperado, 'Prueba').ok).toBe(true);
    expect(contarPartes(unidadesEjemplo()[1]?.poligonos ?? [])).toBe(2);
    expect(contarPartes(unidadesEjemplo()[2]?.poligonos ?? [])).toBe(2); // exterior + hueco
    expect(contarPuntos(unidadesEjemplo()[2]?.poligonos ?? [])).toBe(10);
  });

  it('falla si una isla de un MultiPolygon se pierde, e indica cuántas partes se perdieron', () => {
    const sinIsla = unidadesEjemplo();
    sinIsla[1] = { ...(sinIsla[1] as UnidadCruda), poligonos: [(sinIsla[1] as UnidadCruda).poligonos[0] as UnidadCruda['poligonos'][number]] };
    const r = verificarPartes(sinIsla, esperado, 'Simplificado al 5 %');
    expect(errores(r)).toEqual(['Simplificado al 5 %: el Departamento 02 (BETA) tiene 1 parte(s) y debe tener 2 (se perdieron 1).']);
  });

  it('falla si se pierde un hueco, porque también es una parte', () => {
    const sinHueco = unidadesEjemplo();
    sinHueco[2] = { ...(sinHueco[2] as UnidadCruda), poligonos: [[(sinHueco[2] as UnidadCruda).poligonos[0]?.[0] as readonly [number, number][]]] };
    const r = verificarPartes(sinHueco, esperado, 'Prueba');
    expect(errores(r)[0]).toContain('el Departamento 03 (GAMMA) tiene 1 parte(s) y debe tener 2 (se perdieron 1).');
  });

  it('falla si hay más partes de las que se esperan, sin decir que se perdieron', () => {
    const r = verificarPartes(unidadesEjemplo(), [{ codigo: '01', partes: 0, vertices: 0 }], 'Prueba');
    expect(errores(r)[0]).toContain('tiene 1 parte(s) y debe tener 0.');
    expect(errores(r)[0]).not.toContain('se perdieron');
  });

  it('informa todos los Departamentos con partes perdidas', () => {
    const r = verificarPartes(unidadesEjemplo(), [{ codigo: '01', partes: 3, vertices: 0 }, { codigo: '02', partes: 5, vertices: 0 }], 'Prueba');
    expect(errores(r)).toHaveLength(2);
  });
});

describe('Construcción de la geometría', () => {
  const construir = (unidades = unidadesEjemplo(), parametros = PARAMETROS_PRUEBA, opciones = {}) =>
    construirGeometria(unidades, TABLA_EJEMPLO, parametros, CAMPOS, opciones);

  it('construye un Departamento por fila de la tabla, en el orden de la tabla y con los nombres de la tabla', () => {
    const r = construir([...unidadesEjemplo()].reverse());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.geometria.departamentos.map((d) => [d.codigo, d.nombre])).toEqual([['01', 'Alfa'], ['02', 'Beta'], ['03', 'Gamma']]);
  });

  it('copia version, fuente, licencia y viewBox y no añade otros campos', () => {
    const r = construir();
    if (!r.ok) throw new Error(r.errores.join('\n'));
    const g = r.valor.geometria;
    expect(Object.keys(g).sort()).toEqual(['departamentos', 'fuente', 'licencia', 'version', 'viewBox']);
    expect(g.version).toBe('prueba');
    expect(g.fuente).toBe('Fuente de prueba');
    expect(g.licencia).toBe('Licencia de prueba');
    expect(g.viewBox).toEqual([0, 0, 30, 70]);
    for (const d of g.departamentos) expect(Object.keys(d).sort()).toEqual(['centroide', 'codigo', 'd', 'nombre']);
  });

  it('conserva todas las partes: una subruta m...z por parte, también la isla y el hueco', () => {
    const r = construir();
    if (!r.ok) throw new Error(r.errores.join('\n'));
    const porCodigo = Object.fromEntries(r.valor.geometria.departamentos.map((d) => [d.codigo, (d.d.match(/m/g) ?? []).length]));
    expect(porCodigo).toEqual({ '01': 1, '02': 2, '03': 2 });
    for (const d of r.valor.geometria.departamentos) expect((d.d.match(/z/g) ?? []).length).toBe((d.d.match(/m/g) ?? []).length);
    expect(r.valor.resumen).toEqual({ departamentos: 3, partes: 5, puntosEntrada: 25, verticesSalida: 20, partesOmitidas: 0, partesExcepcion: [] });
  });

  it('proyecta con la proyección equirrectangular: el norte arriba, el este a la derecha', () => {
    const r = construir();
    if (!r.ok) throw new Error(r.errores.join('\n'));
    // Alfa es el rectángulo (0,0)-(1,1) en grados; con 10 u/° y origen en lat 6: x de 0 a 10, y de 50 a 60.
    expect(r.valor.geometria.departamentos[0]?.d).toBe('m0 60 10 0 0-10-10 0z');
  });

  it('los números de las rutas llevan como máximo un decimal', () => {
    const fino = unidadesEjemplo();
    fino[0] = { codigo: '01', nombre: 'ALFA', poligonos: [[rectangulo(0.123456, 0.987654, 1.111111, 1.555555)]] };
    const r = construir(fino);
    if (!r.ok) throw new Error(r.errores.join('\n'));
    const todo = r.valor.geometria.departamentos.map((d) => d.d).join('');
    expect(decimalesMaximos(todo)).toBeLessThanOrEqual(1);
    expect(todo).toMatch(/\d*\.\d/);
    for (const d of r.valor.geometria.departamentos) {
      expect(decimalesMaximos(String(d.centroide[0]))).toBeLessThanOrEqual(1);
      expect(decimalesMaximos(String(d.centroide[1]))).toBeLessThanOrEqual(1);
    }
  });

  it('calcula centroides dentro del viewBox, ponderados por área', () => {
    const r = construir();
    if (!r.ok) throw new Error(r.errores.join('\n'));
    const [alfa, beta, gamma] = r.valor.geometria.departamentos;
    expect(alfa?.centroide).toEqual([5, 55]); // centro de (0,50)-(10,60)
    // Beta: la parte grande ocupa x 0-10, y 0-10 (área 100, centro 5,5) y la isla x 20-25, y 55-60 (área 25, centro 22.5,57.5).
    // x = (5*100 + 22.5*25) / 125 = 8.5 e y = (5*100 + 57.5*25) / 125 = 15.5: queda más cerca de la parte grande.
    expect(beta?.centroide).toEqual([8.5, 15.5]);
    // Gamma tiene un hueco centrado: el centroide es el centro de su exterior.
    expect(gamma?.centroide).toEqual([10, 30]);
    for (const d of r.valor.geometria.departamentos) {
      expect(d.centroide[0]).toBeGreaterThanOrEqual(0);
      expect(d.centroide[0]).toBeLessThanOrEqual(30);
      expect(d.centroide[1]).toBeGreaterThanOrEqual(0);
      expect(d.centroide[1]).toBeLessThanOrEqual(70);
    }
  });

  it('falla, sin descartar la parte, si una parte no se puede dibujar a un decimal (geometría inválida)', () => {
    const minuscula = unidadesEjemplo();
    minuscula[1] = { ...(minuscula[1] as UnidadCruda), poligonos: [...(minuscula[1] as UnidadCruda).poligonos, [rectangulo(5, 5, 5.001, 5.001)]] };
    const r = construir(minuscula);
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toMatch(/Departamento 02 \(Beta\), polígono 2, anillo exterior: se reduce a \d punto\(s\) distinto\(s\) al redondear a un decimal\. No se descarta/);
  });

  it('falla si un hueco se reduce a un punto, e indica que es un hueco', () => {
    const conHuecoMinimo = unidadesEjemplo();
    conHuecoMinimo[2] = { ...(conHuecoMinimo[2] as UnidadCruda), poligonos: [[rectangulo(0, 2, 2, 4), rectangulo(1, 3, 1.001, 3.001)]] };
    expect(errores(construir(conHuecoMinimo)).join('\n')).toContain('Departamento 03 (Gamma), polígono 0, hueco 1:');
  });

  it('en modo tolerante (solo para medir el tamaño) omite esas partes y cuenta cuántas omitió', () => {
    const minuscula = unidadesEjemplo();
    minuscula[1] = { ...(minuscula[1] as UnidadCruda), poligonos: [...(minuscula[1] as UnidadCruda).poligonos, [rectangulo(5, 5, 5.001, 5.001)]] };
    const r = construir(minuscula, PARAMETROS_PRUEBA, { tolerante: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.resumen.partesOmitidas).toBe(1);
  });

  it('falla si algún punto proyectado queda fuera del viewBox', () => {
    const r = construir(unidadesEjemplo(), { ...PARAMETROS_PRUEBA, viewBox: [0, 0, 5, 70] });
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toMatch(/queda fuera del viewBox/);
  });

  it('falla si un Departamento no tiene área para calcular su centroide', () => {
    const plano = unidadesEjemplo();
    plano[0] = { codigo: '01', nombre: 'ALFA', poligonos: [[[[0, 0], [1, 1], [2, 2], [0, 0]]]] };
    expect(errores(construir(plano)).join('\n')).toContain('Departamento 01 (Alfa)');
  });

  it('cambiar el origen o la escala cambia las rutas: los parámetros no son valores fijos del código', () => {
    const a = construir();
    const b = construir(unidadesEjemplo(), { ...PARAMETROS_PRUEBA, proyeccion: { ...PARAMETROS_PRUEBA.proyeccion, unidadesPorGrado: 5 }, viewBox: [0, 0, 15, 35] });
    if (!a.ok || !b.ok) throw new Error('Deben construirse');
    expect(a.valor.geometria.departamentos[0]?.d).not.toBe(b.valor.geometria.departamentos[0]?.d);
  });

  it('es determinista: la misma entrada produce exactamente el mismo resultado', () => {
    expect(JSON.stringify(construir())).toBe(JSON.stringify(construir()));
  });
});

describe('Anillos exteriores y huecos de las partes', () => {
  const esperado = [
    { codigo: '01', partes: 1, vertices: 5, anillosExteriores: 1, huecos: 0 },
    { codigo: '02', partes: 2, vertices: 10, anillosExteriores: 2, huecos: 0 },
    { codigo: '03', partes: 2, vertices: 10, anillosExteriores: 1, huecos: 1 },
  ];

  it('acepta la estructura de las unidades de ejemplo', () => {
    expect(verificarPartes(unidadesEjemplo(), esperado, 'Prueba').ok).toBe(true);
  });

  it('falla si un hueco pasa a ser una isla: suma las mismas partes pero dibujaría otra cosa', () => {
    const [alfa, beta, gamma] = unidadesEjemplo() as [UnidadCruda, UnidadCruda, UnidadCruda];
    const poligono = gamma.poligonos[0] as UnidadCruda['poligonos'][number];
    const huecoComoIsla: UnidadCruda = { ...gamma, poligonos: [[poligono[0] as Anillo], [poligono[1] as Anillo]] };
    const r = verificarPartes([alfa, beta, huecoComoIsla], esperado, 'Simplificado');
    expect(errores(r)).toEqual([
      'Simplificado: el Departamento 03 (GAMMA) tiene 2 anillo(s) exterior(es) y 0 hueco(s), y debe tener 1 y 1.',
    ]);
  });
});

describe('Excepciones autorizadas (partes que no se pueden dibujar a un decimal)', () => {
  /** Gamma con un hueco diminuto, que con 10 unidades por grado se reduce a un punto: es la parte que se exceptúa. */
  const huecoDiminuto: Anillo = rectangulo(1, 3, 1.001, 3.001);
  const conHuecoDiminuto = (): UnidadCruda[] => {
    const base = unidadesEjemplo();
    base[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), huecoDiminuto]] };
    return base;
  };
  const sha = huellaDeAnillo(huecoDiminuto);
  const autorizada: ExcepcionAutorizada = { id: '03#0.1', codigo: '03', poligono: 0, anillo: 1, sha256: sha };
  const registro = (cambiar: (r: Record<string, unknown>) => void = () => {}): unknown[] => {
    const r: Record<string, unknown> = {
      id: '03#0.1',
      codigo: '03',
      poligono: 0,
      anillo: 1,
      puntos: 5,
      sha256: sha,
      motivo: 'Hueco diminuto de prueba.',
      aprobadoPorEquipo: true,
    };
    cambiar(r);
    return [r];
  };
  const verificar = (reg: unknown, autorizadas = [autorizada], original = conHuecoDiminuto(), parametros = PARAMETROS_PRUEBA) =>
    verificarExcepciones(reg, autorizadas, original, parametros);

  it('la huella es el SHA-256 del texto JSON del anillo y cambia si cambia una coordenada', () => {
    expect(huellaDeAnillo(huecoDiminuto)).toBe(createHash('sha256').update(JSON.stringify(huecoDiminuto), 'utf8').digest('hex'));
    expect(huellaDeAnillo(huecoDiminuto)).toMatch(/^[0-9a-f]{64}$/);
    const otro: Anillo = [[1, 3], [1.001, 3], [1.001, 3.0010000000000003], [1, 3.001], [1, 3]];
    expect(huellaDeAnillo(otro)).not.toBe(huellaDeAnillo(huecoDiminuto));
  });

  it('acepta la excepción registrada que coincide con la autorizada, la fuente y los parámetros', () => {
    const r = verificar(registro());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.map((e) => [e.id, e.codigo, e.anillo])).toEqual([['03#0.1', '03', 1]]);
  });

  it('sin registro no hay excepciones: ninguna parte se exceptúa', () => {
    expect(verificar(undefined)).toEqual({ ok: true, valor: [] });
    expect(verificar([])).toEqual({ ok: true, valor: [] });
  });

  it.each([
    ['no es una lista', {}, 'debe ser una lista'],
    ['un elemento que no es un objeto', [3], 'debe ser un objeto'],
    ['un id que no está autorizado', registro((r) => (r['id'] = '03#0.9')), 'no es una de las excepciones que el Equipo autorizó'],
    ['otro código', registro((r) => (r['codigo'] = '02')), 'no es una de las excepciones que el Equipo autorizó'],
    ['otro polígono', registro((r) => (r['poligono'] = 1)), 'no es una de las excepciones que el Equipo autorizó'],
    ['otro anillo', registro((r) => (r['anillo'] = 0)), 'no es una de las excepciones que el Equipo autorizó'],
    ['otra huella', registro((r) => (r['sha256'] = 'a'.repeat(64))), 'no es una de las excepciones que el Equipo autorizó'],
    ['sin aprobación del Equipo', registro((r) => (r['aprobadoPorEquipo'] = false)), '"aprobadoPorEquipo" no es true'],
    ['aprobación como texto', registro((r) => (r['aprobadoPorEquipo'] = 'true')), '"aprobadoPorEquipo" no es true'],
    ['sin motivo', registro((r) => (r['motivo'] = '  ')), 'falta el motivo'],
    ['un número de puntos distinto', registro((r) => (r['puntos'] = 4)), 'el registro dice 4 puntos y el anillo de la fuente tiene 5'],
  ])('rechaza el registro con %s', (_etiqueta, reg, texto) => {
    const r = verificar(reg);
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toContain(texto);
  });

  it('rechaza una excepción repetida', () => {
    const [una] = registro() as [unknown];
    const r = verificar([una, una]);
    expect(errores(r).join('\n')).toContain('está repetida');
  });

  it('rechaza la excepción si el anillo ya no existe en la fuente', () => {
    const sinHueco = unidadesEjemplo();
    sinHueco[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4)]] };
    expect(errores(verificar(registro(), [autorizada], sinHueco)).join('\n')).toContain('la fuente sin simplificar no tiene ese anillo');
  });

  it('rechaza la excepción si las coordenadas de la fuente cambiaron, aunque el registro sea igual', () => {
    const cambiada = conHuecoDiminuto();
    cambiada[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), rectangulo(1, 3, 1.002, 3.002)]] };
    const r = verificar(registro(), [autorizada], cambiada);
    expect(errores(r).join('\n')).toContain('las coordenadas de la fuente cambiaron');
    expect(errores(r).join('\n')).toContain(sha);
  });

  it('rechaza la excepción si con los parámetros aprobados esa parte sí se puede dibujar (ya no hace falta)', () => {
    const r = verificar(registro(), [autorizada], conHuecoDiminuto(), {
      ...PARAMETROS_PRUEBA,
      proyeccion: { ...PARAMETROS_PRUEBA.proyeccion, unidadesPorGrado: 100_000 },
      viewBox: [0, 0, 300_000, 700_000],
    });
    expect(errores(r).join('\n')).toContain('sí se puede dibujar a un decimal');
    expect(errores(r).join('\n')).toContain('debe retirarse');
  });

  it('reconoce la parte excepcionada por sus puntos, también tras simplificar (solo quita puntos), y nada más', () => {
    const r = verificar(registro());
    if (!r.ok) throw new Error(r.errores.join('\n'));
    const [activa] = r.valor as [ExcepcionActiva];
    expect(esLaExcepcion(huecoDiminuto, '03', activa)).toBe(true);
    expect(esLaExcepcion([huecoDiminuto[0] as [number, number], huecoDiminuto[2] as [number, number], huecoDiminuto[0] as [number, number]], '03', activa)).toBe(true);
    expect(esLaExcepcion(huecoDiminuto, '02', activa)).toBe(false); // otro departamento
    expect(esLaExcepcion(rectangulo(1, 3, 1.5, 3.5), '03', activa)).toBe(false); // otros puntos
    expect(esLaExcepcion([...huecoDiminuto.slice(0, 4), [1.0005, 3.0005], huecoDiminuto[4] as [number, number]], '03', activa)).toBe(false); // un punto que no es suyo
    expect(esLaExcepcion([], '03', activa)).toBe(false);
  });

  const activas = (): ExcepcionActiva[] => {
    const r = verificar(registro());
    if (!r.ok) throw new Error(r.errores.join('\n'));
    return r.valor;
  };

  it('construye la geometría sin dibujar la parte excepcionada y lo informa; sin la excepción falla', () => {
    const con = construirGeometria(conHuecoDiminuto(), TABLA_EJEMPLO, PARAMETROS_PRUEBA, CAMPOS, { excepciones: activas() });
    if (!con.ok) throw new Error(con.errores.join('\n'));
    expect(con.valor.resumen).toMatchObject({ partes: 4, partesOmitidas: 0, partesExcepcion: ['03#0.1'] });
    const gamma = con.valor.geometria.departamentos[2];
    expect((gamma?.d.match(/m/g) ?? []).length).toBe(1);
    expect(gamma?.centroide).toEqual([10, 30]); // sin el hueco, el centroide es el centro del exterior
    expect(construirGeometria(conHuecoDiminuto(), TABLA_EJEMPLO, PARAMETROS_PRUEBA, CAMPOS).ok).toBe(false);
  });

  it('la excepción no sirve para otra parte: un segundo hueco diminuto sigue siendo un error', () => {
    const dos = conHuecoDiminuto();
    dos[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4), huecoDiminuto, rectangulo(1.5, 3, 1.501, 3.001)]] };
    const r = construirGeometria(dos, TABLA_EJEMPLO, PARAMETROS_PRUEBA, CAMPOS, { excepciones: activas() });
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toContain('Departamento 03 (Gamma), polígono 0, hueco 2:');
  });

  it('falla si la parte con excepción sí se puede dibujar con los parámetros de la construcción', () => {
    const r = construirGeometria(conHuecoDiminuto(), TABLA_EJEMPLO, { ...PARAMETROS_PRUEBA, proyeccion: { ...PARAMETROS_PRUEBA.proyeccion, unidadesPorGrado: 100_000 }, viewBox: [0, 0, 300_000, 700_000] }, CAMPOS, { excepciones: activas() });
    expect(r.ok).toBe(false);
    expect(errores(r).join('\n')).toContain('tiene una excepción, pero con estos parámetros sí se puede dibujar');
  });

  it('con la fuente sin simplificar se cuentan todas las partes; tras simplificar, no se cuenta ni se espera la excepcionada', () => {
    const esperado = [{ codigo: '03', partes: 2, vertices: 10, anillosExteriores: 1, huecos: 1 }];
    expect(verificarPartes(conHuecoDiminuto(), esperado, 'Fuente').ok).toBe(true);
    expect(verificarPartes(conHuecoDiminuto(), esperado, 'Simplificado', activas()).ok).toBe(true); // el hueco está y se ignora
    const sinElHueco = unidadesEjemplo();
    sinElHueco[2] = { codigo: '03', nombre: 'GAMMA', poligonos: [[rectangulo(0, 2, 2, 4)]] };
    expect(verificarPartes(sinElHueco, esperado, 'Simplificado', activas()).ok).toBe(true); // el hueco ya no está y no se espera
    expect(verificarPartes(sinElHueco, esperado, 'Fuente').ok).toBe(false); // sin excepciones, falta una parte
  });

  it('pierde una parte distinta de la excepcionada: sigue siendo un error', () => {
    const unidades = conHuecoDiminuto();
    unidades[1] = { ...(unidades[1] as UnidadCruda), poligonos: [(unidades[1] as UnidadCruda).poligonos[0] as UnidadCruda['poligonos'][number]] };
    const esperado = [
      { codigo: '02', partes: 2, vertices: 10 },
      { codigo: '03', partes: 2, vertices: 10 },
    ];
    expect(errores(verificarPartes(unidades, esperado, 'Simplificado', activas())).join('\n')).toContain(
      'el Departamento 02 (BETA) tiene 1 parte(s) y debe tener 2 (se perdieron 1).',
    );
  });
});

describe('Rutas relativas de la geometría', () => {
  it('cada ruta se puede releer y dice exactamente lo que se dibujó (la propia construcción lo comprueba)', () => {
    const r = construirGeometria(unidadesEjemplo(), TABLA_EJEMPLO, PARAMETROS_PRUEBA, CAMPOS);
    if (!r.ok) throw new Error(r.errores.join('\n'));
    for (const d of r.valor.geometria.departamentos) {
      expect(d.d).toMatch(/^(?:m[-\d. ]+z)+$/);
      expect(d.d).not.toMatch(/[MLZ]/);
    }
    // Beta: la parte grande (0,50)-(10,60)... y la isla, relativa al inicio de la primera subruta.
    expect(r.valor.geometria.departamentos[1]?.d).toBe('m0 10 10 0 0-10-10 0zm20 50 5 0 0-5-5 0z');
  });
});