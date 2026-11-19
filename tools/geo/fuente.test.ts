import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { CODIGOS_DEPARTAMENTO } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { camposDeGeometria, evaluarPuerta, resumirFuente, type FuenteConfig } from './index.ts';
import configReal from './fuente.config.json' with { type: 'json' };

// Tarea 3.1: configuración de la fuente de la geometría y puerta de confirmación del Equipo.
// Estas pruebas NO cubren la generación de la geometría (tarea 3.2) ni sus pruebas (tarea 3.3).

const RUTA_ZIP = new URL('../../data/fuentes/ign/DEPARTAMENTOS_LIMITES.zip', import.meta.url);

/** Copia profunda de la configuración real con una modificación. `any` es deliberado: se rompe el contrato a propósito. */
function configCon(cambiar: (copia: any) => void = () => {}): unknown {
  const copia = JSON.parse(JSON.stringify(configReal)) as unknown;
  cambiar(copia);
  return copia;
}

describe('Configuración real de la fuente (fuente.config.json)', () => {
  it('registra la aprobación del Equipo', () => {
    expect(configReal.confirmadoPorEquipo).toBe(true);
    expect(configReal.confirmacion.nota).toMatch(/No se registra quién/);
  });

  it('identifica al IGN como publicador y al conjunto "Límites Departamentales" con su identificador', () => {
    const { fuente } = configReal;
    expect(fuente.publicador).toBe('Instituto Geográfico Nacional (IGN), Perú');
    expect(fuente.conjunto).toBe('Límites Departamentales');
    expect(fuente.identificador).toBe('6c5c52fd-047d-4ba7-9ac7-3865860118c2');
    expect(fuente.urlConjunto).toBe('https://www.datosabiertos.gob.pe/dataset/limites-departamentales');
  });

  it('documenta que INEI figura como fuente en los atributos del DBF y que el publicador es el IGN', () => {
    const { fuenteEnAtributos } = configReal.fuente;
    expect(fuenteEnAtributos).toMatchObject({ campo: 'FUENTE', valor: 'INEI', registros: 25 });
    expect(fuenteEnAtributos.nota).toMatch(/publicador del conjunto es el IGN/);
    expect(fuenteEnAtributos.nota).toMatch(/INEI como fuente/);
    expect(configReal.advertencias.join(' ')).toMatch(/IGN es el publicador.*INEI figura como fuente/);
  });

  it('declara la licencia ODC-By sin inventar condiciones: remite al texto de la licencia', () => {
    const { licencia } = configReal;
    expect(licencia.id).toBe('ODC-By');
    expect(licencia.nombre).toBe('Open Data Commons Attribution License (ODC-By)');
    expect(licencia.declaradaEnPortal).toBe('http://opendefinition.org/licenses/odc-by/');
    expect(licencia.urlTexto).toBe('https://opendatacommons.org/licenses/by/1.0/');
    expect(licencia.condiciones).toMatch(/rige el texto de la licencia/);
    expect(licencia.notaVersion).toMatch(/portal no indica la versión/);
  });

  it('incluye un texto de atribución con la licencia, el IGN, INEI y el carácter referencial de los límites', () => {
    const { texto } = configReal.atribucion;
    for (const parte of ['Límites Departamentales', 'Instituto Geográfico Nacional (IGN)', 'ODC-By', 'INEI', 'referenciales']) {
      expect(texto, parte).toContain(parte);
    }
  });

  it('no presenta los límites referenciales como límites legales definitivos', () => {
    expect(configReal.fuente.naturalezaDeLosLimites).toBe('referencial');
    expect(configReal.atribucion.texto).toMatch(/no deben tomarse como límites legales definitivos/);
    expect(configReal.advertencias[0]).toMatch(/No son límites legales definitivos/);
    const todo = JSON.stringify(configReal);
    expect(todo).not.toMatch(/límites (legales )?oficiales/i);
    expect(todo).not.toMatch(/geometría oficial/i);
  });

  it('registra el sistema de coordenadas GCS_WGS_1984 tal como figura en el archivo .prj', () => {
    const { sistemaCoordenadas } = configReal;
    expect(sistemaCoordenadas.nombre).toBe('GCS_WGS_1984');
    expect(sistemaCoordenadas.prjLiteral.startsWith('GEOGCS["GCS_WGS_1984"')).toBe(true);
    expect(sistemaCoordenadas.tipo).toMatch(/sin proyección/);
  });

  it('registra la codificación UBIGEO de 25 unidades, del "01" al "25", con el Callao en "07"', () => {
    expect(configReal.codificacion).toMatchObject({
      esquema: 'UBIGEO',
      campoCodigo: 'CODDEP',
      unidades: 25,
      primerCodigo: '01',
      ultimoCodigo: '25',
      callao: '07',
    });
  });

  it('lista exactamente los 25 códigos de @teletexto/modelo, con el Callao en "07"', () => {
    const verificados = configReal.verificacion.esperadoPorDepartamento;
    expect(verificados.map((d) => d.codigo)).toEqual([...CODIGOS_DEPARTAMENTO]);
    expect(verificados.find((d) => d.nombreEnDbf === 'CALLAO')?.codigo).toBe('07');
  });

  it('conserva todas las partes de las geometrías multiparte: lo comprobado en el archivo queda registrado', () => {
    const verificados = configReal.verificacion.esperadoPorDepartamento;
    const multiparte = Object.fromEntries(verificados.filter((d) => d.partes > 1).map((d) => [d.codigo, d.partes]));
    expect(multiparte).toEqual({ '04': 2, '05': 2, '08': 2, '15': 4, '21': 10 });
    for (const d of verificados) expect(d.anillosExteriores + d.huecos, d.codigo).toBe(d.partes);
    expect(verificados.reduce((suma, d) => suma + d.partes, 0)).toBe(configReal.verificacion.partesTotales);
    expect(verificados.reduce((suma, d) => suma + d.vertices, 0)).toBe(configReal.verificacion.verticesTotales);
    expect(configReal.verificacion.partesTotales).toBe(40);
    expect(configReal.verificacion.integridadDeGeometrias.nota).toMatch(/debe conservarlas todas/);
  });

  it('describe el archivo local con un SHA-256 y registra que coincide con el del portal', () => {
    const { archivoLocal } = configReal;
    expect(archivoLocal.ruta).toBe('data/fuentes/ign/DEPARTAMENTOS_LIMITES.zip');
    expect(archivoLocal.sha256).toMatch(/^[0-9A-F]{64}$/);
    expect(archivoLocal.identicoAlDelPortal).toBe(true);
    expect(archivoLocal.contenido.map((a) => a.nombre)).toEqual([
      'DEPARTAMENTOS.CPG',
      'DEPARTAMENTOS.dbf',
      'DEPARTAMENTOS.prj',
      'DEPARTAMENTOS.sbn',
      'DEPARTAMENTOS.sbx',
      'DEPARTAMENTOS.shp',
      'DEPARTAMENTOS.shp.xml',
      'DEPARTAMENTOS.shx',
    ]);
  });

  it.skipIf(!existsSync(RUTA_ZIP))('el ZIP local coincide con el tamaño y el SHA-256 registrados', () => {
    const bytes = readFileSync(RUTA_ZIP);
    expect(bytes.length).toBe(configReal.archivoLocal.bytes);
    expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(configReal.archivoLocal.sha256);
  });

  it('no contiene ninguna geometría: solo metadatos y conteos', () => {
    expect(Object.keys(configReal)).not.toContain('geometria');
    expect(JSON.stringify(configReal).length).toBeLessThan(20_000);
  });
});

