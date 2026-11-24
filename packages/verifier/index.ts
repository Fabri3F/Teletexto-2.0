// Verificador determinista de resúmenes (tarea 10.1). Sin red, sin modelos de lenguaje y sin dependencias de ejecución.
export { contieneMarcadoresDeInstruccion, extraerCriticos, normalizarTexto } from './criticos.ts';
export type { DatoCritico, TipoDato } from './criticos.ts';
export { LUGARES } from './lugares.ts';
export type { LugarCatalogo } from './lugares.ts';
export {
  MAX_CARACTERES_AVISO,
  MAX_CARACTERES_RESUMEN,
  PLAZO_VERIFICACION_MS,
  verificar,
} from './verificar.ts';
export type { AvisoVerificable, DependenciasVerificacion, MotivoRechazo } from './verificar.ts';
export {
  MAX_CARACTERES_MOTIVO,
  MOTIVO_NO_DISPONIBLE,
  acotarMotivo,
  formatearUtcSegundos,
  registrarVerificacion,
} from './registro.ts';
export type { EstadoVerificacion, RegistroVerificacion, ResultadoVerificacion } from './registro.ts';
