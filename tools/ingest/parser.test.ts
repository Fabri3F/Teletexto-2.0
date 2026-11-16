import { readdirSync, readFileSync } from 'node:fs';
import type { DatasetAlertas, Page } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import {
  loadAll,
  NOMBRE_ARCHIVO_ALERTAS,
  parseAlertas,
  parsePage,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
  validatePageConfig,
  type FileInput,
  type ParseError,
  type Result,
} from './index.ts';

// Pruebas de ejemplos de la tarea 2.1 (Parser_de_Contenido). Las pruebas de propiedad de las tareas
// 2.2 a 2.5 se escriben aparte.

// ---------------------------------------------------------------------------------------------
// Datos sintéticos SOLO para estas pruebas (no son los datos de prueba del producto).
// ---------------------------------------------------------------------------------------------
const FECHA = '2026-01-01T00:00:00Z';
const METADATOS = { fuente: 'VARIAS', publicadoEn: FECHA, actualizadoEn: FECHA };

const portada = () => ({
  numero: 100,
  titulo: 'Portada',
  tipo: 'portada',
  esDatoDePrueba: true,
  umbralHoras: 24,
  metadatos: METADATOS,
  registros: [{ id: 'm1', esDatoDePrueba: true, numero: 101, nombre: 'Alertas' }],
});

const precios = () => ({
  numero: 200,
  titulo: 'Precios',
  tipo: 'precios',
  esDatoDePrueba: true,
  umbralHoras: 24,
  metadatos: { ...METADATOS, fuente: 'MIDAGRI' },
  registros: [
    { id: 'p1', esDatoDePrueba: true, producto: 'Producto', mercado: 'Mercado', unidad: 'kg', precioCentimos: 100, fecha: '2026-01-01' },
  ],
});

const paginaAlertas = () => ({
  numero: 101,
  titulo: 'Alertas',
  tipo: 'alertas',
  esDatoDePrueba: true,
  umbralHoras: 6,
  metadatos: METADATOS,
  datos: 'alertas',
});

const alerta = () => ({
  id: 'a1',
  esDatoDePrueba: true,
  titulo: 'Alerta sintética de prueba',
  tipoRiesgo: 'Tipo de prueba',
  nivel: 'Moderado',
  nivelOficial: { texto: 'Amarillo', esMaximo: false },
  departamentos: ['01'],
  vigencia: { inicio: FECHA, fin: '2026-01-02T00:00:00Z' },
  publicadoEn: FECHA,
  actualizadoEn: FECHA,
  fuente: 'SENAMHI',
  aviso: {
    id: 'v1',
    textoOriginal: 'Texto sintético de un aviso.',
    referencia: 'Documento de prueba',
    recomendaciones: [{ clave: 'c1', frases: ['frase de prueba'] }],
  },
});

const dataset = () => ({ metadatos: METADATOS, esDatoDePrueba: true, alertas: [alerta()] });

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------
/** Copia profunda con una modificación y devuelve el texto JSON. `any` es deliberado: se rompe el contrato a propósito. */
function json<T>(base: T, cambiar: (copia: any) => void = () => {}): string {
  const copia = JSON.parse(JSON.stringify(base)) as T;
  cambiar(copia);
  return JSON.stringify(copia);
}

function errorDe(r: Result<unknown, ParseError>): ParseError {
  if (r.ok) throw new Error('Se esperaba un rechazo, pero el archivo se aceptó.');
  return r.error;
}

function valorDe<R extends Result<unknown, unknown>>(r: R): Extract<R, { ok: true }>['valor'] {
  if (!r.ok) throw new Error(`Se esperaba un archivo válido: ${JSON.stringify(r.error)}`);
  return r.valor as Extract<R, { ok: true }>['valor'];
}

/** Todo error debe identificar el archivo, el campo o la causa, y la regla incumplida (Requisito 13.3). */
function esperarIdentificado(error: ParseError, archivo: string): void {
  expect(error.archivo).toBe(archivo);
  expect(error.regla.length).toBeGreaterThan(0);
  expect(Boolean(error.campo) || Boolean(error.causa)).toBe(true);
}

const rechazaAlertas = (texto: string): ParseError => errorDe(parseAlertas(texto, 'alertas.json'));
const rechazaPagina = (texto: string): ParseError => errorDe(parsePage(texto, '100.json'));

