import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  anillosDeRutaRelativa,
  areaDoble,
  centroideDecimas,
  motivoInvalido,
  redondearAnillo,
  rutaRelativa,
  type AnilloDecimas,
} from './anillos.ts';
import { aDecimas, crearProyector, textoDecimas } from './proyeccion.ts';
import type { ProyeccionEquirrectangular } from './parametros.ts';
import { rectangulo } from './datos-prueba.ts';

const identidad = (p: readonly [number, number]): [number, number] => [p[0], p[1]];
/** Cuadrado de lado `l` (en décimas) con la esquina en (x, y), sin punto de cierre. */
const cuadrado = (x: number, y: number, l: number): AnilloDecimas => [[x, y], [x + l, y], [x + l, y + l], [x, y + l]];

describe('Redondeo a un decimal', () => {
  it.each([
    [1.04, 10],
    [1.05, 11],
    [1.06, 11],
    [12.34, 123],
    [0, 0],
    [-0.04, 0],
    [-0.06, -1],
    [100, 1000],
  ])('aDecimas(%d) = %d (décimas)', (valor, esperado) => {
    expect(aDecimas(valor)).toBe(esperado);
  });

  it('nunca devuelve -0', () => {
    expect(Object.is(aDecimas(-0.01), 0)).toBe(true);
    expect(Object.is(aDecimas(-0), 0)).toBe(true);
  });

  it('escribe las coordenadas con el mínimo de caracteres y con a lo sumo un decimal', () => {
    expect(textoDecimas(123)).toBe('12.3');
    expect(textoDecimas(120)).toBe('12');
    expect(textoDecimas(5)).toBe('0.5');
    expect(textoDecimas(0)).toBe('0');
    expect(textoDecimas(-15)).toBe('-1.5');
    for (const n of [-1234, -1, 0, 1, 9, 10, 11, 999, 123456]) {
      expect((textoDecimas(n).split('.')[1] ?? '').length).toBeLessThanOrEqual(1);
      expect(Number(textoDecimas(n)) * 10).toBeCloseTo(n, 9);
    }
  });
});

describe('Proyección equirrectangular', () => {
  const base: ProyeccionEquirrectangular = {
    tipo: 'equirrectangular',
    paraleloEstandarGrados: 0,
    unidadesPorGrado: 100,
    longitudOrigenGrados: -80,
    latitudOrigenGrados: 0,
  };

  it('el origen se proyecta en (0, 0)', () => {
    expect(crearProyector(base)([-80, 0])).toEqual([0, 0]);
  });

  it('la longitud crece hacia la derecha y la latitud hacia arriba: y crece hacia el sur', () => {
    const p = crearProyector(base);
    expect(p([-79, 0])).toEqual([100, 0]);
    expect(p([-80, -2])).toEqual([0, 200]);
    expect(p([-80, 3])[1]).toBe(-300);
  });

  it('el paralelo estándar reduce la escala horizontal con cos(paralelo) y no toca la vertical', () => {
    const p = crearProyector({ ...base, paraleloEstandarGrados: 60 });
    const [x, y] = p([-79, -1]);
    expect(x).toBeCloseTo(50, 9); // cos(60°) = 0.5
    expect(y).toBeCloseTo(100, 9);
  });

  it('es simétrica con el signo del paralelo', () => {
    const a = crearProyector({ ...base, paraleloEstandarGrados: -9 })([-75, -5]);
    const b = crearProyector({ ...base, paraleloEstandarGrados: 9 })([-75, -5]);
    expect(a).toEqual(b);
  });
});

