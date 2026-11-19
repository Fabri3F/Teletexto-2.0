// Declaración mínima de la API programática de Mapshaper (el paquete no incluye tipos de TypeScript).
// Solo se declara lo que usa tools/geo: `applyCommands`.

declare module 'mapshaper' {
  /** Archivos de entrada, por nombre. Los textos y los bytes se tratan como el contenido del archivo. */
  type Entrada = Record<string, string | Uint8Array>;
  /** Archivos de salida, por nombre. */
  type Salida = Record<string, string | Uint8Array>;

  interface Mapshaper {
    /** Ejecuta comandos de Mapshaper en memoria, sin tocar el disco. */
    applyCommands(comandos: string, entrada?: Entrada): Promise<Salida>;
  }

  const mapshaper: Mapshaper;
  export default mapshaper;
}
