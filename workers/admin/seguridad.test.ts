import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// Tarea 14.2. Requisito 15.4 y reglas de dependencia de structure.md. Revisión estática de `workers/admin`:
// sin secretos ni claves privadas en el repositorio, sin dependencias prohibidas, con el código de producción separado de las
// ayudas de prueba y con la documentación honesta.
const DIRECTORIO = new URL('./', import.meta.url);
const todos = readdirSync(DIRECTORIO);
const archivos = todos.filter((n) => n.endsWith('.ts') || n.endsWith('.json') || n.endsWith('.md'));
const leer = (nombre: string) => readFileSync(new URL(nombre, DIRECTORIO), 'utf8');
const AYUDAS = 'ayudas-de-prueba.ts';
const esPrueba = (nombre: string) => nombre.endsWith('.test.ts');
const fuentesTs = todos.filter((n) => n.endsWith('.ts'));
/** Código de producción: todo `.ts` que no es una prueba ni la ayuda de pruebas. */
const fuentes = fuentesTs.filter((n) => !esPrueba(n) && n !== AYUDAS);
const readme = leer('README.md');
/** Quita los comentarios de bloque y las líneas que son solo un comentario. */
const sinComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * Especificadores de módulo de un texto TypeScript: `import ... from 'x'`, `export ... from 'x'`, `import 'x'`, `import('x')` y
 * `require('x')`, con comillas simples, dobles o de plantilla, también en varias líneas y con `import type`.
 */
