import { readFileSync } from 'node:fs';
import { NIVELES_RIESGO, type NivelRiesgo } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import {
  COLOR_GRIS_NEUTRO,
  COLOR_NARANJA,
  COLORES_TELETEXTO,
  COMBINACIONES_TEXTO,
  ESTILO_NEUTRO,
  ESTILOS_NIVEL,
  estiloDeNivel,
  FOCO,
  FONDO_MAPA,
  GROSOR_MINIMO_FOCO_PX,
  type EstiloVisual,
} from './paleta.ts';
// Tarea 5.16. Requisitos 4.4, 4.5, 6.5, 18.1, 18.3 y 18.10. Pruebas unitarias de la paleta, los estilos del mapa y el foco.
const TEXTO_7_A_1 = 7;
const ELEMENTO_3_A_1 = 3;

/** Los cuatro niveles más el Estilo_Neutro, con su nombre. */
const ESTILOS: readonly (readonly [string, EstiloVisual])[] = [
  ...NIVELES_RIESGO.map((nivel) => [nivel, ESTILOS_NIVEL[nivel]] as const),
  ['Estilo_Neutro', ESTILO_NEUTRO] as const,
];
const COLORES_DE = (estilo: EstiloVisual): string[] => [
  estilo.relleno,
  estilo.tinta,
  estilo.borde,
  ...(estilo.lineaInterior === undefined ? [] : [estilo.lineaInterior]),
];

describe('Paleta: colores válidos', () => {
  it('todos los colores de la paleta son #rrggbb válidos', () => {
    const colores = [
      ...Object.values(COLORES_TELETEXTO),
      COLOR_NARANJA,
      COLOR_GRIS_NEUTRO,
      FONDO_MAPA,
      FOCO.linea,
      FOCO.contorno,
      ...ESTILOS.flatMap(([, estilo]) => COLORES_DE(estilo)),
      ...COMBINACIONES_TEXTO.flatMap((c) => [c.texto, c.fondo]),
    ];
    for (const color of colores) {
      expect(color, color).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(color, '#000000'), color).not.toBeNaN();
    }
  });
  it('los ocho colores del teletexto clásico son los esperados', () => {
    expect(COLORES_TELETEXTO).toEqual({
      negro: '#000000',
      rojo: '#ff0000',
      verde: '#00ff00',
      amarillo: '#ffff00',
      azul: '#0000ff',
      magenta: '#ff00ff',
      cian: '#00ffff',
      blanco: '#ffffff',
    });
  });
  it('el gris del Estilo_Neutro es un gris (canales iguales) que no es negro ni blanco', () => {
    const canales = [COLOR_GRIS_NEUTRO.slice(1, 3), COLOR_GRIS_NEUTRO.slice(3, 5), COLOR_GRIS_NEUTRO.slice(5, 7)];
    expect(new Set(canales).size).toBe(1);
    expect(COLOR_GRIS_NEUTRO).not.toBe(COLORES_TELETEXTO.negro);
    expect(COLOR_GRIS_NEUTRO).not.toBe(COLORES_TELETEXTO.blanco);
    expect(ESTILO_NEUTRO.relleno).toBe(COLOR_GRIS_NEUTRO);
  });
  it('los datos de la paleta no se pueden modificar', () => {
    expect(Object.isFrozen(COLORES_TELETEXTO)).toBe(true);
    expect(Object.isFrozen(ESTILOS_NIVEL)).toBe(true);
    expect(Object.isFrozen(ESTILO_NEUTRO)).toBe(true);
    expect(Object.isFrozen(FOCO)).toBe(true);
    expect(Object.isFrozen(COMBINACIONES_TEXTO)).toBe(true);
    for (const [, estilo] of ESTILOS) expect(Object.isFrozen(estilo)).toBe(true);
    for (const combinacion of COMBINACIONES_TEXTO) expect(Object.isFrozen(combinacion)).toBe(true);
  });
});