describe('Puerta de confirmación (evaluarPuerta)', () => {
  it('deja continuar con la configuración real, que está confirmada y completa', () => {
    const puerta = evaluarPuerta(configReal);
    expect(puerta.permitido).toBe(true);
    if (puerta.permitido) {
      expect(puerta.config.confirmadoPorEquipo).toBe(true);
      expect(puerta.resumen.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['false', false],
    ['ausente', undefined],
    ['null', null],
    ['el texto "true"', 'true'],
    ['el número 1', 1],
    ['un objeto', {}],
    ['una lista', [true]],
  ])('se niega a ejecutarse si confirmadoPorEquipo es %s', (_etiqueta, valor) => {
    const config = configCon((c) => {
      if (valor === undefined) delete c.confirmadoPorEquipo;
      else c.confirmadoPorEquipo = valor;
    });
    const puerta = evaluarPuerta(config);
    expect(puerta.permitido).toBe(false);
    if (!puerta.permitido) {
      expect(puerta.motivo).toMatch(/no confirmó la fuente/);
      expect(puerta.motivo).toContain('confirmadoPorEquipo');
    }
  });

  it('al negarse imprime la fuente, la licencia y la codificación pendientes de confirmar', () => {
    const puerta = evaluarPuerta(configCon((c) => (c.confirmadoPorEquipo = false)));
    expect(puerta.permitido).toBe(false);
    const texto = puerta.resumen.join('\n');
    expect(texto).toContain('Instituto Geográfico Nacional (IGN), Perú');
    expect(texto).toContain('6c5c52fd-047d-4ba7-9ac7-3865860118c2');
    expect(texto).toContain('INEI');
    expect(texto).toContain('Open Data Commons Attribution License (ODC-By)');
    expect(texto).toContain('https://opendatacommons.org/licenses/by/1.0/');
    expect(texto).toContain('UBIGEO');
    expect(texto).toContain('Callao "07"');
    expect(texto).toContain('GCS_WGS_1984');
    expect(texto).toContain('referencial');
  });

  it.each([[null], [undefined], [[]], ['texto'], [42], [true]])('rechaza una configuración que no es un objeto: %j', (config) => {
    const puerta = evaluarPuerta(config);
    expect(puerta.permitido).toBe(false);
    if (!puerta.permitido) expect(puerta.motivo).toMatch(/no es un objeto JSON/);
  });

  it('rechaza una fuente confirmada pero incompleta, e indica cada dato que falta', () => {
    const puerta = evaluarPuerta(
      configCon((c) => {
        delete c.licencia.version;
        delete c.atribucion;
        c.codificacion.unidades = '25';
        c.archivoLocal.sha256 = '';
      }),
    );
    expect(puerta.permitido).toBe(false);
    if (puerta.permitido) return;
    expect(puerta.motivo).toMatch(/incompleto/);
    expect(puerta.errores).toEqual(
      expect.arrayContaining([
        'Falta "licencia.version" (debe ser un texto no vacío).',
        'Falta "atribucion.texto" (debe ser un texto no vacío).',
        'Falta "codificacion.unidades" (debe ser un número entero).',
        'Falta "archivoLocal.sha256" (debe ser un texto no vacío).',
      ]),
    );
  });

  it('no se deja engañar por textos vacíos o de solo espacios', () => {
    const puerta = evaluarPuerta(configCon((c) => (c.fuente.publicador = '   ')));
    expect(puerta.permitido).toBe(false);
  });

  it('exige confirmadoPorEquipo antes que la completitud: una fuente sin confirmar nunca pasa, aunque esté completa', () => {
    const puerta = evaluarPuerta(configCon((c) => (c.confirmadoPorEquipo = false)));
    expect(puerta.permitido).toBe(false);
    if (!puerta.permitido) expect(puerta.errores).toEqual([]);
  });

  it('no modifica la configuración recibida', () => {
    const copia = JSON.stringify(configReal);
    evaluarPuerta(configReal);
    expect(JSON.stringify(configReal)).toBe(copia);
  });
});

describe('resumirFuente', () => {
  it('resume la fuente, el conjunto, la licencia, la codificación y el sistema de coordenadas', () => {
    const lineas = resumirFuente(configReal);
    expect(lineas).toHaveLength(8);
    expect(lineas[0]).toBe('Fuente: Instituto Geográfico Nacional (IGN), Perú');
    expect(lineas.join('\n')).toContain('Fuente indicada en los atributos (FUENTE): INEI');
  });

  it('tolera configuraciones incompletas o inválidas y marca lo que falta, sin lanzar errores', () => {
    for (const config of [{}, null, undefined, [], 'x', { fuente: 5 }]) {
      const lineas = resumirFuente(config);
      expect(lineas).toHaveLength(8);
      expect(lineas.join('\n')).toContain('(no indicado)');
    }
  });
});

describe('camposDeGeometria: licencia y atribución en los campos de la Geometría', () => {
  const config = (): FuenteConfig => {
    const puerta = evaluarPuerta(configReal);
    if (!puerta.permitido) throw new Error('La configuración real debe estar confirmada.');
    return puerta.config;
  };

  it('devuelve solo los campos "fuente" y "licencia", que ya existen en el tipo Geometria', () => {
    expect(Object.keys(camposDeGeometria(config())).sort()).toEqual(['fuente', 'licencia']);
  });

  it('el campo "fuente" nombra al IGN como publicador, el conjunto, su identificador, INEI y el carácter referencial', () => {
    const { fuente } = camposDeGeometria(config());
    for (const parte of [
      'Instituto Geográfico Nacional (IGN), Perú',
      'Límites Departamentales',
      '6c5c52fd-047d-4ba7-9ac7-3865860118c2',
      'Fuente indicada en los datos: INEI',
      'referencial',
    ]) {
      expect(fuente, parte).toContain(parte);
    }
  });

  it('el campo "licencia" lleva la atribución y la licencia ODC-By con el enlace a su texto', () => {
    const { licencia } = camposDeGeometria(config());
    expect(licencia).toContain(configReal.atribucion.texto);
    expect(licencia).toContain('Open Data Commons Attribution License (ODC-By), versión 1.0');
    expect(licencia).toContain('https://opendatacommons.org/licenses/by/1.0/');
    expect(licencia).toContain('no deben tomarse como límites legales definitivos');
  });

  it('refleja los cambios de la configuración, sin textos fijos en el código', () => {
    const modificada = JSON.parse(JSON.stringify(config())) as FuenteConfig;
    modificada.fuente.publicador = 'Publicador de prueba';
    modificada.licencia.nombre = 'Licencia de prueba';
    modificada.atribucion.texto = 'Atribución de prueba.';
    const campos = camposDeGeometria(modificada);
    expect(campos.fuente).toContain('Publicador de prueba');
    expect(campos.licencia).toContain('Atribución de prueba.');
    expect(campos.licencia).toContain('Licencia de prueba');
    expect(campos.licencia).not.toContain('ODC-By');
  });
});
