// Anillos proyectados: redondeo a un decimal, validez, ruta SVG y centroide. Todo en enteros (décimas).

import type { Anillo, Poligono } from './geojson.ts';
import { aDecimas, textoDecimas, type PuntoDecimas } from './proyeccion.ts';

/** Anillo proyectado y redondeado: sin punto de cierre y sin vértices consecutivos repetidos. */
export type AnilloDecimas = readonly PuntoDecimas[];

/**
 * Proyecta un anillo cerrado, lo redondea a un decimal y quita los vértices que quedan repetidos al redondear.
 * El punto que cierra el anillo se descarta: la ruta se cierra con `Z`.
 */
export function redondearAnillo(anillo: Anillo, proyectar: (p: readonly [number, number]) => [number, number]): AnilloDecimas {
  const puntos: PuntoDecimas[] = [];
  for (const posicion of anillo) {
    const [x, y] = proyectar(posicion);
    const punto: PuntoDecimas = [aDecimas(x), aDecimas(y)];
    const anterior = puntos[puntos.length - 1];
    if (anterior === undefined || anterior[0] !== punto[0] || anterior[1] !== punto[1]) puntos.push(punto);
  }
  // El anillo de entrada es cerrado: tras redondear, el último punto repite al primero.
  while (puntos.length > 1) {
    const primero = puntos[0] as PuntoDecimas;
    const ultimo = puntos[puntos.length - 1] as PuntoDecimas;
    if (primero[0] === ultimo[0] && primero[1] === ultimo[1]) puntos.pop();
    else break;
  }
  return puntos;
}

/** Dos veces el área con signo del anillo, en décimas al cuadrado (entero exacto). */
export function areaDoble(anillo: AnilloDecimas): number {
  let suma = 0;
  for (let i = 0; i < anillo.length; i++) {
    const a = anillo[i] as PuntoDecimas;
    const b = anillo[(i + 1) % anillo.length] as PuntoDecimas;
    suma += a[0] * b[1] - b[0] * a[1];
  }
  return suma;
}

/**
 * Motivo por el que un anillo ya redondeado no se puede dibujar, o `undefined` si es válido.
 * Un anillo necesita al menos 3 vértices distintos y un área distinta de cero.
 */
export function motivoInvalido(anillo: AnilloDecimas): string | undefined {
  const distintos = new Set(anillo.map(([x, y]) => `${x},${y}`)).size;
  if (distintos < 3) return `se reduce a ${distintos} punto(s) distinto(s) al redondear a un decimal`;
  if (areaDoble(anillo) === 0) return 'su área es cero al redondear a un decimal';
  return undefined;
}

/** Número de una ruta relativa con el mínimo de caracteres: "0.5" se escribe ".5" y "-0.5" se escribe "-.5". */
function textoRelativo(decimas: number): string {
  const texto = textoDecimas(decimas);
  if (texto.startsWith('0.')) return texto.slice(1);
  if (texto.startsWith('-0.')) return `-${texto.slice(2)}`;
  return texto;
}

/**
 * Ruta SVG relativa y compacta de las partes de un Departamento (decisión del Equipo, tarea 3.2): una subruta
 * `m dx dy dx dy ... z` por parte. Tras `m`, cada par adicional es un `l` relativo implícito. El primer `m` parte de (0, 0),
 * así que es absoluto. Cada `m` siguiente es relativo al INICIO de la subruta anterior, porque `z` devuelve el punto actual
 * a ese inicio. Los números se separan con un espacio salvo cuando el siguiente es negativo (el signo ya separa).
 * Las coordenadas son enteros en décimas, así que la ruta lleva como máximo un decimal.
 */
export function rutaRelativa(anillos: readonly AnilloDecimas[]): string {
  let ruta = '';
  let inicio: PuntoDecimas = [0, 0];
  for (const anillo of anillos) {
    const primero = anillo[0] as PuntoDecimas;
    const numeros = [primero[0] - inicio[0], primero[1] - inicio[1]];
    for (let i = 1; i < anillo.length; i++) {
      const anterior = anillo[i - 1] as PuntoDecimas;
      const actual = anillo[i] as PuntoDecimas;
      numeros.push(actual[0] - anterior[0], actual[1] - anterior[1]);
    }
    let texto = '';
    for (const numero of numeros) {
      const t = textoRelativo(numero);
      texto += texto === '' || t.startsWith('-') ? t : ` ${t}`;
    }
    ruta += `m${texto}z`;
    inicio = primero;
  }
  return ruta;
}