describe('Anillos proyectados', () => {
  it('redondea a décimas, quita el punto de cierre y quita los vértices que quedan repetidos', () => {
    // Con la proyección identidad, 1 unidad = 10 décimas. (0.04, 0.04) redondea a (0, 0) y repite al primer vértice.
    const anillo = redondearAnillo([[0, 0], [0.04, 0.04], [1, 0], [1, 1], [0, 1], [0, 0]], identidad);
    expect(anillo).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('un vértice que se aleja lo bastante para redondear a otra décima se conserva', () => {
    const anillo = redondearAnillo([[0, 0], [0.06, 0.06], [1, 0], [1, 1], [0, 1], [0, 0]], identidad);
    expect(anillo).toEqual([[0, 0], [1, 1], [10, 0], [10, 10], [0, 10]]);
  });

  it('calcula el área doble con signo, exacta y con enteros', () => {
    expect(areaDoble(cuadrado(0, 0, 10))).toBe(200);
    expect(areaDoble([...cuadrado(0, 0, 10)].reverse())).toBe(-200);
  });

  it('un anillo válido no tiene motivo de rechazo', () => {
    expect(motivoInvalido(cuadrado(0, 0, 10))).toBeUndefined();
  });

  it('rechaza un anillo con menos de 3 puntos distintos al redondear', () => {
    expect(motivoInvalido([[5, 5], [5, 5], [5, 5]])).toMatch(/1 punto\(s\) distinto\(s\)/);
    expect(motivoInvalido([[0, 0], [1, 1]])).toMatch(/2 punto\(s\) distinto\(s\)/);
    expect(motivoInvalido([])).toMatch(/0 punto\(s\) distinto\(s\)/);
  });

  it('rechaza un anillo de área cero (puntos alineados)', () => {
    expect(motivoInvalido([[0, 0], [5, 5], [10, 10]])).toMatch(/área es cero/);
  });

  it('escribe la ruta relativa compacta: m dx dy dx dy ... z, con el primer par absoluto', () => {
    // Décimas: (0,0) (125,0) (125,105) (0,105)  ->  0 0, +12.5 0, 0 +10.5, -12.5 0
    expect(rutaRelativa([[[0, 0], [125, 0], [125, 105], [0, 105]]])).toBe('m0 0 12.5 0 0 10.5-12.5 0z');
  });

  it('quita el cero inicial de los decimales y no pone espacio antes de un número negativo', () => {
    expect(rutaRelativa([[[5, -3], [8, -3], [8, -13]]])).toBe('m.5-.3 .3 0 0-1z');
  });

  it('cada subruta nueva es relativa al INICIO de la anterior, porque z devuelve el punto actual a ese inicio', () => {
    const a: AnilloDecimas = [[100, 200], [150, 200], [150, 260]];
    const b: AnilloDecimas = [[400, 500], [420, 500], [420, 530]];
    expect(rutaRelativa([a, b])).toBe('m10 20 5 0 0 6zm30 30 2 0 0 3z');
    expect(anillosDeRutaRelativa(rutaRelativa([a, b]))).toEqual([a, b]);
  });

  it('un Departamento sin partes dibujables da una ruta vacía, que se relee como vacía', () => {
    expect(rutaRelativa([])).toBe('');
    expect(anillosDeRutaRelativa('')).toEqual([]);
  });

  it('solo escribe números con a lo sumo un decimal, sin ceros iniciales ni notación científica', () => {
    const ruta = rutaRelativa([[[1, 2], [3, 4], [5, 6], [-1234567, 7], [0, 0]]]);
    for (const numero of ruta.match(/-?\d*\.?\d+/g) ?? []) {
      expect((numero.split('.')[1] ?? '').length).toBeLessThanOrEqual(1);
      expect(numero).not.toMatch(/^-?0\d/);
      expect(numero).not.toMatch(/e/i);
    }
    expect(ruta).toMatch(/^(?:m[-\d. ]+z)+$/);
  });

  it('rechaza lo que no es una ruta relativa escrita por rutaRelativa', () => {
    for (const texto of ['M0 0 10 0 10 10Z', 'm0 0 10z', 'm0 0 1 2 3z', 'm1 2', 'z', 'm0 0 ab z', 'l1 2z']) {
      expect(anillosDeRutaRelativa(texto), texto).toBeUndefined();
    }
  });

  it('Propiedad: leer una ruta escrita devuelve exactamente los anillos de entrada (coordenadas enteras en décimas)', () => {
    const punto = fc.tuple(fc.integer({ min: -70_000, max: 70_000 }), fc.integer({ min: -100_000, max: 100_000 }));
    const anillo = fc.array(punto, { minLength: 3, maxLength: 40 });
    fc.assert(
      fc.property(fc.array(anillo, { minLength: 1, maxLength: 5 }), (anillos) => {
        const ruta = rutaRelativa(anillos);
        expect(anillosDeRutaRelativa(ruta)).toEqual(anillos);
        for (const numero of ruta.match(/-?\d*\.?\d+/g) ?? []) expect((numero.split('.')[1] ?? '').length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('un anillo ya reducido a décimas se vuelve a dibujar sin pérdida: la ruta se puede releer', () => {
    const anillo = redondearAnillo(rectangulo(0.123, 0.456, 1.789, 1.321), (p) => [p[0] * 10, p[1] * 10]);
    expect(anillosDeRutaRelativa(rutaRelativa([anillo]))).toEqual([anillo]);
  });
});
describe('Centroides', () => {
  it('el centroide de un cuadrado es su centro', () => {
    expect(centroideDecimas([[cuadrado(0, 0, 100)]])).toEqual([50, 50]);
  });

  it('no depende de la orientación del anillo exterior', () => {
    const normal = centroideDecimas([[cuadrado(20, 40, 100)]]);
    const invertido = centroideDecimas([[[...cuadrado(20, 40, 100)].reverse()]]);
    expect(normal).toEqual([70, 90]);
    expect(invertido).toEqual(normal);
  });

  it('pondera por área: con dos partes, el centroide se acerca a la mayor', () => {
    // Cuadrado de lado 100 (área 10000) en el origen y cuadrado de lado 10 (área 100) en x = 300.
    const c = centroideDecimas([[cuadrado(0, 0, 100)], [cuadrado(300, 0, 10)]]);
    // x = (50 * 10000 + 305 * 100) / (10000 + 100) = 530500 / 10100 = 52.97..., que redondea a 53.
    expect(c).toEqual([53, 50]);
    expect((c as readonly [number, number])[0]).toBeGreaterThan(50);
    expect((c as readonly [number, number])[0]).toBeLessThan(305);
  });

  it('un hueco desplaza el centroide: se resta su área', () => {
    // Cuadrado de lado 100 con un hueco de lado 40 en la esquina (0,0)-(40,40): el centroide se desplaza hacia (100,100).
    const sinHueco = centroideDecimas([[cuadrado(0, 0, 100)]]) as readonly [number, number];
    const conHueco = centroideDecimas([[cuadrado(0, 0, 100), cuadrado(0, 0, 40)]]) as readonly [number, number];
    expect(sinHueco).toEqual([50, 50]);
    expect(conHueco[0]).toBeGreaterThan(50);
    expect(conHueco[1]).toBeGreaterThan(50);
    // (50 * 10000 - 20 * 1600) / (10000 - 1600) = 468000 / 8400 = 55.71..., que redondea a 56.
    expect(conHueco).toEqual([56, 56]);
  });

  it('un hueco centrado no mueve el centroide', () => {
    expect(centroideDecimas([[cuadrado(0, 0, 100), cuadrado(30, 30, 40)]])).toEqual([50, 50]);
  });

  it('ignora los anillos inválidos (undefined) y devuelve undefined si no queda área', () => {
    expect(centroideDecimas([[undefined]])).toBeUndefined();
    expect(centroideDecimas([])).toBeUndefined();
    expect(centroideDecimas([[[[0, 0], [5, 5], [10, 10]]]])).toBeUndefined();
    expect(centroideDecimas([[undefined], [cuadrado(0, 0, 100)]])).toEqual([50, 50]);
  });

  it('el centroide queda dentro de la caja de la figura convexa', () => {
    const c = centroideDecimas([[[[10, 10], [200, 30], [150, 180], [20, 120]]]]) as readonly [number, number];
    expect(c[0]).toBeGreaterThan(10);
    expect(c[0]).toBeLessThan(200);
    expect(c[1]).toBeGreaterThan(10);
    expect(c[1]).toBeLessThan(180);
  });

  it('usa identidad para comprobar que el redondeo conserva el centroide de una figura simple', () => {
    const anillo = redondearAnillo(rectangulo(0, 0, 10, 4), identidad);
    expect(centroideDecimas([[anillo]])).toEqual([50, 20]);
  });
});
