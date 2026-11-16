import { readdirSync, readFileSync } from 'node:fs';
import type { DatasetAlertas, Page } from '@teletexto/modelo';
import { ESQUEMAS, ID_ESQUEMA_ALERTAS, ID_ESQUEMA_PAGE, esquemaAlertas, esquemaComun, esquemaPage } from '@teletexto/modelo/esquemas';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { NOMBRE_ARCHIVO_ALERTAS, parseAlertas, parsePage, printAlertas, printPage } from './index.ts';
import { ORDEN_CLAVES } from './printer.ts';

// Pruebas de ejemplos de la tarea 2.1 (Pretty_Printer). La prueba de propiedad del ida y vuelta
// (Property 1) es la tarea 2.2.

const DIR_PRUEBA = new URL('../../data/prueba/', import.meta.url);
const archivosDePrueba = () =>
  readdirSync(DIR_PRUEBA).map((nombre) => ({ nombre, texto: readFileSync(new URL(nombre, DIR_PRUEBA), 'utf8') }));

const ajv = new Ajv({ allErrors: true, strict: true });
for (const esquema of ESQUEMAS) ajv.addSchema(esquema);
const validarPage = ajv.getSchema(ID_ESQUEMA_PAGE);
const validarAlertas = ajv.getSchema(ID_ESQUEMA_ALERTAS);

const FECHA = '2026-01-01T00:00:00Z';

// Datos sintéticos solo para estas pruebas. Se escriben a propósito con las claves DESORDENADAS.
const paginaDesordenada = (): Page =>
  ({
    registros: [
      { nombre: 'Alertas', numero: 101, esDatoDePrueba: true, id: 'm1' },
      { nombre: 'Precios', numero: 200, id: 'm2', esDatoDePrueba: false },
    ],
    metadatos: { actualizadoEn: FECHA, publicadoEn: FECHA, fuente: 'VARIAS' },
    umbralHoras: 24,
    esDatoDePrueba: true,
    tipo: 'portada',
    titulo: 'Portada',
    numero: 100,
  }) as Page;

const datasetDesordenado = (): DatasetAlertas =>
  ({
    alertas: [
      {
        aviso: {
          resumen: {
            verificacion: { verificadoEn: FECHA, estado: 'aprobado' },
            hashFuente: 'a'.repeat(64),
            texto: 'Resumen de prueba.',
          },
          recomendaciones: [{ frases: ['frase uno', 'frase dos'], clave: 'clave-1' }],
          referencia: 'Documento de prueba',
          urlOriginal: 'https://example.com/prueba',
          textoOriginal: 'Texto sintético.',
          id: 'v1',
        },
        fuente: 'INDECI',
        actualizadoEn: FECHA,
        publicadoEn: FECHA,
        vigencia: { fin: '2026-01-02T00:00:00Z', inicio: FECHA },
        departamentos: ['21', '08'],
        nivelOficial: { esMaximo: true, texto: 'Rojo' },
        nivel: 'Muy alto',
        tipoRiesgo: 'Tipo de prueba',
        titulo: 'Alerta sintética',
        esDatoDePrueba: true,
        id: 'a1',
      },
    ],
    esDatoDePrueba: true,
    metadatos: { actualizadoEn: FECHA, publicadoEn: FECHA, fuente: 'VARIAS' },
  }) as DatasetAlertas;

/** Claves de cada objeto, en el orden en que aparecen en el texto (recorre todo el árbol). */
function ordenDeClaves(texto: string): string[][] {
  const recorridos: string[][] = [];
  const visitar = (valor: unknown): void => {
    if (Array.isArray(valor)) valor.forEach(visitar);
    else if (typeof valor === 'object' && valor !== null) {
      recorridos.push(Object.keys(valor));
      Object.values(valor).forEach(visitar);
    }
  };
  visitar(JSON.parse(texto));
  return recorridos;
}

