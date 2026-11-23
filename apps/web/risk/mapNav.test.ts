import { readFileSync } from 'node:fs';
import { CODIGOS_DEPARTAMENTO, type CodigoDepartamento, type Geometria } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { mover, ordenRecorrido, type DireccionMapa, type GeometriaNavegable } from './mapNav.ts';
// Tarea 5.14. Requisitos 4.10, 6.2 y 6.6. Pruebas unitarias; la Propiedad 33 es de la tarea 5.15.
const DIRECCIONES: readonly DireccionMapa[] = ['arriba', 'abajo', 'izquierda', 'derecha'];
const TODOS: readonly CodigoDepartamento[] = CODIGOS_DEPARTAMENTO;

function dep(codigo: string, x: number, y: number): GeometriaNavegable['departamentos'][number] {
  return { codigo: codigo as CodigoDepartamento, centroide: [x, y] };
}
function geom(...departamentos: GeometriaNavegable['departamentos'][number][]): GeometriaNavegable {
  return { departamentos };
}
/** Geometría con los 25 Departamentos con x e y dadas por funciones del índice (0 a 24). */
function geometria25(x: (i: number) => number, y: (i: number) => number): GeometriaNavegable {
  return geom(...TODOS.map((codigo, i) => dep(codigo, x(i), y(i))));
}
function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    for (const hijo of Object.values(valor)) congelar(hijo);
    Object.freeze(valor);
  }
  return valor;
}
function codigo(texto: string): CodigoDepartamento {
  return texto as CodigoDepartamento;
}

const real = JSON.parse(readFileSync(new URL('../../../public/geo/departamentos.json', import.meta.url), 'utf8')) as Geometria;

/**
 * Destinos de `mover` con la geometría real, calculados con la fórmula `axial² + 4 × lateral²` sin normalización antes de
 * añadir la normalización por potencias de dos. Columnas: arriba, abajo, izquierda, derecha (el orden de `DIRECCIONES`).
 * Los destinos de 21 derecha, 23 abajo y 24 arriba e izquierda son avances de respaldo.
 */
const ESPERADO_REAL: Readonly<Record<string, readonly string[]>> = {
  '01': ['24', '06', '20', '16'],
  '02': ['13', '07', '13', '10'],
  '03': ['08', '04', '05', '08'],
  '04': ['03', '18', '03', '18'],
  '05': ['09', '11', '11', '03'],
  '06': ['01', '13', '14', '22'],
  '07': ['15', '11', '02', '15'],
  '08': ['17', '03', '03', '17'],
  '09': ['12', '11', '11', '05'],
  '10': ['22', '19', '02', '19'],
  '11': ['09', '04', '07', '05'],
  '12': ['19', '09', '15', '25'],
  '13': ['06', '02', '06', '22'],
  '14': ['20', '06', '20', '06'],
  '15': ['10', '07', '07', '12'],
  '16': ['24', '22', '01', '25'],
  '17': ['25', '21', '08', '21'],
  '18': ['21', '23', '04', '23'],
  '19': ['10', '12', '10', '12'],
  '20': ['24', '14', '24', '01'],
  '21': ['17', '18', '04', '22'],
  '22': ['01', '10', '06', '10'],
  '23': ['18', '24', '18', '21'],
  '24': ['23', '20', '23', '20'],
  '25': ['10', '12', '19', '17'],
};

/** La geometría real con el centroide de un Departamento dañado (se conserva su código). */
function conCentroideInvalido(danado: string): GeometriaNavegable {
  return geom(...real.departamentos.map((d) => (d.codigo === danado ? { codigo: d.codigo, centroide: [Number.NaN, Number.NaN] as [number, number] } : { codigo: d.codigo, centroide: d.centroide })));
}

// Cruz: 01 en el centro, 02 al este, 03 al oeste, 04 al norte y 05 al sur.
const CRUZ = geom(dep('01', 100, 100), dep('02', 200, 100), dep('03', 0, 100), dep('04', 100, 0), dep('05', 100, 200));

describe('ordenRecorrido (Requisito 4.10)', () => {
  it('con la geometría real es una permutación de los 25 códigos, en el orden canónico', () => {
    const orden = ordenRecorrido(real);
    expect(real.departamentos).toHaveLength(25);
    expect(orden).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(new Set(orden).size).toBe(25);
  });
  it('no depende del orden de entrada', () => {
    const invertida = geom(...[...real.departamentos].reverse());
    const mezclada = geom(...real.departamentos.filter((_d, i) => i % 2 === 0), ...real.departamentos.filter((_d, i) => i % 2 === 1));
    expect(ordenRecorrido(invertida)).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(ordenRecorrido(mezclada)).toEqual([...CODIGOS_DEPARTAMENTO]);
  });
  it('no depende de los centroides', () => {
    expect(ordenRecorrido(geometria25((i) => (i * 37) % 11, (i) => (i * 53) % 7))).toEqual([...CODIGOS_DEPARTAMENTO]);
  });
  it('con una geometría parcial devuelve solo los Departamentos presentes, en orden canónico', () => {
    expect(ordenRecorrido(geom(dep('10', 1, 1), dep('02', 2, 2), dep('25', 3, 3)))).toEqual(['02', '10', '25']);
  });
  it('ignora códigos inválidos', () => {
    const invalidos = ['00', '26', '1', '001', '', 'AB', ' 01', '01 ', '1e1'];
    const orden = ordenRecorrido(geom(dep('03', 0, 0), ...invalidos.map((c) => dep(c, 1, 1)), { codigo: 7 as never, centroide: [1, 1] }));
    expect(orden).toEqual(['03']);
  });
  it('ignora los códigos repetidos y conserva la primera aparición', () => {
    expect(ordenRecorrido(geom(dep('04', 0, 0), dep('04', 5, 5), dep('02', 1, 1)))).toEqual(['02', '04']);
  });
  it('un código repetido cuenta una sola vez aunque su primera aparición tenga el centroide inválido', () => {
    const g = geom({ codigo: codigo('04'), centroide: [Number.NaN, 0] }, dep('04', 5, 5), dep('02', 1, 1));
    expect(ordenRecorrido(g)).toEqual(['02', '04']);
  });
  it.each([
    ['NaN', [Number.NaN, 1]],
    ['x infinita', [Number.POSITIVE_INFINITY, 1]],
    ['y infinita negativa', [1, Number.NEGATIVE_INFINITY]],
    ['cadenas', ['1', '2']],
    ['null', [null, 1]],
    ['undefined', [undefined, 1]],
    ['un solo número', [1]],
    ['tres números', [1, 2, 3]],
    ['vacío', []],
    ['no es arreglo', { 0: 1, 1: 2, length: 2 }],
    ['ausente', undefined],
    ['null entero', null],
  ])('conserva el código aunque su centroide sea inválido: %s', (_etiqueta, centroide) => {
    const g = geom(dep('03', 5, 5), { codigo: codigo('02'), centroide: centroide as never }, dep('01', 0, 0));
    expect(ordenRecorrido(g)).toEqual(['01', '02', '03']);
  });
  it('con los 25 códigos y todos los centroides inválidos sigue siendo una permutación de los 25, en orden canónico', () => {
    const g = geom(...[...TODOS].reverse().map((c, i) => ({ codigo: c, centroide: [i % 2 === 0 ? Number.NaN : 1, Number.POSITIVE_INFINITY] as [number, number] })));
    expect(ordenRecorrido(g)).toEqual([...CODIGOS_DEPARTAMENTO]);
  });
  it('la geometría real con un centroide danado conserva los 25 códigos', () => {
    expect(ordenRecorrido(conCentroideInvalido('08'))).toEqual([...CODIGOS_DEPARTAMENTO]);
  });
  it('ignora entradas que no son objetos', () => {
    const g = { departamentos: [null, undefined, 5, 'x', dep('02', 1, 1)] } as unknown as GeometriaNavegable;
    expect(ordenRecorrido(g)).toEqual(['02']);
  });
  it.each([
    ['sin Departamentos', geom()],
    ['geometría null', null],
    ['geometría undefined', undefined],
    ['departamentos ausentes', {}],
    ['departamentos no es arreglo', { departamentos: 'x' }],
  ])('devuelve un arreglo vacío con %s', (_etiqueta, g) => {
    expect(ordenRecorrido(g as unknown as GeometriaNavegable)).toEqual([]);
  });
  it('devuelve un arreglo nuevo en cada llamada', () => {
    const a = ordenRecorrido(real);
    a.reverse();
    a.pop();
    expect(ordenRecorrido(real)).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(ordenRecorrido(real)).not.toBe(ordenRecorrido(real));
  });
});

