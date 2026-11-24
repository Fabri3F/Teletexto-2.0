import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_CARACTERES_TOKEN, ROL_ADMINISTRADOR, authorize } from './authorize.ts';
import {
  AHORA_MS,
  AHORA_S,
  AUDIENCIA,
  EMISOR,
  claimsValidos,
  conSegmento,
  crearParDeClaves,
  firmar,
  segmento,
  type ParDeClaves,
} from './ayudas-de-prueba.ts';
import { importarClavePublica, type ConfigJwt } from './jwt.ts';
// Tarea 14.2. Requisitos 15.3 y 15.10. `authorize`: 401 si la credencial falta o no es válida, 403 si es válida pero no es de admin.
let par: ParDeClaves;
let otroPar: ParDeClaves;
let config: ConfigJwt;
beforeAll(async () => {
  par = await crearParDeClaves();
  otroPar = await crearParDeClaves();
  const clave = await importarClavePublica(par.jwkPublico);
  if (clave === undefined) throw new Error('no se pudo importar la clave de prueba');
  config = { clave, emisor: EMISOR, audiencia: AUDIENCIA };
});
const evaluar = (cabecera: string | null) => authorize(cabecera, config, AHORA_MS);
const con = async (claims: Record<string, unknown>) => `Bearer ${await firmar(par.privada, claimsValidos(claims))}`;
const r401 = (motivo: string) => ({ permitido: false, estado: 401, motivo });
describe('authorize: credencial válida', () => {
  it('permite a un administrador con token válido', async () => {
    expect(await evaluar(await con({}))).toEqual({ permitido: true });
  });
  it('el rol es exactamente "admin"', () => {
    expect(ROL_ADMINISTRADOR).toBe('admin');
  });
  it('acepta el esquema Bearer en mayúsculas o minúsculas (RFC 7235)', async () => {
    const token = (await con({})).slice('Bearer '.length);
    for (const esquema of ['Bearer', 'bearer', 'BEARER', 'bEaReR']) {
      expect(await evaluar(`${esquema} ${token}`), esquema).toEqual({ permitido: true });
    }
  });
});
describe('authorize: 401 por credencial ausente o inválida (Requisito 15.10)', () => {
  it('sin cabecera Authorization', async () => {
    expect(await evaluar(null)).toEqual(r401('sin_credencial'));
  });
  it('cabecera vacía', async () => {
    expect(await evaluar('')).toEqual(r401('sin_credencial'));
  });
  it.each([
    ['esquema Basic', 'Basic dXNlcjpwYXNz'],
    ['esquema Token', 'Token a.b.c'],
    ['solo la palabra Bearer', 'Bearer'],
    ['sin esquema, solo el token', 'a.b.c'],
    ['esquema pegado al token', 'Bearera.b.c'],
    ['esquema con dos puntos', 'Bearer: a.b.c'],
    ['esquema y tabulador', 'Bearer\ta.b.c'],
  ])('%s', async (_nombre, cabecera) => {
    expect(await evaluar(cabecera)).toEqual(r401('esquema_invalido'));
  });
  it.each([
    ['dos espacios entre esquema y token', 'Bearer  a.b.c'],
    ['token vacío', 'Bearer '],
    ['un solo segmento', 'Bearer abc'],
    ['dos segmentos', 'Bearer a.b'],
    ['cuatro segmentos', 'Bearer a.b.c.d'],
    ['segmento vacío', 'Bearer a..c'],
    ['firma vacía (alg none típico)', 'Bearer a.b.'],
    ['caracteres fuera de base64url', 'Bearer a.b.c!'],
    ['espacio dentro del token', 'Bearer a.b c.d'],
    ['dos credenciales unidas por coma', 'Bearer a.b.c, Bearer d.e.f'],
    ['relleno base64 con "="', 'Bearer a.b.c=='],
    ['salto de línea dentro del token', 'Bearer a.b.c\nd'],
  ])('token mal formado: %s', async (_nombre, cabecera) => {
    expect(await evaluar(cabecera)).toEqual(r401('token_malformado'));
  });
  it('token firmado con otra clave', async () => {
    const cabecera = `Bearer ${await firmar(otroPar.privada, claimsValidos())}`;
    expect(await evaluar(cabecera)).toEqual(r401('firma_invalida'));
  });
  it('token expirado', async () => {
    expect(await evaluar(await con({ iat: AHORA_S - 700, exp: AHORA_S - 100 }))).toEqual(r401('expirado'));
  });
  it('token con `nbf` en el futuro', async () => {
    expect(await evaluar(await con({ nbf: AHORA_S + 30 }))).toEqual(r401('aun_no_valido'));
  });
  it.each([
    ['sin exp', 'exp'],
    ['sin iat', 'iat'],
    ['sin iss', 'iss'],
    ['sin aud', 'aud'],
  ])('token %s', async (_nombre, claim) => {
    const claims = claimsValidos();
    delete claims[claim];
    expect(await evaluar(`Bearer ${await firmar(par.privada, claims)}`)).toEqual(r401('claims_invalidos'));
  });
  it('token con vida de más de 15 minutos', async () => {
    expect(await evaluar(await con({ iat: AHORA_S - 10, exp: AHORA_S - 10 + 901 }))).toEqual(r401('claims_invalidos'));
  });
  it('emisor o audiencia distintos', async () => {
    expect(await evaluar(await con({ iss: 'otro' }))).toEqual(r401('claims_invalidos'));
    expect(await evaluar(await con({ aud: 'otra' }))).toEqual(r401('claims_invalidos'));
  });
  it('algoritmo distinto de ES256 (HS256 con la clave pública como secreto)', async () => {
    const token = await firmar(new TextEncoder().encode(par.jwkPublico), claimsValidos(), { alg: 'HS256' });
    expect(await evaluar(`Bearer ${token}`)).toEqual(r401('algoritmo_no_permitido'));
  });
  it('alg "none" con firma de relleno', async () => {
    const token = `${segmento({ alg: 'none' })}.${segmento(claimsValidos())}.AAAA`;
    expect(await evaluar(`Bearer ${token}`)).toEqual(r401('algoritmo_no_permitido'));
  });
});
describe('authorize: 403 por credencial válida sin rol de administrador (Requisito 15.10)', () => {
  it.each([
    ['rol "user"', { rol: 'user' }],
    ['rol "Admin"', { rol: 'Admin' }],
    ['rol "ADMIN"', { rol: 'ADMIN' }],
    ['rol "admin " con espacio', { rol: 'admin ' }],
    ['rol " admin" con espacio', { rol: ' admin' }],
    ['rol "administrador"', { rol: 'administrador' }],
    ['rol vacío', { rol: '' }],
    ['rol nulo', { rol: null }],
    ['rol numérico', { rol: 1 }],
    ['rol booleano', { rol: true }],
    ['rol como lista con admin', { rol: ['admin'] }],
    ['rol como objeto', { rol: { nombre: 'admin' } }],
  ])('%s', async (_nombre, extra) => {
    expect(await evaluar(await con(extra))).toEqual({ permitido: false, estado: 403, motivo: 'rol_insuficiente' });
  });
  it('rol ausente', async () => {
    const claims = claimsValidos();
    delete claims['rol'];
    expect(await evaluar(`Bearer ${await firmar(par.privada, claims)}`)).toEqual({ permitido: false, estado: 403, motivo: 'rol_insuficiente' });
  });
  it('otros claims de rol (`role`, `roles`, `scope`) no sustituyen a `rol`', async () => {
    for (const extra of [{ role: 'admin' }, { roles: ['admin'] }, { scope: 'admin' }, { admin: true }]) {
      const claims = claimsValidos(extra);
      delete claims['rol'];
      expect((await evaluar(`Bearer ${await firmar(par.privada, claims)}`)).permitido).toBe(false);
    }
  });
});
describe('authorize: el rol solo cuenta con firma válida', () => {
  it('un token sin firma válida que dice "admin" recibe 401, nunca 403 ni permiso', async () => {
    const valido = await firmar(par.privada, claimsValidos({ rol: 'user' }));
    const falso = conSegmento(valido, 1, segmento(claimsValidos({ rol: 'admin' })));
    expect(await evaluar(`Bearer ${falso}`)).toEqual(r401('firma_invalida'));
    const ajeno = await firmar(otroPar.privada, claimsValidos({ rol: 'user' }));
    expect(await evaluar(`Bearer ${ajeno}`)).toEqual(r401('firma_invalida'));
  });
  it('un token expirado de administrador sigue siendo 401', async () => {
    expect(await evaluar(await con({ rol: 'admin', iat: AHORA_S - 700, exp: AHORA_S - 1 }))).toEqual(r401('expirado'));
  });
  it('un token de usuario con claims inválidos es 401, no 403', async () => {
    expect(await evaluar(await con({ rol: 'user', iss: 'otro' }))).toEqual(r401('claims_invalidos'));
  });
});
describe('authorize: límites de tamaño', () => {
  it('rechaza una cabecera de más de 2048 caracteres de token sin analizarla', async () => {
    const limite = 'Bearer '.length + MAX_CARACTERES_TOKEN;
    expect(await evaluar('B'.repeat(limite + 1))).toEqual(r401('token_demasiado_grande'));
    expect(await evaluar(`Bearer ${'a'.repeat(MAX_CARACTERES_TOKEN + 1)}`)).toEqual(r401('token_demasiado_grande'));
    expect(await evaluar('x'.repeat(1_000_000))).toEqual(r401('token_demasiado_grande'));
  });
  it('un token justo en el límite sigue por el análisis normal', async () => {
    const limite = 'Bearer '.length + MAX_CARACTERES_TOKEN;
    const justo = `Bearer ${'a'.repeat(MAX_CARACTERES_TOKEN)}`;
    expect(justo.length).toBe(limite);
    expect(await evaluar(justo)).toEqual(r401('token_malformado'));
  });
  it('un token válido real mide mucho menos que el límite', async () => {
    const cabecera = await con({});
    expect(cabecera.length).toBeLessThan(600);
  });
});