describe('Formato del texto producido', () => {
  const texto = printPage(paginaDesordenada());

  it('termina con exactamente un salto de línea y no empieza con BOM', () => {
    expect(texto.endsWith('}\n')).toBe(true);
    expect(texto.endsWith('\n\n')).toBe(false);
    expect(texto.charCodeAt(0)).toBe('{'.charCodeAt(0));
  });

  it('sangra con 2 espacios, sin tabuladores ni retornos de carro', () => {
    expect(texto).not.toContain('\t');
    expect(texto).not.toContain('\r');
    const lineas = texto.trimEnd().split('\n');
    expect(lineas[0]).toBe('{');
    expect(lineas[1]).toBe('  "numero": 100,');
    for (const linea of lineas) expect((linea.length - linea.trimStart().length) % 2).toBe(0);
  });

  it('es JSON válido', () => {
    expect(() => JSON.parse(texto)).not.toThrow();
  });

  it('escribe los caracteres en UTF-8 tal cual, sin secuencias \\u', () => {
    const conAcentos = { ...paginaDesordenada(), titulo: 'Ñandú: Áncash, Huánuco y Junín' } as Page;
    const impreso = printPage(conAcentos);
    expect(impreso).toContain('Ñandú: Áncash, Huánuco y Junín');
    expect(impreso).not.toContain('\\u');
    expect(JSON.parse(impreso).titulo).toBe(conAcentos.titulo);
  });

  it('escapa las comillas, las barras y los saltos de línea de los textos', () => {
    const peligroso = '"comillas" \\ barra\ny salto <script>alert(1)</script>';
    const pagina = { ...paginaDesordenada(), titulo: peligroso } as Page;
    expect(JSON.parse(printPage(pagina)).titulo).toBe(peligroso);
  });
});

describe('Orden fijo de las claves', () => {
  it('escribe las claves de una página en el orden definido, sin importar el orden de entrada', () => {
    const [raiz, metadatos, ...registros] = ordenDeClaves(printPage(paginaDesordenada()));
    expect(raiz).toEqual(['numero', 'titulo', 'tipo', 'esDatoDePrueba', 'umbralHoras', 'metadatos', 'registros']);
    expect(metadatos).toEqual(['fuente', 'publicadoEn', 'actualizadoEn']);
    for (const registro of registros) expect(registro).toEqual(['id', 'esDatoDePrueba', 'numero', 'nombre']);
  });

  it('escribe las claves de un conjunto de alertas, de cada alerta y de cada aviso en el orden definido', () => {
    const recorridos = ordenDeClaves(printAlertas(datasetDesordenado()));
    expect(recorridos).toEqual([
      ['metadatos', 'esDatoDePrueba', 'alertas'],
      ['fuente', 'publicadoEn', 'actualizadoEn'],
      ['id', 'esDatoDePrueba', 'titulo', 'tipoRiesgo', 'nivel', 'nivelOficial', 'departamentos', 'vigencia', 'publicadoEn', 'actualizadoEn', 'fuente', 'aviso'],
      ['texto', 'esMaximo'],
      ['inicio', 'fin'],
      ['id', 'textoOriginal', 'urlOriginal', 'referencia', 'recomendaciones', 'resumen'],
      ['clave', 'frases'],
      ['texto', 'hashFuente', 'verificacion'],
      ['estado', 'verificadoEn'],
    ]);
  });

  it('produce el mismo texto para el mismo contenido, aunque cambie el orden de las claves de entrada', () => {
    const a = paginaDesordenada();
    const b = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse()))) as Page;
    expect(printPage(a)).toBe(printPage(b));
    expect(printAlertas(datasetDesordenado())).toBe(
      printAlertas(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(datasetDesordenado()).reverse())))),
    );
  });

  it('conserva el orden de las listas: registros, alertas, departamentos y frases no se reordenan', () => {
    const impreso = JSON.parse(printAlertas(datasetDesordenado())) as DatasetAlertas;
    expect(impreso.alertas[0]?.departamentos).toEqual(['21', '08']);
    expect(impreso.alertas[0]?.aviso.recomendaciones[0]?.frases).toEqual(['frase uno', 'frase dos']);
    const pagina = JSON.parse(printPage(paginaDesordenada())) as Page;
    expect(pagina.registros?.map((r) => r.id)).toEqual(['m1', 'm2']);
  });

  it('omite las propiedades opcionales ausentes y no escribe valores undefined', () => {
    const sinOpcionales = printPage({ ...paginaDesordenada(), datos: undefined } as Page);
    expect(sinOpcionales).not.toContain('"datos"');
    expect(sinOpcionales).not.toContain('undefined');
  });

  it('escribe al final, en orden alfabético, las claves desconocidas, para no perder datos', () => {
    const conExtras = { ...paginaDesordenada(), zeta: 1, alfa: 2 } as unknown as Page;
    expect(ordenDeClaves(printPage(conExtras))[0]?.slice(-2)).toEqual(['alfa', 'zeta']);
  });

  it('la tabla de orden cubre exactamente las propiedades de los esquemas de @teletexto/modelo', () => {
    const claves = (esquema: { properties: object }) => Object.keys(esquema.properties).sort();
    const comparar = (orden: readonly string[], esquema: { properties: object }) => expect([...orden].sort()).toEqual(claves(esquema));
    const defs = esquemaAlertas.$defs;
    comparar(ORDEN_CLAVES.page, esquemaPage);
    comparar(ORDEN_CLAVES.metadatos, esquemaComun.$defs.metadatos);
    comparar(ORDEN_CLAVES.dataset, esquemaAlertas);
    comparar(ORDEN_CLAVES.alerta, defs.alertaRiesgo);
    comparar(ORDEN_CLAVES.nivelOficial, defs.alertaRiesgo.properties.nivelOficial);
    comparar(ORDEN_CLAVES.vigencia, defs.alertaRiesgo.properties.vigencia);
    comparar(ORDEN_CLAVES.aviso, defs.avisoOficial);
    comparar(ORDEN_CLAVES.recomendacion, defs.recomendacion);
    comparar(ORDEN_CLAVES.resumen, defs.resumenAviso);
    comparar(ORDEN_CLAVES.verificacion, defs.resumenAviso.properties.verificacion);
    // Los registros de la Portada y los precios comparten esta tabla: debe cubrir las claves de ambos.
    const registros = new Set([
      ...Object.keys(esquemaPage.$defs.entradaMenu.properties),
      ...Object.keys(esquemaPage.$defs.precio.properties),
    ]);
    expect([...ORDEN_CLAVES.registro].sort()).toEqual([...registros].sort());
  });
});