describe('mover: las cuatro direcciones (Requisitos 4.10, 6.2 y 6.6)', () => {
  it('desde el centro de la cruz llega al vecino de cada lado', () => {
    expect(mover(CRUZ, codigo('01'), 'derecha')).toBe('02');
    expect(mover(CRUZ, codigo('01'), 'izquierda')).toBe('03');
    expect(mover(CRUZ, codigo('01'), 'arriba')).toBe('04');
    expect(mover(CRUZ, codigo('01'), 'abajo')).toBe('05');
  });
  it('"arriba" es y menor y "abajo" es y mayor (el eje y crece hacia abajo)', () => {
    const g = geom(dep('01', 50, 100), dep('02', 50, 10), dep('03', 50, 190));
    expect(mover(g, codigo('01'), 'arriba')).toBe('02');
    expect(mover(g, codigo('01'), 'abajo')).toBe('03');
    expect(mover(g, codigo('02'), 'abajo')).toBe('01');
    expect(mover(g, codigo('03'), 'arriba')).toBe('01');
  });
  it('"izquierda" es x menor y "derecha" es x mayor', () => {
    const g = geom(dep('01', 100, 50), dep('02', 10, 50), dep('03', 190, 50));
    expect(mover(g, codigo('01'), 'izquierda')).toBe('02');
    expect(mover(g, codigo('01'), 'derecha')).toBe('03');
    expect(mover(g, codigo('02'), 'derecha')).toBe('01');
    expect(mover(g, codigo('03'), 'izquierda')).toBe('01');
  });
  it('desde un extremo de la cruz elige el más cercano en esa dirección', () => {
    expect(mover(CRUZ, codigo('02'), 'izquierda')).toBe('01');
    expect(mover(CRUZ, codigo('03'), 'derecha')).toBe('01');
    expect(mover(CRUZ, codigo('04'), 'abajo')).toBe('01');
    expect(mover(CRUZ, codigo('05'), 'arriba')).toBe('01');
  });
  it('no depende del orden de las entradas', () => {
    const invertida = geom(...[...CRUZ.departamentos].reverse());
    for (const c of ['01', '02', '03', '04', '05']) {
      for (const d of DIRECCIONES) expect(mover(invertida, codigo(c), d), `${c} ${d}`).toBe(mover(CRUZ, codigo(c), d));
    }
  });
});

describe('mover: candidatos y coste (regla C)', () => {
  it('la comparación axial es estricta: mismo x no es candidato hacia la derecha ni hacia la izquierda', () => {
    const g = geom(dep('01', 0, 0), dep('02', 0, 50), dep('03', 10, 1000), dep('04', -10, 1000));
    expect(mover(g, codigo('01'), 'derecha')).toBe('03');
    expect(mover(g, codigo('01'), 'izquierda')).toBe('04');
  });
  it('la comparación axial es estricta: mismo y no es candidato hacia arriba ni hacia abajo', () => {
    const g = geom(dep('01', 0, 0), dep('02', 50, 0), dep('03', 1000, 10), dep('04', 1000, -10));
    expect(mover(g, codigo('01'), 'abajo')).toBe('03');
    expect(mover(g, codigo('01'), 'arriba')).toBe('04');
  });
  it('el desvío lateral pesa 4 veces: gana el alineado aunque el otro esté más cerca en línea recta', () => {
    // 02: axial 100, lateral 0, coste 10 000. 03: axial 60, lateral 60, distancia 84.9 (menor que 100) pero coste 18 000.
    const g = geom(dep('01', 0, 0), dep('02', 100, 0), dep('03', 60, 60));
    expect(mover(g, codigo('01'), 'derecha')).toBe('02');
  });
  it('un candidato algo desviado gana a uno alineado pero mucho más lejos', () => {
    // 02: axial 300, coste 90 000. 03: axial 100, lateral 50, coste 10 000 + 10 000 = 20 000.
    const g = geom(dep('01', 0, 0), dep('02', 300, 0), dep('03', 100, 50));
    expect(mover(g, codigo('01'), 'derecha')).toBe('03');
  });
  it('el peso lateral vale lo mismo en vertical que en horizontal', () => {
    const g = geom(dep('01', 0, 0), dep('02', 0, 100), dep('03', 60, 60));
    expect(mover(g, codigo('01'), 'abajo')).toBe('02');
  });
  it('un candidato en la dirección contraria no cuenta', () => {
    const g = geom(dep('01', 0, 0), dep('02', -5, 0), dep('03', 500, 0));
    expect(mover(g, codigo('01'), 'derecha')).toBe('03');
  });
  it('en un empate de coste gana el primero según ordenRecorrido, sin importar el orden de entrada', () => {
    const a = geom(dep('01', 0, 0), dep('02', 100, 10), dep('03', 100, -10));
    const b = geom(dep('03', 100, -10), dep('02', 100, 10), dep('01', 0, 0));
    expect(mover(a, codigo('01'), 'derecha')).toBe('02');
    expect(mover(b, codigo('01'), 'derecha')).toBe('02');
    const c = geom(dep('01', 0, 0), dep('20', 100, 10), dep('04', -100, 10), dep('11', 100, -10));
    expect(mover(c, codigo('01'), 'derecha')).toBe('11');
  });
  it('un centroide no finito no es candidato', () => {
    const g = geom(dep('01', 0, 0), dep('02', Number.NaN, 0), dep('03', 10, Number.POSITIVE_INFINITY), dep('04', 500, 0));
    expect(mover(g, codigo('01'), 'derecha')).toBe('04');
    expect(mover(g, codigo('04'), 'izquierda')).toBe('01');
  });
});

