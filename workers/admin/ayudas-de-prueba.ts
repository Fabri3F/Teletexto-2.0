// Ayudas SOLO para las pruebas de `workers/admin`. No forman parte del Worker y nadie las importa fuera de los `*.test.ts`.
// Las claves se generan en memoria en cada ejecución y se descartan: no se guarda ninguna clave privada, ni aquí ni en ningún
// otro archivo del repositorio. Los valores de configuración son ficticios y se reconocen por el sufijo "de-prueba".
import { SignJWT, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import type { Env } from './index.ts';

/** Instante fijo de las pruebas: 15/01/2030 12:00:00 UTC. */
export const AHORA_MS = Date.UTC(2030, 0, 15, 12, 0, 0);
export const AHORA_S = AHORA_MS / 1000;
export const EMISOR = 'emisor-de-prueba';
export const AUDIENCIA = 'audiencia-de-prueba';
/** Valor ficticio con forma de token de GitHub. Las pruebas comprueban que nunca sale en una respuesta ni en un registro. */
export const TOKEN_GITHUB_CANARIO = 'ghp_CANARIO_DE_PRUEBA_NO_FILTRAR_0123456789';

export interface ParDeClaves {
  readonly privada: CryptoKey;
  readonly publica: CryptoKey;
  /** JWK público en texto, tal como se configuraría en el Worker. */
  readonly jwkPublico: string;
}

/** Genera un par ES256 efímero (solo en memoria). */
export async function crearParDeClaves(): Promise<ParDeClaves> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  return { privada: privateKey, publica: publicKey, jwkPublico: JSON.stringify(await exportJWK(publicKey)) };
}

/** Claims válidos de un administrador, con `iat` en el instante de prueba y 10 minutos de vida. */
export function claimsValidos(extra: JWTPayload = {}): JWTPayload {
  return { iss: EMISOR, aud: AUDIENCIA, iat: AHORA_S, exp: AHORA_S + 600, rol: 'admin', ...extra };
}

/** Firma un JWT con los claims tal cual (sin añadir nada). `alg` es ES256 salvo que se indique otro encabezado. */
export function firmar(clave: CryptoKey | Uint8Array, claims: JWTPayload, cabecera: Record<string, unknown> = { alg: 'ES256' }): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', ...cabecera } as { alg: string }).sign(clave);
}

const aBase64Url = (texto: string): string => btoa(texto).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

/** Codifica un objeto como segmento base64url (para armar tokens a mano, con firma falsa). */
export function segmento(objeto: unknown): string {
  return aBase64Url(JSON.stringify(objeto));
}

/** Cambia el segmento `indice` (0, 1 o 2) de un token compacto. */
export function conSegmento(token: string, indice: 0 | 1 | 2, nuevo: string): string {
  const partes = token.split('.');
  partes[indice] = nuevo;
  return partes.join('.');
}

/** Configuración completa y válida del Worker, con valores ficticios. `cambios` sustituye o quita (`undefined`) variables. */
export function entorno(jwkPublico: string, cambios: Partial<Record<keyof Env, string | undefined>> = {}): Env {
  const base: Record<string, string | undefined> = {
    ADMIN_JWT_PUBLIC_KEY: jwkPublico,
    ADMIN_JWT_ISSUER: EMISOR,
    ADMIN_JWT_AUDIENCE: AUDIENCIA,
    ADMIN_GITHUB_TOKEN: TOKEN_GITHUB_CANARIO,
    ADMIN_GITHUB_OWNER: 'propietario-de-prueba',
    ADMIN_GITHUB_REPO: 'repositorio-de-prueba',
    ADMIN_GITHUB_WORKFLOW: 'flujo-de-prueba.yml',
    ADMIN_GITHUB_REF: 'rama-de-prueba',
    ...cambios,
  };
  return base as Env;
}
