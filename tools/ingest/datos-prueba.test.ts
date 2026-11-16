import { readdirSync, readFileSync } from 'node:fs';
import { Ajv, type ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';
import {
  CODIGOS_DEPARTAMENTO,
  NIVELES_RIESGO,
  type AlertaRiesgo,
  type DatasetAlertas,
  type EntradaMenu,
  type NivelRiesgo,
  type Page,
  type Precio,
} from '@teletexto/modelo';
import { ESQUEMAS, ID_ESQUEMA_ALERTAS, ID_ESQUEMA_PAGE } from '@teletexto/modelo/esquemas';

// Valida los datos de prueba de data/prueba/ (tarea 1.3) contra los esquemas de @teletexto/modelo
// y contra los criterios de los Requisitos 4.14, 4.16, 10.2, 19.2 y 19.3.

const DIR_DATOS = new URL('../../data/', import.meta.url);
const DIR_PRUEBA = new URL('prueba/', DIR_DATOS);

/**
 * Días de la demostración que las alertas de prueba deben cubrir completos, en hora de Perú (UTC-5).
 * Si la demostración se aleja de este rango, se amplían las fechas de vigencia en data/prueba/alertas.json
 * y se actualizan estas dos constantes.
 */
const DEMOSTRACION_DESDE = Date.parse('2026-11-16T05:00:00Z'); // 16/11/2026 00:00 en Perú
const DEMOSTRACION_HASTA = Date.parse('2026-12-16T04:59:59Z'); // 15/12/2026 23:59:59 en Perú

const leerTexto = (carpeta: URL, nombre: string): string => readFileSync(new URL(nombre, carpeta), 'utf8');
const leerJson = <T>(carpeta: URL, nombre: string): T => JSON.parse(leerTexto(carpeta, nombre)) as T;

const NOMBRES_PAGINAS = ['100.json', '101.json', '200.json', '400.json'] as const;
const pagina = (numero: number): Page => leerJson<Page>(DIR_PRUEBA, `${numero}.json`);
const dataset = (): DatasetAlertas => leerJson<DatasetAlertas>(DIR_PRUEBA, 'alertas.json');

const ajv = new Ajv({ allErrors: true, strict: true });
for (const esquema of ESQUEMAS) ajv.addSchema(esquema);
const validador = (id: string): ValidateFunction => {
  const validar = ajv.getSchema(id);
  if (!validar) throw new Error(`Esquema no registrado: ${id}`);
  return validar;
};
const validarPage = validador(ID_ESQUEMA_PAGE);
const validarAlertas = validador(ID_ESQUEMA_ALERTAS);
const erroresDe = (validar: ValidateFunction): string =>
  JSON.stringify(validar.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? []);

/** Departamentos con al menos una alerta vigente durante TODO el rango de la demostración, con su nivel máximo. */
function nivelPorDepartamento(alertas: AlertaRiesgo[]): Map<string, NivelRiesgo> {
  const resultado = new Map<string, NivelRiesgo>();
  for (const alerta of alertas) {
    const cubreDemostracion =
      Date.parse(alerta.vigencia.inicio) <= DEMOSTRACION_DESDE && Date.parse(alerta.vigencia.fin) >= DEMOSTRACION_HASTA;
    if (!cubreDemostracion) continue;
    for (const codigo of alerta.departamentos) {
      const actual = resultado.get(codigo);
      if (actual === undefined || NIVELES_RIESGO.indexOf(alerta.nivel) > NIVELES_RIESGO.indexOf(actual)) {
        resultado.set(codigo, alerta.nivel);
      }
    }
  }
  return resultado;
}

describe('Datos de prueba: archivos', () => {
  it('data/prueba/ contiene solo las páginas 100, 101, 200 y 400 y el conjunto de alertas', () => {
    const archivos = readdirSync(DIR_PRUEBA).sort();
    expect(archivos).toEqual(['100.json', '101.json', '200.json', '400.json', 'alertas.json']);
  });

  it.each([...NOMBRES_PAGINAS, 'alertas.json'])('%s está en UTF-8 sin BOM y termina en un salto de línea', (nombre) => {
    const texto = leerTexto(DIR_PRUEBA, nombre);
    expect(texto.charCodeAt(0)).not.toBe(0xfeff);
    expect(texto.endsWith('\n')).toBe(true);
    expect(texto.endsWith('\n\n')).toBe(false);
    expect(() => JSON.parse(texto)).not.toThrow();
  });

  it('ningún archivo menciona información de salud (fuera del alcance del MVP)', () => {
    for (const nombre of [...NOMBRES_PAGINAS, 'alertas.json']) {
      expect(leerTexto(DIR_PRUEBA, nombre)).not.toMatch(/minsa|campa[ñn]a|salud/i);
    }
    expect(leerTexto(DIR_DATOS, 'mapeo-niveles.json')).not.toMatch(/minsa/i);
  });
});

describe('Datos de prueba: cumplen los esquemas de @teletexto/modelo', () => {
  it.each(NOMBRES_PAGINAS)('%s cumple page.schema.json', (nombre) => {
    const valido = validarPage(leerJson(DIR_PRUEBA, nombre));
    expect(valido, erroresDe(validarPage)).toBe(true);
  });

  it('alertas.json cumple alertas.schema.json', () => {
    const valido = validarAlertas(dataset());
    expect(valido, erroresDe(validarAlertas)).toBe(true);
  });

  it('cada página usa el número, el tipo y el umbral de desactualización que fija la spec', () => {
    const esperado = [
      { numero: 100, tipo: 'portada', umbralHoras: 24 },
      { numero: 101, tipo: 'alertas', umbralHoras: 6 },
      { numero: 200, tipo: 'precios', umbralHoras: 24 },
      { numero: 400, tipo: 'mapa', umbralHoras: 6 },
    ] as const;
    for (const { numero, tipo, umbralHoras } of esperado) {
      const p = pagina(numero);
      expect({ numero: p.numero, tipo: p.tipo, umbralHoras: p.umbralHoras }).toEqual({ numero, tipo, umbralHoras });
    }
  });

  it('las páginas 101 y 400 leen el conjunto único de alertas y no guardan copias', () => {
    for (const numero of [101, 400]) {
      const p = pagina(numero);
      expect(p.datos).toBe('alertas');
      expect(p.registros).toBeUndefined();
    }
  });

  it('los metadatos de las páginas 101 y 400 coinciden con los del conjunto de alertas', () => {
    expect(pagina(101).metadatos).toEqual(dataset().metadatos);
    expect(pagina(400).metadatos).toEqual(dataset().metadatos);
  });
});

describe('Datos de prueba: todo está marcado como dato de prueba (Requisito 10.2)', () => {
  it('cada página, registro, alerta y el conjunto de alertas tienen esDatoDePrueba: true', () => {
    let revisados = 0;
    const exigir = (objeto: { esDatoDePrueba: boolean }): void => {
      expect(objeto.esDatoDePrueba).toBe(true);
      revisados += 1;
    };
    for (const nombre of NOMBRES_PAGINAS) {
      const p = leerJson<Page>(DIR_PRUEBA, nombre);
      exigir(p);
      for (const registro of p.registros ?? []) exigir(registro);
    }
    const d = dataset();
    exigir(d);
    for (const alerta of d.alertas) exigir(alerta);
    expect(revisados).toBeGreaterThan(30);
  });

  it('ninguna alerta ni aviso se presenta como información real de la fuente', () => {
    for (const alerta of dataset().alertas) {
      expect(alerta.titulo.startsWith('PRUEBA:'), alerta.id).toBe(true);
      expect(alerta.aviso.textoOriginal.startsWith('AVISO DE PRUEBA, NO OFICIAL.'), alerta.id).toBe(true);
      expect(alerta.aviso.textoOriginal, alerta.id).toContain(`no proviene de ${alerta.fuente}`);
      expect(alerta.aviso.referencia, alerta.id).toMatch(/ficticio/i);
    }
  });

  it('las únicas URL son de example.com, dominio reservado para ejemplos, nunca de una fuente real', () => {
    const urls = dataset().alertas.flatMap((a) => (a.aviso.urlOriginal ? [a.aviso.urlOriginal] : []));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).hostname).toBe('example.com');
  });

  it('los avisos no traen resumen: lo genera y verifica la ingesta (tarea 10)', () => {
    for (const alerta of dataset().alertas) expect(alerta.aviso.resumen).toBeUndefined();
  });

  it('los ids de los registros y de los avisos son únicos y empiezan con "prueba-"', () => {
    const ids = [
      ...(pagina(100).registros ?? []),
      ...(pagina(200).registros ?? []),
      ...dataset().alertas,
      ...dataset().alertas.map((a) => a.aviso),
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('prueba-')).toBe(true);
  });
});