describe('mover: avance de respaldo circular (Requisitos 4.10 y 6.2)', () => {
  it('sin candidatos, derecha y abajo avanzan al siguiente según ordenRecorrido', () => {
    expect(mover(CRUZ, codigo('02'), 'derecha')).toBe('03');
    expect(mover(CRUZ, codigo('05'), 'abajo')).toBe('01');
  });
  it('sin candidatos, izquierda y arriba retroceden al anterior', () => {
    expect(mover(CRUZ, codigo('03'), 'izquierda')).toBe('02');
    expect(mover(CRUZ, codigo('04'), 'arriba')).toBe('03');
  });
  it('es circular: desde el último avanza al primero y desde el primero retrocede al último', () => {
    const g = geom(dep('01', 0, 0), dep('02', 0, 0), dep('03', 0, 0));
    expect(mover(g, codigo('03'), 'derecha')).toBe('01');
    expect(mover(g, codigo('03'), 'abajo')).toBe('01');
    expect(mover(g, codigo('01'), 'izquierda')).toBe('03');
    expect(mover(g, codigo('01'), 'arriba')).toBe('03');
  });
  it('con centroides iguales ningún Departamento es candidato en ninguna dirección', () => {
    const g = geometria25(() => 10, () => 10);
    for (const c of TODOS) {
      const i = TODOS.indexOf(c);
      expect(mover(g, c, 'derecha')).toBe(TODOS[(i + 1) % 25]);
      expect(mover(g, c, 'abajo')).toBe(TODOS[(i + 1) % 25]);
      expect(mover(g, c, 'izquierda')).toBe(TODOS[(i + 24) % 25]);
      expect(mover(g, c, 'arriba')).toBe(TODOS[(i + 24) % 25]);
    }
  });
  it('siguiendo el respaldo desde cualquier Departamento se visitan los 25 sin repetir y se vuelve al inicio', () => {
    // Todos con la misma x: "derecha" e "izquierda" nunca tienen candidatos. Todos con la misma y: igual con "abajo" y "arriba".
    const mismaX = geometria25(() => 5, (i) => (i * 7919) % 101);
    const mismaY = geometria25((i) => (i * 7919) % 101, () => 5);
    const casos: [GeometriaNavegable, DireccionMapa][] = [
      [mismaX, 'derecha'],
      [mismaX, 'izquierda'],
      [mismaY, 'abajo'],
      [mismaY, 'arriba'],
    ];
    for (const [g, direccion] of casos) {
      for (const inicio of TODOS) {
        const visitados = [inicio];
        let actual = inicio;
        for (let paso = 1; paso < 25; paso++) {
          actual = mover(g, actual, direccion);
          visitados.push(actual);
        }
        expect(new Set(visitados).size, `${direccion} desde ${inicio}`).toBe(25);
        expect(mover(g, actual, direccion), `${direccion} desde ${inicio}`).toBe(inicio);
      }
    }
  });
  it('con la geometría real, los cuatro movimientos que no tienen candidatos usan el respaldo', () => {
    expect(mover(real, codigo('21'), 'derecha')).toBe('22'); // Puno: ninguno más al este; siguiente en el orden
    expect(mover(real, codigo('23'), 'abajo')).toBe('24'); // Tacna: ninguno más al sur; siguiente en el orden
    expect(mover(real, codigo('24'), 'arriba')).toBe('23'); // Tumbes: ninguno más al norte; anterior en el orden
    expect(mover(real, codigo('24'), 'izquierda')).toBe('23'); // Tumbes: ninguno más al oeste; anterior en el orden
  });
});

describe('mover con la geometría real (Requisitos 4.10, 6.2 y 6.6)', () => {
  it('desde Lima, las cuatro direcciones llevan a los Departamentos calculados con la regla de coste', () => {
    expect(mover(real, codigo('15'), 'derecha')).toBe('12'); // Junín
    expect(mover(real, codigo('15'), 'izquierda')).toBe('07'); // Callao
    expect(mover(real, codigo('15'), 'abajo')).toBe('07'); // Callao
    expect(mover(real, codigo('15'), 'arriba')).toBe('10'); // Huánuco
  });
  it('otros ejemplos con valores calculados aparte', () => {
    expect(mover(real, codigo('24'), 'abajo')).toBe('20'); // Tumbes a Piura
    expect(mover(real, codigo('20'), 'derecha')).toBe('01'); // Piura a Amazonas
    expect(mover(real, codigo('16'), 'derecha')).toBe('25'); // Loreto a Ucayali
    expect(mover(real, codigo('04'), 'abajo')).toBe('18'); // Arequipa a Moquegua
    expect(mover(real, codigo('08'), 'arriba')).toBe('17'); // Cusco a Madre de Dios
  });
  it('siempre devuelve uno de los 25 códigos, para cada Departamento y cada dirección', () => {
    const orden = ordenRecorrido(real);
    for (const c of orden) {
      for (const d of DIRECCIONES) expect(orden, `${c} ${d}`).toContain(mover(real, c, d));
    }
  });
  it('nunca devuelve el mismo Departamento cuando hay más de uno', () => {
    for (const c of TODOS) {
      for (const d of DIRECCIONES) expect(mover(real, c, d), `${c} ${d}`).not.toBe(c);
    }
  });
  it('desde cada Departamento, solo con las flechas se llega a los 25', () => {
    for (const inicio of TODOS) {
      const vistos = new Set<CodigoDepartamento>([inicio]);
      const pendientes: CodigoDepartamento[] = [inicio];
      for (let actual = pendientes.pop(); actual !== undefined; actual = pendientes.pop()) {
        for (const d of DIRECCIONES) {
          const destino = mover(real, actual, d);
          if (!vistos.has(destino)) {
            vistos.add(destino);
            pendientes.push(destino);
          }
        }
      }
      expect(vistos.size, `desde ${inicio}`).toBe(25);
    }
  });
  it('Callao y Lima, los más cercanos, se alcanzan entre sí', () => {
    expect(mover(real, codigo('07'), 'derecha')).toBe('15');
    expect(mover(real, codigo('15'), 'izquierda')).toBe('07');
  });
});

describe('mover: invariantes con geometrías pseudoaleatorias deterministas', () => {
  /** Generador congruencial lineal con semilla fija, para no depender de `Math.random`. */
  function generador(semilla: number): () => number {
    let estado = semilla;
    return () => {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return estado / 4_294_967_296;
    };
  }
  it('el resultado es un candidato de coste mínimo o, sin candidatos, el vecino en el orden', () => {
    for (let semilla = 1; semilla <= 60; semilla++) {
      const azar = generador(semilla);
      const g = geometria25(() => Math.round(azar() * 400) / 10, () => Math.round(azar() * 400) / 10);
      const c = (codigoDep: CodigoDepartamento) => {
        const d = g.departamentos.find((e) => e.codigo === codigoDep);
        if (d === undefined) throw new Error('falta el Departamento');
        return d.centroide;
      };
      for (const origen of TODOS) {
        const [ox, oy] = c(origen);
        for (const direccion of DIRECCIONES) {
          const destino = mover(g, origen, direccion);
          const costes = TODOS.filter((o) => o !== origen).flatMap((otro) => {
            const [x, y] = c(otro);
            const par: [number, number] =
              direccion === 'derecha' ? [x - ox, y - oy] : direccion === 'izquierda' ? [ox - x, y - oy] : direccion === 'abajo' ? [y - oy, x - ox] : [oy - y, x - ox];
            const [axial, lateral] = par;
            return axial > 0 ? [{ otro, coste: axial * axial + 4 * lateral * lateral }] : [];
          });
          const etiqueta = `semilla ${semilla}, ${origen} ${direccion}`;
          if (costes.length === 0) {
            const i = TODOS.indexOf(origen);
            const paso = direccion === 'derecha' || direccion === 'abajo' ? 1 : 24;
            expect(destino, etiqueta).toBe(TODOS[(i + paso) % 25]);
          } else {
            const minimo = Math.min(...costes.map((e) => e.coste));
            const elegido = costes.find((e) => e.otro === destino);
            expect(elegido, etiqueta).toBeDefined();
            expect(elegido?.coste, etiqueta).toBe(minimo);
            // Entre los de coste mínimo, el primero según el orden canónico.
            expect(destino, etiqueta).toBe(costes.filter((e) => e.coste === minimo).map((e) => e.otro)[0]);
          }
        }
      }
    }
  });
});

