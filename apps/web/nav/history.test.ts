import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actual, back, historialVacio, visit, type Historial } from './history.ts';

// Tarea 4.6, parte 2. Requisitos 5.7 y 5.8: "Atrás" lleva a la página visitada inmediatamente antes; sin anterior, no cambia nada.

/** Historial resultante de visitar las páginas en orden. */
const visitar = (...numeros: number[]): Historial => numeros.reduce((h, n) => visit(h, n), historialVacio);

/** Todas las páginas del historial, de la actual a la más antigua, usando solo `actual` y `back` (la API pública). */
function recorrer(h: Historial): (number | undefined)[] {
  const vistas: (number | undefined)[] = [];
  let siguiente = h;
  for (let i = 0; i < 10_000; i++) {
    vistas.push(actual(siguiente));
    const anterior = back(siguiente);
    if (anterior === siguiente) break;
    siguiente = anterior;
  }
  return vistas;
}

describe('Historial vacío', () => {
  it('no tiene página actual', () => {
    expect(actual(historialVacio)).toBeUndefined();
    expect(historialVacio.paginas).toEqual([]);
  });

  it('"Atrás" no hace nada: devuelve el mismo historial', () => {
    expect(back(historialVacio)).toBe(historialVacio);
    expect(actual(back(historialVacio))).toBeUndefined();
  });

  it('un número inválido no lo modifica', () => {
    expect(visit(historialVacio, 99)).toBe(historialVacio);
    expect(visit(historialVacio, Number.NaN)).toBe(historialVacio);
  });
});

describe('Primera visita', () => {
  it('la página visitada es la actual y es la única', () => {
    const h = visit(historialVacio, 100);
    expect(actual(h)).toBe(100);
    expect(h.paginas).toEqual([100]);
  });

  it('el historial vacío anterior no cambia', () => {
    visit(historialVacio, 100);
    expect(actual(historialVacio)).toBeUndefined();
    expect(historialVacio.paginas).toEqual([]);
  });

  it('con una sola página no hay anterior: "Atrás" la deja como está', () => {
    const h = visit(historialVacio, 101);
    expect(back(h)).toBe(h);
    expect(actual(back(h))).toBe(101);
  });
});

describe('Visitas consecutivas a páginas distintas', () => {
  it('cada página visitada pasa a ser la actual y queda registrada en orden', () => {
    const h1 = visit(historialVacio, 100);
    const h2 = visit(h1, 101);
    const h3 = visit(h2, 200);
    expect([actual(h1), actual(h2), actual(h3)]).toEqual([100, 101, 200]);
    expect(h3.paginas).toEqual([100, 101, 200]);
  });

  it('conserva todos los números válidos de 100 a 999', () => {
    const todos = Array.from({ length: 900 }, (_, i) => 100 + i);
    const h = visitar(...todos);
    expect(h.paginas).toEqual(todos);
    expect(actual(h)).toBe(999);
  });

  it('visitar una página anterior que no es la actual sí añade una entrada', () => {
    const h = visitar(100, 101, 100);
    expect(h.paginas).toEqual([100, 101, 100]);
    expect(back(h).paginas).toEqual([100, 101]);
    expect(actual(back(h))).toBe(101);
  });

  it('"Inicio" (visitar 100) desde otra página se registra y "Atrás" regresa a la anterior', () => {
    const h = visitar(100, 101, 200, 100);
    expect(actual(h)).toBe(100);
    expect(actual(back(h))).toBe(200);
  });
});

describe('Visita repetida a la página actual', () => {
  it('no añade una entrada duplicada y devuelve el mismo historial', () => {
    const h = visitar(100, 101);
    expect(visit(h, 101)).toBe(h);
    expect(visit(visit(h, 101), 101).paginas).toEqual([100, 101]);
  });

  it('con solo una página, repetirla no la duplica', () => {
    const h = visitar(100);
    expect(visit(h, 100)).toBe(h);
    expect(h.paginas).toEqual([100]);
  });

  it('después de repetirla, "Atrás" sigue yendo a la página anterior y no a la misma', () => {
    const h = visitar(100, 101, 101, 101);
    expect(h.paginas).toEqual([100, 101]);
    expect(actual(back(h))).toBe(100);
  });

  it('una página repetida solo cuenta como duplicada si es la actual: 101, 200, 101 deja tres', () => {
    expect(visitar(101, 200, 101).paginas).toEqual([101, 200, 101]);
  });
});