const DIR_PRUEBA = new URL('../../data/prueba/', import.meta.url);
const archivosDePrueba = (): FileInput[] =>
  readdirSync(DIR_PRUEBA).map((nombre) => ({ nombre, texto: readFileSync(new URL(nombre, DIR_PRUEBA), 'utf8') }));

// ---------------------------------------------------------------------------------------------
describe('Compatibilidad con los datos sintéticos de data/prueba/', () => {
  it('cada archivo existente se acepta sin modificarlo', () => {
    for (const { nombre, texto } of archivosDePrueba()) {
      const r = nombre === NOMBRE_ARCHIVO_ALERTAS ? parseAlertas(texto, nombre) : parsePage(texto, nombre);
      expect(r.ok, `${nombre}: ${JSON.stringify(r.ok ? '' : r.error)}`).toBe(true);
    }
  });

  it('el objeto parseado es idéntico al contenido del archivo: no inventa ni cambia ningún valor', () => {
    for (const { nombre, texto } of archivosDePrueba()) {
      const r = nombre === NOMBRE_ARCHIVO_ALERTAS ? parseAlertas(texto, nombre) : parsePage(texto, nombre);
      expect(valorDe(r)).toEqual(JSON.parse(texto));
    }
  });

  it('todos los datos de prueba siguen marcados con esDatoDePrueba: true tras la carga', () => {
    const cargado = valorDe(loadAll(archivosDePrueba()));
    for (const pagina of cargado.paginas) {
      expect(pagina.esDatoDePrueba).toBe(true);
      for (const registro of pagina.registros ?? []) expect(registro.esDatoDePrueba).toBe(true);
    }
    expect(cargado.alertas?.esDatoDePrueba).toBe(true);
    for (const a of cargado.alertas?.alertas ?? []) expect(a.esDatoDePrueba).toBe(true);
  });
});

describe('Lectura del archivo: vacío, tamaño y JSON válido', () => {
  it.each([[''], ['   '], ['\n\n\t  \r\n'], ['\uFEFF']])('rechaza el archivo vacío %j', (texto) => {
    for (const r of [parsePage(texto, '100.json'), parseAlertas(texto, 'alertas.json')]) {
      const e = errorDe(r);
      expect(e.regla).toBe('El archivo no puede estar vacío');
      expect(e.causa).toBeTruthy();
      expect(e.campo).toBeUndefined();
    }
  });

  it('acepta un archivo de exactamente 1 MB (1 048 576 bytes) y rechaza uno de 1 byte más', () => {
    const base = json(portada());
    const hastaElLimite = base + ' '.repeat(TAMANO_MAXIMO_ARCHIVO_BYTES - Buffer.byteLength(base));
    expect(Buffer.byteLength(hastaElLimite)).toBe(TAMANO_MAXIMO_ARCHIVO_BYTES);
    expect(parsePage(hastaElLimite, '100.json').ok).toBe(true);

    const e = errorDe(parsePage(`${hastaElLimite} `, '100.json'));
    esperarIdentificado(e, '100.json');
    expect(e.regla).toBe('El archivo no puede superar 1 MB');
    expect(e.causa).toContain(String(TAMANO_MAXIMO_ARCHIVO_BYTES + 1));
  });

  it('mide el tamaño en bytes y no en caracteres', () => {
    // 600 000 caracteres "ñ" son 1 200 000 bytes en UTF-8, aunque tengan menos de 1 048 576 caracteres.
    const texto = `{"x":"${'ñ'.repeat(600_000)}"}`;
    expect(texto.length).toBeLessThan(TAMANO_MAXIMO_ARCHIVO_BYTES);
    expect(errorDe(parseAlertas(texto, 'alertas.json')).regla).toBe('El archivo no puede superar 1 MB');
  });

  it.each([['esto no es JSON'], ['{"numero": 100,'], ['{numero: 100}'], ["{'numero': 100}"], ['{"a":1}{"b":2}'], ['{"a":1,}']])(
    'rechaza el contenido que no es JSON válido %j',
    (texto) => {
      const e = rechazaPagina(texto);
      esperarIdentificado(e, '100.json');
      expect(e.regla).toBe('El contenido debe ser JSON válido');
      expect(e.causa).toBeTruthy();
    },
  );

  it.each([['[]'], ['null'], ['42'], ['"texto"'], ['true']])('rechaza una raíz que no es un objeto: %s', (texto) => {
    for (const r of [parsePage(texto, '100.json'), parseAlertas(texto, 'alertas.json')]) {
      const e = errorDe(r);
      esperarIdentificado(e, e.archivo);
      expect(e.regla).toMatch(/Debe ser de tipo objeto/);
    }
  });

  it('acepta un archivo que empieza con BOM (lo añaden algunos editores de Windows)', () => {
    expect(parsePage(`\uFEFF${json(portada())}`, '100.json').ok).toBe(true);
    expect(parseAlertas(`\uFEFF${json(dataset())}`, 'alertas.json').ok).toBe(true);
  });
});