describe('mover: entradas inválidas', () => {
  it('si actual no está en el orden devuelve el primer elemento', () => {
    const g = geom(dep('05', 0, 0), dep('02', 10, 10), dep('09', 20, 20));
    for (const d of DIRECCIONES) expect(mover(g, codigo('25'), d)).toBe('02');
    expect(mover(g, codigo('99'), 'derecha')).toBe('02');
    expect(mover(g, '' as CodigoDepartamento, 'abajo')).toBe('02');
    expect(mover(g, undefined as never, 'arriba')).toBe('02');
  });
  it('si el orden está vacío devuelve actual', () => {
    for (const d of DIRECCIONES) {
      expect(mover(geom(), codigo('08'), d)).toBe('08');
      expect(mover(null as never, codigo('08'), d)).toBe('08');
      expect(mover({ departamentos: [dep('99', 1, 1), dep('00', 2, 2)] }, codigo('08'), d)).toBe('08');
    }
  });
  it('un Departamento con centroide inválido está en el orden: si actual no está, se devuelve el primero', () => {
    const g = geom(dep('05', 0, 0), dep('07', Number.NaN, 1), dep('02', 10, 10));
    for (const d of DIRECCIONES) expect(mover(g, codigo('08'), d)).toBe('02');
  });
  it.each([
    ['diagonal'],
    ['ArrowUp'],
    ['ARRIBA'],
    ['derecha '],
    [''],
    ['toString'],
    ['__proto__'],
    ['constructor'],
    [undefined],
    [null],
    [3],
    [{}],
  ])('una dirección desconocida (%s) devuelve actual', (direccion) => {
    expect(mover(CRUZ, codigo('01'), direccion as never)).toBe('01');
    expect(mover(CRUZ, codigo('05'), direccion as never)).toBe('05');
  });
  it('la dirección desconocida devuelve actual aunque actual no esté en la geometría', () => {
    expect(mover(CRUZ, codigo('25'), 'diagonal' as never)).toBe('25');
  });
  it('con un solo Departamento devuelve ese mismo Departamento en cualquier dirección', () => {
    const g = geom(dep('12', 3, 4));
    for (const d of DIRECCIONES) expect(mover(g, codigo('12'), d)).toBe('12');
  });
  it('con códigos repetidos usa la primera aparición', () => {
    const g = geom(dep('01', 0, 0), dep('02', 100, 0), dep('02', -100, 0), dep('03', 50, 500));
    expect(mover(g, codigo('01'), 'derecha')).toBe('02');
    expect(mover(g, codigo('01'), 'izquierda')).toBe('03'); // el 02 repetido, al oeste, se ignora; sin candidatos: anterior del 01 es 03
  });
  it('si la primera aparición de un código tiene el centroide inválido, la repetida no lo reemplaza', () => {
    const g = geom(dep('01', 0, 0), { codigo: codigo('02'), centroide: [Number.NaN, 0] }, dep('02', 100, 0), dep('03', 50, 500));
    expect(ordenRecorrido(g)).toEqual(['01', '02', '03']);
    expect(mover(g, codigo('01'), 'derecha')).toBe('03'); // 02 no tiene posición, aunque la repetida sí la tenga
    expect(mover(g, codigo('02'), 'derecha')).toBe('03'); // respaldo: siguiente de 02
    expect(mover(g, codigo('02'), 'izquierda')).toBe('01'); // respaldo: anterior de 02
  });
  it('ignora los códigos inválidos como candidatos', () => {
    const g = geom(dep('01', 0, 0), dep('00', 10, 0), dep('26', 20, 0), dep('02', 500, 0));
    expect(mover(g, codigo('01'), 'derecha')).toBe('02');
  });
});

describe('mover: desde un Departamento con centroide inválido (Requisitos 4.10 y 6.2)', () => {
  it('usa directamente el respaldo circular de la dirección, sin consultar a los demás', () => {
    const g = geom(dep('05', 0, 0), dep('07', Number.NaN, 1), dep('02', 10, 10)); // orden: 02, 05, 07
    expect(mover(g, codigo('07'), 'derecha')).toBe('02'); // siguiente, con vuelta al primero
    expect(mover(g, codigo('07'), 'abajo')).toBe('02');
    expect(mover(g, codigo('07'), 'izquierda')).toBe('05'); // anterior
    expect(mover(g, codigo('07'), 'arriba')).toBe('05');
  });
  it('lo hace aunque otros Departamentos estuvieran en esa dirección', () => {
    const g = geom(dep('01', 500, 500), { codigo: codigo('02'), centroide: [Number.POSITIVE_INFINITY, 0] }, dep('03', 900, 500));
    expect(mover(g, codigo('02'), 'derecha')).toBe('03');
    expect(mover(g, codigo('02'), 'izquierda')).toBe('01');
  });
  it('con la geometría real y el centroide de Cusco dañado, desde Cusco avanza o retrocede en el orden', () => {
    const g = conCentroideInvalido('08');
    expect(mover(g, codigo('08'), 'derecha')).toBe('09');
    expect(mover(g, codigo('08'), 'abajo')).toBe('09');
    expect(mover(g, codigo('08'), 'izquierda')).toBe('07');
    expect(mover(g, codigo('08'), 'arriba')).toBe('07');
  });
  it('un Departamento dañado no es candidato espacial: los demás movimientos no cambian salvo los que llevaban a él', () => {
    const g = conCentroideInvalido('08');
    for (const c of TODOS) {
      if (c === '08') continue;
      DIRECCIONES.forEach((d) => {
        const sano = ESPERADO_REAL[c]?.[DIRECCIONES.indexOf(d)];
        const conDano = mover(g, c, d);
        if (sano === '08') expect(conDano, `${c} ${d}`).not.toBe('08');
        else expect(conDano, `${c} ${d}`).toBe(sano);
      });
    }
  });
  it('con los 25 centroides inválidos, cada dirección recorre los 25 en el orden canónico', () => {
    const g = geom(...TODOS.map((c) => ({ codigo: c, centroide: [Number.NaN, Number.NaN] as [number, number] })));
    for (const direccion of ['derecha', 'abajo'] as const) {
      let actual: CodigoDepartamento = codigo('01');
      for (let paso = 1; paso <= 25; paso++) {
        actual = mover(g, actual, direccion);
        expect(actual).toBe(TODOS[paso % 25]);
      }
    }
    for (const direccion of ['izquierda', 'arriba'] as const) {
      let actual: CodigoDepartamento = codigo('01');
      for (let paso = 1; paso <= 25; paso++) {
        actual = mover(g, actual, direccion);
        expect(actual).toBe(TODOS[(25 - paso) % 25]);
      }
    }
  });
});