describe('Paleta: texto a 7:1 (Requisitos 6.5 y 18.1)', () => {
  it('hay combinaciones de texto declaradas, con usos distintos', () => {
    expect(COMBINACIONES_TEXTO.length).toBeGreaterThanOrEqual(5);
    expect(new Set(COMBINACIONES_TEXTO.map((c) => c.uso)).size).toBe(COMBINACIONES_TEXTO.length);
  });
  it.each(COMBINACIONES_TEXTO.map((c) => [c.uso, c.texto, c.fondo] as const))('%s (%s sobre %s) cumple 7:1', (_uso, texto, fondo) => {
    expect(contrastRatio(texto, fondo)).toBeGreaterThanOrEqual(TEXTO_7_A_1);
  });
  it('la cabecera, el cuerpo y el título que usa styles.css están entre las combinaciones', () => {
    const pares = COMBINACIONES_TEXTO.map((c) => `${c.texto}/${c.fondo}`);
    expect(pares).toContain(`${COLORES_TELETEXTO.blanco}/${COLORES_TELETEXTO.negro}`);
    expect(pares).toContain(`${COLORES_TELETEXTO.blanco}/${COLORES_TELETEXTO.azul}`);
    expect(pares).toContain(`${COLORES_TELETEXTO.amarillo}/${COLORES_TELETEXTO.negro}`);
  });
  it('el rojo, el magenta y el azul no alcanzan 7:1 como texto sobre negro, así que no se usan como tal', () => {
    for (const color of [COLORES_TELETEXTO.rojo, COLORES_TELETEXTO.magenta, COLORES_TELETEXTO.azul]) {
      expect(contrastRatio(color, COLORES_TELETEXTO.negro), color).toBeLessThan(TEXTO_7_A_1);
      expect(COMBINACIONES_TEXTO.some((c) => c.texto === color && c.fondo === COLORES_TELETEXTO.negro), color).toBe(false);
    }
  });
  it('sobre azul solo se usan el blanco y el amarillo', () => {
    const sobreAzul = COMBINACIONES_TEXTO.filter((c) => c.fondo === COLORES_TELETEXTO.azul).map((c) => c.texto);
    for (const texto of sobreAzul) expect([COLORES_TELETEXTO.blanco, COLORES_TELETEXTO.amarillo]).toContain(texto);
  });
});