function especificadores(texto: string): string[] {
  const limpio = sinComentarios(texto);
  const patrones = [
    /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"`])([^'"`]+)\1/g,
    /\bimport\s*(['"`])([^'"`]+)\1/g,
    /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
    /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  ];
  const encontrados = new Set<string>();
  for (const patron of patrones) for (const coincidencia of limpio.matchAll(patron)) encontrados.add(coincidencia[2] ?? '');
  return [...encontrados];
}
/** Nombre del archivo del paquete al que apunta un especificador relativo, o `undefined` si sale del directorio o no es relativo. */
function resolverLocal(desde: string, especificador: string): string | undefined {
  if (!especificador.startsWith('.')) return undefined;
  const destino = new URL(especificador, new URL(desde, DIRECTORIO)).href;
  return destino.startsWith(DIRECTORIO.href) ? destino.slice(DIRECTORIO.href.length) : undefined;
}
/** Archivos del paquete alcanzables desde `inicio` siguiendo importaciones relativas (también las indirectas). */
function alcanzables(inicio: string): Set<string> {
  const vistos = new Set<string>();
  const pendientes = [inicio];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() ?? '';
    if (vistos.has(actual) || !todos.includes(actual)) continue;
    vistos.add(actual);
    for (const especificador of especificadores(leer(actual))) {
      const local = resolverLocal(actual, especificador);
      if (local !== undefined) pendientes.push(local);
    }
  }
  return vistos;
}
describe('workers/admin: sin secretos ni claves privadas en el repositorio (Requisito 15.4)', () => {
  it('ningún archivo contiene una clave privada PEM', () => {
    for (const nombre of archivos) expect(leer(nombre), nombre).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  });
  it('ningún archivo contiene un JWK con parte privada ni un token de GitHub con forma real', () => {
    for (const nombre of archivos) {
      const texto = leer(nombre);
      expect(texto, nombre).not.toMatch(/"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/);
      expect(texto, nombre).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{36,}\b/);
      expect(texto, nombre).not.toMatch(/\bgithub_pat_[A-Za-z0-9_]{20,}/);
    }
  });
  it('ningún archivo contiene un JWT completo escrito a mano', () => {
    for (const nombre of archivos) expect(leer(nombre), nombre).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });
  it('no hay configuración de despliegue ni archivos de secretos locales', () => {
    for (const prohibido of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc', '.dev.vars', '.env']) {
      expect(todos, prohibido).not.toContain(prohibido);
    }
  });
});
describe('workers/admin: dependencias y alcance (structure.md)', () => {
  it('el código de producción solo importa `jose` y otros módulos de producción del propio paquete', () => {
    for (const nombre of fuentes) {
      for (const especificador of especificadores(leer(nombre))) {
        if (especificador === 'jose') continue;
        const local = resolverLocal(nombre, especificador);
        expect(local, `${nombre} importa ${especificador}`).toBeDefined();
        expect(fuentes, `${nombre} importa ${especificador}`).toContain(local);
      }
    }
  });
  it('no importa de apps/web, tools, packages ni workers de otros paquetes', () => {
    for (const nombre of fuentes) {
      for (const especificador of especificadores(leer(nombre))) {
        expect(especificador, nombre).not.toMatch(/(^|\/)(apps|tools|packages|workers)(\/|$)|@teletexto/);
      }
    }
  });
  it('la única dependencia del paquete es jose', () => {
    const paquete = JSON.parse(leer('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(Object.keys(paquete.dependencies ?? {})).toEqual(['jose']);
    expect(paquete.devDependencies).toBeUndefined();
  });
  it('el código del Worker no usa process.env, eval ni Function', () => {
    for (const nombre of fuentes) {
      const texto = leer(nombre);
      expect(texto, nombre).not.toMatch(/process\.env|\beval\s*\(|new Function\s*\(/);
    }
  });
  it('el único registro es `console.log(linea)` en index.ts y nadie más escribe en la consola', () => {
    for (const nombre of fuentes) {
      const usos = sinComentarios(leer(nombre)).match(/console\.\w+/g) ?? [];
      expect(usos, nombre).toEqual(nombre === 'index.ts' ? ['console.log'] : []);
    }
  });
  it('la cabecera Authorization se lee solo en index.ts y nunca se pasa a console ni al registro', () => {
    for (const nombre of fuentes) {
      const lecturas = leer(nombre).match(/headers\.get\('authorization'\)/g) ?? [];
      expect(lecturas.length, nombre).toBe(nombre === 'index.ts' ? 1 : 0);
    }
  });
  it('el Worker acepta solo las claves de entorno documentadas', () => {
    const usadas = new Set<string>();
    for (const nombre of fuentes) for (const [, clave = ''] of leer(nombre).matchAll(/\b(ADMIN_[A-Z_]+)\b/g)) usadas.add(clave);
    expect([...usadas].sort()).toEqual(
      [
        'ADMIN_GITHUB_OWNER',
        'ADMIN_GITHUB_REF',
        'ADMIN_GITHUB_REPO',
        'ADMIN_GITHUB_TOKEN',
        'ADMIN_GITHUB_WORKFLOW',
        'ADMIN_JWT_AUDIENCE',
        'ADMIN_JWT_ISSUER',
        'ADMIN_JWT_PUBLIC_KEY',
      ].sort(),
    );
    for (const clave of usadas) expect(readme, clave).toContain(`\`${clave}\``);
  });
});
describe('workers/admin: las ayudas de prueba no entran en el código de producción (B5)', () => {
  it('hay código de producción y la ayuda de pruebas existe: la revisión no es vacía', () => {
    expect([...fuentes].sort()).toEqual(['authorize.ts', 'github.ts', 'index.ts', 'jwt.ts', 'registro.ts']);
    expect(todos).toContain(AYUDAS);
  });
  it('ningún módulo de producción menciona la ayuda de pruebas, ni siquiera en un comentario', () => {
    for (const nombre of fuentes) {
      expect(leer(nombre), nombre).not.toContain('ayudas-de-prueba');
      expect(leer(nombre), nombre).not.toContain('claves-efimeras');
    }
  });
  it('ningún módulo de producción importa, directa ni dinámicamente, la ayuda ni una prueba', () => {
    for (const nombre of fuentes) {
      for (const especificador of especificadores(leer(nombre))) {
        const local = resolverLocal(nombre, especificador);
        expect(local, `${nombre} importa ${especificador}`).not.toBe(AYUDAS);
        expect(local === undefined || !esPrueba(local), `${nombre} importa la prueba ${especificador}`).toBe(true);
      }
    }
  });
  it('desde el punto de entrada (index.ts) no se alcanza la ayuda ni ninguna prueba, ni siquiera de forma indirecta', () => {
    const alcanzados = alcanzables('index.ts');
    expect(alcanzados.has('index.ts')).toBe(true);
    expect(alcanzados.has(AYUDAS)).toBe(false);
    expect([...alcanzados].filter(esPrueba)).toEqual([]);
    for (const nombre of alcanzados) expect(fuentes, nombre).toContain(nombre);
  });
  it('desde cada módulo de producción tampoco se alcanza la ayuda ni una prueba', () => {
    for (const nombre of fuentes) {
      const alcanzados = alcanzables(nombre);
      expect(alcanzados.has(AYUDAS), nombre).toBe(false);
      expect([...alcanzados].filter(esPrueba), nombre).toEqual([]);
    }
  });
  it('solo los archivos `.test.ts` importan la ayuda', () => {
    const importadores = fuentesTs.filter((nombre) => especificadores(leer(nombre)).some((e) => resolverLocal(nombre, e) === AYUDAS));
    expect(importadores.length).toBeGreaterThan(0);
    for (const nombre of importadores) expect(esPrueba(nombre), `${nombre} importa la ayuda de pruebas`).toBe(true);
  });
  it('el punto de entrada del paquete es index.ts y no se exportan otros archivos', () => {
    const paquete = JSON.parse(leer('package.json')) as { main?: string; exports?: unknown; files?: unknown };
    expect(paquete.main).toBe('index.ts');
    expect(paquete.exports).toBeUndefined();
    expect(paquete.files).toBeUndefined();
  });
  it('la ayuda no guarda claves: solo genera pares efímeros en memoria', () => {
    const texto = leer(AYUDAS);
    expect(texto).toContain('generateKeyPair');
    expect(texto).not.toMatch(/-----BEGIN|importJWK|importPKCS8|readFileSync|writeFileSync/);
  });
});
describe('el detector de importaciones encuentra todas las formas (la revisión B5 no puede quedar ciega)', () => {
  const destino = './ayudas-de-prueba.ts';
  it.each([
    ['import con nombre', `import { a } from '${destino}';`],
    ['import por defecto', `import a from "${destino}";`],
    ['import type', `import type { A } from '${destino}';`],
    ['import con varias líneas', `import {\n  a,\n  b,\n} from '${destino}';`],
    ['export con nombre', `export { a } from '${destino}';`],
    ['export *', `export * from '${destino}';`],
    ['import de efecto secundario', `import '${destino}';`],
    ['import dinámico', `const m = await import('${destino}');`],
    ['import dinámico con plantilla', `const m = await import(\`${destino}\`);`],
    ['require', `const m = require('${destino}');`],
  ])('encuentra %s', (_nombre, codigo) => {
    expect(especificadores(codigo)).toEqual([destino]);
  });
  it('ignora las importaciones que están dentro de comentarios', () => {
    expect(especificadores(`// import a from '${destino}';\n/* import b from '${destino}'; */\nconst x = 1;`)).toEqual([]);
  });
  it('resuelve los especificadores relativos y detecta los que salen del paquete', () => {
    expect(resolverLocal('index.ts', './github.ts')).toBe('github.ts');
    expect(resolverLocal('index.ts', '../otro/modulo.ts')).toBeUndefined();
    expect(resolverLocal('index.ts', 'jose')).toBeUndefined();
  });
  it('alcanza los módulos de forma indirecta: index.ts llega a jwt.ts por authorize.ts', () => {
    expect(alcanzables('authorize.ts').has('jwt.ts')).toBe(true);
    expect(alcanzables('index.ts').has('registro.ts')).toBe(true);
  });
});
describe('workers/admin/README.md: documentación honesta', () => {
  it('declara que el Worker no está desplegado y no hay secretos configurados', () => {
    expect(readme).toContain('**El Worker no está desplegado y no hay ningún secreto configurado.**');
  });
  it('declara pendientes el workflow, su protección, el despliegue, la emisión de tokens y la prueba de extremo a extremo', () => {
    for (const texto of [
      'El workflow de ingesta. No existe ni se creó.',
      'La protección del workflow contra disparos repetidos',
      'Desplegar el Worker',
      'Emitir tokens de administrador',
      'La prueba de extremo a extremo',
    ]) {
      expect(readme).toContain(texto);
    }
  });
  it('documenta las decisiones aprobadas: ES256, 15 minutos, rol exacto, 204 y 405 con Allow', () => {
    for (const texto of ['Solo `ES256`', '15 minutos', '`rol` debe ser exactamente `admin`', 'Solo la respuesta **204** cuenta como éxito', '`Allow: POST`']) {
      expect(readme).toContain(texto);
    }
  });
  it('documenta la retención limitada de Workers Logs', () => {
    expect(readme).toContain('**3 días**');
    expect(readme).toContain('Tres días es poco para una auditoría.');
  });
  it('B1: explica que la versión 2022-11-28 sin return_run_details espera 204 y que otra versión cambia el contrato a 200', () => {
    for (const texto of [
      '`X-GitHub-Api-Version: 2022-11-28`',
      'no envía `return_run_details`',
      'se espera la respuesta **204**',
      '`2026-03-10`',
      'responda siempre **200**',
      'también hay que cambiar el código de éxito y sus pruebas',
      'no se amplía la lista de códigos de éxito sin una razón',
      '10 de marzo de 2028',
      '`410 Gone`',
    ]) {
      expect(readme).toContain(texto);
    }
  });
  it('B1: ya no presenta el 200 como algo esperable en el entorno real con la versión configurada', () => {
    expect(readme).not.toContain('La documentación actual de GitHub menciona un 200');
    expect(readme).not.toContain('el Worker responderá 502 aunque el workflow haya arrancado');
    expect(readme).not.toContain('ajustar la regla de éxito');
  });
  it('B2: documenta el resultado desconocido (504), que no debe reintentarse y que el Worker no reintenta', () => {
    for (const texto of [
      '504',
      '**Resultado desconocido (504).**',
      '"estado":"desconocido"',
      '**No debe reintentarse de forma automática**',
      'El Worker tampoco reintenta.',
      '- **Sin reintentos.**',
      'fallo confirmado',
    ]) {
      expect(readme).toContain(texto);
    }
  });
  it('B3: documenta el 500 genérico y que el registro de excepciones no lleva el mensaje', () => {
    for (const texto of ['`{"error":"Error interno."}`', '`admin_error_inesperado`', 'nunca el mensaje de la excepción', 'Un fallo al escribir un registro no cambia la respuesta.']) {
      expect(readme).toContain(texto);
    }
  });
  it('M1: documenta el agotamiento del cupo de registros y que no son una auditoría permanente', () => {
    for (const texto of [
      '**Estos registros no son una auditoría permanente.**',
      '**Agotamiento por inundación.**',
      'no se garantiza que se registren los rechazos siguientes',
      'No hay mitigación implementada.',
      'la retención de 3 días, el tope de 200 000 eventos al día y la falta de límite de solicitudes',
    ]) {
      expect(readme).toContain(texto);
    }
  });
  it('M2: documenta el consumo de minutos de Actions y que no hay enfriamiento ni deduplicación', () => {
    for (const texto of [
      '**Disparos repetidos y minutos de GitHub Actions.**',
      'consume minutos de GitHub Actions',
      '**Hoy no hay enfriamiento ni deduplicación**',
      '**esa protección está pendiente**',
    ]) {
      expect(readme).toContain(texto);
    }
  });
  it('avisa de que no hay límite de solicitudes ni revocación', () => {
    expect(readme).toContain('No hay límite de solicitudes para este Worker.');
    expect(readme).toContain('No se puede revocar');
  });
  it('no afirma que la autenticación o el disparo se hayan comprobado en un entorno real', () => {
    expect(readme).toContain('Ninguna se ha ejecutado.');
    expect(readme).not.toMatch(/se comprobó en (el )?entorno real|ya está desplegado|funciona en producción/i);
  });
});
