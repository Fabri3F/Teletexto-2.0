import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
// Tarea 5.16. Requisitos 6.5, 18.1, 18.3 y 18.10. Pruebas unitarias de la fórmula de contraste de WCAG 2.1.

describe('contrastRatio: valores de referencia', () => {
  it('negro sobre blanco es 21 y es el máximo', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });
  it('un color sobre sí mismo es 1', () => {
    for (const color of ['#000000', '#ffffff', '#ff8000', '#123456', '#0a0a0a', '#0b0b0b']) {
      expect(contrastRatio(color, color)).toBe(1);
    }
  });
  it.each([
    ['rojo sobre negro', '#ff0000', '#000000', 5.252],
    ['amarillo sobre negro', '#ffff00', '#000000', 19.556],
    ['verde sobre negro', '#00ff00', '#000000', 15.304],
    ['cian sobre negro', '#00ffff', '#000000', 16.748],
    ['magenta sobre negro', '#ff00ff', '#000000', 6.696],
    ['azul sobre negro', '#0000ff', '#000000', 2.444],
    ['naranja sobre negro', '#ff8000', '#000000', 8.3397],
    ['blanco sobre azul', '#ffffff', '#0000ff', 8.5925],
    ['amarillo sobre azul', '#ffff00', '#0000ff', 8.0016],
    ['rojo sobre blanco', '#ff0000', '#ffffff', 3.9985],
    ['gris #808080 sobre negro', '#808080', '#000000', 5.3172],
    ['gris #666666 sobre negro', '#666666', '#000000', 3.6574],
    ['gris #666666 sobre blanco', '#666666', '#ffffff', 5.7418],
  ])('%s: %f', (_etiqueta, primero, segundo, esperado) => {
    expect(contrastRatio(primero, segundo)).toBeCloseTo(esperado, 3);
  });
  it('valores clásicos de WCAG: #767676 sobre blanco es 4.54 (pasa 4.5) y #777777 es 4.48 (no pasa)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.5422, 3);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.4781, 3);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });
  it('la rama lineal de la conversión sRGB (canal 10) y la exponencial (canal 11) dan los valores esperados', () => {
    expect(contrastRatio('#0a0a0a', '#000000')).toBeCloseTo(1.0607, 4);
    expect(contrastRatio('#0b0b0b', '#000000')).toBeCloseTo(1.0669, 4);
  });
  it('los pares de luminancia mayor y menor dan lo mismo en cualquier orden', () => {
    expect(contrastRatio('#ff8000', '#000000')).toBe(contrastRatio('#000000', '#ff8000'));
  });
  it('no redondea: un par justo por debajo de un umbral queda por debajo', () => {
    // #777777 sobre blanco vale 4.478...; redondeado a un decimal sería 4.5 y pasaría. Sin redondeo no pasa.
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(Number(contrastRatio('#777777', '#ffffff').toFixed(1))).toBe(4.5);
  });
});

describe('contrastRatio: formatos de color', () => {
  it('#rgb equivale a #rrggbb', () => {
    expect(contrastRatio('#fff', '#000')).toBe(contrastRatio('#ffffff', '#000000'));
    expect(contrastRatio('#f80', '#000')).toBe(contrastRatio('#ff8800', '#000000'));
    expect(contrastRatio('#abc', '#123')).toBe(contrastRatio('#aabbcc', '#112233'));
  });
  it('no distingue mayúsculas de minúsculas', () => {
    expect(contrastRatio('#FF8000', '#000000')).toBe(contrastRatio('#ff8000', '#000000'));
    expect(contrastRatio('#Ff8000', '#FFF')).toBe(contrastRatio('#ff8000', '#ffffff'));
  });
  it.each([
    [''],
    ['#'],
    ['#f'],
    ['#ff'],
    ['#ffff'],
    ['#fffff'],
    ['#fffffff'],
    ['#ffffffff'],
    ['ffffff'],
    ['fff'],
    ['#ggg'],
    ['#gggggg'],
    ['#ff00zz'],
    ['##fff'],
    [' #fff'],
    ['#fff '],
    ['#fff\n'],
    ['\n#fff'],
    ['rgb(0, 0, 0)'],
    ['red'],
    ['transparent'],
    ['#ff 000'],
    ['#ff-000'],
    ['#ＦＦＦ'],
  ])('un color inválido (%j) da NaN en cualquiera de los dos lados', (invalido) => {
    expect(contrastRatio(invalido, '#000000')).toBeNaN();
    expect(contrastRatio('#ffffff', invalido)).toBeNaN();
    expect(contrastRatio(invalido, invalido)).toBeNaN();
  });
  it.each([[null], [undefined], [0], [255], [true], [{}], [[]], [['#fff']]])('un valor que no es texto (%s) da NaN', (valor) => {
    expect(contrastRatio(valor as never, '#000000')).toBeNaN();
    expect(contrastRatio('#000000', valor as never)).toBeNaN();
  });
  it('un resultado NaN nunca cumple un umbral', () => {
    for (const umbral of [1, 3, 4.5, 7, 21]) expect(contrastRatio('#xyz', '#000') >= umbral).toBe(false);
  });
});

describe('contrastRatio: propiedades sobre una muestra determinista', () => {
  /** Generador congruencial lineal con semilla fija, para no depender de `Math.random`. */
  function generador(semilla: number): () => number {
    let estado = semilla;
    return () => {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return estado / 4_294_967_296;
    };
  }
  const azar = generador(31_337);
  const hex2 = (): string =>
    Math.floor(azar() * 256)
      .toString(16)
      .padStart(2, '0');
  const colores = Array.from({ length: 80 }, () => `#${hex2()}${hex2()}${hex2()}`);
  it('el resultado está siempre entre 1 y 21 y es simétrico', () => {
    for (const a of colores) {
      for (const b of colores) {
        const razon = contrastRatio(a, b);
        expect(razon, `${a} ${b}`).toBeGreaterThanOrEqual(1);
        expect(razon, `${a} ${b}`).toBeLessThanOrEqual(21 + 1e-9);
        expect(razon, `${a} ${b}`).toBe(contrastRatio(b, a));
      }
    }
  });
  it('sobre negro, un canal verde más claro nunca baja el contraste', () => {
    let anterior = 0;
    for (let canal = 0; canal <= 255; canal++) {
      const razon = contrastRatio(`#00${canal.toString(16).padStart(2, '0')}00`, '#000000');
      expect(razon).toBeGreaterThanOrEqual(anterior);
      anterior = razon;
    }
  });
  it('la razón entre tres colores cumple la transitividad de luminancias: si a > b > c, razon(a, c) = razon(a, b) · razon(b, c) con 0.05', () => {
    // (La + 0.05) / (Lc + 0.05) = [(La + 0.05) / (Lb + 0.05)] · [(Lb + 0.05) / (Lc + 0.05)].
    const a = '#ffffff';
    const b = '#808080';
    const c = '#101010';
    expect(contrastRatio(a, c)).toBeCloseTo(contrastRatio(a, b) * contrastRatio(b, c), 9);
  });
});

describe('Pureza del módulo', () => {
  const fuente = readFileSync(new URL('./contrast.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no usa DOM, red, almacenamiento, reloj, temporizadores ni azar, y no importa nada', () => {
    for (const prohibido of [
      'window', 'document', 'navigator', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'Date', 'performance', 'setTimeout',
      'setInterval', 'requestAnimationFrame', 'Math.random', 'console', 'import ',
    ]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });
});
