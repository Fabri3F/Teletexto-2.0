// Búfer de entrada de dígitos del cliente (tarea 4.6, parte 3). Requisitos 5.9, 5.10, 6.7 y 6.8.
//
// Máquina de estados pura e inmutable: el usuario digita hasta tres dígitos y, al tercero, se emite una solicitud con el
// número formado. Con uno o dos dígitos la pantalla los muestra con marcadores en los que faltan (Requisito 5.9). Cancelar o
// dejar pasar 5 s sin un dígito nuevo descarta lo ingresado (Requisito 5.10).
//
// El tiempo entra siempre como argumento, en milisegundos. Este módulo no lee el reloj, no programa temporizadores y no usa
// ninguna API del navegador: el componente que lo use llama a `tick` cuando le toque con el instante de su reloj inyectado.

/** Milisegundos sin un dígito nuevo tras los cuales se descarta lo ingresado (Requisito 5.10). */
export const PLAZO_ENTRADA_MS = 5000;

/** Cantidad de dígitos de un Número_de_Página. */
const DIGITOS_DE_UNA_PAGINA = 3;

/** Estado del búfer: los dígitos ingresados y el instante del último, en milisegundos. Vacío: `''` y `null`. */
export interface EstadoEntrada {
  readonly digitos: string;
  readonly ultimoEn: number | null;
}

/** Resultado de `push`: el estado nuevo y, solo al completar el tercer dígito, el número formado. */
export interface ResultadoPush {
  readonly estado: EstadoEntrada;
  /**
   * Número formado por los tres dígitos, emitido exactamente una vez al completarlos. Con ceros iniciales es menor que 100
   * (`012` es 12): no se descarta aquí, porque decidir que "no existe" es de la resolución del router.
   */
  readonly solicitud: number | undefined;
}

const crear = (digitos: string, ultimoEn: number | null): EstadoEntrada => Object.freeze({ digitos, ultimoEn });

/** Búfer sin dígitos. */
export const entradaVacia: EstadoEntrada = crear('', null);

/** Verdadero solo para un texto de un único carácter entre `0` y `9` (ASCII). Un número, `'10'` o `' 1'` no lo son. */
const esDigito = (valor: unknown): valor is string => typeof valor === 'string' && /^[0-9]$/.test(valor);

const esInstante = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);

/**
 * Verdadero si hay dígitos y ya pasaron 5000 ms o más desde el último, o si el reloj retrocedió respecto del último instante
 * registrado (en ese caso no se puede saber cuánto pasó, y dejar el búfer atascado sería peor que descartarlo).
 */
function haExpirado(estado: EstadoEntrada, ahora: number): boolean {
  if (estado.digitos === '' || estado.ultimoEn === null) return false;
  return ahora < estado.ultimoEn || ahora - estado.ultimoEn >= PLAZO_ENTRADA_MS;
}

/**
 * Añade un dígito. Si el búfer había expirado, descarta lo anterior y empieza una entrada nueva con este dígito. Con el
 * tercer dígito devuelve la solicitud con el número formado y el búfer vuelve a vacío.
 *
 * Si `digit` no es un único carácter de `0` a `9`, o `ahora` no es un número finito, no cambia nada: devuelve el mismo
 * estado y ninguna solicitud.
 */
export function push(estado: EstadoEntrada, digit: string, ahora: number): ResultadoPush {
  if (!esDigito(digit) || !esInstante(ahora)) return { estado, solicitud: undefined };
  const base = haExpirado(estado, ahora) ? entradaVacia : estado;
  const digitos = base.digitos + digit;
  if (digitos.length >= DIGITOS_DE_UNA_PAGINA) return { estado: entradaVacia, solicitud: Number(digitos) };
  return { estado: crear(digitos, ahora), solicitud: undefined };
}

/** Descarta lo ingresado (Requisito 5.10). */
export function cancel(_estado: EstadoEntrada): EstadoEntrada {
  return entradaVacia;
}

/**
 * Comprueba el plazo: devuelve el búfer vacío si pasaron 5000 ms o más desde el último dígito o si el reloj retrocedió, y el
 * mismo estado en otro caso (también si `ahora` no es un número finito, porque entonces no se puede decidir).
 */
export function tick(estado: EstadoEntrada, ahora: number): EstadoEntrada {
  if (!esInstante(ahora)) return estado;
  return haExpirado(estado, ahora) ? entradaVacia : estado;
}

/**
 * Texto de los dígitos ingresados, con un marcador `_` en cada posición que falta y separados por espacios: `"1 _ _"` con un
 * dígito y `"1 2 _"` con dos. Con el búfer vacío devuelve `""`: entonces la vista muestra el número de la página actual.
 */
export function display(estado: EstadoEntrada): string {
  if (estado.digitos === '') return '';
  const posiciones = Array.from({ length: DIGITOS_DE_UNA_PAGINA }, (_, i) => estado.digitos[i] ?? '_');
  return posiciones.join(' ');
}
