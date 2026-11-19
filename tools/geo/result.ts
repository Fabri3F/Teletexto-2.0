// Resultado tipado de las operaciones de tools/geo que pueden fallar de forma esperada (tech.md,
// "Convenciones de código"). Los errores son mensajes en español, pensados para el Equipo.

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly errores: string[] };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function fallo<T = never>(errores: string | readonly string[]): Resultado<T> {
  return { ok: false, errores: typeof errores === 'string' ? [errores] : [...errores] };
}