describe('Validación contra los esquemas: archivo, campo y regla', () => {
  it('acepta una página válida de cada tipo', () => {
    for (const pagina of [portada(), precios(), paginaAlertas()]) {
      expect(parsePage(json(pagina), 'p.json').ok).toBe(true);
    }
    expect(parseAlertas(json(dataset()), 'alertas.json').ok).toBe(true);
  });

  it('identifica el archivo, el campo y la regla de una propiedad con el tipo equivocado', () => {
    const e = errorDe(parsePage(json(portada(), (p) => (p.titulo = 5)), 'mi-pagina.json'));
    expect(e).toEqual({ archivo: 'mi-pagina.json', campo: 'titulo', regla: 'Debe ser de tipo texto' });
  });

  it('identifica la propiedad obligatoria que falta, con la ruta completa', () => {
    const e = rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].aviso.textoOriginal));
    expect(e.campo).toBe('alertas[0].aviso.textoOriginal');
    expect(e.regla).toBe('Falta la propiedad obligatoria "textoOriginal"');
  });

  it('rechaza propiedades desconocidas', () => {
    const e = rechazaPagina(json(portada(), (p) => (p.extra = 1)));
    expect(e).toEqual({ archivo: '100.json', campo: 'extra', regla: 'La propiedad "extra" no está permitida' });
  });

  it('rechaza una página 101 o 400 sin datos "alertas" o con registros propios', () => {
    expect(rechazaPagina(json(paginaAlertas(), (p) => delete p.datos)).campo).toBe('datos');
    expect(rechazaPagina(json(paginaAlertas(), (p) => (p.registros = portada().registros))).campo).toBe('registros');
  });

  it('rechaza una página sin umbralHoras y un número de página fuera de 100 a 999', () => {
    expect(rechazaPagina(json(portada(), (p) => delete p.umbralHoras)).campo).toBe('umbralHoras');
    for (const numero of [99, 1000, 100.5, '101']) {
      expect(rechazaPagina(json(portada(), (p) => (p.numero = numero))).campo).toBe('numero');
    }
  });

  it('exige el precio como entero en céntimos o nulo, nunca decimal', () => {
    expect(parsePage(json(precios(), (p) => (p.registros[0].precioCentimos = null)), 'p.json').ok).toBe(true);
    const e = errorDe(parsePage(json(precios(), (p) => (p.registros[0].precioCentimos = 2.5)), '200.json'));
    expect(e.campo).toBe('registros[0].precioCentimos');
    expect(e.regla).toMatch(/entero en céntimos/);
  });

  it('indica la posición de la alerta o del registro que falla', () => {
    const e = rechazaAlertas(json(dataset(), (d) => d.alertas.push({ ...alerta(), id: 'a2', titulo: '' })));
    expect(e.campo).toBe('alertas[1].titulo');
    expect(e.regla).toBe('No puede estar vacío');
  });

  it('exige urlOriginal o referencia en cada alerta y rechaza enlaces que no son http ni https', () => {
    const sinNinguna = rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].aviso.referencia));
    expect(sinNinguna.campo).toBe('alertas[0].aviso');
    expect(sinNinguna.regla).toBe('Debe incluir "urlOriginal" o "referencia"');

    const peligrosa = rechazaAlertas(json(dataset(), (d) => (d.alertas[0].aviso.urlOriginal = 'javascript:alert(1)')));
    expect(peligrosa.campo).toBe('alertas[0].aviso.urlOriginal');
  });
});

