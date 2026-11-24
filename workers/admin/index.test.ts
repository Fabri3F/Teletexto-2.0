import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AHORA_MS,
  AHORA_S,
  TOKEN_GITHUB_CANARIO,
  claimsValidos,
  crearParDeClaves,
  entorno,
  firmar,
  type ParDeClaves,
} from './ayudas-de-prueba.ts';
import worker, { RUTA_RECARGA, manejar, type DependenciasWorker, type Env } from './index.ts';
import type { FetchInyectable } from './github.ts';
// Tarea 14.2. Requisitos 15.3, 15.4 y 15.10. El Worker completo con todas sus dependencias inyectadas: ninguna prueba usa la red.
const ORIGEN = 'https://worker-de-prueba.example';
const URL_RECARGA = `${ORIGEN}${RUTA_RECARGA}`;
const URL_GITHUB = 'https://api.github.com/repos/propietario-de-prueba/repositorio-de-prueba/actions/workflows/flujo-de-prueba.yml/dispatches';
let par: ParDeClaves;
let env: Env;
let registros: string[];
let enviar: ReturnType<typeof vi.fn<FetchInyectable>>;
let fetchGlobal: ReturnType<typeof vi.fn>;
/** Todo lo que el Worker devolvió o escribió en las pruebas de este archivo, para buscar secretos al final. */
const todoLoVisible: string[] = [];
beforeAll(async () => {
  par = await crearParDeClaves();
  env = entorno(par.jwkPublico);
});
beforeEach(() => {
  registros = [];
  enviar = vi.fn<FetchInyectable>(async () => new Response(null, { status: 204 }));
  // Si algo llamara al `fetch` global (la red real), la prueba falla.
  fetchGlobal = vi.fn(() => {
    throw new Error('Una prueba intentó usar la red real');
  });
  vi.stubGlobal('fetch', fetchGlobal);
});
afterEach(() => {
  vi.unstubAllGlobals();
  expect(fetchGlobal).not.toHaveBeenCalled();
});
interface Opciones {
  readonly metodo?: string;
  readonly ruta?: string;
  readonly autorizacion?: string | null;
  readonly cabeceras?: Record<string, string>;
  readonly cuerpo?: string;
  readonly entorno?: Env;
  readonly ahoraMs?: number;
  readonly plazoGitHubMs?: number;
}
async function llamar(opciones: Opciones = {}): Promise<{ respuesta: Response; texto: string }> {
  const { metodo = 'POST', ruta = RUTA_RECARGA, autorizacion = null, cabeceras = {}, cuerpo, ahoraMs = AHORA_MS } = opciones;
  const encabezados = new Headers(cabeceras);
  if (autorizacion !== null) encabezados.set('authorization', autorizacion);
  const solicitud = new Request(`${ORIGEN}${ruta}`, {
    method: metodo,
    headers: encabezados,
    ...(cuerpo !== undefined && metodo !== 'GET' && metodo !== 'HEAD' ? { body: cuerpo } : {}),
  });
  const deps: DependenciasWorker = {
    ahora: () => ahoraMs,
    registrar: (linea) => registros.push(linea),
    fetch: enviar,
    ...(opciones.plazoGitHubMs === undefined ? {} : { plazoGitHubMs: opciones.plazoGitHubMs }),
  };
  const respuesta = await manejar(solicitud, opciones.entorno ?? env, deps);
  const texto = await respuesta.text();
  todoLoVisible.push(texto, JSON.stringify([...respuesta.headers.entries()]), ...registros);
  return { respuesta, texto };
}
const bearer = async (claims: Record<string, unknown> = {}) => `Bearer ${await firmar(par.privada, claimsValidos(claims))}`;
function comprobarCabecerasComunes(respuesta: Response): void {
  expect(respuesta.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(respuesta.headers.get('cache-control')).toBe('no-store');
  expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
  expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
}
const registro = (indice = 0) => JSON.parse(registros[indice] ?? 'null') as Record<string, unknown>;
describe('Worker: 404 para cualquier ruta que no sea /admin/reload', () => {
  it.each(['/', '/admin', '/admin/', '/admin/reload/', '/admin/reload/x', '/admin//reload', '//admin/reload', '/ADMIN/reload', '/admin/Reload', '/admin/%72eload', '/p/100.json', '/index.html'])(
    '%s',
    async (ruta) => {
      const { respuesta, texto } = await llamar({ ruta, autorizacion: await bearer() });
      expect(respuesta.status).toBe(404);
      expect(JSON.parse(texto)).toEqual({ error: 'No encontrado.' });
      comprobarCabecerasComunes(respuesta);
      expect(enviar).not.toHaveBeenCalled();
      expect(registros).toEqual([]);
    },
  );
  it('el 404 no autentica: no pide credencial y no revela nada', async () => {
    const { respuesta } = await llamar({ ruta: '/otra' });
    expect(respuesta.status).toBe(404);
    expect(respuesta.headers.get('www-authenticate')).toBeNull();
  });
  it('la cadena de consulta no cambia la ruta', async () => {
    const { respuesta } = await llamar({ ruta: `${RUTA_RECARGA}?x=1&ref=otra`, autorizacion: await bearer() });
    expect(respuesta.status).toBe(202);
  });
});
describe('Worker: 401 por credencial ausente o inválida (Requisitos 15.3 y 15.10)', () => {
  it('sin credencial: 401 con WWW-Authenticate, registro y sin llamar a GitHub', async () => {
    const { respuesta, texto } = await llamar({ cabeceras: { 'cf-connecting-ip': '203.0.113.7' } });
    expect(respuesta.status).toBe(401);
    expect(JSON.parse(texto)).toEqual({ error: 'No autorizado.' });
    expect(respuesta.headers.get('www-authenticate')).toBe('Bearer');
    comprobarCabecerasComunes(respuesta);
    expect(enviar).not.toHaveBeenCalled();
    expect(registros).toHaveLength(1);
    expect(registro()).toEqual({
      evento: 'admin_rechazo',
      timestamp: '2030-01-15T12:00:00Z',
      ip: '203.0.113.7',
      recurso: '/admin/reload',
      estado: 401,
      motivo: 'sin_credencial',
      metodo: 'POST',
    });
  });
  it.each([
    ['esquema Basic', 'Basic dXNlcjpwYXNz', 'esquema_invalido'],
    ['token mal formado', 'Bearer abc', 'token_malformado'],
    ['token vacío (el entorno recorta el espacio final)', 'Bearer ', 'esquema_invalido'],
  ])('%s: 401, registro con su motivo y sin llamar a GitHub', async (_nombre, autorizacion, motivo) => {
    const { respuesta } = await llamar({ autorizacion });
    expect(respuesta.status).toBe(401);
    expect(registro()['motivo']).toBe(motivo);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('firma de otra clave: 401 y sin llamar a GitHub', async () => {
    const otro = await crearParDeClaves();
    const token = await firmar(otro.privada, claimsValidos());
    const { respuesta } = await llamar({ autorizacion: `Bearer ${token}` });
    expect(respuesta.status).toBe(401);
    expect(registro()['motivo']).toBe('firma_invalida');
    expect(enviar).not.toHaveBeenCalled();
  });
  it('token expirado según el reloj inyectado: 401', async () => {
    const autorizacion = await bearer();
    expect((await llamar({ autorizacion })).respuesta.status).toBe(202);
    registros.length = 0;
    const { respuesta } = await llamar({ autorizacion, ahoraMs: (AHORA_S + 600) * 1000 });
    expect(respuesta.status).toBe(401);
    expect(registro()['motivo']).toBe('expirado');
    expect(registro()['timestamp']).toBe('2030-01-15T12:10:00Z');
  });
  it('varias cabeceras Authorization (unidas por coma) se rechazan', async () => {
    const solicitud = new Request(URL_RECARGA, {
      method: 'POST',
      headers: [
        ['authorization', await bearer()],
        ['authorization', await bearer()],
      ],
    });
    const respuesta = await manejar(solicitud, env, { ahora: () => AHORA_MS, registrar: (l) => registros.push(l), fetch: enviar });
    expect(respuesta.status).toBe(401);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('el registro usa solo CF-Connecting-IP: ignora X-Forwarded-For y X-Real-IP', async () => {
    await llamar({ cabeceras: { 'x-forwarded-for': '198.51.100.9', 'x-real-ip': '198.51.100.10' } });
    expect(registro()['ip']).toBe('No disponible');
    registros.length = 0;
    await llamar({ cabeceras: { 'cf-connecting-ip': '2001:db8::1', 'x-forwarded-for': '198.51.100.9' } });
    expect(registro()['ip']).toBe('2001:db8::1');
  });
  it('una IP inválida en CF-Connecting-IP se registra como "No disponible"', async () => {
    await llamar({ cabeceras: { 'cf-connecting-ip': 'no es una ip' } });
    expect(registro()['ip']).toBe('No disponible');
  });
  it('el recurso del registro no lleva la cadena de consulta', async () => {
    await llamar({ ruta: `${RUTA_RECARGA}?token=secreto&x=1#frag` });
    expect(registro()['recurso']).toBe('/admin/reload');
    expect(registros[0]).not.toContain('secreto');
  });
  it('un token enorme se rechaza sin llamar a GitHub y sin escribirlo en el registro', async () => {
    const grande = `Bearer ${'a'.repeat(5000)}`;
    const { respuesta } = await llamar({ autorizacion: grande });
    expect(respuesta.status).toBe(401);
    expect(registro()['motivo']).toBe('token_demasiado_grande');
    expect(registros[0]).not.toContain('aaaaaaaaaa');
    expect(enviar).not.toHaveBeenCalled();
  });
});
describe('Worker: 403 por credencial válida sin rol de administrador (Requisitos 15.3 y 15.10)', () => {
  it.each([
    ['rol user', { rol: 'user' }],
    ['rol Admin', { rol: 'Admin' }],
    ['rol ausente', { rol: undefined }],
  ])('%s: 403, registro y sin llamar a GitHub', async (_nombre, extra) => {
    const claims = claimsValidos(extra);
    if (extra.rol === undefined) delete claims['rol'];
    const { respuesta, texto } = await llamar({
      autorizacion: `Bearer ${await firmar(par.privada, claims)}`,
      cabeceras: { 'cf-connecting-ip': '198.51.100.20' },
    });
    expect(respuesta.status).toBe(403);
    expect(JSON.parse(texto)).toEqual({ error: 'Prohibido.' });
    expect(respuesta.headers.get('www-authenticate')).toBeNull();
    comprobarCabecerasComunes(respuesta);
    expect(enviar).not.toHaveBeenCalled();
    expect(registro()).toEqual({
      evento: 'admin_rechazo',
      timestamp: '2030-01-15T12:00:00Z',
      ip: '198.51.100.20',
      recurso: '/admin/reload',
      estado: 403,
      motivo: 'rol_insuficiente',
      metodo: 'POST',
    });
  });
});
describe('Worker: 405 para métodos distintos de POST', () => {
  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s con credencial de administrador: 405 y Allow: POST', async (metodo) => {
    const { respuesta, texto } = await llamar({ metodo, autorizacion: await bearer() });
    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get('allow')).toBe('POST');
    comprobarCabecerasComunes(respuesta);
    if (metodo !== 'HEAD') expect(JSON.parse(texto)).toEqual({ error: 'Método no permitido.' });
    expect(enviar).not.toHaveBeenCalled();
    expect(registros).toEqual([]);
  });
  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s sin credencial: 401 registrado, no 405 (Requisito 15.10)', async (metodo) => {
    const { respuesta } = await llamar({ metodo });
    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get('allow')).toBeNull();
    expect(registro()['metodo']).toBe(metodo);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('un método no estándar con credencial de otro rol: 403 y método registrado como OTRO', async () => {
    const { respuesta } = await llamar({ metodo: 'PROPFIND', autorizacion: await bearer({ rol: 'user' }) });
    expect(respuesta.status).toBe(403);
    expect(registro()['metodo']).toBe('OTRO');
  });
});
describe('Worker: 202 y disparo de GitHub (Requisitos 15.3 y 15.4)', () => {
  it('con un administrador válido llama una sola vez a GitHub y responde 202', async () => {
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(202);
    expect(JSON.parse(texto)).toEqual({ estado: 'solicitado' });
    comprobarCabecerasComunes(respuesta);
    expect(registros).toEqual([]);
    expect(enviar).toHaveBeenCalledTimes(1);
    const [url, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_GITHUB);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"ref":"rama-de-prueba"}');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN_GITHUB_CANARIO}`);
  });
  it('el token de GitHub solo va a GitHub, nunca a la respuesta ni al registro', async () => {
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(texto).not.toContain(TOKEN_GITHUB_CANARIO);
    expect(JSON.stringify([...respuesta.headers.entries()])).not.toContain(TOKEN_GITHUB_CANARIO);
    expect(registros.join('')).not.toContain(TOKEN_GITHUB_CANARIO);
  });
  it('nada de la solicitud llega al cuerpo del disparo: ni el cuerpo, ni la consulta, ni las cabeceras', async () => {
    const cuerpo = JSON.stringify({ ref: 'rama-ajena', inputs: { x: '1' }, workflow: 'otro.yml' });
    await llamar({
      autorizacion: await bearer(),
      ruta: `${RUTA_RECARGA}?ref=rama-ajena&workflow=otro.yml`,
      cuerpo,
      cabeceras: { 'x-ref': 'rama-ajena', 'content-type': 'application/json' },
    });
    const [url, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_GITHUB);
    expect(init.body).toBe('{"ref":"rama-de-prueba"}');
  });
  it('un cuerpo muy grande no cambia el resultado (no se lee)', async () => {
    const { respuesta } = await llamar({ autorizacion: await bearer(), cuerpo: 'x'.repeat(2_000_000) });
    expect(respuesta.status).toBe(202);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('cada solicitud válida hace su propia llamada a GitHub (el Worker no guarda estado)', async () => {
    const autorizacion = await bearer();
    await llamar({ autorizacion });
    await llamar({ autorizacion });
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});
describe('Worker: 502 cuando GitHub rechaza el disparo (fallo confirmado: 3xx y 4xx)', () => {
  it.each([301, 302, 303, 307, 308, 400, 401, 403, 404, 409, 422, 429, 499])('GitHub responde %i: 502 sin detalles', async (estado) => {
    enviar.mockImplementation(async () => new Response('{"message":"detalle interno"}', { status: estado }));
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(502);
    expect(JSON.parse(texto)).toEqual({ error: 'No se pudo iniciar la ingesta.' });
    comprobarCabecerasComunes(respuesta);
    expect(texto).not.toContain('detalle interno');
    expect(registros).toHaveLength(1);
    expect(registro()).toEqual({ evento: 'admin_github_error', causa: 'estado', estadoHttp: estado });
  });
  it('un error de red: resultado desconocido (504), no un 502, y causa "red" en el registro', async () => {
    enviar.mockImplementation(async (url, init) => {
      throw new Error(`falló ${url} ${JSON.stringify(init.headers)}`);
    });
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(504);
    expect(registro()).toEqual({ evento: 'admin_github_error', causa: 'red' });
    expect(texto + registros.join('')).not.toContain(TOKEN_GITHUB_CANARIO);
    expect(texto + registros.join('')).not.toContain('falló');
  });
  it('si GitHub no responde a tiempo: resultado desconocido (504) y causa "tiempo" en el registro', async () => {
    enviar.mockImplementation(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
    );
    const { respuesta } = await llamar({ autorizacion: await bearer(), plazoGitHubMs: 30 });
    expect(respuesta.status).toBe(504);
    expect(registro()).toEqual({ evento: 'admin_github_error', causa: 'tiempo' });
  });
});
describe('Worker: resultado desconocido frente a fallo confirmado (B2)', () => {
  const DESCONOCIDO = {
    estado: 'desconocido',
    error: 'No se pudo confirmar si la ingesta se inició. Revise las ejecuciones en GitHub. No repita la solicitud de forma automática.',
  };
  const colgado: FetchInyectable = (_url, init) =>
    new Promise((_resolver, rechazar) => {
      init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
    });
  it('un fallo de red y un plazo vencido dan la misma respuesta diferenciada, con cuerpo fijo', async () => {
    enviar.mockImplementation(async () => {
      throw new TypeError('fallo de red');
    });
    const porRed = await llamar({ autorizacion: await bearer() });
    enviar.mockImplementation(colgado);
    const porTiempo = await llamar({ autorizacion: await bearer(), plazoGitHubMs: 20 });
    for (const { respuesta, texto } of [porRed, porTiempo]) {
      expect(respuesta.status).toBe(504);
      expect(JSON.parse(texto)).toEqual(DESCONOCIDO);
      comprobarCabecerasComunes(respuesta);
    }
  });
  it('la respuesta de resultado desconocido advierte que no se reintente y no lleva Retry-After', async () => {
    enviar.mockImplementation(async () => {
      throw new TypeError('x');
    });
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(JSON.parse(texto)['error']).toContain('No repita la solicitud de forma automática.');
    expect(respuesta.headers.get('retry-after')).toBeNull();
  });
  it('un fallo confirmado de GitHub sigue siendo 502 con su mensaje y sin el campo "estado"', async () => {
    for (const estado of [400, 401, 403, 404, 409, 422, 429, 499, 301, 302, 308]) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
      expect(respuesta.status, String(estado)).toBe(502);
      expect(JSON.parse(texto)).toEqual({ error: 'No se pudo iniciar la ingesta.' });
    }
  });
  it('un 204 sigue siendo 202', async () => {
    const { respuesta } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(202);
  });
  it('el Worker no reintenta: un fallo desconocido hace una sola llamada a GitHub', async () => {
    enviar.mockImplementation(async () => {
      throw new TypeError('x');
    });
    await llamar({ autorizacion: await bearer() });
    expect(enviar).toHaveBeenCalledTimes(1);
    enviar.mockClear();
    enviar.mockImplementation(colgado);
    await llamar({ autorizacion: await bearer(), plazoGitHubMs: 20 });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('un fallo confirmado tampoco se reintenta', async () => {
    enviar.mockImplementation(async () => new Response(null, { status: 404 }));
    await llamar({ autorizacion: await bearer() });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
describe('Worker: los 5xx de GitHub son resultado desconocido (504), no fallo confirmado', () => {
  const DESCONOCIDO = {
    estado: 'desconocido',
    error: 'No se pudo confirmar si la ingesta se inició. Revise las ejecuciones en GitHub. No repita la solicitud de forma automática.',
  };
  const CINCO_XX = [500, 501, 502, 503, 504, 505, 507, 508, 511, 520, 522, 524, 599];
  it.each([500, 502, 503, 504])('GitHub responde %i: 504 de resultado desconocido, con cuerpo fijo y cabeceras comunes', async (estado) => {
    enviar.mockImplementation(async () => new Response('{"message":"detalle interno"}', { status: estado }));
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(504);
    expect(JSON.parse(texto)).toEqual(DESCONOCIDO);
    comprobarCabecerasComunes(respuesta);
    expect(texto).not.toContain('detalle interno');
  });
  it('cualquier otro 5xx de GitHub también da 504 de resultado desconocido', async () => {
    for (const estado of CINCO_XX) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
      expect(respuesta.status, String(estado)).toBe(504);
      expect(JSON.parse(texto), String(estado)).toEqual(DESCONOCIDO);
    }
  });
  it('la respuesta 504 advierte que no debe repetirse automáticamente la solicitud y no lleva Retry-After', async () => {
    for (const estado of CINCO_XX) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
      expect(JSON.parse(texto)['error'], String(estado)).toContain('No repita la solicitud de forma automática.');
      expect(respuesta.headers.get('retry-after'), String(estado)).toBeNull();
    }
  });
  it('el registro conserva el código de GitHub tal cual (evento admin_github_error con causa "estado")', async () => {
    for (const estado of CINCO_XX) {
      registros.length = 0;
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      await llamar({ autorizacion: await bearer() });
      expect(registros, String(estado)).toEqual([JSON.stringify({ evento: 'admin_github_error', causa: 'estado', estadoHttp: estado })]);
    }
  });
  it('no hay reintentos: cada 5xx hace una sola llamada a GitHub', async () => {
    for (const estado of CINCO_XX) {
      enviar.mockClear();
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      await llamar({ autorizacion: await bearer() });
      expect(enviar, String(estado)).toHaveBeenCalledTimes(1);
    }
  });
  it('los 4xx siguen siendo 502 (fallo confirmado) y no 504', async () => {
    for (const estado of [400, 401, 403, 404, 405, 409, 410, 422, 429, 499]) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
      expect(respuesta.status, String(estado)).toBe(502);
      expect(JSON.parse(texto), String(estado)).toEqual({ error: 'No se pudo iniciar la ingesta.' });
    }
  });
  it('el éxito 204 sigue produciendo 202 con una sola llamada', async () => {
    enviar.mockImplementation(async () => new Response(null, { status: 204 }));
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(202);
    expect(JSON.parse(texto)).toEqual({ estado: 'solicitado' });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(registros).toEqual([]);
  });
  it('un error de red y un plazo vencido siguen dando 504, igual que un 5xx', async () => {
    enviar.mockImplementation(async () => {
      throw new TypeError('x');
    });
    const porRed = await llamar({ autorizacion: await bearer() });
    enviar.mockImplementation(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
    );
    const porTiempo = await llamar({ autorizacion: await bearer(), plazoGitHubMs: 20 });
    enviar.mockImplementation(async () => new Response(null, { status: 503 }));
    const por5xx = await llamar({ autorizacion: await bearer() });
    for (const { respuesta, texto } of [porRed, porTiempo, por5xx]) {
      expect(respuesta.status).toBe(504);
      expect(JSON.parse(texto)).toEqual(DESCONOCIDO);
    }
  });
  it('un 5xx no filtra el token de GitHub ni el cuerpo de la respuesta de GitHub', async () => {
    enviar.mockImplementation(async () => new Response(`error con ${TOKEN_GITHUB_CANARIO}`, { status: 503 }));
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(texto + JSON.stringify([...respuesta.headers.entries()]) + registros.join('\n')).not.toContain(TOKEN_GITHUB_CANARIO);
  });
});
describe('Worker: los 2xx de GitHub distintos de 204 son resultado desconocido (504)', () => {
  const DESCONOCIDO = {
    estado: 'desconocido',
    error: 'No se pudo confirmar si la ingesta se inició. Revise las ejecuciones en GitHub. No repita la solicitud de forma automática.',
  };
  const DOS_XX = [200, 201, 202, 203, 205, 206, 207, 226, 299];
  it('un 200 con los datos de la ejecución (contrato de la versión 2026-03-10) da 504 y no filtra el cuerpo', async () => {
    enviar.mockImplementation(
      async () =>
        new Response('{"workflow_run_id":1,"run_url":"https://api.github.com/detalle-interno","html_url":"https://github.com/detalle-interno"}', {
          status: 200,
        }),
    );
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(504);
    expect(JSON.parse(texto)).toEqual(DESCONOCIDO);
    comprobarCabecerasComunes(respuesta);
    expect(texto).not.toContain('detalle-interno');
    expect(texto).not.toContain('workflow_run_id');
  });
  it('cualquier 2xx distinto de 204 da 504, con el aviso de no repetir automáticamente y sin Retry-After', async () => {
    for (const estado of DOS_XX) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
      expect(respuesta.status, String(estado)).toBe(504);
      expect(JSON.parse(texto), String(estado)).toEqual(DESCONOCIDO);
      expect(JSON.parse(texto)['error'], String(estado)).toContain('No repita la solicitud de forma automática.');
      expect(respuesta.headers.get('retry-after'), String(estado)).toBeNull();
    }
  });
  it('el registro conserva el código de GitHub tal cual (admin_github_error con causa "estado")', async () => {
    for (const estado of DOS_XX) {
      registros.length = 0;
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      await llamar({ autorizacion: await bearer() });
      expect(registros, String(estado)).toEqual([JSON.stringify({ evento: 'admin_github_error', causa: 'estado', estadoHttp: estado })]);
    }
  });
  it('no hay reintentos: cada 2xx distinto de 204 hace una sola llamada a GitHub', async () => {
    for (const estado of DOS_XX) {
      enviar.mockClear();
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      await llamar({ autorizacion: await bearer() });
      expect(enviar, String(estado)).toHaveBeenCalledTimes(1);
    }
  });
  it('el 204 sigue dando 202 y los 3xx y 4xx siguen dando 502', async () => {
    enviar.mockImplementation(async () => new Response(null, { status: 204 }));
    expect((await llamar({ autorizacion: await bearer() })).respuesta.status).toBe(202);
    for (const estado of [301, 302, 399, 400, 404, 429, 499]) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      expect((await llamar({ autorizacion: await bearer() })).respuesta.status, String(estado)).toBe(502);
    }
  });
  it('un 2xx distinto de 204, un 5xx, un error de red y un plazo vencido dan la misma respuesta 504', async () => {
    const respuestas: Array<{ respuesta: Response; texto: string }> = [];
    for (const estado of [200, 202, 500, 503]) {
      enviar.mockImplementation(async () => new Response(null, { status: estado }));
      respuestas.push(await llamar({ autorizacion: await bearer() }));
    }
    enviar.mockImplementation(async () => {
      throw new TypeError('x');
    });
    respuestas.push(await llamar({ autorizacion: await bearer() }));
    enviar.mockImplementation(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
    );
    respuestas.push(await llamar({ autorizacion: await bearer(), plazoGitHubMs: 20 }));
    for (const { respuesta, texto } of respuestas) {
      expect(respuesta.status).toBe(504);
      expect(JSON.parse(texto)).toEqual(DESCONOCIDO);
    }
  });
});
describe('Worker: excepciones inesperadas (B3)', () => {
  const ERROR_500 = { error: 'Error interno.' };
  const solicitudRota = { url: 'no es una url', method: 'POST', headers: new Headers() } as unknown as Request;
  const marcas = [TOKEN_GITHUB_CANARIO, 'secreto-en-la-excepcion', 'api.github.com', 'stack'];
  const sinFugas = (texto: string) => {
    for (const marca of marcas) expect(texto, marca).not.toContain(marca);
  };
  it('una excepción al analizar la solicitud: 500 genérico, JSON y cabeceras comunes', async () => {
    const respuesta = await manejar(solicitudRota, env, { registrar: (l) => registros.push(l), fetch: enviar });
    expect(respuesta.status).toBe(500);
    expect(JSON.parse(await respuesta.text())).toEqual(ERROR_500);
    comprobarCabecerasComunes(respuesta);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('el registro de la excepción solo lleva el evento y si el disparo se había iniciado, sin mensaje ni pila', async () => {
    await manejar(solicitudRota, env, { registrar: (l) => registros.push(l), fetch: enviar });
    expect(registros).toEqual([JSON.stringify({ evento: 'admin_error_inesperado', disparoIniciado: false })]);
  });
  it.each([
    ['un Error con secretos en el mensaje', () => new Error(`secreto-en-la-excepcion ${TOKEN_GITHUB_CANARIO} api.github.com`)],
    ['un texto', () => `secreto-en-la-excepcion ${TOKEN_GITHUB_CANARIO}`],
    ['un objeto con toString', () => ({ toString: () => `secreto-en-la-excepcion ${TOKEN_GITHUB_CANARIO}` })],
    ['un Error con causa y pila', () => Object.assign(new Error('secreto-en-la-excepcion'), { cause: { token: TOKEN_GITHUB_CANARIO } })],
    ['null', () => null],
    ['undefined', () => undefined],
  ])('si el reloj lanza %s: 500 genérico sin filtrar nada y sin llamar a GitHub', async (_nombre, crear) => {
    const solicitud = new Request(URL_RECARGA, { method: 'POST', headers: { authorization: await bearer() } });
    const respuesta = await manejar(solicitud, env, {
      ahora: () => {
        throw crear();
      },
      registrar: (l) => registros.push(l),
      fetch: enviar,
    });
    const texto = await respuesta.text();
    expect(respuesta.status).toBe(500);
    expect(JSON.parse(texto)).toEqual(ERROR_500);
    sinFugas(texto + JSON.stringify([...respuesta.headers.entries()]) + registros.join('\n'));
    expect(registros).toEqual([JSON.stringify({ evento: 'admin_error_inesperado', disparoIniciado: false })]);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('una excepción después de iniciar el disparo se trata como resultado desconocido (504), no como 500', async () => {
    // `fetch` devuelve `undefined`: la respuesta se envió pero es inutilizable. Puede que GitHub haya iniciado el workflow.
    enviar.mockImplementation((async () => undefined) as unknown as FetchInyectable);
    const { respuesta, texto } = await llamar({ autorizacion: await bearer() });
    expect(respuesta.status).toBe(504);
    expect(JSON.parse(texto)['estado']).toBe('desconocido');
    expect(registros).toEqual([JSON.stringify({ evento: 'admin_error_inesperado', disparoIniciado: true })]);
    sinFugas(texto + registros.join('\n'));
  });
  it('un fallo al escribir el registro no cambia la respuesta de un 401, un 403 ni un 503', async () => {
    const roto = (): never => {
      throw new Error('secreto-en-la-excepcion');
    };
    const intentos: Array<[string, Request, Env, number]> = [
      ['401', new Request(URL_RECARGA, { method: 'POST' }), env, 401],
      ['403', new Request(URL_RECARGA, { method: 'POST', headers: { authorization: await bearer({ rol: 'user' }) } }), env, 403],
      ['503', new Request(URL_RECARGA, { method: 'POST' }), {}, 503],
    ];
    for (const [nombre, solicitud, entornoPrueba, esperado] of intentos) {
      const respuesta = await manejar(solicitud, entornoPrueba, { ahora: () => AHORA_MS, registrar: roto, fetch: enviar });
      expect(respuesta.status, nombre).toBe(esperado);
      sinFugas(await respuesta.text());
    }
    expect(enviar).not.toHaveBeenCalled();
  });
  it('un fallo al escribir el registro tampoco impide responder 500 ni 202', async () => {
    const roto = (): never => {
      throw new Error('secreto-en-la-excepcion');
    };
    const rota = await manejar(solicitudRota, env, { registrar: roto, fetch: enviar });
    expect(rota.status).toBe(500);
    const valida = new Request(URL_RECARGA, { method: 'POST', headers: { authorization: await bearer() } });
    const ok = await manejar(valida, env, { ahora: () => AHORA_MS, registrar: roto, fetch: enviar });
    expect(ok.status).toBe(202);
  });
  it('conserva los registros de seguridad existentes: el rechazo 401 sigue escribiendo su línea completa', async () => {
    const { respuesta } = await llamar({ cabeceras: { 'cf-connecting-ip': '203.0.113.7' } });
    expect(respuesta.status).toBe(401);
    expect(registro()).toEqual({
      evento: 'admin_rechazo',
      timestamp: '2030-01-15T12:00:00Z',
      ip: '203.0.113.7',
      recurso: '/admin/reload',
      estado: 401,
      motivo: 'sin_credencial',
      metodo: 'POST',
    });
  });
});
describe('Worker: falla cerrado cuando falta configuración (503)', () => {
  const sinClave = (cambios: Record<string, string | undefined>) => entorno(par.jwkPublico, cambios);
  it.each([
    ['sin clave pública', { ADMIN_JWT_PUBLIC_KEY: undefined }],
    ['clave pública vacía', { ADMIN_JWT_PUBLIC_KEY: '' }],
    ['clave pública que no es JSON', { ADMIN_JWT_PUBLIC_KEY: 'no es json' }],
    ['clave de otro tipo (RSA)', { ADMIN_JWT_PUBLIC_KEY: '{"kty":"RSA","n":"AAAA","e":"AQAB"}' }],
    ['sin emisor', { ADMIN_JWT_ISSUER: undefined }],
    ['emisor vacío', { ADMIN_JWT_ISSUER: '' }],
    ['emisor con salto de línea', { ADMIN_JWT_ISSUER: 'a\nb' }],
    ['emisor demasiado largo', { ADMIN_JWT_ISSUER: 'a'.repeat(257) }],
    ['sin audiencia', { ADMIN_JWT_AUDIENCE: undefined }],
    ['audiencia vacía', { ADMIN_JWT_AUDIENCE: '' }],
  ])('%s: 503 aunque la credencial sea válida y sin llamar a GitHub', async (_nombre, cambios) => {
    const { respuesta, texto } = await llamar({ autorizacion: await bearer(), entorno: sinClave(cambios) });
    expect(respuesta.status).toBe(503);
    expect(JSON.parse(texto)).toEqual({ error: 'Servicio no disponible.' });
    comprobarCabecerasComunes(respuesta);
    expect(enviar).not.toHaveBeenCalled();
    expect(registros).toEqual([JSON.stringify({ evento: 'admin_config_invalida', componente: 'jwt' })]);
  });
  it('una clave con parte privada se rechaza como configuración inválida: la clave privada no puede estar en el Worker', async () => {
    const { exportJWK } = await import('jose');
    const privado = JSON.stringify(await exportJWK(par.privada));
    const { respuesta } = await llamar({ autorizacion: await bearer(), entorno: sinClave({ ADMIN_JWT_PUBLIC_KEY: privado }) });
    expect(respuesta.status).toBe(503);
    expect(registros.join('')).not.toContain(privado);
    expect(enviar).not.toHaveBeenCalled();
  });
  it('un entorno completamente vacío: 503 sin llamar a nadie', async () => {
    const { respuesta } = await llamar({ autorizacion: await bearer(), entorno: {} });
    expect(respuesta.status).toBe(503);
    expect(enviar).not.toHaveBeenCalled();
  });
  it.each([
    ['sin token de GitHub', { ADMIN_GITHUB_TOKEN: undefined }],
    ['sin propietario', { ADMIN_GITHUB_OWNER: undefined }],
    ['sin repositorio', { ADMIN_GITHUB_REPO: undefined }],
    ['sin workflow', { ADMIN_GITHUB_WORKFLOW: undefined }],
    ['sin rama', { ADMIN_GITHUB_REF: undefined }],
    ['workflow con ruta', { ADMIN_GITHUB_WORKFLOW: '../a.yml' }],
  ])('%s: un administrador recibe 503 y no se llama a GitHub', async (_nombre, cambios) => {
    const { respuesta } = await llamar({ autorizacion: await bearer(), entorno: sinClave(cambios) });
    expect(respuesta.status).toBe(503);
    expect(enviar).not.toHaveBeenCalled();
    expect(registros).toEqual([JSON.stringify({ evento: 'admin_config_invalida', componente: 'github' })]);
  });
  it('con la configuración de GitHub incompleta, una credencial inválida sigue recibiendo 401 y queda registrada', async () => {
    const { respuesta } = await llamar({ entorno: sinClave({ ADMIN_GITHUB_TOKEN: undefined }) });
    expect(respuesta.status).toBe(401);
    expect(registro()['evento']).toBe('admin_rechazo');
  });
  it('con la configuración de GitHub incompleta, un método distinto de POST de un administrador recibe 405', async () => {
    const { respuesta } = await llamar({ metodo: 'GET', autorizacion: await bearer(), entorno: sinClave({ ADMIN_GITHUB_TOKEN: undefined }) });
    expect(respuesta.status).toBe(405);
  });
});
describe('Worker: exportación por defecto', () => {
  it('atiende solicitudes y escribe el registro con console.log', async () => {
    const espia = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const respuesta = await worker.fetch(new Request(URL_RECARGA, { method: 'POST' }), env);
      expect(respuesta.status).toBe(401);
      expect(espia).toHaveBeenCalledTimes(1);
      const linea = espia.mock.calls[0]?.[0] as string;
      expect(JSON.parse(linea)).toMatchObject({ evento: 'admin_rechazo', estado: 401, motivo: 'sin_credencial', metodo: 'POST' });
    } finally {
      espia.mockRestore();
    }
  });
  it('el 404 por defecto no escribe nada', async () => {
    const espia = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const respuesta = await worker.fetch(new Request(`${ORIGEN}/otra`), env);
      expect(respuesta.status).toBe(404);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      espia.mockRestore();
    }
  });
});
describe('Worker: ningún secreto ni credencial sale en respuestas ni en registros (Requisito 15.4)', () => {
  it('recorre todos los escenarios y no encuentra tokens, claves ni cabeceras Authorization', async () => {
    const valido = await bearer();
    const usuario = await bearer({ rol: 'user' });
    const expirado = await bearer({ iat: AHORA_S - 700, exp: AHORA_S - 100 });
    const jwtValido = valido.slice('Bearer '.length);
    const ajeno = await firmar((await crearParDeClaves()).privada, claimsValidos());
    const escenarios: Opciones[] = [
      { autorizacion: valido },
      { autorizacion: usuario },
      { autorizacion: expirado },
      { autorizacion: `Bearer ${ajeno}` },
      { autorizacion: valido, metodo: 'GET' },
      { autorizacion: valido, entorno: {} },
      { autorizacion: valido, entorno: entorno(par.jwkPublico, { ADMIN_GITHUB_REF: undefined }) },
      { autorizacion: 'Basic abc' },
      {},
    ];
    for (const escenario of escenarios) await llamar(escenario);
    enviar.mockImplementation(async () => new Response('x', { status: 500 }));
    await llamar({ autorizacion: valido });
    enviar.mockImplementation(async () => {
      throw new Error(`error con ${TOKEN_GITHUB_CANARIO}`);
    });
    await llamar({ autorizacion: valido });
    const visible = todoLoVisible.join('\n');
    for (const secreto of [TOKEN_GITHUB_CANARIO, jwtValido, usuario.slice(7), expirado.slice(7), ajeno, 'Bearer ', 'authorization']) {
      expect(visible.toLowerCase(), secreto).not.toContain(secreto.toLowerCase());
    }
    expect(visible).not.toContain('"d":');
  });
  it('todas las respuestas del Worker son JSON con no-store y nosniff', async () => {
    const respuestas = [
      await llamar({ ruta: '/x' }),
      await llamar({}),
      await llamar({ autorizacion: await bearer({ rol: 'user' }) }),
      await llamar({ metodo: 'PUT', autorizacion: await bearer() }),
      await llamar({ autorizacion: await bearer(), entorno: {} }),
      await llamar({ autorizacion: await bearer() }),
    ];
    expect(respuestas.map((r) => r.respuesta.status)).toEqual([404, 401, 403, 405, 503, 202]);
    for (const { respuesta } of respuestas) comprobarCabecerasComunes(respuesta);
    enviar.mockImplementation(async () => new Response(null, { status: 404 }));
    const fallo = await llamar({ autorizacion: await bearer() });
    expect(fallo.respuesta.status).toBe(502);
    comprobarCabecerasComunes(fallo.respuesta);
  });
});
