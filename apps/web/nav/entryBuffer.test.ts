import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cancel, display, entradaVacia, PLAZO_ENTRADA_MS, push, tick, type EstadoEntrada } from './entryBuffer.ts';

// Tarea 4.6, parte 3. Requisitos 5.9 y 5.10: los dígitos ingresados se muestran con marcadores, y cancelar o 5 s sin un dígito
// nuevo los descarta. El tiempo entra siempre como argumento en milisegundos.

/** Aplica los dígitos en orden, cada uno en su instante, y devuelve el estado final y las solicitudes emitidas. */
function ingresar(...pasos: [digito: string, ahora: number][]): { estado: EstadoEntrada; solicitudes: number[] } {
  let estado = entradaVacia;
  const solicitudes: number[] = [];
  for (const [digito, ahora] of pasos) {
    const r = push(estado, digito, ahora);
    estado = r.estado;
    if (r.solicitud !== undefined) solicitudes.push(r.solicitud);
  }
  return { estado, solicitudes };
}

describe('Estado inicial', () => {
  it('está vacío: sin dígitos, sin instante y sin texto', () => {
    expect(entradaVacia.digitos).toBe('');
    expect(entradaVacia.ultimoEn).toBeNull();
    expect(display(entradaVacia)).toBe('');
  });

  it('tick y cancel sobre el estado vacío lo dejan vacío', () => {
    expect(tick(entradaVacia, 0)).toBe(entradaVacia);
    expect(tick(entradaVacia, 1e12)).toBe(entradaVacia);
    expect(tick(entradaVacia, -5)).toBe(entradaVacia);
    expect(cancel(entradaVacia)).toBe(entradaVacia);
  });

  it('el plazo es de 5000 ms', () => {
    expect(PLAZO_ENTRADA_MS).toBe(5000);
  });
});

