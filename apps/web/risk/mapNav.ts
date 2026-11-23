// Navegación entre Departamentos del mapa con teclado y control remoto (tarea 5.14). Requisitos 4.10, 6.2 y 6.6.
//
// Lógica pura: solo usa los códigos y los centroides de la geometría. No lee el DOM, el teclado, el reloj ni la red. Traducir
// una tecla a una `DireccionMapa` y mover el foco visible es del componente `MapaRiesgos` (tarea 12.1).
//
// Los datos vienen de la red o de la Caché_Local y el cliente no los valida con el esquema, así que las funciones no confían en
// su forma: ignoran las entradas con código inválido o repetido y nunca lanzan errores. Un Departamento con código válido
// siempre está en `ordenRecorrido`, aunque su centroide sea inválido: Tab no necesita coordenadas. Ese Departamento solo queda
// fuera de la navegación espacial: no es candidato de `mover` y, si es el actual, `mover` usa el avance de respaldo.
//
// Los centroides están en unidades del `viewBox` de la geometría. El eje y crece hacia abajo: "arriba" es y menor.
//
// Garantías numéricas. El criterio se evalúa en números de doble precisión (IEEE-754). Cada desvío se redondea (error relativo
// de hasta 2⁻⁵³) y el coste añade tres redondeos, así que el coste calculado difiere del exacto en menos de unas 4.5e-16 veces
// su valor. Dos candidatos cuyos costes exactos difieren menos de 2⁻⁵⁰ en proporción pueden ordenarse distinto que en aritmética
// exacta, y los empates se deciden por la igualdad de los costes calculados: gana el primero según `ordenRecorrido`. Un término
// menor que 2⁻⁵³ veces el coste se absorbe en la suma, como en cualquier suma de dobles. La normalización por potencias de dos y
// las mitades no añaden ningún error de redondeo con coordenadas normales: equivalen a evaluar la fórmula con rango de exponentes
// ilimitado. Ver `normalizar` y `masCercano`.
import { CODIGOS_DEPARTAMENTO, type CodigoDepartamento, type DepartamentoGeometria } from '@teletexto/modelo';

/** Dirección de una tecla direccional o del control remoto. */
export type DireccionMapa = 'arriba' | 'abajo' | 'izquierda' | 'derecha';
/** Lo único que la navegación necesita de la geometría. Una `Geometria` completa también sirve. */
export type GeometriaNavegable = {
  readonly departamentos: readonly Pick<DepartamentoGeometria, 'codigo' | 'centroide'>[];
};

/** Peso del desvío lateral en el coste de un candidato: coste = axial² + 4 × lateral². */
const PESO_LATERAL = 4;
// Potencias de dos exactas, calculadas con operaciones que no pierden precisión (sin depender de `Math.pow`).
const DOS_32 = 4_294_967_296;
const DOS_64 = DOS_32 * DOS_32;
const DOS_MENOS_64 = 1 / DOS_64;
/**
 * Un desvío desbordado (|desvío| mayor o igual que 2¹⁰²⁴ − 2⁹⁷⁰, más que `Number.MAX_VALUE`) da un coste mayor que
 * `MAX_VALUE²`. Un candidato con todos los desvíos finitos y `max(axial, |lateral|) <= MAX_VALUE / 3` cuesta como máximo
 * `5 × (MAX_VALUE / 3)²`, menos que `MAX_VALUE²`: ningún candidato con un desvío desbordado puede ganarle.
 */
const UMBRAL_ORDINARIO = Number.MAX_VALUE / 3;