describe('Estilos del mapa y la leyenda: 3:1 (Requisitos 4.4 y 18.10)', () => {
  it.each(ESTILOS)('%s: el relleno frente a la tinta del patrón cumple 3:1', (_nombre, estilo) => {
    expect(contrastRatio(estilo.relleno, estilo.tinta)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it.each(ESTILOS)('%s: el relleno frente al borde cumple 3:1', (_nombre, estilo) => {
    expect(contrastRatio(estilo.relleno, estilo.borde)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it.each(ESTILOS)('%s: el relleno frente al fondo del mapa cumple 3:1', (_nombre, estilo) => {
    expect(contrastRatio(estilo.relleno, FONDO_MAPA)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it('los valores concretos de los contrastes del relleno frente al fondo del mapa', () => {
    expect(contrastRatio(ESTILOS_NIVEL.Bajo.relleno, FONDO_MAPA)).toBeCloseTo(15.304, 3);
    expect(contrastRatio(ESTILOS_NIVEL.Moderado.relleno, FONDO_MAPA)).toBeCloseTo(19.556, 3);
    expect(contrastRatio(ESTILOS_NIVEL.Alto.relleno, FONDO_MAPA)).toBeCloseTo(8.3397, 3);
    expect(contrastRatio(ESTILOS_NIVEL['Muy alto'].relleno, FONDO_MAPA)).toBeCloseTo(5.252, 3);
    expect(contrastRatio(ESTILO_NEUTRO.relleno, FONDO_MAPA)).toBeCloseTo(3.6574, 3);
  });
  it('la tinta y el borde del Estilo_Neutro frente a su relleno, con valores concretos', () => {
    expect(contrastRatio(ESTILO_NEUTRO.relleno, ESTILO_NEUTRO.tinta)).toBeCloseTo(5.7418, 3);
    expect(contrastRatio(ESTILO_NEUTRO.relleno, ESTILO_NEUTRO.borde)).toBeCloseTo(3.6574, 3);
  });
});

describe('Bordes frente a los rellenos vecinos (Requisito 18.10)', () => {
  // El trazo se centra sobre la arista compartida, así que parte de él cae sobre el relleno del vecino. El borde de cada estilo debe
  // contrastar 3:1 con el relleno de cualquier estilo que pueda tocarlo, incluido el suyo, sin depender del orden de pintado.
  const PARES = ESTILOS.flatMap(([nombreBorde, estiloBorde]) => ESTILOS.map(([nombreRelleno, estiloRelleno]) => [nombreBorde, nombreRelleno, estiloBorde, estiloRelleno] as const));
  it('son 25 pares: cada borde frente a cada relleno', () => {
    expect(PARES).toHaveLength(25);
  });
  it.each(PARES)('el borde de %s frente al relleno de %s cumple 3:1', (_borde, _relleno, estiloBorde, estiloRelleno) => {
    expect(contrastRatio(estiloBorde.borde, estiloRelleno.relleno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it('todos los estilos tienen el mismo borde negro, que es el color estructural del mapa', () => {
    for (const [nombre, estilo] of ESTILOS) expect(estilo.borde, nombre).toBe(COLORES_TELETEXTO.negro);
  });
  it('el peor de los 25 pares es el borde negro frente al relleno gris del Estilo_Neutro, con margen sobre 3:1', () => {
    const razones = PARES.map(([, , estiloBorde, estiloRelleno]) => contrastRatio(estiloBorde.borde, estiloRelleno.relleno));
    expect(Math.min(...razones)).toBeCloseTo(3.6574, 3);
    expect(Math.min(...razones)).toBeGreaterThan(ELEMENTO_3_A_1);
  });
  it('un borde blanco no serviría: no llega a 3:1 frente al verde, el amarillo ni el naranja', () => {
    for (const nivel of ['Bajo', 'Moderado', 'Alto'] as const) {
      expect(contrastRatio(COLORES_TELETEXTO.blanco, ESTILOS_NIVEL[nivel].relleno), nivel).toBeLessThan(ELEMENTO_3_A_1);
    }
  });
});

describe('Tinta del patrón: solo frente a su propio relleno', () => {
  // La tinta son las marcas del patrón y quedan dentro del relleno de su propio Departamento. Nunca tocan el relleno de un vecino, que
  // está separado por el borde. Por eso solo se exige 3:1 frente al relleno propio, y no frente a los de los otros estilos. La tinta
  // blanca del Estilo_Neutro no cumpliría 3:1 frente al amarillo, pero no se usa ahí.
  it.each(ESTILOS)('la tinta de %s cumple 3:1 frente a su propio relleno', (_nombre, estilo) => {
    expect(contrastRatio(estilo.tinta, estilo.relleno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
});

describe('Línea interior del Estilo_Neutro (Requisito 18.10 y design.md: trazo distinto)', () => {
  const linea = ESTILO_NEUTRO.lineaInterior ?? '';
  it('el Estilo_Neutro tiene línea interior cian y ningún nivel la tiene', () => {
    expect(ESTILO_NEUTRO.lineaInterior).toBe(COLORES_TELETEXTO.cian);
    for (const nivel of NIVELES_RIESGO) expect(ESTILOS_NIVEL[nivel].lineaInterior, nivel).toBeUndefined();
  });
  it('la línea interior frente al relleno gris cumple 3:1 (4.58)', () => {
    expect(contrastRatio(linea, ESTILO_NEUTRO.relleno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
    expect(contrastRatio(linea, ESTILO_NEUTRO.relleno)).toBeCloseTo(4.5793, 3);
  });
  it('la línea interior frente al borde negro cumple 3:1 (16.75)', () => {
    expect(contrastRatio(linea, ESTILO_NEUTRO.borde)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
    expect(contrastRatio(linea, ESTILO_NEUTRO.borde)).toBeCloseTo(16.748, 3);
  });
  it('la línea interior no reutiliza ningún color de nivel (relleno, tinta o borde de los cuatro niveles)', () => {
    const coloresDeNiveles = new Set(NIVELES_RIESGO.flatMap((nivel) => COLORES_DE(ESTILOS_NIVEL[nivel])));
    expect(coloresDeNiveles.has(linea)).toBe(false);
  });
  it('la línea interior no es el blanco ni el negro del foco, así que un neutro con foco se distingue de uno sin foco', () => {
    expect(linea).not.toBe(FOCO.linea);
    expect(linea).not.toBe(FOCO.contorno);
  });
  it('la línea interior es distinta de la tinta del neutro', () => {
    expect(linea).not.toBe(ESTILO_NEUTRO.tinta);
  });
});

describe('Diferenciación de los cinco estilos (Requisitos 4.3, 4.4 y 4.5)', () => {
  it('la escala aprobada es verde, amarillo, naranja y rojo', () => {
    expect(ESTILOS_NIVEL.Bajo.relleno).toBe('#00ff00');
    expect(ESTILOS_NIVEL.Moderado.relleno).toBe('#ffff00');
    expect(ESTILOS_NIVEL.Alto.relleno).toBe('#ff8000');
    expect(ESTILOS_NIVEL['Muy alto'].relleno).toBe('#ff0000');
  });
  it('los cinco rellenos son distintos', () => {
    expect(new Set(ESTILOS.map(([, estilo]) => estilo.relleno)).size).toBe(5);
  });
  it('los cinco patrones son distintos', () => {
    expect(new Set(ESTILOS.map(([, estilo]) => estilo.patron)).size).toBe(5);
  });
  it('cada nivel tiene un patrón propio, distinto del de los demás niveles', () => {
    const patrones = NIVELES_RIESGO.map((nivel) => ESTILOS_NIVEL[nivel].patron);
    expect(new Set(patrones).size).toBe(NIVELES_RIESGO.length);
  });
  it('el Estilo_Neutro no reutiliza ningún relleno ni ningún patrón de los cuatro niveles', () => {
    // El borde negro es el color estructural del mapa y lo comparten todos los estilos. La línea interior se prueba aparte.
    const rellenosDeNiveles = new Set(NIVELES_RIESGO.map((nivel) => ESTILOS_NIVEL[nivel].relleno));
    const patronesDeNiveles = new Set(NIVELES_RIESGO.map((nivel) => ESTILOS_NIVEL[nivel].patron));
    expect(rellenosDeNiveles.has(ESTILO_NEUTRO.relleno)).toBe(false);
    expect(patronesDeNiveles.has(ESTILO_NEUTRO.patron)).toBe(false);
  });
  it('el trazo del Estilo_Neutro se distingue del de los niveles por su línea interior, porque el borde negro es el mismo', () => {
    expect(ESTILO_NEUTRO.borde).toBe(ESTILOS_NIVEL.Bajo.borde);
    expect(ESTILO_NEUTRO.lineaInterior).toBeDefined();
    for (const nivel of NIVELES_RIESGO) expect(ESTILOS_NIVEL[nivel].lineaInterior, nivel).toBeUndefined();
  });
  it('los rellenos de los cuatro niveles son colores cromáticos, no grises', () => {
    for (const nivel of NIVELES_RIESGO) {
      const relleno = ESTILOS_NIVEL[nivel].relleno;
      const canales = [relleno.slice(1, 3), relleno.slice(3, 5), relleno.slice(5, 7)];
      expect(new Set(canales).size, nivel).toBeGreaterThan(1);
    }
  });
});

describe('Mapeo de nivel a estilo (Requisito 4.5 y regla 7 de product.md)', () => {
  it('el mapa de estilos tiene exactamente los cuatro niveles del modelo', () => {
    expect(Object.keys(ESTILOS_NIVEL).sort()).toEqual([...NIVELES_RIESGO].sort());
  });
  it.each(NIVELES_RIESGO.map((nivel) => [nivel] as const))('el nivel %s devuelve su propio estilo y nunca el neutro', (nivel) => {
    expect(estiloDeNivel(nivel)).toBe(ESTILOS_NIVEL[nivel]);
    expect(estiloDeNivel(nivel)).not.toBe(ESTILO_NEUTRO);
  });
  it('sin alertas vigentes (nivel null) se aplica el Estilo_Neutro', () => {
    expect(estiloDeNivel(null)).toBe(ESTILO_NEUTRO);
  });
  it.each([
    ['nivel inexistente', 'Crítico'],
    ['nivel con otra capitalización', 'bajo'],
    ['nivel con espacios', ' Bajo'],
    ['cadena vacía', ''],
    ['undefined', undefined],
    ['número', 2],
    ['objeto', {}],
    ['propiedad heredada', 'toString'],
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
  ])('un valor que no es un nivel (%s) recibe el Estilo_Neutro y nunca un color de riesgo', (_etiqueta, valor) => {
    expect(estiloDeNivel(valor as NivelRiesgo)).toBe(ESTILO_NEUTRO);
  });
  it('ningún nivel tiene el estilo del Estilo_Neutro y el neutro no es ninguno de los niveles', () => {
    for (const nivel of NIVELES_RIESGO) expect(ESTILOS_NIVEL[nivel]).not.toBe(ESTILO_NEUTRO);
    expect(Object.values(ESTILOS_NIVEL)).not.toContain(ESTILO_NEUTRO);
  });
});

describe('Foco de dos tonos (Requisitos 4.10 y 18.3)', () => {
  it('es una línea blanca con un contorno negro, de al menos 2 px', () => {
    expect(FOCO.linea).toBe(COLORES_TELETEXTO.blanco);
    expect(FOCO.contorno).toBe(COLORES_TELETEXTO.negro);
    expect(GROSOR_MINIMO_FOCO_PX).toBe(2);
    expect(FOCO.grosorLineaPx).toBeGreaterThanOrEqual(GROSOR_MINIMO_FOCO_PX);
    expect(FOCO.grosorContornoPx).toBeGreaterThanOrEqual(GROSOR_MINIMO_FOCO_PX);
  });
  it('la línea frente al contorno cumple 3:1', () => {
    expect(contrastRatio(FOCO.linea, FOCO.contorno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
    expect(contrastRatio(FOCO.linea, FOCO.contorno)).toBeCloseTo(21, 9);
  });
  it.each(ESTILOS)('el contorno del foco frente al relleno de %s cumple 3:1', (_nombre, estilo) => {
    expect(contrastRatio(FOCO.contorno, estilo.relleno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it('la línea blanca sola no basta frente al relleno amarillo: por eso lleva el contorno negro', () => {
    expect(contrastRatio(FOCO.linea, ESTILOS_NIVEL.Moderado.relleno)).toBeLessThan(ELEMENTO_3_A_1);
    expect(contrastRatio(FOCO.contorno, ESTILOS_NIVEL.Moderado.relleno)).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
  });
  it('frente a cada fondo de texto al menos uno de los dos tonos cumple 3:1', () => {
    for (const { fondo } of COMBINACIONES_TEXTO) {
      const mejor = Math.max(contrastRatio(FOCO.linea, fondo), contrastRatio(FOCO.contorno, fondo));
      expect(mejor, fondo).toBeGreaterThanOrEqual(ELEMENTO_3_A_1);
    }
  });
  it('un solo color de foco no basta: no hay ningún color de la paleta a 3:1 de todos los rellenos y del fondo negro', () => {
    const candidatos = [...Object.values(COLORES_TELETEXTO), COLOR_NARANJA, COLOR_GRIS_NEUTRO];
    const contra = [...ESTILOS.map(([, estilo]) => estilo.relleno), FONDO_MAPA];
    const sirven = candidatos.filter((candidato) => contra.every((otro) => contrastRatio(candidato, otro) >= ELEMENTO_3_A_1));
    expect(sirven).toEqual([]);
  });
});

describe('Correspondencia con styles.css', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const variables = new Map<string, string>();
  for (const coincidencia of css.matchAll(/--([a-z]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    const [, nombre, valor] = coincidencia;
    if (nombre !== undefined && valor !== undefined) variables.set(nombre, valor.toLowerCase());
  }
  it.each(Object.entries(COLORES_TELETEXTO))('la variable --%s de styles.css vale %s', (nombre, valor) => {
    expect(variables.get(nombre), nombre).toBe(valor);
  });
  it('los colores de texto y fondo del cuerpo, la cabecera y el título de styles.css cumplen 7:1', () => {
    for (const [texto, fondo] of [
      ['blanco', 'negro'],
      ['blanco', 'azul'],
      ['amarillo', 'negro'],
    ] as const) {
      const t = variables.get(texto);
      const f = variables.get(fondo);
      expect(t, texto).toBeDefined();
      expect(f, fondo).toBeDefined();
      expect(contrastRatio(t ?? '', f ?? ''), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(TEXTO_7_A_1);
    }
  });
});

describe('Pureza del módulo', () => {
  const fuente = readFileSync(new URL('./paleta.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  it('no usa DOM, red, almacenamiento, reloj, temporizadores ni azar', () => {
    for (const prohibido of [
      'window', 'document', 'navigator', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'Date', 'performance', 'setTimeout',
      'setInterval', 'requestAnimationFrame', 'Math.random', 'console',
    ]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });
  it('solo importa tipos de @teletexto/modelo', () => {
    const importaciones = [...fuente.matchAll(/^import\s+(type\s+)?[^;]*from\s+'([^']+)'/gm)].map((m) => [m[1]?.trim(), m[2]]);
    expect(importaciones).toEqual([['type', '@teletexto/modelo']]);
  });
});
