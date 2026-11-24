import { describe, expect, it, vi } from 'vitest';
import { TOKEN_GITHUB_CANARIO } from './ayudas-de-prueba.ts';
import {
  ESTADO_EXITO_GITHUB,
  PLAZO_GITHUB_MS,
  dispararWorkflow,
  leerConfigGitHub,
  resultadoEsDesconocido,
  urlDeDisparo,
  type ConfigGitHub,
  type EntornoGitHub,
  type FetchInyectable,
} from './github.ts';
// Tarea 14.2. Requisito 15.4. Disparo de `workflow_dispatch` con `fetch` inyectado: ninguna prueba toca la red.
const ENTORNO: EntornoGitHub = {
  ADMIN_GITHUB_TOKEN: TOKEN_GITHUB_CANARIO,
  ADMIN_GITHUB_OWNER: 'propietario-de-prueba',
  ADMIN_GITHUB_REPO: 'repositorio-de-prueba',
  ADMIN_GITHUB_WORKFLOW: 'flujo-de-prueba.yml',
  ADMIN_GITHUB_REF: 'rama-de-prueba',
};
const CONFIG: ConfigGitHub = {
  token: TOKEN_GITHUB_CANARIO,
  propietario: 'propietario-de-prueba',
  repositorio: 'repositorio-de-prueba',
  workflow: 'flujo-de-prueba.yml',
  ref: 'rama-de-prueba',
};
const con = (cambios: Partial<Record<keyof EntornoGitHub, string | undefined>>): EntornoGitHub => ({ ...ENTORNO, ...cambios });
const respuesta = (estado: number) => new Response(null, { status: estado === 204 ? 204 : estado });
describe('leerConfigGitHub', () => {
  it('lee una configuración completa y válida', () => {
    expect(leerConfigGitHub(ENTORNO)).toEqual(CONFIG);
  });
  it.each(['ADMIN_GITHUB_TOKEN', 'ADMIN_GITHUB_OWNER', 'ADMIN_GITHUB_REPO', 'ADMIN_GITHUB_WORKFLOW', 'ADMIN_GITHUB_REF'] as const)(
    'falla cerrado si falta %s o está vacío',
    (clave) => {
      expect(leerConfigGitHub(con({ [clave]: undefined }))).toBeUndefined();
      expect(leerConfigGitHub(con({ [clave]: '' }))).toBeUndefined();
    },
  );
  it('un entorno vacío falla cerrado', () => {
    expect(leerConfigGitHub({})).toBeUndefined();
  });
  it.each([
    ['propietario con barra', { ADMIN_GITHUB_OWNER: 'a/b' }],
    ['propietario con punto', { ADMIN_GITHUB_OWNER: 'a.b' }],
    ['propietario que empieza con guion', { ADMIN_GITHUB_OWNER: '-a' }],
    ['propietario de 40 caracteres', { ADMIN_GITHUB_OWNER: 'a'.repeat(40) }],
    ['propietario con espacio', { ADMIN_GITHUB_OWNER: 'a b' }],
    ['repositorio con barra', { ADMIN_GITHUB_REPO: 'a/b' }],
    ['repositorio ..', { ADMIN_GITHUB_REPO: '..' }],
    ['repositorio .', { ADMIN_GITHUB_REPO: '.' }],
    ['repositorio con espacio', { ADMIN_GITHUB_REPO: 'a b' }],
    ['repositorio de 101 caracteres', { ADMIN_GITHUB_REPO: 'a'.repeat(101) }],
    ['workflow sin extensión yml', { ADMIN_GITHUB_WORKFLOW: 'flujo.sh' }],
    ['workflow con barra', { ADMIN_GITHUB_WORKFLOW: '.github/workflows/a.yml' }],
    ['workflow con ../', { ADMIN_GITHUB_WORKFLOW: '../a.yml' }],
    ['workflow que empieza con punto', { ADMIN_GITHUB_WORKFLOW: '.a.yml' }],
    ['workflow numérico', { ADMIN_GITHUB_WORKFLOW: '12345' }],
    ['workflow con espacio', { ADMIN_GITHUB_WORKFLOW: 'a b.yml' }],
    ['workflow con consulta', { ADMIN_GITHUB_WORKFLOW: 'a.yml?x=1' }],
    ['ref con ..', { ADMIN_GITHUB_REF: 'a..b' }],
    ['ref que empieza con barra', { ADMIN_GITHUB_REF: '/a' }],
    ['ref que termina con barra', { ADMIN_GITHUB_REF: 'a/' }],
    ['ref con espacio', { ADMIN_GITHUB_REF: 'a b' }],
    ['ref con salto de línea', { ADMIN_GITHUB_REF: 'a\nb' }],
    ['ref con comillas', { ADMIN_GITHUB_REF: 'a"b' }],
    ['ref de 256 caracteres', { ADMIN_GITHUB_REF: 'a'.repeat(256) }],
    ['token con espacio', { ADMIN_GITHUB_TOKEN: 'abc def' }],
    ['token con salto de línea', { ADMIN_GITHUB_TOKEN: 'abc\r\nX: y' }],
    ['token con carácter no ASCII', { ADMIN_GITHUB_TOKEN: 'abcñ' }],
    ['token de 513 caracteres', { ADMIN_GITHUB_TOKEN: 'a'.repeat(513) }],
  ])('rechaza %s', (_nombre, cambios) => {
    expect(leerConfigGitHub(con(cambios))).toBeUndefined();
  });
  it('acepta ramas con barra interna, punto y guion', () => {
    expect(leerConfigGitHub(con({ ADMIN_GITHUB_REF: 'release/1.0-a_b' }))?.ref).toBe('release/1.0-a_b');
  });
  it('acepta .yaml además de .yml', () => {
    expect(leerConfigGitHub(con({ ADMIN_GITHUB_WORKFLOW: 'flujo.yaml' }))?.workflow).toBe('flujo.yaml');
  });
});
describe('urlDeDisparo', () => {
  it('apunta a la API de GitHub, a workflow_dispatch de ese repositorio y archivo', () => {
    expect(urlDeDisparo(CONFIG)).toBe(
      'https://api.github.com/repos/propietario-de-prueba/repositorio-de-prueba/actions/workflows/flujo-de-prueba.yml/dispatches',
    );
  });
  it('codifica los segmentos', () => {
    const rara: ConfigGitHub = { ...CONFIG, repositorio: 'a b?c#d', workflow: 'x/y.yml' };
    const url = urlDeDisparo(rara);
    expect(url).toContain('/repos/propietario-de-prueba/a%20b%3Fc%23d/actions/workflows/x%2Fy.yml/dispatches');
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe('');
  });
});
describe('dispararWorkflow: la solicitud', () => {
  it('envía POST con el token, el cuerpo fijo y sin seguir redirecciones', async () => {
    const enviar = vi.fn<FetchInyectable>(async () => respuesta(204));
    expect(await dispararWorkflow(CONFIG, { fetch: enviar })).toEqual({ ok: true });
    expect(enviar).toHaveBeenCalledTimes(1);
    const [url, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(urlDeDisparo(CONFIG));
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN_GITHUB_CANARIO}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'teletexto-admin-worker',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"ref":"rama-de-prueba"}');
  });
  it('el cuerpo solo tiene `ref`: no hay entradas ni datos del usuario', async () => {
    const enviar = vi.fn<FetchInyectable>(async () => respuesta(204));
    await dispararWorkflow(CONFIG, { fetch: enviar });
    const [, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(Object.keys(JSON.parse(String(init.body)) as object)).toEqual(['ref']);
  });
  it('cancela el cuerpo de la respuesta, que no se usa', async () => {
    const cancelar = vi.fn(async () => undefined);
    const falsa = { status: 204, body: { cancel: cancelar } } as unknown as Response;
    expect(await dispararWorkflow(CONFIG, { fetch: async () => falsa })).toEqual({ ok: true });
    expect(cancelar).toHaveBeenCalledTimes(1);
  });
  it('un fallo al cancelar el cuerpo no cambia el resultado', async () => {
    const falsa = { status: 204, body: { cancel: async () => Promise.reject(new Error('x')) } } as unknown as Response;
    expect(await dispararWorkflow(CONFIG, { fetch: async () => falsa })).toEqual({ ok: true });
  });
  it('usa 10 segundos de tiempo límite por defecto', () => {
    expect(PLAZO_GITHUB_MS).toBe(10_000);
  });
});
describe('dispararWorkflow: éxito solo con 204', () => {
  it('el código de éxito aprobado es 204', () => {
    expect(ESTADO_EXITO_GITHUB).toBe(204);
  });
  it.each([200, 201, 202, 203, 205, 206, 301, 302, 303, 307, 308, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503])(
    'GitHub responde %i: es un fallo con ese código',
    async (estado) => {
      const resultado = await dispararWorkflow(CONFIG, { fetch: async () => respuesta(estado) });
      expect(resultado).toEqual({ ok: false, causa: 'estado', estadoHttp: estado });
    },
  );
});
describe('dispararWorkflow: errores de red y tiempo límite', () => {
  it('un error de red es un fallo "red"', async () => {
    const resultado = await dispararWorkflow(CONFIG, {
      fetch: async () => {
        throw new TypeError('fallo de red');
      },
    });
    expect(resultado).toEqual({ ok: false, causa: 'red' });
  });
  it('el resultado de un error no incluye el token, la URL ni el texto del error', async () => {
    const resultado = await dispararWorkflow(CONFIG, {
      fetch: async (url, init) => {
        throw new Error(`falló ${url} con ${JSON.stringify(init.headers)}`);
      },
    });
    const texto = JSON.stringify(resultado);
    expect(texto).not.toContain(TOKEN_GITHUB_CANARIO);
    expect(texto).not.toContain('api.github.com');
    expect(texto).not.toContain('falló');
  });
  it('si GitHub no responde antes del plazo, es un fallo "tiempo"', async () => {
    const colgado: FetchInyectable = (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
      });
    const antes = Date.now();
    const resultado = await dispararWorkflow(CONFIG, { fetch: colgado, plazoMs: 30 });
    expect(resultado).toEqual({ ok: false, causa: 'tiempo' });
    expect(Date.now() - antes).toBeLessThan(2000);
  });
  it('un error lanzado después de vencer el plazo también cuenta como "tiempo"', async () => {
    const tardio: FetchInyectable = (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init.signal?.addEventListener('abort', () => rechazar(new Error('abortado')));
      });
    expect(await dispararWorkflow(CONFIG, { fetch: tardio, plazoMs: 20 })).toEqual({ ok: false, causa: 'tiempo' });
  });
  it('no reintenta: un fallo de red o un plazo vencido hacen una sola llamada', async () => {
    const falla = vi.fn<FetchInyectable>(async () => {
      throw new TypeError('fallo de red');
    });
    await dispararWorkflow(CONFIG, { fetch: falla });
    expect(falla).toHaveBeenCalledTimes(1);
    const colgado = vi.fn<FetchInyectable>(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
    );
    await dispararWorkflow(CONFIG, { fetch: colgado, plazoMs: 20 });
    expect(colgado).toHaveBeenCalledTimes(1);
  });
  it('no lanza excepciones con ninguna respuesta rara', async () => {
    for (const falsa of [{ status: 0 }, { status: 204 }, { status: 500, body: null }]) {
      await expect(dispararWorkflow(CONFIG, { fetch: async () => falsa as unknown as Response })).resolves.toBeDefined();
    }
  });
});
describe('resultadoEsDesconocido: fallo confirmado frente a resultado desconocido (B2)', () => {
  it.each([400, 401, 403, 404, 405, 409, 410, 422, 429, 499])('una respuesta de GitHub con código %i (4xx) es un fallo confirmado', (estadoHttp) => {
    expect(resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp })).toBe(false);
  });
  it.each([300, 301, 302, 303, 304, 307, 308, 399])('una respuesta de GitHub con código %i (3xx) es un fallo confirmado', (estadoHttp) => {
    expect(resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp })).toBe(false);
  });
  it.each([200, 201, 202, 203, 205, 206, 207, 226, 299])('una respuesta de GitHub con código %i (2xx distinto de 204) es un resultado desconocido', (estadoHttp) => {
    expect(resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp })).toBe(true);
  });
  it.each([500, 501, 502, 503, 504])('una respuesta de GitHub con código %i es un resultado desconocido', (estadoHttp) => {
    expect(resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp })).toBe(true);
  });
  it.each([505, 506, 507, 508, 510, 511, 520, 521, 522, 524, 529, 599])('cualquier otro 5xx (%i) también es un resultado desconocido', (estadoHttp) => {
    expect(resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp })).toBe(true);
  });
  it('los límites entre clases: 299 es desconocido, 300 a 499 son confirmados, y de 500 a 599 son desconocidos', () => {
    const desconocido = (estadoHttp: number) => resultadoEsDesconocido({ ok: false, causa: 'estado', estadoHttp });
    expect([200, 299].map(desconocido)).toEqual([true, true]);
    expect([300, 399, 400, 499].map(desconocido)).toEqual([false, false, false, false]);
    expect([500, 599].map(desconocido)).toEqual([true, true]);
  });
  it.each(['red', 'tiempo'] as const)('la causa "%s" es un resultado desconocido', (causa) => {
    expect(resultadoEsDesconocido({ ok: false, causa })).toBe(true);
  });
  it('dispararWorkflow conserva el código de GitHub en todo 4xx y 5xx, para que el registro lo escriba tal cual', async () => {
    for (const estadoHttp of [200, 201, 202, 206, 301, 302, 400, 404, 429, 500, 502, 503, 504, 599]) {
      expect(await dispararWorkflow(CONFIG, { fetch: async () => respuesta(estadoHttp) })).toEqual({ ok: false, causa: 'estado', estadoHttp });
    }
  });
  it('clasifica como desconocido el resultado real de cada 2xx distinto de 204 y de cada 5xx, y como confirmado el de cada 3xx y 4xx', async () => {
    for (const estado of [200, 201, 202, 203, 205, 206, 299, 500, 501, 502, 503, 504, 505, 507, 511, 520, 599]) {
      const resultado = await dispararWorkflow(CONFIG, { fetch: async () => respuesta(estado) });
      if (resultado.ok) throw new Error('se esperaba un fallo');
      expect(resultadoEsDesconocido(resultado), String(estado)).toBe(true);
    }
    for (const estado of [300, 301, 302, 303, 307, 308, 399, 400, 401, 403, 404, 409, 410, 422, 429, 499]) {
      const resultado = await dispararWorkflow(CONFIG, { fetch: async () => respuesta(estado) });
      if (resultado.ok) throw new Error('se esperaba un fallo');
      expect(resultadoEsDesconocido(resultado), String(estado)).toBe(false);
    }
  });
  it('el 204 sigue siendo éxito y no es un fallo que clasificar', async () => {
    expect(await dispararWorkflow(CONFIG, { fetch: async () => respuesta(204) })).toEqual({ ok: true });
  });
  it('un 5xx o un 2xx distinto de 204 no se reintenta: una sola llamada por cada uno', async () => {
    for (const estado of [200, 201, 202, 206, 500, 502, 503, 504, 599]) {
      const enviar = vi.fn<FetchInyectable>(async () => respuesta(estado));
      await dispararWorkflow(CONFIG, { fetch: enviar });
      expect(enviar, String(estado)).toHaveBeenCalledTimes(1);
    }
  });
  it('clasifica los resultados reales de dispararWorkflow', async () => {
    const respondido = await dispararWorkflow(CONFIG, { fetch: async () => respuesta(404) });
    const sinRed = await dispararWorkflow(CONFIG, {
      fetch: async () => {
        throw new TypeError('x');
      },
    });
    const colgado = await dispararWorkflow(CONFIG, {
      fetch: (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
      plazoMs: 20,
    });
    if (respondido.ok || sinRed.ok || colgado.ok) throw new Error('se esperaban fallos');
    expect(resultadoEsDesconocido(respondido)).toBe(false);
    expect(resultadoEsDesconocido(sinRed)).toBe(true);
    expect(resultadoEsDesconocido(colgado)).toBe(true);
  });
});