interface Posicion {
  readonly x: number;
  readonly y: number;
}
/** Un Departamento del recorrido. `posicion` falta si su centroide no es un par de números finitos. */
interface Entrada {
  readonly codigo: CodigoDepartamento;
  readonly posicion: Posicion | undefined;
}
interface Eje {
  /** `true` si la dirección es horizontal (el eje axial es x). */
  readonly horizontal: boolean;
  /** `1` si la dirección avanza hacia coordenadas mayores (derecha, abajo) y `-1` si va hacia las menores. */
  readonly signo: 1 | -1;
}
/** Candidato estricto en la dirección pedida, con su desvío axial (en la dirección) y lateral (perpendicular). */
interface Candidato {
  readonly codigo: CodigoDepartamento;
  readonly posicion: Posicion;
  axial: number;
  lateral: number;
}

function ejeDe(direccion: unknown): Eje | undefined {
  switch (direccion) {
    case 'derecha':
      return { horizontal: true, signo: 1 };
    case 'izquierda':
      return { horizontal: true, signo: -1 };
    case 'abajo':
      return { horizontal: false, signo: 1 };
    case 'arriba':
      return { horizontal: false, signo: -1 };
    default:
      return undefined;
  }
}

function coordenadaValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function posicionDe(centroide: unknown): Posicion | undefined {
  if (!Array.isArray(centroide) || centroide.length !== 2) return undefined;
  const [x, y] = centroide as unknown[];
  return coordenadaValida(x) && coordenadaValida(y) ? { x, y } : undefined;
}

/**
 * Departamentos del recorrido, en el orden canónico de `CODIGOS_DEPARTAMENTO`. Se ignoran las entradas con código fuera de ese
 * conjunto y las repetidas (vale la primera aparición). El centroide no decide si un Departamento entra: si es inválido, la
 * entrada queda sin posición.
 */
function entradasValidas(geometria: GeometriaNavegable): Entrada[] {
  const lista: unknown = (geometria as { departamentos?: unknown } | null | undefined)?.departamentos;
  if (!Array.isArray(lista)) return [];
  const porCodigo = new Map<string, Posicion | undefined>();
  for (const entrada of lista as unknown[]) {
    if (typeof entrada !== 'object' || entrada === null) continue;
    const { codigo, centroide } = entrada as { codigo?: unknown; centroide?: unknown };
    if (typeof codigo !== 'string' || porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, posicionDe(centroide));
  }
  const entradas: Entrada[] = [];
  for (const codigo of CODIGOS_DEPARTAMENTO) {
    if (porCodigo.has(codigo)) entradas.push({ codigo, posicion: porCodigo.get(codigo) });
  }
  return entradas;
}

/**
 * Desvío de `posicion` respecto de `origen`. `escala` es 1 o 0.5. Con 1 el cálculo es la resta directa. Con 0.5 las coordenadas se
 * reducen a la mitad antes de restar, y las mitades son exactas salvo en coordenadas subnormales con un número impar de unidades.
 * Con 0.5 el resultado nunca desborda, porque |x/2 − y/2| es como máximo `Number.MAX_VALUE`.
 */
function desvioDe(origen: Posicion, posicion: Posicion, eje: Eje, escala: number): { axial: number; lateral: number } {
  const dx = posicion.x * escala - origen.x * escala;
  const dy = posicion.y * escala - origen.y * escala;
  return { axial: eje.signo * (eje.horizontal ? dx : dy), lateral: eje.horizontal ? dy : dx };
}

/**
 * Candidatos estrictos en la dirección pedida, con los desvíos de la resta directa. La candidatura se decide aquí, con el signo
 * del desvío axial, que es correcto aunque el desvío desborde (`Infinity`). Una entrada que no es candidata no influye en nada,
 * aunque alguno de sus desvíos desborde.
 */
function candidatosEn(origen: Posicion, entradas: readonly Entrada[], indiceActual: number, eje: Eje): Candidato[] {
  const lista: Candidato[] = [];
  for (const [indice, entrada] of entradas.entries()) {
    const posicion = entrada.posicion;
    if (indice === indiceActual || posicion === undefined) continue;
    const { axial, lateral } = desvioDe(origen, posicion, eje, 1);
    if (axial > 0) lista.push({ codigo: entrada.codigo, posicion, axial, lateral });
  }
  return lista;
}