/**
 * Lee una ruta escrita por `rutaRelativa` y devuelve los anillos en décimas. Sirve para comprobar, antes de escribir el
 * archivo, que la ruta dice exactamente lo que se quiso dibujar. Solo admite el formato que produce `rutaRelativa`:
 * devuelve `undefined` ante cualquier otra cosa.
 */
export function anillosDeRutaRelativa(ruta: string): AnilloDecimas[] | undefined {
  if (ruta === '') return [];
  if (!/^(?:m[-\d. ]+z)+$/.test(ruta)) return undefined;
  const anillos: AnilloDecimas[] = [];
  let inicio: PuntoDecimas = [0, 0];
  for (const subruta of ruta.split('z').slice(0, -1)) {
    const numeros = (subruta.slice(1).match(/-?\d*\.?\d+/g) ?? []).map((t) => Math.round(Number(t) * 10));
    if (numeros.length < 2 || numeros.length % 2 !== 0) return undefined;
    const puntos: PuntoDecimas[] = [[inicio[0] + (numeros[0] as number), inicio[1] + (numeros[1] as number)]];
    for (let i = 2; i < numeros.length; i += 2) {
      const anterior = puntos[puntos.length - 1] as PuntoDecimas;
      puntos.push([anterior[0] + (numeros[i] as number), anterior[1] + (numeros[i + 1] as number)]);
    }
    anillos.push(puntos);
    inicio = puntos[0] as PuntoDecimas;
  }
  return anillos;
}

/** Un polígono proyectado: el anillo exterior primero y después sus huecos. Los anillos inválidos van como `undefined`. */
export type PoligonoDecimas = readonly (AnilloDecimas | undefined)[];

/**
 * Centroide de una unidad, ponderado por área, en décimas (enteros): suma las partes exteriores y resta los huecos.
 * Cada anillo cuenta como exterior o hueco según su posición en el polígono (el primero es el exterior), no según
 * su orientación. Devuelve `undefined` si el área total no es positiva.
 */
export function centroideDecimas(poligonos: readonly PoligonoDecimas[]): PuntoDecimas | undefined {
  let area = 0;
  let momentoX = 0;
  let momentoY = 0;
  for (const poligono of poligonos) {
    poligono.forEach((anillo, indice) => {
      if (anillo === undefined) return;
      const a2 = areaDoble(anillo);
      if (a2 === 0) return;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < anillo.length; i++) {
        const p = anillo[i] as PuntoDecimas;
        const q = anillo[(i + 1) % anillo.length] as PuntoDecimas;
        const cruz = p[0] * q[1] - q[0] * p[1];
        sx += (p[0] + q[0]) * cruz;
        sy += (p[1] + q[1]) * cruz;
      }
      // Con a2 con signo: area_anillo = a2/2 y area_anillo × centroide_anillo = suma/6. El factor deja siempre
      // positiva el área de un exterior y negativa la de un hueco, sin importar la orientación del anillo.
      const factor = (indice === 0 ? 1 : -1) * (a2 < 0 ? -1 : 1);
      area += (factor * a2) / 2;
      momentoX += (factor * sx) / 6;
      momentoY += (factor * sy) / 6;
    });
  }
  if (!(area > 0)) return undefined;
  return [aDecimas(momentoX / area / 10), aDecimas(momentoY / area / 10)];
}

/** Proyecta y redondea todos los anillos de los polígonos de una unidad. */
export function redondearPoligonos(
  poligonos: readonly Poligono[],
  proyectar: (p: readonly [number, number]) => [number, number],
): AnilloDecimas[][] {
  return poligonos.map((poligono) => poligono.map((anillo) => redondearAnillo(anillo, proyectar)));
}