describe('Datos de prueba: Portada (100)', () => {
  const entradas = (): EntradaMenu[] => (pagina(100).registros ?? []) as EntradaMenu[];

  it('tiene exactamente tres entradas de menú: 101, 200 y 400', () => {
    expect(entradas().map((e) => e.numero)).toEqual([101, 200, 400]);
  });

  it('cada entrada apunta a una página que existe en los datos de prueba', () => {
    const existentes = new Set(NOMBRES_PAGINAS.map((n) => pagina(Number.parseInt(n, 10)).numero));
    for (const entrada of entradas()) expect(existentes.has(entrada.numero)).toBe(true);
  });
});

describe('Datos de prueba: alertas de riesgo y mapa (Requisitos 4.16 y 19.3)', () => {
  const alertas = (): AlertaRiesgo[] => dataset().alertas;

  it('hay alertas vigentes para al menos 3 Departamentos durante toda la demostración', () => {
    expect(nivelPorDepartamento(alertas()).size).toBeGreaterThanOrEqual(3);
  });

  it('esas alertas tienen al menos 2 niveles de riesgo distintos', () => {
    const niveles = new Set(nivelPorDepartamento(alertas()).values());
    expect(niveles.size).toBeGreaterThanOrEqual(2);
  });

  it('al menos 1 Departamento queda sin alertas vigentes, para mostrar "Sin información disponible"', () => {
    const conAlertas = nivelPorDepartamento(alertas());
    const sinAlertas = CODIGOS_DEPARTAMENTO.filter((codigo) => !conAlertas.has(codigo));
    expect(sinAlertas.length).toBeGreaterThanOrEqual(1);
  });

  it('una alerta cubre más de un Departamento, y un Departamento recibe varias alertas', () => {
    expect(alertas().some((a) => a.departamentos.length > 1)).toBe(true);
    const porDepartamento = new Map<string, number>();
    for (const a of alertas()) for (const c of a.departamentos) porDepartamento.set(c, (porDepartamento.get(c) ?? 0) + 1);
    expect([...porDepartamento.values()].some((n) => n > 1)).toBe(true);
  });

  it('un Departamento con alertas de distinto nivel toma el más alto', () => {
    const niveles = nivelPorDepartamento(alertas());
    const conVarias = alertas().filter((a) => a.departamentos.includes('21'));
    expect(conVarias.map((a) => a.nivel).sort()).toEqual(['Alto', 'Bajo']);
    expect(niveles.get('21')).toBe('Alto');
  });

  it('todas las alertas cubren los días de la demostración y su vigencia es coherente', () => {
    for (const a of alertas()) {
      expect(Date.parse(a.vigencia.inicio), `${a.id}: inicio`).toBeLessThanOrEqual(DEMOSTRACION_DESDE);
      expect(Date.parse(a.vigencia.fin), `${a.id}: fin`).toBeGreaterThanOrEqual(DEMOSTRACION_HASTA);
      expect(Date.parse(a.vigencia.fin), `${a.id}: fin >= inicio`).toBeGreaterThanOrEqual(Date.parse(a.vigencia.inicio));
      expect(Date.parse(a.actualizadoEn), `${a.id}: actualizadoEn >= publicadoEn`).toBeGreaterThanOrEqual(Date.parse(a.publicadoEn));
    }
  });

  it('el conjunto usa las dos fuentes (SENAMHI e INDECI) y varios tipos de riesgo', () => {
    expect(new Set(alertas().map((a) => a.fuente))).toEqual(new Set(['SENAMHI', 'INDECI']));
    expect(new Set(alertas().map((a) => a.tipoRiesgo)).size).toBeGreaterThanOrEqual(3);
  });

  it('cubre los cuatro niveles de riesgo y marca como máximo solo el nivel más alto de la escala', () => {
    expect(new Set(alertas().map((a) => a.nivel))).toEqual(new Set(NIVELES_RIESGO));
    for (const a of alertas()) expect(a.nivelOficial.esMaximo, a.id).toBe(a.nivel === 'Muy alto');
  });
});