function esOrdinario(candidato: Candidato): boolean {
  return Number.isFinite(candidato.axial) && Number.isFinite(candidato.lateral);
}

/** Menor `max(axial, |lateral|)` entre los candidatos, o `Infinity` si no hay ninguno. */
function menorMagnitud(candidatos: readonly Candidato[]): number {
  let menor = Infinity;
  for (const candidato of candidatos) menor = Math.min(menor, Math.max(candidato.axial, Math.abs(candidato.lateral)));
  return menor;
}

function reescalar(candidatos: readonly Candidato[], factor: number): void {
  for (const candidato of candidatos) {
    candidato.axial *= factor;
    candidato.lateral *= factor;
  }
}

/**
 * Multiplica todos los desvíos (finitos) por potencias exactas de 2⁶⁴ o 2⁻⁶⁴ hasta que el menor `max(axial, |lateral|)` quede en
 * [2⁻⁶⁴, 2⁶⁴). El coste es homogéneo de grado 2 y multiplicar por una potencia de dos no añade error de redondeo (mientras el
 * resultado sea normal), así que la comparación de costes, incluidos los empates, es la misma que con rango de exponentes
 * ilimitado. El candidato ganador cumple m² ≤ coste ≤ 5·m² y m ≤ √5 veces ese mínimo, así que su coste normalizado queda entre
 * 2⁻¹²⁸ y 25·2¹²⁸: no se desborda ni se anula. Los candidatos muy lejanos pueden dar `Infinity` y no pueden ganar. Un componente
 * que se subdesborda al reducir es menor que 2⁻⁵³ veces el coste y se absorbe igual que sin normalizar. Con coordenadas de mapa
 * normales no hace ninguna multiplicación.
 */
function normalizar(candidatos: readonly Candidato[]): void {
  let menor = menorMagnitud(candidatos);
  // No ocurre: los desvíos son finitos y `menor` es positivo. En el nivel 1 porque el axial de cada ordinario es positivo. En el
  // nivel 2 porque cada candidato tiene un componente de al menos `MAX_VALUE / 6` tras las mitades (el axial puede ser 0).
  if (!(menor > 0) || !Number.isFinite(menor)) return;
  while (menor >= DOS_64) {
    menor *= DOS_MENOS_64;
    reescalar(candidatos, DOS_MENOS_64);
  }
  while (menor < DOS_MENOS_64) {
    menor *= DOS_64;
    reescalar(candidatos, DOS_64);
  }
}

/** Candidato de menor coste `axial² + 4 × lateral²` entre los dados, con desvíos finitos. Gana el primero en un empate. */
function elegirMinimo(candidatos: readonly Candidato[]): CodigoDepartamento | undefined {
  normalizar(candidatos);
  let mejor: Candidato | undefined;
  let mejorCoste = 0;
  for (const candidato of candidatos) {
    const coste = candidato.axial * candidato.axial + PESO_LATERAL * candidato.lateral * candidato.lateral;
    if (mejor === undefined || coste < mejorCoste) {
      mejor = candidato;
      mejorCoste = coste;
    }
  }
  return mejor?.codigo;
}

/**
 * Departamento de menor coste en la dirección dada, o `undefined` si no hay candidatos. Se evalúa por niveles:
 * 1. Los candidatos con todos los desvíos finitos (ordinarios) se comparan con la resta directa, sin mitades. Si alguno cumple
 *    `max(axial, |lateral|) <= MAX_VALUE / 3`, ningún candidato con un desvío desbordado puede ganar (su coste supera
 *    `MAX_VALUE²`), así que se ignoran. Es el caso de cualquier geometría normal, y no cambia ningún cálculo.
 * 2. Si no, todos los costes superan `(MAX_VALUE / 3)²` y los componentes subnormales (menores que 2⁻¹⁰²¹) quedan absorbidos
 *    en la suma. Entonces se comparan todos los candidatos con las coordenadas a la mitad, lo que evita el desbordamiento. La
 *    candidatura ya se decidió en el primer paso, así que un desvío axial subnormal que se redondee a 0 no elimina a nadie.
 */