describe('Alertas: Departamento, nivel y fechas válidos, y nunca un nivel por defecto', () => {
  it.each([['26'], ['00'], ['1'], ['001'], ['AA'], [''], [7]])('rechaza el Departamento %j', (codigo) => {
    const e = rechazaAlertas(json(dataset(), (d) => (d.alertas[0].departamentos = [codigo])));
    expect(e.archivo).toBe('alertas.json');
    expect(e.campo).toBe('alertas[0].departamentos[0]');
    expect(e.regla).toMatch(/^Debe ser uno de los 25 valores permitidos \(de "01" a "25"\)$/);
  });

  it('rechaza una alerta sin Departamentos, con códigos repetidos o con más de 25', () => {
    expect(rechazaAlertas(json(dataset(), (d) => (d.alertas[0].departamentos = []))).campo).toBe('alertas[0].departamentos');
    expect(rechazaAlertas(json(dataset(), (d) => (d.alertas[0].departamentos = ['01', '02', '01']))).regla).toMatch(/No puede repetir/);
    expect(rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].departamentos)).regla).toBe('Falta la propiedad obligatoria "departamentos"');
  });

  it('acepta los 25 códigos de Departamento en una misma alerta', () => {
    const todos = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0'));
    expect(parseAlertas(json(dataset(), (d) => (d.alertas[0].departamentos = todos)), 'alertas.json').ok).toBe(true);
  });

  it('rechaza una alerta sin nivel, y no le asigna ninguno', () => {
    const r = parseAlertas(json(dataset(), (d) => delete d.alertas[0].nivel), 'alertas.json');
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('valor'); // ningún objeto con un nivel inventado
    const e = errorDe(r);
    expect(e.campo).toBe('alertas[0].nivel');
    expect(e.regla).toBe('Falta la propiedad obligatoria "nivel"');
  });

  it.each([[null], [''], ['bajo'], ['MUY ALTO'], ['Rojo'], ['Extremo'], [1], [undefined]])(
    'rechaza el nivel %j y no lo reemplaza por un valor por defecto',
    (nivel) => {
      const texto = json(dataset(), (d) => {
        if (nivel === undefined) delete d.alertas[0].nivel;
        else d.alertas[0].nivel = nivel;
      });
      const r = parseAlertas(texto, 'alertas.json');
      expect(r.ok).toBe(false);
      expect(errorDe(r).campo).toBe('alertas[0].nivel');
    },
  );

  it.each(['Bajo', 'Moderado', 'Alto', 'Muy alto'])('acepta el nivel "%s" y lo conserva tal cual', (nivel) => {
    const alertas = valorDe(parseAlertas(json(dataset(), (d) => (d.alertas[0].nivel = nivel)), 'alertas.json'));
    expect(alertas.alertas[0]?.nivel).toBe(nivel);
  });

  it('rechaza una alerta sin vigencia, o sin fecha de inicio o de fin', () => {
    expect(rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].vigencia)).campo).toBe('alertas[0].vigencia');
    expect(rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].vigencia.inicio)).campo).toBe('alertas[0].vigencia.inicio');
    const sinFin = rechazaAlertas(json(dataset(), (d) => delete d.alertas[0].vigencia.fin));
    expect(sinFin.campo).toBe('alertas[0].vigencia.fin');
    expect(sinFin.regla).toBe('Falta la propiedad obligatoria "fin"');
  });

  it.each([[''], ['mañana'], ['2026-01-01'], ['2026-01-01T00:00:00'], ['2026-01-01T00:00:00-05:00'], [null], [20260101]])(
    'rechaza la fecha de fin %j',
    (fin) => {
      const e = rechazaAlertas(json(dataset(), (d) => (d.alertas[0].vigencia.fin = fin)));
      expect(e.campo).toBe('alertas[0].vigencia.fin');
    },
  );

  it('rechaza una alerta cuya fecha de fin es anterior a la de inicio', () => {
    const e = rechazaAlertas(
      json(dataset(), (d) => {
        d.alertas[0].vigencia = { inicio: '2026-03-10T00:00:00Z', fin: '2026-03-09T23:59:59Z' };
      }),
    );
    expect(e).toEqual({
      archivo: 'alertas.json',
      campo: 'alertas[0].vigencia.fin',
      causa: 'Inicio: 2026-03-10T00:00:00Z. Fin: 2026-03-09T23:59:59Z.',
      regla: 'La fecha de fin no puede ser anterior a la fecha de inicio',
    });
  });

  it('compara con precisión de milisegundo, y admite que fin sea igual a inicio', () => {
    const con = (inicio: string, fin: string) => json(dataset(), (d) => (d.alertas[0].vigencia = { inicio, fin }));
    expect(parseAlertas(con('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), 'a.json').ok).toBe(true);
    expect(parseAlertas(con('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.001Z'), 'a.json').ok).toBe(true);
    expect(parseAlertas(con('2026-01-01T00:00:00.001Z', '2026-01-01T00:00:00.000Z'), 'a.json').ok).toBe(false);
  });

  it('compara los instantes reales, no el texto (un año posterior no es anterior por el orden alfabético)', () => {
    const con = (inicio: string, fin: string) => json(dataset(), (d) => (d.alertas[0].vigencia = { inicio, fin }));
    expect(parseAlertas(con('2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z'), 'a.json').ok).toBe(true);
    expect(parseAlertas(con('2027-01-01T00:00:00Z', '2026-12-31T23:59:59Z'), 'a.json').ok).toBe(false);
  });

  it.each([['2026-02-30T00:00:00Z'], ['2026-02-29T00:00:00Z'], ['2100-02-29T00:00:00Z'], ['2026-04-31T00:00:00Z']])(
    'rechaza la fecha inexistente %s en la vigencia',
    (inicio) => {
      const e = rechazaAlertas(json(dataset(), (d) => (d.alertas[0].vigencia.inicio = inicio)));
      expect(e.campo).toBe('alertas[0].vigencia.inicio');
      expect(e.regla).toMatch(/exista en el calendario/);
    },
  );

  it('acepta el 29 de febrero de un año bisiesto', () => {
    const con = json(dataset(), (d) => (d.alertas[0].vigencia = { inicio: '2028-02-29T00:00:00Z', fin: '2028-03-01T00:00:00Z' }));
    expect(parseAlertas(con, 'a.json').ok).toBe(true);
  });

  it('comprueba que existan también las demás fechas: metadatos, publicación, actualización y fecha de un precio', () => {
    const inexistente = '2026-02-30T00:00:00Z';
    expect(rechazaAlertas(json(dataset(), (d) => (d.metadatos.publicadoEn = inexistente))).campo).toBe('metadatos.publicadoEn');
    expect(rechazaAlertas(json(dataset(), (d) => (d.alertas[0].actualizadoEn = inexistente))).campo).toBe('alertas[0].actualizadoEn');
    expect(rechazaPagina(json(portada(), (p) => (p.metadatos.actualizadoEn = inexistente))).campo).toBe('metadatos.actualizadoEn');
    const precio = errorDe(parsePage(json(precios(), (p) => (p.registros[0].fecha = '2026-02-30')), '200.json'));
    expect(precio.campo).toBe('registros[0].fecha');
  });

  it('parseAlertas devuelve el primer problema y loadAll devuelve todos', () => {
    const texto = json(dataset(), (d) => {
      d.alertas[0].departamentos = ['99'];
      delete d.alertas[0].nivel;
      d.alertas[0].vigencia.fin = '2025-01-01T00:00:00Z';
    });
    const primero = rechazaAlertas(texto);
    expect(primero.archivo).toBe('alertas.json');

    const r = loadAll([{ nombre: 'alertas.json', texto }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const campos = r.error.map((e) => e.campo);
    // Con el esquema incumplido solo se informan los problemas del esquema (departamento y nivel).
    expect(campos).toEqual(expect.arrayContaining(['alertas[0].departamentos[0]', 'alertas[0].nivel']));
    expect(r.error.length).toBeGreaterThanOrEqual(2);
    expect(r.error[0]).toEqual(primero);
  });
});

describe('esDatoDePrueba ausente o inválido se trata como true (Requisito 10.3)', () => {
  const INVALIDOS: unknown[] = ['true', 'false', 'sí', '', null, 0, 1, -1, {}, [], [true]];

  it('lo asume verdadero cuando falta, en la página, en cada registro y en cada alerta', () => {
    const pagina = valorDe(
      parsePage(
        json(portada(), (p) => {
          delete p.esDatoDePrueba;
          delete p.registros[0].esDatoDePrueba;
        }),
        '100.json',
      ),
    );
    expect(pagina.esDatoDePrueba).toBe(true);
    expect(pagina.registros?.[0]?.esDatoDePrueba).toBe(true);

    const alertas = valorDe(
      parseAlertas(
        json(dataset(), (d) => {
          delete d.esDatoDePrueba;
          delete d.alertas[0].esDatoDePrueba;
        }),
        'alertas.json',
      ),
    );
    expect(alertas.esDatoDePrueba).toBe(true);
    expect(alertas.alertas[0]?.esDatoDePrueba).toBe(true);
  });

  it.each(INVALIDOS.map((v) => [JSON.stringify(v), v]))('lo asume verdadero cuando vale %s', (_etiqueta, valor) => {
    const pagina = valorDe(
      parsePage(
        json(precios(), (p) => {
          p.esDatoDePrueba = valor;
          p.registros[0].esDatoDePrueba = valor;
        }),
        '200.json',
      ),
    );
    expect(pagina.esDatoDePrueba).toBe(true);
    expect(pagina.registros?.[0]?.esDatoDePrueba).toBe(true);

    const alertas = valorDe(
      parseAlertas(
        json(dataset(), (d) => {
          d.esDatoDePrueba = valor;
          d.alertas[0].esDatoDePrueba = valor;
        }),
        'alertas.json',
      ),
    );
    expect(alertas.esDatoDePrueba).toBe(true);
    expect(alertas.alertas[0]?.esDatoDePrueba).toBe(true);
  });

  it('conserva un false explícito, para cuando el sistema use datos reales', () => {
    const pagina = valorDe(
      parsePage(
        json(precios(), (p) => {
          p.esDatoDePrueba = false;
          p.registros[0].esDatoDePrueba = false;
        }),
        '200.json',
      ),
    );
    expect(pagina.esDatoDePrueba).toBe(false);
    expect(pagina.registros?.[0]?.esDatoDePrueba).toBe(false);

    const alertas = valorDe(
      parseAlertas(
        json(dataset(), (d) => {
          d.esDatoDePrueba = false;
          d.alertas[0].esDatoDePrueba = false;
        }),
        'alertas.json',
      ),
    );
    expect(alertas.esDatoDePrueba).toBe(false);
    expect(alertas.alertas[0]?.esDatoDePrueba).toBe(false);
  });

  it('no cambia ningún otro valor ni añade el atributo a objetos que no son registros', () => {
    const original = dataset();
    const sinAtributo = json(original, (d) => {
      delete d.esDatoDePrueba;
      delete d.alertas[0].esDatoDePrueba;
    });
    expect(valorDe(parseAlertas(sinAtributo, 'alertas.json'))).toEqual(original);
  });

  it('no falla con valores inesperados: la validación del esquema informa el problema real', () => {
    expect(rechazaPagina(json(portada(), (p) => (p.registros = 'no es una lista'))).campo).toBe('registros');
    expect(rechazaAlertas(json(dataset(), (d) => (d.alertas = [null, 5, 'x']))).campo).toMatch(/^alertas\[0\]/);
    expect(rechazaAlertas('{}').regla).toMatch(/Falta la propiedad obligatoria/);
  });
});

describe('loadAll: todo o nada', () => {
  const archivo = (nombre: string, objeto: unknown): FileInput => ({ nombre, texto: JSON.stringify(objeto) });

  it('carga un conjunto válido, con las páginas ordenadas por número y el conjunto de alertas', () => {
    const r = valorDe(
      loadAll([archivo('400.json', { ...paginaAlertas(), numero: 400, tipo: 'mapa' }), archivo('100.json', portada()), archivo('alertas.json', dataset()), archivo('101.json', paginaAlertas())]),
    );
    expect(r.paginas.map((p: Page) => p.numero)).toEqual([100, 101, 400]);
    expect((r.alertas as DatasetAlertas).alertas).toHaveLength(1);
  });

  it('carga los datos de prueba existentes completos', () => {
    const r = valorDe(loadAll(archivosDePrueba()));
    expect(r.paginas.map((p) => p.numero)).toEqual([100, 101, 200, 400]);
    expect(r.alertas?.alertas).toHaveLength(4);
  });

  it('acepta una lista vacía y un conjunto sin alertas', () => {
    expect(valorDe(loadAll([]))).toEqual({ paginas: [] });
    expect(valorDe(loadAll([archivo('100.json', portada())]))).toEqual({ paginas: [valorDe(parsePage(json(portada()), 'x'))] });
  });

  it('reconoce el archivo de alertas con cualquier ruta, de Linux o de Windows', () => {
    for (const nombre of ['data/prueba/alertas.json', 'data\\prueba\\alertas.json', './alertas.json']) {
      const r = valorDe(loadAll([archivo(nombre, dataset())]));
      expect(r.alertas?.alertas).toHaveLength(1);
      expect(r.paginas).toEqual([]);
    }
  });

  it('si un solo archivo es inválido rechaza todo y no devuelve ningún contenido', () => {
    const r = loadAll([archivo('100.json', portada()), archivo('200.json', precios()), { nombre: '101.json', texto: '' }]);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('valor');
  });

  it('informa los errores de todos los archivos inválidos, cada uno con su archivo, campo o causa, y regla', () => {
    const r = loadAll([
      archivo('100.json', portada()),
      { nombre: '101.json', texto: '' },
      { nombre: '200.json', texto: '{ no es json' },
      archivo('400.json', { ...paginaAlertas(), numero: 400, tipo: 'mapa', umbralHoras: 0 }),
      { nombre: 'alertas.json', texto: json(dataset(), (d) => delete d.alertas[0].nivel) },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(new Set(r.error.map((e) => e.archivo))).toEqual(new Set(['101.json', '200.json', '400.json', 'alertas.json']));
    for (const e of r.error) esperarIdentificado(e, e.archivo);
    expect(r.error.find((e) => e.archivo === 'alertas.json')?.campo).toBe('alertas[0].nivel');
  });

  it('rechaza dos archivos con el mismo número de página y señala al segundo', () => {
    const r = loadAll([archivo('100.json', portada()), archivo('copia-de-100.json', portada())]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual([
      { archivo: 'copia-de-100.json', campo: 'numero', regla: 'El número 100 está repetido (ya se usó en la posición 0)' },
    ]);
  });

  it('rechaza un segundo archivo de alertas', () => {
    const r = loadAll([archivo('a/alertas.json', dataset()), archivo('b/alertas.json', dataset())]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toHaveLength(1);
    expect(r.error[0]).toMatchObject({ archivo: 'b/alertas.json', regla: 'Solo puede haber un archivo de alertas' });
  });

  it('un rechazo no altera el contenido cargado antes: es una función pura', () => {
    const anterior = valorDe(loadAll(archivosDePrueba()));
    const copia = JSON.stringify(anterior);
    expect(loadAll([{ nombre: '100.json', texto: 'roto' }]).ok).toBe(false);
    expect(JSON.stringify(anterior)).toBe(copia);
  });
});

describe('validatePageConfig', () => {
  const numeros = (...valores: unknown[]) => valores.map((numero) => ({ numero: numero as number }));

  it('acepta una lista vacía y números únicos de 100 a 999', () => {
    expect(validatePageConfig([])).toEqual({ ok: true, valor: undefined });
    expect(validatePageConfig(numeros(100, 101, 200, 400, 999)).ok).toBe(true);
  });

  it.each([[99], [1000], [0], [-100], [100.5], [Number.NaN], [Number.POSITIVE_INFINITY], ['101'], [null], [undefined], [true]])(
    'rechaza el número de página %j',
    (numero) => {
      const r = validatePageConfig(numeros(100, numero));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.problemas).toHaveLength(1);
      expect(r.error.problemas[0]).toMatchObject({
        indice: 1,
        regla: 'Debe ser un número entero de tres dígitos, entre 100 y 999',
      });
      expect(r.error.motivo).toMatch(/posición 1/);
    },
  );

  it('acepta los extremos 100 y 999', () => {
    expect(validatePageConfig(numeros(100, 999)).ok).toBe(true);
  });

  it('rechaza los números repetidos, e indica cada repetición y la posición de la primera', () => {
    const r = validatePageConfig(numeros(100, 200, 100, 100));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.problemas.map((p) => p.indice)).toEqual([2, 3]);
    expect(r.error.problemas[0]?.regla).toBe('El número 100 está repetido (ya se usó en la posición 0)');
    expect(r.error.motivo.length).toBeGreaterThan(0);
  });

  it('informa a la vez los números fuera de rango y los repetidos', () => {
    const r = validatePageConfig(numeros(100, 5000, 100, 'x'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.problemas.map((p) => p.indice)).toEqual([1, 2, 3]);
  });

  it('no falla con elementos que no son configuraciones válidas', () => {
    const r = validatePageConfig([null, undefined, {}] as unknown as { numero: number }[]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.problemas).toHaveLength(3);
  });

  it('no modifica la lista recibida', () => {
    const lista = numeros(100, 100);
    const copia = JSON.stringify(lista);
    validatePageConfig(lista);
    expect(JSON.stringify(lista)).toBe(copia);
  });
});