describe('Datos de prueba: avisos y recomendaciones (Requisito 10)', () => {
  it('cada aviso tiene de 1 a 3 recomendaciones, para que quepan en un resumen de 60 palabras', () => {
    for (const a of dataset().alertas) {
      expect(a.aviso.recomendaciones.length, a.id).toBeGreaterThanOrEqual(1);
      expect(a.aviso.recomendaciones.length, a.id).toBeLessThanOrEqual(3);
    }
  });

  it('cada recomendación tiene una clave única en su aviso y al menos una frase que aparece en el texto original', () => {
    for (const { aviso, id } of dataset().alertas) {
      const claves = aviso.recomendaciones.map((r) => r.clave);
      expect(new Set(claves).size, id).toBe(claves.length);
      const texto = aviso.textoOriginal.toLowerCase();
      for (const recomendacion of aviso.recomendaciones) {
        const aparece = recomendacion.frases.some((frase) => texto.includes(frase.toLowerCase()));
        expect(aparece, `${id}: "${recomendacion.clave}" no aparece en el texto original`).toBe(true);
      }
    }
  });

  it('el texto original cabe en un resumen razonable: de 20 a 90 palabras', () => {
    for (const { aviso, id } of dataset().alertas) {
      const palabras = aviso.textoOriginal.trim().split(/\s+/).length;
      expect(palabras, id).toBeGreaterThanOrEqual(20);
      expect(palabras, id).toBeLessThanOrEqual(90);
    }
  });

  it('cada aviso tiene urlOriginal o referencia (Requisito 4.14), y al menos uno ejercita cada caso', () => {
    const avisos = dataset().alertas.map((a) => a.aviso);
    for (const aviso of avisos) expect(aviso.urlOriginal ?? aviso.referencia).toBeTruthy();
    expect(avisos.some((a) => a.urlOriginal !== undefined)).toBe(true);
    expect(avisos.some((a) => a.urlOriginal === undefined && a.referencia !== undefined)).toBe(true);
  });
});