function masCercano(origen: Posicion, entradas: readonly Entrada[], indiceActual: number, eje: Eje): CodigoDepartamento | undefined {
  const candidatos = candidatosEn(origen, entradas, indiceActual, eje);
  if (candidatos.length === 0) return undefined;
  const ordinarios = candidatos.filter(esOrdinario);
  if (menorMagnitud(ordinarios) <= UMBRAL_ORDINARIO) return elegirMinimo(ordinarios);
  const mitades = candidatos.map((candidato) => ({ ...candidato, ...desvioDe(origen, candidato.posicion, eje, 0.5) }));
  return elegirMinimo(mitades);
}

/**
 * Orden en que Tab recorre los Departamentos (Requisito 4.10): los códigos válidos y únicos de la geometría, en el orden de
 * `CODIGOS_DEPARTAMENTO`, sin importar el orden de entrada ni si sus centroides son válidos. Para un código repetido vale la
 * primera aparición. Con los 25 Departamentos es una permutación de los 25 códigos. Devuelve un arreglo nuevo y no modifica la
 * geometría.
 */
export function ordenRecorrido(geometria: GeometriaNavegable): CodigoDepartamento[] {
  return entradasValidas(geometria).map((entrada) => entrada.codigo);
}

/**
 * Departamento al que se llega desde `actual` con una tecla direccional (Requisitos 4.10, 6.2 y 6.6).
 * 1. Entre los demás Departamentos con centroide finito, solo son candidatos los que están estrictamente en esa dirección.
 *    Gana el de menor coste `axial² + 4 × lateral²`, donde `axial` es la distancia en la dirección pedida y `lateral` el
 *    desvío perpendicular. En un empate gana el primero según `ordenRecorrido`. El cálculo no se desborda con coordenadas
 *    finitas enormes ni se anula con diferencias minúsculas. Las garantías numéricas exactas (error de redondeo de los dobles,
 *    empates) están en la cabecera de este archivo.
 * 2. Si no hay candidatos, o si el centroide de `actual` es inválido, avanza de respaldo por `ordenRecorrido`, de forma
 *    circular: derecha y abajo van al siguiente; izquierda y arriba, al anterior.
 * Si la dirección no es válida, devuelve `actual`. Si no hay Departamentos en el orden, devuelve `actual`. Si `actual` no está en
 * el orden, devuelve el primero de `ordenRecorrido`.
 *
 * Limitación conocida: con una geometría arbitraria, las flechas solas no garantizan llegar a los 25 Departamentos. El respaldo
 * circular solo actúa cuando no hay candidatos. Lo que sí está garantizado es que Tab y el respaldo recorren los 25. Con la
 * geometría real se comprueba en las pruebas que desde cualquier Departamento las flechas llegan a todos.
 */
export function mover(geometria: GeometriaNavegable, actual: CodigoDepartamento, direccion: DireccionMapa): CodigoDepartamento {
  const eje = ejeDe(direccion);
  if (eje === undefined) return actual;
  const entradas = entradasValidas(geometria);
  const primera = entradas[0];
  if (primera === undefined) return actual;
  const indiceActual = entradas.findIndex((entrada) => entrada.codigo === actual);
  const origen = entradas[indiceActual];
  if (origen === undefined) return primera.codigo;

  const respaldo = (): CodigoDepartamento => (entradas[(indiceActual + eje.signo + entradas.length) % entradas.length] ?? origen).codigo;
  if (origen.posicion === undefined) return respaldo();
  return masCercano(origen.posicion, entradas, indiceActual, eje) ?? respaldo();
}