describe('Entrada de uno, dos y tres dígitos', () => {
  it('un dígito: queda en el búfer con su instante, sin solicitud', () => {
    const r = push(entradaVacia, '1', 1000);
    expect(r.estado).toEqual({ digitos: '1', ultimoEn: 1000 });
    expect(r.solicitud).toBeUndefined();
    expect(display(r.estado)).toBe('1 _ _');
  });

  it('dos dígitos: el segundo se añade y actualiza el instante, sin solicitud', () => {
    const r = ingresar(['1', 1000], ['2', 1500]);
    expect(r.estado).toEqual({ digitos: '12', ultimoEn: 1500 });
    expect(r.solicitudes).toEqual([]);
    expect(display(r.estado)).toBe('1 2 _');
  });

  it('tres dígitos: emite la solicitud con el número formado y el búfer vuelve a vacío', () => {
    const tercero = push(push(push(entradaVacia, '1', 0).estado, '0', 10).estado, '1', 20);
    expect(tercero.solicitud).toBe(101);
    expect(tercero.estado).toBe(entradaVacia);
    expect(display(tercero.estado)).toBe('');
  });

  it('nunca hay más de tres dígitos en el búfer', () => {
    let estado = entradaVacia;
    for (let i = 0; i < 100; i++) {
      estado = push(estado, String(i % 10), i).estado;
      expect(estado.digitos.length).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    ['100', 100],
    ['101', 101],
    ['200', 200],
    ['400', 400],
    ['999', 999],
    ['555', 555],
  ])('la solicitud de %s es el número %d', (texto, esperado) => {
    const r = ingresar(...texto.split('').map((d, i): [string, number] => [d, i]));
    expect(r.solicitudes).toEqual([esperado]);
  });

  it('solo se emite una solicitud, y solo con el tercer dígito', () => {
    const primero = push(entradaVacia, '4', 0);
    const segundo = push(primero.estado, '0', 1);
    const tercero = push(segundo.estado, '0', 2);
    expect([primero.solicitud, segundo.solicitud, tercero.solicitud]).toEqual([undefined, undefined, 400]);
  });
});

describe('Cero inicial', () => {
  it('se acepta como primer dígito y se muestra', () => {
    const r = push(entradaVacia, '0', 0);
    expect(r.estado.digitos).toBe('0');
    expect(display(r.estado)).toBe('0 _ _');
  });

  it.each([
    ['012', 12],
    ['099', 99],
    ['000', 0],
    ['001', 1],
    ['010', 10],
    ['005', 5],
  ])('la solicitud de %s es %d (la resolución dirá que no existe)', (texto, esperado) => {
    const r = ingresar(...texto.split('').map((d, i): [string, number] => [d, i]));
    expect(r.solicitudes).toEqual([esperado]);
  });

  it('el cero en otras posiciones también cuenta: 100 y 400 no pierden sus ceros', () => {
    expect(display(ingresar(['1', 0], ['0', 1]).estado)).toBe('1 0 _');
    expect(ingresar(['4', 0], ['0', 1], ['0', 2]).solicitudes).toEqual([400]);
  });
});

describe('Reinicio después de completar', () => {
  it('el siguiente dígito empieza una entrada nueva, no se añade al número anterior', () => {
    const r = ingresar(['1', 0], ['0', 1], ['1', 2], ['2', 3]);
    expect(r.solicitudes).toEqual([101]);
    expect(r.estado).toEqual({ digitos: '2', ultimoEn: 3 });
    expect(display(r.estado)).toBe('2 _ _');
  });

  it('nueve dígitos seguidos emiten exactamente tres solicitudes, en orden', () => {
    const r = ingresar(...'123456789'.split('').map((d, i): [string, number] => [d, i * 10]));
    expect(r.solicitudes).toEqual([123, 456, 789]);
    expect(r.estado).toBe(entradaVacia);
  });

  it('el tiempo de la entrada anterior no cuenta: tras completar, la nueva tiene su propio plazo', () => {
    const r = ingresar(['1', 0], ['0', 1], ['1', 2], ['7', 4000]);
    expect(tick(r.estado, 8999)).toBe(r.estado);
    expect(tick(r.estado, 9000)).toBe(entradaVacia);
  });
});

describe('Dígitos inválidos', () => {
  const invalidos: [string, unknown][] = [
    ["una letra 'a'", 'a'],
    ['una letra mayúscula', 'A'],
    ['el texto vacío', ''],
    ['un espacio', ' '],
    ['dos dígitos juntos', '12'],
    ['diez', '10'],
    ['tres dígitos juntos', '123'],
    ['un dígito con espacio', ' 1'],
    ['un dígito con salto de línea', '1\n'],
    ['un salto de línea', '\n'],
    ['un signo menos', '-'],
    ['un signo más', '+'],
    ['un punto', '.'],
    ['una coma', ','],
    ['un dígito de ancho completo', '１'],
    ['un dígito arábigo oriental', '٣'],
    ['un dígito devanagari', '१'],
    ['un dígito con exponente', '1e'],
    ['una tecla con nombre', 'Enter'],
    ['el número 1 (no es un carácter)', 1],
    ['el número 0', 0],
    ['null', null],
    ['undefined', undefined],
    ['un objeto', {}],
    ['un arreglo', ['1']],
    ['un booleano', true],
    ['un BigInt', 1n],
  ];

  it.each(invalidos)('%s no modifica el estado ni emite solicitud (búfer vacío)', (_etiqueta, valor) => {
    const r = push(entradaVacia, valor as string, 100);
    expect(r.estado).toBe(entradaVacia);
    expect(r.solicitud).toBeUndefined();
  });

  it.each(invalidos)('%s no modifica el estado ni emite solicitud (con dos dígitos)', (_etiqueta, valor) => {
    const { estado } = ingresar(['1', 0], ['2', 10]);
    const r = push(estado, valor as string, 20);
    expect(r.estado).toBe(estado);
    expect(r.estado).toEqual({ digitos: '12', ultimoEn: 10 });
    expect(r.solicitud).toBeUndefined();
  });

  it('un dígito inválido no reinicia el plazo: el instante del último dígito válido se conserva', () => {
    const { estado } = ingresar(['1', 0]);
    const despues = push(estado, 'x', 4000).estado;
    expect(despues.ultimoEn).toBe(0);
    expect(tick(despues, 5000)).toBe(entradaVacia);
  });

  it('una secuencia con inválidos en medio se comporta como si no estuvieran', () => {
    const r = ingresar(['1', 0], ['x', 1], ['0', 2], ['', 3], ['1', 4]);
    expect(r.solicitudes).toEqual([101]);
  });

  it.each([['NaN', Number.NaN], ['Infinity', Number.POSITIVE_INFINITY], ['-Infinity', Number.NEGATIVE_INFINITY], ['un texto', '1000'], ['null', null], ['undefined', undefined]])(
    'un instante inválido (%s) no modifica el estado ni emite solicitud',
    (_etiqueta, instante) => {
      const { estado } = ingresar(['1', 0], ['2', 10]);
      for (const base of [entradaVacia, estado]) {
        const r = push(base, '3', instante as number);
        expect(r.estado).toBe(base);
        expect(r.solicitud).toBeUndefined();
        expect(tick(base, instante as number)).toBe(base);
      }
    },
  );
});

describe('Cancelación', () => {
  it('con un dígito, vacía el búfer', () => {
    const { estado } = ingresar(['1', 0]);
    expect(cancel(estado)).toBe(entradaVacia);
    expect(display(cancel(estado))).toBe('');
  });

  it('con dos dígitos, vacía el búfer', () => {
    const { estado } = ingresar(['1', 0], ['2', 10]);
    expect(cancel(estado)).toEqual({ digitos: '', ultimoEn: null });
    expect(display(cancel(estado))).toBe('');
  });

  it('es idempotente, y no depende del tiempo', () => {
    const { estado } = ingresar(['1', 0], ['2', 10]);
    expect(cancel(cancel(estado))).toBe(entradaVacia);
  });

  it('después de cancelar, el siguiente dígito empieza una entrada nueva', () => {
    const { estado } = ingresar(['1', 0], ['2', 10]);
    const r = push(cancel(estado), '9', 20);
    expect(r.estado).toEqual({ digitos: '9', ultimoEn: 20 });
    expect(r.solicitud).toBeUndefined();
  });
});

describe('Expiración a los 5000 ms', () => {
  it('justo antes (4999 ms desde el último dígito) conserva el estado', () => {
    const { estado } = ingresar(['1', 1000]);
    expect(tick(estado, 5999)).toBe(estado);
  });

  it('al alcanzar 5000 ms vacía el búfer', () => {
    const { estado } = ingresar(['1', 1000]);
    expect(tick(estado, 6000)).toBe(entradaVacia);
  });

  it('después de 5000 ms sigue vacío', () => {
    const { estado } = ingresar(['1', 1000], ['2', 1100]);
    expect(tick(estado, 6100)).toBe(entradaVacia);
    expect(tick(estado, 6101)).toBe(entradaVacia);
    expect(tick(estado, 1e12)).toBe(entradaVacia);
  });

  it('con dos dígitos, el plazo se cuenta desde el segundo', () => {
    const { estado } = ingresar(['1', 0], ['2', 4000]);
    expect(tick(estado, 8999)).toBe(estado); // 4999 ms desde el segundo dígito
    expect(tick(estado, 9000)).toBe(entradaVacia); // 5000 ms
  });

  it('antes del vencimiento no cambia nada, en ningún instante intermedio', () => {
    const { estado } = ingresar(['7', 2000]);
    for (const ahora of [2000, 2001, 3000, 4500, 6999]) expect(tick(estado, ahora), String(ahora)).toBe(estado);
  });

  it('tick sin dígitos y varios tick seguidos no cambian nada', () => {
    const { estado } = ingresar(['7', 0]);
    expect(tick(tick(estado, 100), 200)).toBe(estado);
    expect(tick(tick(estado, 6000), 6001)).toBe(entradaVacia);
  });

  it('un instante igual al del último dígito (0 ms transcurridos) no expira', () => {
    const { estado } = ingresar(['7', 3000]);
    expect(tick(estado, 3000)).toBe(estado);
  });
});

describe('Retroceso del reloj', () => {
  it('si el instante es anterior al del último dígito, el búfer expira', () => {
    const { estado } = ingresar(['1', 10_000]);
    expect(tick(estado, 9999)).toBe(entradaVacia);
    expect(tick(estado, 0)).toBe(entradaVacia);
    expect(tick(estado, -1)).toBe(entradaVacia);
    expect(tick(estado, -1e9)).toBe(entradaVacia);
  });

  it('en el mismo instante o después sigue vigente', () => {
    const { estado } = ingresar(['1', 10_000]);
    expect(tick(estado, 10_000)).toBe(estado);
    expect(tick(estado, 10_001)).toBe(estado);
  });

  it('con dos dígitos también expira al retroceder respecto del segundo', () => {
    const { estado } = ingresar(['1', 1000], ['2', 2000]);
    expect(tick(estado, 1999)).toBe(entradaVacia);
  });

  it('un dígito nuevo con el reloj atrasado empieza una entrada nueva, y no emite solicitud', () => {
    const { estado } = ingresar(['1', 10_000], ['2', 10_100]);
    const r = push(estado, '3', 9000);
    expect(r.estado).toEqual({ digitos: '3', ultimoEn: 9000 });
    expect(r.solicitud).toBeUndefined();
  });

  it('con instantes negativos desde el inicio, el búfer funciona con normalidad', () => {
    const { estado } = ingresar(['1', -5000]);
    expect(tick(estado, -1)).toBe(estado);
    expect(tick(estado, 0)).toBe(entradaVacia); // 5000 ms
  });
});

describe('Nuevo dígito después de expirar', () => {
  it('con el búfer expirado, el dígito empieza una entrada nueva', () => {
    const { estado } = ingresar(['1', 0], ['2', 100]);
    const r = push(estado, '9', 5100); // 5000 ms desde el último
    expect(r.estado).toEqual({ digitos: '9', ultimoEn: 5100 });
    expect(r.solicitud).toBeUndefined();
    expect(display(r.estado)).toBe('9 _ _');
  });

  it('el dígito que habría completado el número no emite solicitud si el búfer ya expiró', () => {
    const { estado } = ingresar(['1', 0], ['2', 100]);
    const r = push(estado, '3', 6000);
    expect(r.solicitud).toBeUndefined();
    expect(r.estado.digitos).toBe('3');
  });

  it('un instante antes de expirar sí lo completa', () => {
    const { estado } = ingresar(['1', 0], ['2', 100]);
    expect(push(estado, '3', 5099).solicitud).toBe(123);
  });

  it('con 4999 ms se añade; con 5000 ms empieza de nuevo (sin llamar a tick antes)', () => {
    const { estado } = ingresar(['1', 0]);
    expect(push(estado, '2', 4999).estado).toEqual({ digitos: '12', ultimoEn: 4999 });
    expect(push(estado, '2', 5000).estado).toEqual({ digitos: '2', ultimoEn: 5000 });
  });

  it('tras un tick que lo vació, el dígito también empieza una entrada nueva', () => {
    const { estado } = ingresar(['1', 0], ['2', 100]);
    const vaciado = tick(estado, 9000);
    expect(push(vaciado, '5', 9001).estado).toEqual({ digitos: '5', ultimoEn: 9001 });
  });

  it('cada dígito reinicia el plazo: 1 en 0, 2 en 4000 y 3 en 8000 completa 123', () => {
    const r = ingresar(['1', 0], ['2', 4000], ['3', 8000]);
    expect(r.solicitudes).toEqual([123]);
  });

  it('con un dígito cada 5000 ms o más nunca se completa nada', () => {
    const r = ingresar(['1', 0], ['2', 5000], ['3', 10_000], ['4', 15_000]);
    expect(r.solicitudes).toEqual([]);
    expect(r.estado).toEqual({ digitos: '4', ultimoEn: 15_000 });
  });
});

describe('Representación display', () => {
  it('vacío es la cadena vacía', () => {
    expect(display(entradaVacia)).toBe('');
  });

  it.each([['0'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9']])('con el dígito %s: "%s _ _"', (d) => {
    expect(display(push(entradaVacia, d, 0).estado)).toBe(`${d} _ _`);
  });

  it('con dos dígitos muestra "1 2 _", incluidos los ceros', () => {
    expect(display(ingresar(['1', 0], ['2', 1]).estado)).toBe('1 2 _');
    expect(display(ingresar(['0', 0], ['0', 1]).estado)).toBe('0 0 _');
    expect(display(ingresar(['9', 0], ['0', 1]).estado)).toBe('9 0 _');
  });

  it('separa con un solo espacio y usa el guion bajo como marcador', () => {
    expect(display(push(entradaVacia, '5', 0).estado)).toMatch(/^\d _ _$/);
    expect(display(ingresar(['5', 0], ['6', 1]).estado)).toMatch(/^\d \d _$/);
  });

  it('un estado de tres dígitos (que push nunca produce) se muestra completo, sin marcadores', () => {
    expect(display({ digitos: '123', ultimoEn: 0 })).toBe('1 2 3');
  });

  it('no depende del instante ni cambia el estado', () => {
    const { estado } = ingresar(['1', 0]);
    expect(display(estado)).toBe(display(estado));
    expect(estado).toEqual({ digitos: '1', ultimoEn: 0 });
  });
});

describe('Inmutabilidad', () => {
  it('los estados están congelados y no se pueden modificar desde fuera', () => {
    const { estado } = ingresar(['1', 0]);
    expect(Object.isFrozen(estado)).toBe(true);
    expect(Object.isFrozen(entradaVacia)).toBe(true);
    expect(() => ((estado as { digitos: string }).digitos = '999')).toThrow(TypeError);
    expect(() => ((entradaVacia as { digitos: string }).digitos = '1')).toThrow(TypeError);
    expect(estado.digitos).toBe('1');
  });

  it('push no modifica el estado anterior', () => {
    const antes = ingresar(['1', 0]).estado;
    const copia = { ...antes };
    const r = push(antes, '2', 10);
    expect(antes).toEqual(copia);
    expect(r.estado).not.toBe(antes);
  });

  it('tick y cancel no modifican el estado anterior', () => {
    const antes = ingresar(['1', 0], ['2', 10]).estado;
    const copia = { ...antes };
    tick(antes, 99_999);
    cancel(antes);
    expect(antes).toEqual(copia);
  });

  it('completar el número no modifica el estado de dos dígitos', () => {
    const antes = ingresar(['1', 0], ['2', 10]).estado;
    push(antes, '3', 20);
    expect(antes).toEqual({ digitos: '12', ultimoEn: 10 });
  });

  it('el estado vacío compartido nunca se contamina', () => {
    ingresar(['1', 0], ['2', 1], ['3', 2], ['4', 3]);
    cancel(entradaVacia);
    tick(entradaVacia, 1e9);
    expect(entradaVacia).toEqual({ digitos: '', ultimoEn: null });
  });

  it('es determinista: la misma entrada da el mismo resultado', () => {
    expect(ingresar(['1', 0], ['2', 10], ['3', 20])).toEqual(ingresar(['1', 0], ['2', 10], ['3', 20]));
  });

  it('funciona con un estado de entrada congelado (todos lo están)', () => {
    const congelado = Object.freeze({ digitos: '1', ultimoEn: 0 });
    expect(() => push(congelado, '2', 10)).not.toThrow();
    expect(() => tick(congelado, 6000)).not.toThrow();
    expect(() => display(congelado)).not.toThrow();
  });
});

describe('Casos límite y secuencias de entrada', () => {
  it('el instante 0 y los instantes muy grandes se manejan como cualquier otro', () => {
    expect(push(entradaVacia, '1', 0).estado.ultimoEn).toBe(0);
    expect(push(entradaVacia, '1', Number.MAX_SAFE_INTEGER).estado.ultimoEn).toBe(Number.MAX_SAFE_INTEGER);
    const { estado } = ingresar(['1', 1e12]);
    expect(tick(estado, 1e12 + 4999)).toBe(estado);
    expect(tick(estado, 1e12 + 5000)).toBe(entradaVacia);
  });

  it('acepta instantes con decimales (milisegundos fraccionarios)', () => {
    const { estado } = ingresar(['1', 1000.5]);
    expect(tick(estado, 5999.4)).toBe(estado);
    expect(tick(estado, 6000.5)).toBe(entradaVacia);
  });

  it('escribir 101, esperar y escribir 200 da dos solicitudes independientes', () => {
    const r = ingresar(['1', 0], ['0', 100], ['1', 200], ['2', 10_000], ['0', 10_100], ['0', 10_200]);
    expect(r.solicitudes).toEqual([101, 200]);
  });

  it('un dígito, cancelar y tres dígitos: solo cuentan los tres últimos', () => {
    let estado = push(entradaVacia, '9', 0).estado;
    estado = cancel(estado);
    const r = ingresar(['1', 10], ['0', 20], ['0', 30]);
    expect(r.solicitudes).toEqual([100]);
    expect(estado).toBe(entradaVacia);
  });

  it('un dígito, expiración y dos dígitos más: la expiración separa las entradas', () => {
    const r = ingresar(['1', 0], ['2', 6000], ['3', 6100]);
    expect(r.solicitudes).toEqual([]);
    expect(r.estado).toEqual({ digitos: '23', ultimoEn: 6100 });
  });

  it('coincide con un modelo simple en todas las secuencias de hasta 4 operaciones', () => {
    type Operacion = { tipo: 'push'; digito: string } | { tipo: 'tick' } | { tipo: 'cancel' };
    const operaciones: Operacion[] = [{ tipo: 'push', digito: '7' }, { tipo: 'push', digito: '0' }, { tipo: 'push', digito: 'x' }, { tipo: 'tick' }, { tipo: 'cancel' }];
    // Pasos de tiempo: 0 ms, 2000 ms, justo 5000 ms y un retroceso de 1000 ms.
    const saltos = [0, 2000, 5000, -1000];
    let secuencias = 0;
    const fallos: string[] = [];
    const verificar = (condicion: boolean, mensaje: string): void => {
      if (!condicion && fallos.length < 5) fallos.push(mensaje);
    };

    // Modelo escrito aparte de la implementación: lista de dígitos y el instante del último.
    type Modelo = { d: string[]; t: number | null };
    const vacio: Modelo = { d: [], t: null };
    const expira = (m: Modelo, ahora: number): boolean => m.d.length > 0 && m.t !== null && (ahora < m.t || ahora - m.t >= 5000);

    const recorrer = (estado: EstadoEntrada, modelo: Modelo, ahora: number, resto: number, camino: string): void => {
      verificar(estado.digitos === modelo.d.join(''), `${camino}: digitos ${estado.digitos} y se esperaba ${modelo.d.join('')}`);
      verificar(estado.ultimoEn === modelo.t, `${camino}: ultimoEn ${estado.ultimoEn} y se esperaba ${modelo.t}`);
      verificar(display(estado) === (modelo.d.length === 0 ? '' : [...modelo.d, '_', '_'].slice(0, 3).join(' ')), `${camino}: display ${display(estado)}`);
      secuencias++;
      if (resto === 0) return;
      for (const salto of saltos) {
        const t = ahora + salto;
        for (const op of operaciones) {
          const paso = `${camino} > ${op.tipo === 'push' ? `push ${op.digito}` : op.tipo}@${t}`;
          if (op.tipo === 'cancel') {
            recorrer(cancel(estado), vacio, t, resto - 1, paso);
          } else if (op.tipo === 'tick') {
            recorrer(tick(estado, t), expira(modelo, t) ? vacio : modelo, t, resto - 1, paso);
          } else if (!/^[0-9]$/.test(op.digito)) {
            const r = push(estado, op.digito, t);
            verificar(r.estado === estado && r.solicitud === undefined, `${paso}: un dígito inválido debe dejar todo igual`);
            recorrer(r.estado, modelo, t, resto - 1, paso);
          } else {
            const base: Modelo = expira(modelo, t) ? vacio : modelo;
            const digitos = [...base.d, op.digito];
            const r = push(estado, op.digito, t);
            if (digitos.length === 3) {
              verificar(r.solicitud === Number(digitos.join('')), `${paso}: solicitud ${r.solicitud}`);
              recorrer(r.estado, vacio, t, resto - 1, paso);
            } else {
              verificar(r.solicitud === undefined, `${paso}: no debe haber solicitud`);
              recorrer(r.estado, { d: digitos, t }, t, resto - 1, paso);
            }
          }
        }
      }
    };
    recorrer(entradaVacia, vacio, 10_000, 4, 'inicio');
    expect(fallos).toEqual([]);
    const porNivel = saltos.length * operaciones.length;
    expect(secuencias).toBe(1 + porNivel + porNivel ** 2 + porNivel ** 3 + porNivel ** 4);
  });
});
describe('Lógica pura, sin reloj ni API del navegador', () => {
  it('ninguna función consulta Date.now', () => {
    const espia = vi.spyOn(Date, 'now');
    const { estado } = ingresar(['1', 0], ['2', 10]);
    tick(estado, 99_999);
    cancel(estado);
    display(estado);
    push(estado, 'x', 5);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('entryBuffer.ts no usa window, document, location, temporizadores, el reloj ni importa nada', () => {
    const fuente = readFileSync(new URL('./entryBuffer.ts', import.meta.url), 'utf8');
    const codigo = fuente
      .split('\n')
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    expect(codigo).not.toMatch(
      /\bwindow\b|\bdocument\b|\blocation\b|\bglobalThis\b|\bnavigator\b|setTimeout|setInterval|clearTimeout|requestAnimationFrame|Date\b|performance\b|addEventListener/,
    );
    expect(codigo).not.toMatch(/^import /m);
  });
});