describe('Datos de prueba: precios agrícolas (200)', () => {
  const precios = (): Precio[] => (pagina(200).registros ?? []) as Precio[];

  it('hay más de 20 registros, para ejercitar la paginación de 20 por página', () => {
    expect(precios().length).toBeGreaterThan(20);
  });

  it('hay precios sin dato (nulo, nunca estimado) y precios en céntimos enteros', () => {
    const sinDato = precios().filter((p) => p.precioCentimos === null);
    expect(sinDato.length).toBeGreaterThanOrEqual(1);
    for (const p of precios()) {
      if (p.precioCentimos !== null) expect(Number.isInteger(p.precioCentimos)).toBe(true);
    }
  });

  it('un mismo producto aparece en varios mercados, para probar el filtro por producto', () => {
    const porProducto = new Map<string, number>();
    for (const p of precios()) porProducto.set(p.producto, (porProducto.get(p.producto) ?? 0) + 1);
    expect([...porProducto.values()].every((n) => n > 1)).toBe(true);
    expect(porProducto.size).toBeGreaterThanOrEqual(3);
  });

  it('los mercados se rotulan "de prueba" para que no se confundan con cotizaciones reales', () => {
    for (const p of precios()) expect(p.mercado).toMatch(/^Mercado de prueba /);
  });

  it('cada fecha es una fecha de calendario y todas las fechas son la misma (no se inventa un historial)', () => {
    expect(new Set(precios().map((p) => p.fecha)).size).toBe(1);
  });
});

interface EscalaMapeo {
  oficial: string;
  nivel: NivelRiesgo;
  esMaximo: boolean;
}
interface MapeoNiveles {
  version: string;
  confirmadoPorEquipo: boolean;
  nota: string;
  escalas: Record<'SENAMHI' | 'INDECI', EscalaMapeo[]>;
}

describe('Tabla de mapeo de niveles (data/mapeo-niveles.json)', () => {
  const mapeo = (): MapeoNiveles => leerJson<MapeoNiveles>(DIR_DATOS, 'mapeo-niveles.json');

  it('declara una escala para SENAMHI y otra para INDECI, y que es un supuesto por confirmar', () => {
    expect(Object.keys(mapeo().escalas).sort()).toEqual(['INDECI', 'SENAMHI']);
    expect(typeof mapeo().confirmadoPorEquipo).toBe('boolean');
    expect(mapeo().nota).toMatch(/supuesto/i);
  });

  it.each(['SENAMHI', 'INDECI'] as const)('la escala de %s es verde, amarillo, naranja y rojo, de menor a mayor severidad', (fuente) => {
    const escala = mapeo().escalas[fuente];
    expect(escala.map((e) => e.oficial)).toEqual(['Verde', 'Amarillo', 'Naranja', 'Rojo']);
    expect(escala.map((e) => e.nivel)).toEqual([...NIVELES_RIESGO]);
  });

  it.each(['SENAMHI', 'INDECI'] as const)('en la escala de %s solo el último nivel es el máximo', (fuente) => {
    expect(mapeo().escalas[fuente].map((e) => e.esMaximo)).toEqual([false, false, false, true]);
  });

  it.each(['SENAMHI', 'INDECI'] as const)('la escala de %s no repite valores oficiales y no tiene un nivel por defecto', (fuente) => {
    const oficiales = mapeo().escalas[fuente].map((e) => e.oficial);
    expect(new Set(oficiales).size).toBe(oficiales.length);
    expect(mapeo()).not.toHaveProperty('porDefecto');
    expect(mapeo()).not.toHaveProperty('default');
  });

  it('cada alerta de prueba usa un valor oficial que la tabla convierte exactamente en su nivel normalizado', () => {
    for (const a of dataset().alertas) {
      const entrada = mapeo().escalas[a.fuente].find((e) => e.oficial === a.nivelOficial.texto);
      expect(entrada, `${a.id}: "${a.nivelOficial.texto}" no está en la escala de ${a.fuente}`).toBeDefined();
      expect(entrada?.nivel, a.id).toBe(a.nivel);
      expect(entrada?.esMaximo, a.id).toBe(a.nivelOficial.esMaximo);
    }
  });
});