describe('mover: coordenadas extremas (normalización por potencias de dos)', () => {
  const MAX = Number.MAX_VALUE;
  const U = Number.MIN_VALUE; // 2^-1074, la unidad de los números subnormales
  /** El siguiente double por encima de MAX_VALUE/2 (es 2^1023): su resta con -MAX_VALUE/2 vale 2^1024 − 2^970 y desborda. */
  const JUSTO_SOBRE_LIMITE = MAX / 2 + potenciaDeDos(970);
  /** 2^k calculada solo con multiplicaciones exactas por 2 o 0.5 (válida para -1022 <= k <= 1023). */
  function potenciaDeDos(k: number): number {
    let valor = 1;
    for (let i = 0; i < Math.abs(k); i++) valor = k > 0 ? valor * 2 : valor * 0.5;
    return valor;
  }
  type PuntoAxial = readonly [codigo: string, axial: number, lateral: number];
  /** Posición con la coordenada `axial` en el sentido de la dirección y el desvío `lateral`. */
  function enDireccion(direccion: DireccionMapa, axial: number, lateral: number): [number, number] {
    switch (direccion) {
      case 'derecha':
        return [axial, lateral];
      case 'izquierda':
        return [-axial, lateral];
      case 'abajo':
        return [lateral, axial];
      case 'arriba':
        return [lateral, -axial];
    }
  }
  /** Comprueba, en las cuatro direcciones y con el orden de entrada normal e invertido, el destino desde el Departamento 01. */
  function desdeElPrimero(puntos: readonly PuntoAxial[], esperado: string): void {
    for (const direccion of DIRECCIONES) {
      const lista = puntos.map(([c, axial, lateral]) => {
        const [x, y] = enDireccion(direccion, axial, lateral);
        return dep(c, x, y);
      });
      expect(mover(geom(...lista), codigo('01'), direccion), direccion).toBe(esperado);
      expect(mover(geom(...[...lista].reverse()), codigo('01'), direccion), `${direccion}, entrada invertida`).toBe(esperado);
    }
  }
  const CASOS: readonly (readonly [string, readonly PuntoAxial[], string])[] = [
    ['1e300: gana el más cercano aunque tenga el código mayor', [['01', 0, 0], ['02', 2e300, 0], ['03', 1e300, 0]], '03'],
    ['1e300: el desvío lateral pesa 4 veces', [['01', 0, 0], ['02', 0.6e300, 0.6e300], ['03', 1e300, 0]], '03'],
    ['1e300: gana el alineado aunque tenga el código menor', [['01', 0, 0], ['02', 1e300, 0], ['03', 0.6e300, 0.6e300]], '02'],
    ['±1e300: origen en el lado opuesto', [['01', -1e300, 0], ['02', 1e300, 0], ['03', 0, 0]], '03'],
    ['Number.MAX_VALUE: el desvío entre extremos desborda la resta', [['01', -MAX, 0], ['02', MAX, 0], ['03', 0, 0]], '03'],
    ['Number.MAX_VALUE: un solo candidato', [['01', 0, 0], ['02', MAX, 0]], '02'],
    ['Number.MAX_VALUE: un candidato en sentido contrario no cuenta', [['01', 0, 0], ['02', -MAX, 0], ['03', MAX, 0]], '03'],
    ['Number.MAX_VALUE: desvío lateral gigante frente a un axial grande', [['01', 0, 0], ['02', 1, MAX], ['03', MAX / 2, 0]], '03'],
    ['Number.MAX_VALUE: desvío lateral gigante negativo', [['01', 0, 0], ['02', 1, -MAX], ['03', MAX / 2, 0]], '03'],
    ['empate con 1e300: gana el primero según el orden', [['01', 0, 0], ['02', 1e300, 1e299], ['03', 1e300, -1e299]], '02'],
    ['empate con Number.MAX_VALUE: gana el primero según el orden', [['01', 0, 0], ['02', MAX, MAX / 4], ['03', MAX, -MAX / 4]], '02'],
    ['empate con Number.MAX_VALUE y desvíos del tamaño del axial', [['01', 0, 0], ['02', MAX, MAX], ['03', MAX, -MAX]], '02'],
    ['sin empate con 1e300: gana el de menor desvío (código menor)', [['01', 0, 0], ['02', 1e300, 1e299], ['03', 1e300, 1.1e299]], '02'],
    ['sin empate con 1e300: gana el de menor desvío (código mayor)', [['01', 0, 0], ['02', 1e300, 1.1e299], ['03', 1e300, 1e299]], '03'],
    ['1e-200: gana el más cercano', [['01', 0, 0], ['02', 3e-200, 0], ['03', 2e-200, 0]], '03'],
    ['1e-200: el desvío lateral pesa 4 veces', [['01', 0, 0], ['02', 1e-200, 1e-200], ['03', 1.5e-200, 0]], '03'],
    ['1e-200 con el origen desplazado', [['01', 1e-200, 1e-200], ['02', 4e-200, 1e-200], ['03', 3e-200, 1e-200]], '03'],
    ['subnormales: gana el más cercano', [['01', 0, 0], ['02', 1e-323, 0], ['03', 5e-324, 0]], '03'],
    ['subnormales: el desvío lateral pesa 4 veces', [['01', 0, 0], ['02', 5e-324, 5e-324], ['03', 5e-324, 0]], '03'],
    ['subnormales: empate exacto, gana el primero', [['01', 0, 0], ['02', 5e-324, 0], ['03', 5e-324, 0]], '02'],
    ['un subnormal frente a un valor normal', [['01', 0, 0], ['02', 1, 0], ['03', 5e-324, 0]], '03'],
    ['escalas mezcladas: 1e300, 2e-300 y 1e-300', [['01', 0, 0], ['02', 1e300, 0], ['03', 2e-300, 0], ['04', 1e-300, 0]], '04'],
    // Regresiones de la revisión numérica: antes, un delta desbordado activaba las mitades en todo el cálculo y los subnormales
    // impares (múltiplos impares de Number.MIN_VALUE) perdían un bit.
    [
      'contraejemplo 1: un candidato con el desvío lateral desbordado no hace perder los candidatos subnormales',
      [['01', 4 * U, -1e300], ['02', 5 * U, MAX], ['03', 5 * U, 0]],
      '03',
    ],
    [
      'contraejemplo 2: una entrada que no es candidata con el desvío desbordado no cambia el orden de los subnormales',
      [['01', 4 * U, -1e300], ['02', 9 * U, -1e300], ['03', 7 * U, -1e300], ['04', 0, MAX]],
      '03',
    ],
    ['un ordinario con m menor que MAX/3 gana a un enorme de código menor', [['01', -MAX / 2, 0], ['02', 0.6 * MAX, 0], ['03', -MAX / 4, 0]], '03'],
    [
      'todos los candidatos con el desvío desbordado: gana el de menor coste',
      [['01', 0, -MAX], ['02', 1, MAX], ['03', 1, 0.9 * MAX]],
      '03',
    ],
    [
      'un ordinario enorme (m mayor que MAX/3) frente a un enorme con el desvío desbordado más barato (código mayor)',
      [['01', -MAX / 2, 0], ['02', MAX / 2, MAX], ['03', 0.6 * MAX, 0]],
      '03',
    ],
    [
      'un ordinario enorme (m mayor que MAX/3) frente a un enorme con el desvío desbordado más barato (código menor)',
      [['01', -MAX / 2, 0], ['02', 0.6 * MAX, 0], ['03', MAX / 2, MAX]],
      '02',
    ],
    [
      'un ordinario con m = MAX/2 (mayor que MAX/3) cuesta 1.25·MAX² y pierde frente a un enorme que cuesta 1.21·MAX²',
      [['01', -MAX / 2, 0], ['02', 0.6 * MAX, 0], ['03', 0, MAX / 2]],
      '02',
    ],
    [
      'umbral: un desbordado justo sobre el límite (≈1.0·MAX²) gana a un ordinario con axial y lateral de 0.47·MAX (≈1.10·MAX²)',
      [['01', -MAX / 2, 0], ['02', -0.03 * MAX, 0.47 * MAX], ['03', JUSTO_SOBRE_LIMITE, 0]],
      '03',
    ],
    [
      'un ordinario enorme más barato que un enorme con el desvío desbordado',
      [['01', -MAX / 2, 0], ['02', 0.6 * MAX, 0], ['03', 0.4 * MAX, 0]],
      '03',
    ],
  ];
  it.each(CASOS)('%s', (_etiqueta, puntos, esperado) => {
    desdeElPrimero(puntos, esperado);
  });
  it('sin candidatos a Number.MAX_VALUE usa el respaldo circular', () => {
    const lista = (direccion: DireccionMapa) =>
      geom(...([['01', MAX, 0], ['02', -MAX, 0], ['03', 0, 0]] as const).map(([c, axial, lateral]) => dep(c, ...enDireccion(direccion, axial, lateral))));
    expect(mover(lista('derecha'), codigo('01'), 'derecha')).toBe('02');
    expect(mover(lista('abajo'), codigo('01'), 'abajo')).toBe('02');
    expect(mover(lista('izquierda'), codigo('01'), 'izquierda')).toBe('03');
    expect(mover(lista('arriba'), codigo('01'), 'arriba')).toBe('03');
  });

  // Modelo independiente con aritmética exacta (BigInt): cada número se convierte a un entero igual a valor × 2^1074.
  function enteroExacto(valor: number): bigint {
    const bits = new BigUint64Array(new Float64Array([valor]).buffer)[0] ?? 0n;
    const exponente = Number((bits >> 52n) & 0x7ffn);
    const fraccion = bits & 0xfffffffffffffn;
    const mantisa = exponente === 0 ? fraccion : fraccion | (1n << 52n);
    const magnitud = mantisa << BigInt(exponente === 0 ? 0 : exponente - 1);
    return bits >> 63n === 1n ? -magnitud : magnitud;
  }
  /** Coste exacto `axial² + 4 × lateral²` (multiplicado por 2^2148) de cada candidato estricto en la dirección dada. */
  function costesExactos(puntos: readonly { codigo: string; x: number; y: number }[], origen: number, direccion: DireccionMapa): Map<string, bigint> {
    const horizontal = direccion === 'derecha' || direccion === 'izquierda';
    const avanza = direccion === 'derecha' || direccion === 'abajo';
    const base = puntos[origen];
    if (base === undefined) throw new Error('origen inexistente');
    const costes = new Map<string, bigint>();
    for (const [indice, punto] of puntos.entries()) {
      if (indice === origen) continue;
      const dx = enteroExacto(punto.x) - enteroExacto(base.x);
      const dy = enteroExacto(punto.y) - enteroExacto(base.y);
      const axial = (avanza ? 1n : -1n) * (horizontal ? dx : dy);
      const lateral = horizontal ? dy : dx;
      if (axial > 0n) costes.set(punto.codigo, axial * axial + 4n * lateral * lateral);
    }
    return costes;
  }
  it('elige un candidato de coste mínimo según un modelo exacto (BigInt) en 150 geometrías deterministas de escalas muy distintas', () => {
    // Cota del error del criterio en dobles: cada desvío se redondea (error relativo <= 2^-53) y el coste añade tres redondeos
    // (dos productos y una suma). El coste calculado queda dentro de (1 ± 2^-53)^4, unos 4.4e-16. Por tanto, dos candidatos cuyos
    // costes exactos difieren más de 2^-50 en proporción se ordenan igual que en aritmética exacta. Se exige 2^-49, que da un
    // margen de 2. Con Infinity o 0 por desbordamiento o subdesbordamiento la diferencia sería enorme. La cota rige también en
    // los niveles con coordenadas enormes (la escala MAX_VALUE de la lista), porque la normalización y las mitades son exactas.
    const BITS_TOLERANCIA = 49n;
    const escalas = [1e-320, 1e-200, 1e-100, 1e-3, 1, 1e3, 1e100, 1e200, 1e300, MAX / 4, MAX / 2, MAX];
    let estado = 12_345;
    const azar = (): number => {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return estado / 4_294_967_296;
    };
    for (let geometria = 0; geometria < 150; geometria++) {
      const mezclada = geometria % 3 === 0;
      const escalaFija = escalas[geometria % escalas.length] ?? 1;
      const puntos = TODOS.slice(0, 8).map((c) => ({
        codigo: c as string,
        x: (azar() * 2 - 1) * (mezclada ? (escalas[Math.floor(azar() * escalas.length)] ?? 1) : escalaFija),
        y: (azar() * 2 - 1) * (mezclada ? (escalas[Math.floor(azar() * escalas.length)] ?? 1) : escalaFija),
      }));
      const g = geom(...puntos.map((p) => dep(p.codigo, p.x, p.y)));
      for (const [indice, origen] of puntos.entries()) {
        for (const direccion of DIRECCIONES) {
          const etiqueta = `geometría ${geometria}, ${origen.codigo} ${direccion}`;
          const destino = mover(g, codigo(origen.codigo), direccion);
          const costes = costesExactos(puntos, indice, direccion);
          if (costes.size === 0) {
            const avanza = direccion === 'derecha' || direccion === 'abajo';
            expect(destino, etiqueta).toBe(puntos[(indice + (avanza ? 1 : puntos.length - 1)) % puntos.length]?.codigo);
            continue;
          }
          const elegido = costes.get(destino);
          expect(elegido, `${etiqueta}: el destino debe ser un candidato`).toBeDefined();
          const minimo = [...costes.values()].reduce((a, b) => (b < a ? b : a));
          expect((((elegido ?? 0n) - minimo) << BITS_TOLERANCIA) <= minimo, `${etiqueta}: coste del elegido frente al mínimo exacto`).toBe(true);
        }
      }
    }
  });

  it('casi empates: gana el candidato exacto más barato cuando su ventaja supera el error de redondeo', () => {
    // Dos candidatos con el mismo axial S: el alineado cuesta S² y el otro S²·(1 + 2^(2-2k)), con desvío lateral S·2^-k.
    // El más barato tiene el código mayor. Las ventajas 2^-20, 2^-30, 2^-40 y 2^-44 superan con holgura 2^-49.
    for (const escala of [potenciaDeDos(-900), 1e-300, 1, 3, 1e150, 1e300, potenciaDeDos(900)]) {
      for (const k of [11, 16, 21, 23]) {
        desdeElPrimero([['01', 0, 0], ['02', escala, escala * potenciaDeDos(-k)], ['03', escala, 0]], '03');
      }
    }
  });
  it('casi empates exactos (S potencia de dos): hasta una ventaja de 2^-52 el coste calculado distingue el par y gana el más barato', () => {
    // Con S potencia de dos todo el cálculo es exacto: S², 4·(S·2^-k)² = S²·2^(2-2k) y la suma S²·(1 + 2^(2-2k)), que cabe en
    // 53 bits mientras 2-2k >= -52. Las ventajas de k = 24, 25, 26 y 27 son 2^-46, 2^-48, 2^-50 y 2^-52. El más barato tiene el
    // código mayor, así que si el criterio las tratara como empate ganaría el otro.
    for (const escala of [potenciaDeDos(-900), potenciaDeDos(-300), 1, potenciaDeDos(300), potenciaDeDos(900)]) {
      for (const k of [24, 25, 26, 27]) {
        desdeElPrimero([['01', 0, 0], ['02', escala, escala * potenciaDeDos(-k)], ['03', escala, 0]], '03');
      }
    }
  });
  it('límite documentado: con una ventaja menor que 2^-53 los costes calculados empatan y gana el primero según el orden', () => {
    // Desde k = 28 la ventaja 2^(2-2k) es 2^-54 o menos: el sumando es menor que la mitad del último bit y S²·(1 + 2^(2-2k)) se
    // redondea a S². El criterio en dobles no distingue ese par, así que decide el orden. El límite exacto queda entre k = 27
    // (2^-52, distinguible) y k = 28 (2^-54, empate).
    for (const escala of [potenciaDeDos(-900), potenciaDeDos(-300), 1, potenciaDeDos(300), potenciaDeDos(900)]) {
      for (const k of [28, 29, 30, 31]) {
        desdeElPrimero([['01', 0, 0], ['02', escala, escala * potenciaDeDos(-k)], ['03', escala, 0]], '02');
      }
    }
  });
  it('umbral: el caso del desbordado justo sobre el límite cumple sus premisas', () => {
    // El desvío axial del desbordado desborda en dobles, los del ordinario no, y los costes exactos son ≈1.0·MAX² y ≈1.10·MAX².
    expect(JUSTO_SOBRE_LIMITE).toBe(potenciaDeDos(1023));
    expect(Number.isFinite(JUSTO_SOBRE_LIMITE - -MAX / 2)).toBe(false);
    expect(Number.isFinite(-0.03 * MAX - -MAX / 2)).toBe(true);
    expect(-0.03 * MAX - -MAX / 2).toBeGreaterThan(MAX / 3);
    const puntos = [
      { codigo: '01', x: -MAX / 2, y: 0 },
      { codigo: '02', x: -0.03 * MAX, y: 0.47 * MAX },
      { codigo: '03', x: JUSTO_SOBRE_LIMITE, y: 0 },
    ];
    const costes = costesExactos(puntos, 0, 'derecha');
    const maxCuadrado = enteroExacto(MAX) ** 2n;
    const razon = (coste: bigint | undefined): number => Number(((coste ?? 0n) * 10_000n) / maxCuadrado) / 10_000;
    expect(razon(costes.get('03'))).toBeCloseTo(1.0, 3);
    expect(razon(costes.get('02'))).toBeCloseTo(1.1045, 3);
  });
  it('umbral: un desbordado justo sobre el límite (≈1.0·MAX²) gana a un ordinario con axial y lateral de 0.45·MAX (≈1.0125·MAX²)', () => {
    // Cierra el hueco entre MAX/3 y 0.47·MAX. El umbral más alto que sigue siendo correcto es MAX/√5 ≈ 0.4472·MAX. Un umbral de
    // 0.4545·MAX descartaría aquí al desbordado, que es más barato, y devolvería el ordinario.
    const puntos = [
      { codigo: '01', x: -MAX / 2, y: 0 },
      { codigo: '02', x: -0.05 * MAX, y: 0.45 * MAX },
      { codigo: '03', x: JUSTO_SOBRE_LIMITE, y: 0 },
    ];
    // Premisas: el desvío axial del desbordado desborda; los del ordinario son finitos, mayores que MAX/3 y menores que 0.4545·MAX.
    expect(Number.isFinite(JUSTO_SOBRE_LIMITE - -MAX / 2)).toBe(false);
    const axialOrdinario = -0.05 * MAX - -MAX / 2;
    expect(axialOrdinario).toBeGreaterThan(MAX / 3);
    expect(axialOrdinario).toBeLessThan(0.4545 * MAX);
    expect(0.45 * MAX).toBeGreaterThan(MAX / 3);
    expect(0.45 * MAX).toBeLessThan(0.4545 * MAX);
    const costes = costesExactos(puntos, 0, 'derecha');
    const maxCuadrado = enteroExacto(MAX) ** 2n;
    const razon = (coste: bigint | undefined): number => Number(((coste ?? 0n) * 10_000n) / maxCuadrado) / 10_000;
    expect(razon(costes.get('03'))).toBeCloseTo(1.0, 3);
    expect(razon(costes.get('02'))).toBeCloseTo(1.0125, 3);
    expect(razon(costes.get('03'))).toBeLessThan(razon(costes.get('02')));
    // Resultado: gana el desbordado en las cuatro direcciones y con la entrada invertida.
    desdeElPrimero(
      puntos.map((p) => [p.codigo, p.x, p.y] as const),
      '03',
    );
  });

  it('el peso del desvío lateral es exactamente 4: (5, 0) y (3, 2) cuestan lo mismo (25 = 9 + 4·4) y los casi empates se resuelven bien', () => {
    for (const escala of [potenciaDeDos(-900), 1, potenciaDeDos(900)]) {
      const s = (valor: number): number => valor * escala;
      // Empate exacto: gana el primero según el orden, sea el alineado o el desviado.
      desdeElPrimero([['01', 0, 0], ['02', s(3), s(2)], ['03', s(5), 0]], '02');
      desdeElPrimero([['01', 0, 0], ['02', s(5), 0], ['03', s(3), s(2)]], '02');
      // El desviado cuesta algo más (ventaja de unos 1.16e-12 en proporción): gana el alineado aunque tenga el código mayor.
      desdeElPrimero([['01', 0, 0], ['02', s(3), s(2 * (1 + potenciaDeDos(-40)))], ['03', s(5), 0]], '03');
      // El desviado cuesta algo menos: gana aunque tenga el código mayor.
      desdeElPrimero([['01', 0, 0], ['02', s(5), 0], ['03', s(3), s(2 * (1 - potenciaDeDos(-40)))]], '03');
    }
  });

  /** Generador congruencial lineal con semilla fija, para no depender de `Math.random`. */
  function generadorLineal(semilla: number): () => number {
    let estado = semilla;
    return () => {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return estado / 4_294_967_296;
    };
  }

  it('invariancia: multiplicar toda la geometría por 2^k no cambia ningún destino', () => {
    // Multiplicar por una potencia de dos es exacto, y el coste escala por 2^(2k). El criterio con rango de exponentes ilimitado
    // da entonces el mismo destino, incluidos los empates. Las coordenadas base están entre 0.5 y 1 en módulo (con ±1, ±(1-2^-53)
    // y 0) para que los productos sean normales y las restas exactas. Con k = 1023 hay desvíos desbordados.
    const azar = generadorLineal(777);
    const casiUno = 1 - potenciaDeDos(-53);
    const coordenada = (): number => {
      const r = azar();
      const signo = azar() < 0.5 ? 1 : -1;
      if (r < 0.12) return signo;
      if (r < 0.24) return signo * casiUno;
      if (r < 0.3) return 0;
      return signo * (0.5 + azar() * 0.5);
    };
    const bases: { codigo: string; x: number; y: number }[][] = [];
    for (let i = 0; i < 60; i++) bases.push(TODOS.slice(0, 8).map((c) => ({ codigo: c as string, x: coordenada(), y: coordenada() })));
    // Una base con empates exactos entre candidatos.
    bases.push([
      { codigo: '01', x: 0, y: 0 },
      { codigo: '02', x: 0.5, y: 0.25 },
      { codigo: '03', x: 0.5, y: -0.25 },
      { codigo: '04', x: -0.5, y: 0.25 },
      { codigo: '05', x: -0.5, y: -0.25 },
      { codigo: '06', x: 0.25, y: 0.5 },
      { codigo: '07', x: -0.25, y: 0.5 },
    ]);
    // Una base con el par de extremos que desborda la resta al multiplicar por 2^1023.
    bases.push([
      { codigo: '01', x: -1, y: 0.5 },
      { codigo: '02', x: casiUno, y: 0.5 },
      { codigo: '03', x: 0.75, y: -1 },
      { codigo: '04', x: -0.5, y: casiUno },
    ]);
    const exponentes = [-1020, -1000, -600, -64, -1, 1, 64, 600, 1000, 1023];
    for (const [numero, base] of bases.entries()) {
      const g0 = geom(...base.map((p) => dep(p.codigo, p.x, p.y)));
      for (const k of exponentes) {
        const factor = potenciaDeDos(k);
        const gk = geom(...base.map((p) => dep(p.codigo, p.x * factor, p.y * factor)));
        for (const origen of base) {
          for (const direccion of DIRECCIONES) {
            expect(mover(gk, codigo(origen.codigo), direccion), `base ${numero}, k ${k}, ${origen.codigo} ${direccion}`).toBe(
              mover(g0, codigo(origen.codigo), direccion),
            );
          }
        }
      }
    }
  });

  /** Fórmula ingenua en dobles, sin normalización: válida solo cuando no hay desbordamiento ni subdesbordamiento. */
  function destinoIngenuo(puntos: readonly { codigo: string; x: number; y: number }[], origen: number, direccion: DireccionMapa): string {
    const horizontal = direccion === 'derecha' || direccion === 'izquierda';
    const avanza = direccion === 'derecha' || direccion === 'abajo';
    const base = puntos[origen];
    if (base === undefined) throw new Error('origen inexistente');
    let mejor: string | undefined;
    let mejorCoste = 0;
    for (const [indice, punto] of puntos.entries()) {
      if (indice === origen) continue;
      const dx = punto.x - base.x;
      const dy = punto.y - base.y;
      const axial = (avanza ? 1 : -1) * (horizontal ? dx : dy);
      const lateral = horizontal ? dy : dx;
      if (!(axial > 0)) continue;
      const coste = axial * axial + 4 * lateral * lateral;
      if (mejor === undefined || coste < mejorCoste) {
        mejor = punto.codigo;
        mejorCoste = coste;
      }
    }
    return mejor ?? puntos[(origen + (avanza ? 1 : puntos.length - 1)) % puntos.length]?.codigo ?? base.codigo;
  }
  it('en escalas seguras (1e-100 a 1e100) coincide exactamente con la fórmula ingenua, incluidos los empates', () => {
    const azar = generadorLineal(2024);
    const escalas = [1e-100, 1e-30, 1, 1e30, 1e100];
    let consultas = 0;
    for (let numero = 0; numero < 200; numero++) {
      const escala = escalas[numero % escalas.length] ?? 1;
      // La mitad de las geometrías usa coordenadas de una retícula de 7 valores, que produce muchos empates exactos.
      const reticula = numero % 2 === 0;
      const valor = (): number => (reticula ? (Math.floor(azar() * 7) - 3) * escala : (azar() * 2 - 1) * escala);
      const puntos = TODOS.slice(0, 8).map((c) => ({ codigo: c as string, x: valor(), y: valor() }));
      const g = geom(...puntos.map((p) => dep(p.codigo, p.x, p.y)));
      for (const [indice, origen] of puntos.entries()) {
        for (const direccion of DIRECCIONES) {
          expect(mover(g, codigo(origen.codigo), direccion), `geometría ${numero}, ${origen.codigo} ${direccion}`).toBe(
            destinoIngenuo(puntos, indice, direccion),
          );
          consultas++;
        }
      }
    }
    expect(consultas).toBe(200 * 8 * 4);
  });
});