describe('Ida y vuelta entre el Parser y el Pretty_Printer (ejemplos)', () => {
  it('imprimir una página válida produce un archivo que cumple el esquema y se vuelve a leer igual', () => {
    const texto = printPage(paginaDesordenada());
    expect(validarPage?.(JSON.parse(texto)), JSON.stringify(validarPage?.errors)).toBe(true);
    const leida = parsePage(texto, '100.json');
    expect(leida.ok && leida.valor).toEqual(paginaDesordenada());
    expect(printPage(leida.ok ? leida.valor : paginaDesordenada())).toBe(texto);
  });

  it('imprimir un conjunto de alertas válido produce un archivo que cumple el esquema y se vuelve a leer igual', () => {
    const texto = printAlertas(datasetDesordenado());
    expect(validarAlertas?.(JSON.parse(texto)), JSON.stringify(validarAlertas?.errors)).toBe(true);
    const leido = parseAlertas(texto, 'alertas.json');
    expect(leido.ok && leido.valor).toEqual(datasetDesordenado());
    expect(printAlertas(leido.ok ? leido.valor : datasetDesordenado())).toBe(texto);
  });

  it('conserva el valor null de un precio sin dato y los números enteros', () => {
    const pagina = {
      numero: 200,
      titulo: 'Precios',
      tipo: 'precios',
      esDatoDePrueba: true,
      umbralHoras: 24,
      metadatos: { fuente: 'MIDAGRI', publicadoEn: FECHA, actualizadoEn: FECHA },
      registros: [
        { id: 'p1', esDatoDePrueba: true, producto: 'A', mercado: 'M', unidad: 'kg', precioCentimos: null, fecha: '2026-01-01' },
        { id: 'p2', esDatoDePrueba: true, producto: 'B', mercado: 'M', unidad: 'kg', precioCentimos: 0, fecha: '2026-01-01' },
        { id: 'p3', esDatoDePrueba: true, producto: 'C', mercado: 'M', unidad: 'kg', precioCentimos: 250, fecha: '2026-01-01' },
      ],
    } as Page;
    const leida = parsePage(printPage(pagina), '200.json');
    expect(leida.ok && leida.valor).toEqual(pagina);
    expect(printPage(pagina)).toContain('"precioCentimos": null');
  });

  it('conserva un esDatoDePrueba false explícito', () => {
    const pagina = { ...paginaDesordenada(), esDatoDePrueba: false } as Page;
    const leida = parsePage(printPage(pagina), '100.json');
    expect(leida.ok && leida.valor.esDatoDePrueba).toBe(false);
  });
});

describe('Compatibilidad con los datos sintéticos de data/prueba/', () => {
  it('los archivos existentes ya están en forma canónica: leerlos e imprimirlos reproduce el texto exacto', () => {
    for (const { nombre, texto } of archivosDePrueba()) {
      const impreso =
        nombre === NOMBRE_ARCHIVO_ALERTAS
          ? printAlertas((parseAlertas(texto, nombre) as { valor: DatasetAlertas }).valor)
          : printPage((parsePage(texto, nombre) as { valor: Page }).valor);
      expect(impreso, nombre).toBe(texto);
    }
  });
});