describe('Números inválidos', () => {
  const invalidos: [string, unknown][] = [
    ['99', 99],
    ['0', 0],
    ['-100', -100],
    ['1000', 1000],
    ['100.5', 100.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ["'101'", '101'],
    ['null', null],
    ['undefined', undefined],
    ['un objeto', {}],
    ['un booleano', true],
    ['un BigInt', 101n],
  ];

  it.each(invalidos)('visitar %s no modifica el historial', (_etiqueta, valor) => {
    const h = visitar(100, 101);
    const despues = visit(h, valor as number);
    expect(despues).toBe(h);
    expect(despues.paginas).toEqual([100, 101]);
    expect(actual(despues)).toBe(101);
  });

  it('una secuencia con inválidos en medio se comporta como si no estuvieran', () => {
    const h = [100, 99, 101, Number.NaN, 200, 1000, 200].reduce((acumulado, n) => visit(acumulado, n), historialVacio);
    expect(h.paginas).toEqual([100, 101, 200]);
  });

  it('un inválido no cuenta como "página actual" para evitar duplicados', () => {
    expect(visitar(100, 99, 100).paginas).toEqual([100]);
  });
});

describe('Retroceso con historial disponible', () => {
  it('"Atrás" elimina la página actual y vuelve a la anterior', () => {
    const h = visitar(100, 101, 200);
    const atras = back(h);
    expect(actual(atras)).toBe(101);
    expect(atras.paginas).toEqual([100, 101]);
  });

  it('se puede retroceder varias veces hasta la primera página, y ahí ya no cambia', () => {
    const h = visitar(100, 101, 200);
    const uno = back(h);
    const dos = back(uno);
    expect([actual(uno), actual(dos)]).toEqual([101, 100]);
    expect(back(dos)).toBe(dos);
    expect(actual(back(dos))).toBe(100);
  });

  it('no hay "adelante": al visitar otra página tras volver, la que se descartó no regresa', () => {
    const h = visit(back(visitar(100, 101)), 200);
    expect(h.paginas).toEqual([100, 200]);
    expect(actual(back(h))).toBe(100);
  });

  it('después de volver, visitar la página que se acaba de dejar la registra de nuevo', () => {
    const h = visit(back(visitar(100, 101)), 101);
    expect(h.paginas).toEqual([100, 101]);
  });
});

describe('Retroceso sin historial previo', () => {
  it('con un historial de una página devuelve el mismo historial, con la misma página actual', () => {
    const h = visitar(400);
    const atras = back(h);
    expect(atras).toBe(h);
    expect(actual(atras)).toBe(400);
  });

  it('retroceder más veces que visitas deja la primera página y el historial intacto', () => {
    let h = visitar(100, 101, 200);
    for (let i = 0; i < 10; i++) h = back(h);
    expect(h.paginas).toEqual([100]);
    expect(actual(h)).toBe(100);
  });

  it('con visitas repetidas de la misma página sigue sin haber anterior', () => {
    const h = visitar(100, 100, 100);
    expect(back(h)).toBe(h);
  });
});

describe('Secuencias de la tarea', () => {
  it('100 -> 101 -> 200 y volver desde 200 regresa a 101', () => {
    const h = visitar(100, 101, 200);
    expect(actual(h)).toBe(200);
    expect(actual(back(h))).toBe(101);
  });

  it('100 -> 101 -> 200 -> 101: al volver regresa a 200, no a 100', () => {
    const h = visitar(100, 101, 200, 101);
    expect(actual(h)).toBe(101);
    expect(h.paginas).toEqual([100, 101, 200, 101]);
    const atras = back(h);
    expect(actual(atras)).toBe(200);
    expect(actual(back(atras))).toBe(101);
    expect(actual(back(back(atras)))).toBe(100);
  });

  it('recorrer hasta el principio devuelve las páginas en orden inverso de visita', () => {
    expect(recorrer(visitar(100, 101, 200, 101))).toEqual([101, 200, 101, 100]);
    expect(recorrer(visitar(100))).toEqual([100]);
    expect(recorrer(historialVacio)).toEqual([undefined]);
  });
});

describe('Inmutabilidad', () => {
  it('visit no modifica el historial anterior', () => {
    const antes = visitar(100, 101);
    const copia = [...antes.paginas];
    const despues = visit(antes, 200);
    expect(antes.paginas).toEqual(copia);
    expect(actual(antes)).toBe(101);
    expect(despues).not.toBe(antes);
    expect(despues.paginas).not.toBe(antes.paginas);
  });

  it('back no modifica el historial anterior', () => {
    const antes = visitar(100, 101, 200);
    const copia = [...antes.paginas];
    const despues = back(antes);
    expect(antes.paginas).toEqual(copia);
    expect(actual(antes)).toBe(200);
    expect(despues).not.toBe(antes);
    expect(despues.paginas).not.toBe(antes.paginas);
  });

  it('los historiales están congelados: no se pueden modificar desde fuera', () => {
    const h = visitar(100, 101);
    expect(Object.isFrozen(h)).toBe(true);
    expect(Object.isFrozen(h.paginas)).toBe(true);
    expect(Object.isFrozen(historialVacio)).toBe(true);
    expect(Object.isFrozen(historialVacio.paginas)).toBe(true);
    expect(() => (h.paginas as number[]).push(200)).toThrow(TypeError);
    expect(() => ((h as { paginas: number[] }).paginas = [])).toThrow(TypeError);
    expect(h.paginas).toEqual([100, 101]);
  });

  it('el historial vacío compartido nunca se contamina por las visitas', () => {
    visitar(100, 101, 200);
    back(visitar(100, 101));
    expect(historialVacio.paginas).toEqual([]);
  });

  it('dos historiales construidos con la misma secuencia son independientes pero iguales', () => {
    const a = visitar(100, 101);
    const b = visitar(100, 101);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    const a2 = visit(a, 200);
    expect(b.paginas).toEqual([100, 101]);
    expect(a2.paginas).toEqual([100, 101, 200]);
  });

  it('es determinista', () => {
    expect(visitar(100, 101, 200, 101)).toEqual(visitar(100, 101, 200, 101));
    expect(back(visitar(100, 101, 200))).toEqual(back(visitar(100, 101, 200)));
  });
});

describe('Casos límite y coherencia de actual', () => {
  it('con un historial largo, "Atrás" recorre todas las visitas en orden inverso', () => {
    const visitas = Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? 100 : 101)); // alterna: nunca repite la actual
    const h = visitar(...visitas);
    expect(h.paginas).toHaveLength(2000);
    const recorrido = recorrer(h) as number[];
    expect(recorrido).toEqual([...visitas].reverse());
  });

  it('actual es siempre el último elemento de las páginas, y undefined solo si está vacío', () => {
    const h = visitar(100, 101, 200);
    expect(actual(h)).toBe(h.paginas[h.paginas.length - 1]);
    expect(actual(historialVacio)).toBeUndefined();
    expect(actual(back(back(back(h))))).toBe(100);
  });

  it('el menor y el mayor Número_de_Página válidos funcionan, y 99 y 1000 no', () => {
    expect(visitar(100).paginas).toEqual([100]);
    expect(visitar(999).paginas).toEqual([999]);
    expect(visitar(99, 1000).paginas).toEqual([]);
  });

  it('coincide con un modelo simple en todas las secuencias de hasta 6 operaciones (visitar 100, 101, 200, un inválido, o volver)', () => {
    type Operacion = 100 | 101 | 200 | 'invalido' | 'atras';
    const operaciones: Operacion[] = [100, 101, 200, 'invalido', 'atras'];
    let secuencias = 0;
    const probar = (h: Historial, modelo: number[], resto: number): void => {
      expect(h.paginas).toEqual(modelo);
      expect(actual(h)).toBe(modelo[modelo.length - 1]);
      secuencias++;
      if (resto === 0) return;
      for (const op of operaciones) {
        if (op === 'atras') {
          probar(back(h), modelo.length > 1 ? modelo.slice(0, -1) : modelo, resto - 1);
        } else if (op === 'invalido') {
          probar(visit(h, 99), modelo, resto - 1);
        } else {
          probar(visit(h, op), modelo[modelo.length - 1] === op ? modelo : [...modelo, op], resto - 1);
        }
      }
    };
    probar(historialVacio, [], 6);
    expect(secuencias).toBe(1 + 5 + 25 + 125 + 625 + 3125 + 15_625);
  });
});

describe('Lógica pura, sin API del navegador', () => {
  it('history.ts no usa window, document, location, pushState, popstate, temporizadores ni el reloj', () => {
    const codigo = readFileSync(new URL('./history.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    expect(codigo).not.toMatch(
      /\bwindow\b|\bdocument\b|\blocation\b|\bglobalThis\b|\bnavigator\b|pushState|replaceState|popstate|setTimeout|setInterval|requestAnimationFrame|Date\b|performance\b/,
    );
  });

  it('solo importa del router y del modelo', () => {
    const importaciones = readFileSync(new URL('./history.ts', import.meta.url), 'utf8').match(/^import .* from '.*';$/gm) ?? [];
    expect(importaciones.map((linea) => /from '(.*)'/.exec(linea)?.[1])).toEqual(['@teletexto/modelo', './router.ts']);
  });
});