describe('mover: regresión con la geometría real (los 100 movimientos)', () => {
  it('cada Departamento y dirección llevan al destino calculado antes de añadir la normalización', () => {
    for (const c of TODOS) {
      DIRECCIONES.forEach((d) => {
        expect(mover(real, c, d), `${c} ${d}`).toBe(ESPERADO_REAL[c]?.[DIRECCIONES.indexOf(d)]);
      });
    }
  });
  it('la tabla cubre los 25 Departamentos con destinos válidos', () => {
    expect(Object.keys(ESPERADO_REAL).sort()).toEqual([...CODIGOS_DEPARTAMENTO]);
    for (const fila of Object.values(ESPERADO_REAL)) {
      expect(fila).toHaveLength(4);
      for (const destino of fila) expect(TODOS).toContain(destino);
    }
  });
});

describe('Sin mutaciones y sin efectos', () => {
  it('no modifica la geometría ni el resultado de ordenRecorrido entre llamadas', () => {
    const g = congelar(JSON.parse(JSON.stringify(real)) as Geometria);
    const antes = JSON.stringify(g);
    expect(() => {
      ordenRecorrido(g);
      for (const c of TODOS) for (const d of DIRECCIONES) mover(g, c, d);
    }).not.toThrow();
    expect(JSON.stringify(g)).toBe(antes);
  });
  it('las llamadas repetidas dan el mismo resultado', () => {
    for (const c of TODOS) {
      for (const d of DIRECCIONES) expect(mover(real, c, d)).toBe(mover(real, c, d));
    }
    expect(ordenRecorrido(real)).toEqual(ordenRecorrido(real));
  });
  it('la geometría mínima y la completa dan el mismo resultado', () => {
    const minima = geom(...real.departamentos.map((d) => ({ codigo: d.codigo, centroide: d.centroide })));
    for (const c of TODOS) {
      for (const d of DIRECCIONES) expect(mover(minima, c, d)).toBe(mover(real, c, d));
    }
  });
  describe('pureza del módulo', () => {
    const fuente = readFileSync(new URL('./mapNav.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s\/\/.*$/gm, '');
    it('no usa DOM, red, almacenamiento, reloj, temporizadores ni azar', () => {
      for (const prohibido of [
        'window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'Date',
        'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Math.random', 'addEventListener', 'KeyboardEvent',
        'console',
      ]) {
        expect(fuente, prohibido).not.toContain(prohibido);
      }
    });
    it('solo importa de @teletexto/modelo', () => {
      const importaciones = [...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      expect(importaciones).toEqual(['@teletexto/modelo']);
    });
  });
});
