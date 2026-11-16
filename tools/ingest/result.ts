// Resultado tipado de las operaciones que pueden fallar de forma esperada (tech.md, "Convenciones
// de código"): los errores esperados se devuelven, no se lanzan como excepciones sueltas.

export type Result<T, E> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(valor: T): Result<T, never> {
  return { ok: true, valor };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
