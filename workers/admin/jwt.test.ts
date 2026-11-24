import { exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
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
import { MAX_CARACTERES_CLAVE, VIDA_MAXIMA_TOKEN_SEGUNDOS, importarClavePublica, verificarToken, type ConfigJwt } from './jwt.ts';
// Tarea 14.2. Requisitos 15.3 y 15.10. Validación del JWT ES256: firma, algoritmo, claims y vigencia.
// Las claves se generan en memoria en cada ejecución y no se guardan.
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
const verificar = (token: string, ahoraMs = AHORA_MS) => verificarToken(token, config, ahoraMs);
const rechazado = (motivo: string) => ({ ok: false, motivo });
describe('importarClavePublica', () => {
  it('importa un JWK público ES256 válido', async () => {
    expect(await importarClavePublica(par.jwkPublico)).toBeDefined();
  });
  it('descarta campos extra del JWK (alg, use, key_ops) y sigue siendo válido', async () => {
    const jwk = { ...(JSON.parse(par.jwkPublico) as object), alg: 'HS256', use: 'enc', key_ops: ['encrypt'], kid: 'x' };
    expect(await importarClavePublica(JSON.stringify(jwk))).toBeDefined();
  });
  it('rechaza una clave con parte privada (`d`): la clave privada no puede estar en el Worker', async () => {
    const privado = JSON.stringify(await exportJWK(par.privada));
    expect(privado).toContain('"d"');
    expect(await importarClavePublica(privado)).toBeUndefined();
    expect(await importarClavePublica(JSON.stringify({ ...(JSON.parse(par.jwkPublico) as object), d: '' }))).toBeUndefined();
  });
  it.each([
    ['undefined', undefined],
    ['texto vacío', ''],
    ['no es JSON', 'no es json'],
    ['un arreglo', '[]'],
    ['null', 'null'],
    ['un número', '5'],
    ['sin x', JSON.stringify({ kty: 'EC', crv: 'P-256', y: 'AAAA' })],
    ['sin y', JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'AAAA' })],
    ['x vacío', JSON.stringify({ kty: 'EC', crv: 'P-256', x: '', y: 'AAAA' })],
    ['x no es texto', JSON.stringify({ kty: 'EC', crv: 'P-256', x: 1, y: 'AAAA' })],
    ['kty RSA', JSON.stringify({ kty: 'RSA', n: 'AAAA', e: 'AQAB' })],
    ['curva P-384', JSON.stringify({ kty: 'EC', crv: 'P-384', x: 'AAAA', y: 'AAAA' })],
    ['punto que no está en la curva', JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' })],
  ])('rechaza una clave que %s', async (_nombre, texto) => {
    expect(await importarClavePublica(texto)).toBeUndefined();
  });
  it('rechaza un JWK público real de otra curva (P-384 y P-521): es una clave válida pero no es ES256', async () => {
    for (const alg of ['ES384', 'ES512'] as const) {
      const { publicKey } = await generateKeyPair(alg, { extractable: true });
      expect(await importarClavePublica(JSON.stringify(await exportJWK(publicKey))), alg).toBeUndefined();
    }
  });
  it('rechaza un texto de clave demasiado grande, aunque sea JSON', async () => {
    const grande = JSON.stringify({ ...(JSON.parse(par.jwkPublico) as object), relleno: 'x'.repeat(MAX_CARACTERES_CLAVE) });
    expect(grande.length).toBeGreaterThan(MAX_CARACTERES_CLAVE);
    expect(await importarClavePublica(grande)).toBeUndefined();
  });
  it('devuelve la misma promesa para el mismo texto (no importa dos veces)', () => {
    expect(importarClavePublica(par.jwkPublico)).toBe(importarClavePublica(par.jwkPublico));
  });
});
describe('verificarToken: token válido', () => {
  it('acepta un ES256 con todos los claims y devuelve el rol tal cual', async () => {
    expect(await verificar(await firmar(par.privada, claimsValidos()))).toEqual({ ok: true, rol: 'admin' });
  });
  it('devuelve el rol sin interpretarlo, sea cual sea', async () => {
    for (const rol of ['user', 'Admin', '', 5, null, ['admin'], { a: 1 }]) {
      expect(await verificar(await firmar(par.privada, claimsValidos({ rol })))).toEqual({ ok: true, rol });
    }
  });
  it('devuelve rol indefinido si el token no lo trae (decide `authorize`)', async () => {
    const claims = claimsValidos();
    delete claims['rol'];
    expect(await verificar(await firmar(par.privada, claims))).toEqual({ ok: true, rol: undefined });
  });
  it('acepta `kid`, `typ` y otros encabezados inofensivos', async () => {
    const token = await firmar(par.privada, claimsValidos(), { alg: 'ES256', kid: 'cualquiera', typ: 'JWT' });
    expect((await verificar(token)).ok).toBe(true);
  });
});
describe('verificarToken: firma (Requisito 15.3)', () => {
  it('rechaza un token firmado con otra clave', async () => {
    expect(await verificar(await firmar(otroPar.privada, claimsValidos()))).toEqual(rechazado('firma_invalida'));
  });
  it('rechaza un token cuyo contenido cambió después de firmar', async () => {
    const token = await firmar(par.privada, claimsValidos({ rol: 'user' }));
    const falso = conSegmento(token, 1, segmento(claimsValidos({ rol: 'admin' })));
    expect(await verificar(falso)).toEqual(rechazado('firma_invalida'));
  });
  it('rechaza una firma alterada, vacía, de longitud incorrecta o en formato DER', async () => {
    const token = await firmar(par.privada, claimsValidos());
    const firma = token.split('.')[2] ?? '';
    const alterada = `${firma.slice(0, -2)}${firma.endsWith('AA') ? 'BB' : 'AA'}`;
    for (const mala of [alterada, 'AAAA', 'A'.repeat(64), 'A'.repeat(86), 'MEUCIQC'.padEnd(96, 'A')]) {
      const resultado = await verificar(conSegmento(token, 2, mala));
      expect(resultado.ok, mala).toBe(false);
    }
  });
  it('rechaza un encabezado con `jwk` incrustado de otra clave: solo cuenta la clave configurada', async () => {
    const jwkAtacante = await exportJWK(otroPar.publica);
    const token = await firmar(otroPar.privada, claimsValidos(), { alg: 'ES256', jwk: jwkAtacante });
    expect(await verificar(token)).toEqual(rechazado('firma_invalida'));
  });
});
describe('verificarToken: algoritmos no permitidos y confusión de algoritmos (Requisito 15.3)', () => {
  const claims = () => claimsValidos();
  it('rechaza alg "none" con firma vacía (formato malformado) y con firma de relleno', async () => {
    const cabecera = segmento({ alg: 'none', typ: 'JWT' });
    const cuerpo = segmento(claims());
    expect((await verificar(`${cabecera}.${cuerpo}.`)).ok).toBe(false);
    expect(await verificar(`${cabecera}.${cuerpo}.AAAA`)).toEqual(rechazado('algoritmo_no_permitido'));
  });
  it('rechaza HS256 firmado con la clave pública como secreto (confusión de algoritmos)', async () => {
    const jwk = JSON.parse(par.jwkPublico) as { x: string; y: string };
    const secretos = [new TextEncoder().encode(par.jwkPublico), new TextEncoder().encode(jwk.x + jwk.y), new TextEncoder().encode(jwk.x)];
    for (const secreto of secretos) {
      const token = await firmar(secreto, claims(), { alg: 'HS256' });
      expect(await verificar(token)).toEqual(rechazado('algoritmo_no_permitido'));
    }
  });
  it('rechaza ES384 y ES512 aunque la firma sea correcta para su propia clave', async () => {
    for (const alg of ['ES384', 'ES512'] as const) {
      const { privateKey } = await generateKeyPair(alg);
      expect(await verificar(await firmar(privateKey, claims(), { alg }))).toEqual(rechazado('algoritmo_no_permitido'));
    }
  });
  it('rechaza RS256 y PS256', async () => {
    for (const alg of ['RS256', 'PS256'] as const) {
      const { privateKey } = await generateKeyPair(alg);
      expect(await verificar(await firmar(privateKey, claims(), { alg }))).toEqual(rechazado('algoritmo_no_permitido'));
    }
  });
  it('rechaza un `alg` que no es ES256 aunque la firma sea la de un ES256 correcto', async () => {
    const token = await firmar(par.privada, claims());
    for (const alg of ['HS256', 'ES384', 'none', 'RS256', 'es256', '']) {
      const falso = conSegmento(token, 0, segmento({ alg, typ: 'JWT' }));
      expect((await verificar(falso)).ok, alg).toBe(false);
    }
  });
  it('rechaza `crit` con extensiones que no se entienden', async () => {
    // La biblioteca no deja firmar un `crit` desconocido, así que se cambia el encabezado de un token válido.
    const token = conSegmento(await firmar(par.privada, claims()), 0, segmento({ alg: 'ES256', crit: ['ext'], ext: 1 }));
    expect(await verificar(token)).toEqual(rechazado('token_malformado'));
  });
});
describe('verificarToken: formato', () => {
  it.each([
    ['sin puntos', 'abc'],
    ['dos segmentos', 'aaa.bbb'],
    ['cuatro segmentos (JWE)', 'a.b.c.d.e'],
    ['encabezado que no es base64url', '!!!.bbb.ccc'],
    ['encabezado que no es JSON', `${segmento('texto')}.${segmento({})}.AAAA`],
    ['cuerpo que no es JSON', `${segmento({ alg: 'ES256' })}.${'bm9fanNvbg'}.AAAA`],
    ['cuerpo que es un arreglo', `${segmento({ alg: 'ES256' })}.${segmento([1])}.AAAA`],
    ['vacío', ''],
  ])('rechaza un token %s sin lanzar excepciones', async (_nombre, token) => {
    const resultado = await verificar(token);
    expect(resultado.ok).toBe(false);
  });
});
describe('verificarToken: claims obligatorios (Requisito 15.3)', () => {
  const sin = (claim: string) => {
    const claims = claimsValidos();
    delete claims[claim];
    return claims;
  };
  it.each(['exp', 'iat', 'iss', 'aud'])('rechaza un token sin `%s`', async (claim) => {
    expect(await verificar(await firmar(par.privada, sin(claim)))).toEqual(rechazado('claims_invalidos'));
  });
  it.each([
    ['exp como texto', { exp: String(AHORA_S + 60) }],
    ['exp nulo', { exp: null }],
    ['exp como objeto', { exp: {} }],
    ['iat como texto', { iat: String(AHORA_S) }],
    ['iat nulo', { iat: null }],
    ['iss de otro valor', { iss: 'otro-emisor' }],
    ['iss con otra capitalización', { iss: EMISOR.toUpperCase() }],
    ['iss con espacio final', { iss: `${EMISOR} ` }],
    ['iss como número', { iss: 5 }],
    ['iss como lista', { iss: [EMISOR] }],
    ['aud de otro valor', { aud: 'otra-audiencia' }],
    ['aud con otra capitalización', { aud: AUDIENCIA.toUpperCase() }],
    ['aud como número', { aud: 5 }],
    ['aud lista vacía', { aud: [] }],
    ['aud lista con un valor ajeno', { aud: ['otra-audiencia'] }],
    ['aud lista con la correcta y otra más', { aud: [AUDIENCIA, 'otra-audiencia'] }],
    ['nbf como texto', { nbf: String(AHORA_S - 10) }],
  ])('rechaza un token con %s', async (_nombre, extra) => {
    expect(await verificar(await firmar(par.privada, claimsValidos(extra as Record<string, unknown>)))).toEqual(rechazado('claims_invalidos'));
  });
  it('acepta `aud` como lista con un solo elemento igual al configurado', async () => {
    expect((await verificar(await firmar(par.privada, claimsValidos({ aud: [AUDIENCIA] })))).ok).toBe(true);
  });
});
describe('verificarToken: vigencia (Requisito 15.3)', () => {
  const con = (iat: number, exp: number, extra: Record<string, unknown> = {}) => firmar(par.privada, claimsValidos({ iat, exp, ...extra }));
  it('acepta un token a un segundo de vencer', async () => {
    expect((await verificar(await con(AHORA_S - 100, AHORA_S + 1))).ok).toBe(true);
  });
  it('rechaza un token con `exp` igual al instante actual: ya venció', async () => {
    expect(await verificar(await con(AHORA_S - 100, AHORA_S))).toEqual(rechazado('expirado'));
  });
  it('rechaza un token vencido desde hace 1 segundo, 1 hora y 1 año', async () => {
    for (const atras of [1, 3600, 31_536_000]) {
      expect(await verificar(await con(AHORA_S - atras - 100, AHORA_S - atras))).toEqual(rechazado('expirado'));
    }
  });
  it('no usa tolerancia de reloj: vence en el segundo exacto, no antes ni después', async () => {
    const token = await con(AHORA_S - 100, AHORA_S + 10);
    expect((await verificar(token, AHORA_MS + 9_999)).ok).toBe(true);
    expect(await verificar(token, AHORA_MS + 10_000)).toEqual(rechazado('expirado'));
  });
  it('rechaza un token con `nbf` en el futuro y acepta `nbf` igual o anterior al instante actual', async () => {
    expect(await verificar(await con(AHORA_S, AHORA_S + 60, { nbf: AHORA_S + 1 }))).toEqual(rechazado('aun_no_valido'));
    expect((await verificar(await con(AHORA_S, AHORA_S + 60, { nbf: AHORA_S }))).ok).toBe(true);
    expect((await verificar(await con(AHORA_S, AHORA_S + 60, { nbf: AHORA_S - 1000 }))).ok).toBe(true);
  });
  it('rechaza un token emitido en el futuro (`iat` mayor que el instante actual)', async () => {
    expect(await verificar(await con(AHORA_S + 1, AHORA_S + 601))).toEqual(rechazado('claims_invalidos'));
    expect((await verificar(await con(AHORA_S, AHORA_S + 600))).ok).toBe(true);
  });
});
describe('verificarToken: duración máxima de 15 minutos', () => {
  it('la constante vale 900 segundos', () => {
    expect(VIDA_MAXIMA_TOKEN_SEGUNDOS).toBe(900);
  });
  it('acepta exactamente 900 segundos entre `iat` y `exp`', async () => {
    const iat = AHORA_S - 10;
    expect((await verificar(await firmar(par.privada, claimsValidos({ iat, exp: iat + 900 })))).ok).toBe(true);
  });
  it('rechaza 901 segundos y duraciones mucho mayores', async () => {
    const iat = AHORA_S - 10;
    for (const vida of [901, 1800, 3600, 86_400, 31_536_000]) {
      expect(await verificar(await firmar(par.privada, claimsValidos({ iat, exp: iat + vida })))).toEqual(rechazado('claims_invalidos'));
    }
  });
  it('rechaza un token sin vencimiento práctico aunque `iat` sea muy antiguo', async () => {
    expect((await verificar(await firmar(par.privada, claimsValidos({ iat: 0, exp: AHORA_S + 60 })))).ok).toBe(false);
  });
});
