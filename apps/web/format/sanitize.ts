// Escape de texto externo del cliente (tarea 4.1). Requisito 15.6.
//
// Nunca se inserta HTML de las fuentes en el DOM y no se usa `innerHTML`.
//
// IMPORTANTE: NO se aplica a texto ni a atributos que renderiza Preact. Preact ya escapa los hijos de texto y los valores
// de los atributos; si además se pasaran por `escapeText`, el usuario vería literalmente `&lt;` en lugar de `<`.
// `escapeText` es para los destinos que no escapa Preact y donde un texto externo termina dentro de una cadena que puede
// interpretarse como HTML, por ejemplo un mensaje de registro, una cadena de marcado construida a mano o un texto que se
// entrega a otra API que lo interprete como HTML.

/**
 * Escapa los caracteres con significado en HTML: `&`, `<`, `>`, comilla doble y comilla simple, en ese orden (el `&` va
 * primero para no escapar dos veces los que añaden los demás). No es idempotente: escapar un texto ya escapado lo escapa
 * de nuevo, y es lo correcto porque el texto original puede contener `&amp;` de verdad.
 */
export function escapeText(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
