import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CODIGOS_DEPARTAMENTO,
  FUENTES_ALERTA,
  FUENTES_METADATOS,
  MAX_NOMBRE_MENU,
  MAX_PALABRAS_RESUMEN,
  MAX_REFERENCIA,
  MAX_TITULO_ALERTA,
  MAX_TITULO_PAGINA,
  NIVELES_RIESGO,
  NUMERO_PAGINA_MAXIMO,
  NUMERO_PAGINA_MINIMO,
  TIPOS_PAGINA,
  type AlertaRiesgo,
  type DatasetAlertas,
  type Page,
} from '../index.ts';
import {
  ESQUEMAS,
  ID_ESQUEMA_ALERTAS,
  ID_ESQUEMA_PAGE,
  esquemaAlertas,
  esquemaComun,
  esquemaPage,
} from './index.ts';

// ---------------------------------------------------------------------------------------------
// Datos sintéticos SOLO para estas pruebas. No son datos de prueba del producto (esos van en
// data/prueba/, tarea 1.3): no describen ninguna situación real ni usan fuentes o cifras reales.
// ---------------------------------------------------------------------------------------------
const FECHA = '2026-01-01T00:00:00Z';
const METADATOS = { fuente: 'VARIAS', publicadoEn: FECHA, actualizadoEn: FECHA } as const;

const portada = {
  numero: 100,
  titulo: 'Portada',
  tipo: 'portada',
  esDatoDePrueba: true,
  umbralHoras: 24,
  metadatos: METADATOS,
  registros: [
    { id: 'menu-1', esDatoDePrueba: true, numero: 101, nombre: 'Alertas' },
    { id: 'menu-2', esDatoDePrueba: true, numero: 200, nombre: 'Precios' },
    { id: 'menu-3', esDatoDePrueba: true, numero: 400, nombre: 'Mapa de riesgos' },
  ],
} satisfies Page;

const precios = {
  numero: 200,
  titulo: 'Precios',
  tipo: 'precios',
  esDatoDePrueba: true,
  umbralHoras: 24,
  metadatos: { ...METADATOS, fuente: 'MIDAGRI' },
  registros: [
    {
      id: 'precio-1',
      esDatoDePrueba: true,
      producto: 'Producto de prueba',
      mercado: 'Mercado de prueba',
      unidad: 'kg',
      precioCentimos: 100,
      fecha: '2026-01-01',
    },
    {
      id: 'precio-2',
      esDatoDePrueba: true,
      producto: 'Producto sin dato',
      mercado: 'Mercado de prueba',
      unidad: 'kg',
      precioCentimos: null,
      fecha: '2026-01-01',
    },
  ],
} satisfies Page;

const paginaAlertas = {
  numero: 101,
  titulo: 'Alertas',
  tipo: 'alertas',
  esDatoDePrueba: true,
  umbralHoras: 6,
  metadatos: METADATOS,
  datos: 'alertas',
} satisfies Page;

const paginaMapa = {
  numero: 400,
  titulo: 'Mapa de riesgos',
  tipo: 'mapa',
  esDatoDePrueba: true,
  umbralHoras: 6,
  metadatos: METADATOS,
  datos: 'alertas',
} satisfies Page;

const alerta = {
  id: 'alerta-1',
  esDatoDePrueba: true,
  titulo: 'Alerta sintética para pruebas del esquema',
  tipoRiesgo: 'Tipo de riesgo de prueba',
  nivel: 'Moderado',
  nivelOficial: { texto: 'Nivel de prueba', esMaximo: false },
  departamentos: ['01'],
  vigencia: { inicio: FECHA, fin: '2026-01-02T00:00:00Z' },
  publicadoEn: FECHA,
  actualizadoEn: FECHA,
  fuente: 'SENAMHI',
  aviso: {
    id: 'aviso-1',
    textoOriginal: 'Texto sintético de un aviso, solo para pruebas del esquema.',
    referencia: 'Documento de prueba',
    recomendaciones: [{ clave: 'clave-de-prueba', frases: ['frase de prueba'] }],
  },
} satisfies AlertaRiesgo;

const dataset = {
  metadatos: METADATOS,
  esDatoDePrueba: true,
  alertas: [alerta],
} satisfies DatasetAlertas;

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------
const ajv = new Ajv({ allErrors: true, strict: true });
for (const esquema of ESQUEMAS) ajv.addSchema(esquema);

function obtenerValidador(id: string): ValidateFunction {
  const validar = ajv.getSchema(id);
  if (!validar) throw new Error(`Esquema no registrado: ${id}`);
  return validar;
}

const validarPage = obtenerValidador(ID_ESQUEMA_PAGE);
const validarAlertas = obtenerValidador(ID_ESQUEMA_ALERTAS);

function describirError(e: ErrorObject): string {
  const params = e.params as Record<string, unknown>;
  if (e.keyword === 'required') return `${e.instancePath}/${String(params['missingProperty'])} requerido`;
  if (e.keyword === 'additionalProperties') {
    return `${e.instancePath}/${String(params['additionalProperty'])} no permitido`;
  }
  return `${e.instancePath || '/'} ${e.keyword}`;
}

/** Valida y devuelve el resultado junto con los errores en forma legible, para comprobar el motivo del rechazo. */
function probar(validar: ValidateFunction, datos: unknown): { valido: boolean; errores: string[] } {
  const valido = validar(datos) as boolean;
  return { valido, errores: (validar.errors ?? []).map(describirError) };
}

/** Copia profunda con una modificación. `any` es deliberado: las pruebas rompen el contrato a propósito. */
function modificar<T>(base: T, cambiar: (copia: any) => void): unknown {
  const copia = JSON.parse(JSON.stringify(base)) as T;
  cambiar(copia);
  return copia;
}

const palabras = (n: number): string => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

// ---------------------------------------------------------------------------------------------
describe('Registro y compilación de los esquemas', () => {
  it('compila los tres esquemas en modo estricto de Ajv, con referencias resueltas', () => {
    expect(validarPage).toBeTypeOf('function');
    expect(validarAlertas).toBeTypeOf('function');
    expect(esquemaComun.$id).toBe('teletexto/comun.schema.json');
    // comun.schema.json solo contiene $defs: no restringe ningún valor por sí sola.
    expect(Object.keys(esquemaComun).filter((k) => ['type', 'properties', 'required'].includes(k))).toEqual([]);
  });

  it('declara los mismos $id que exportan las constantes', () => {
    expect(esquemaPage.$id).toBe(ID_ESQUEMA_PAGE);
    expect(esquemaAlertas.$id).toBe(ID_ESQUEMA_ALERTAS);
  });
});

describe('Coherencia entre los esquemas JSON y las constantes de TypeScript', () => {
  const defsAlerta = esquemaAlertas.$defs.alertaRiesgo.properties;

  it('los tipos de página del esquema son los de TIPOS_PAGINA', () => {
    expect(esquemaPage.properties.tipo.enum).toEqual([...TIPOS_PAGINA]);
  });

  it('las fuentes de los metadatos son las de FUENTES_METADATOS', () => {
    expect(esquemaComun.$defs.metadatos.properties.fuente.enum).toEqual([...FUENTES_METADATOS]);
  });

  it('las fuentes de las alertas son las de FUENTES_ALERTA', () => {
    expect(defsAlerta.fuente.enum).toEqual([...FUENTES_ALERTA]);
  });

  it('los niveles de riesgo son los de NIVELES_RIESGO, en el mismo orden', () => {
    expect(defsAlerta.nivel.enum).toEqual([...NIVELES_RIESGO]);
  });

  it('los códigos de Departamento son los de CODIGOS_DEPARTAMENTO', () => {
    expect(defsAlerta.departamentos.items.enum).toEqual([...CODIGOS_DEPARTAMENTO]);
  });

  it('el rango del número de página y las longitudes máximas coinciden con las constantes', () => {
    const numero = esquemaComun.$defs.numeroPagina;
    expect(numero.minimum).toBe(NUMERO_PAGINA_MINIMO);
    expect(numero.maximum).toBe(NUMERO_PAGINA_MAXIMO);
    expect(esquemaPage.properties.titulo.maxLength).toBe(MAX_TITULO_PAGINA);
    expect(esquemaPage.$defs.entradaMenu.properties.nombre.maxLength).toBe(MAX_NOMBRE_MENU);
    expect(defsAlerta.titulo.maxLength).toBe(MAX_TITULO_ALERTA);
    expect(esquemaAlertas.$defs.avisoOficial.properties.referencia.maxLength).toBe(MAX_REFERENCIA);
  });
});

describe('page.schema.json: páginas válidas', () => {
  it.each([
    ['100 (portada)', portada],
    ['200 (precios)', precios],
    ['101 (alertas)', paginaAlertas],
    ['400 (mapa)', paginaMapa],
  ])('acepta la página %s', (_nombre, pagina) => {
    expect(probar(validarPage, pagina)).toEqual({ valido: true, errores: [] });
  });

  it('acepta un precio sin dato (precioCentimos nulo) y el precio cero', () => {
    const conCero = modificar(precios, (p) => {
      p.registros[0].precioCentimos = 0;
    });
    expect(probar(validarPage, precios).valido).toBe(true);
    expect(probar(validarPage, conCero).valido).toBe(true);
  });
});

describe('page.schema.json: esDatoDePrueba booleano en cada registro', () => {
  it('rechaza una página sin esDatoDePrueba', () => {
    const r = probar(validarPage, modificar(portada, (p) => delete p.esDatoDePrueba));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/esDatoDePrueba requerido');
  });

  it.each([['"true"', 'true'], ['null', null], ['1', 1], ['0', 0]])(
    'rechaza esDatoDePrueba con el valor no booleano %s en la página',
    (_etiqueta, valor) => {
      const r = probar(validarPage, modificar(portada, (p) => (p.esDatoDePrueba = valor)));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain('/esDatoDePrueba type');
    },
  );

  it('rechaza una entrada de menú sin esDatoDePrueba', () => {
    const r = probar(validarPage, modificar(portada, (p) => delete p.registros[1].esDatoDePrueba));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/registros/1/esDatoDePrueba requerido');
  });

  it('rechaza un precio con esDatoDePrueba no booleano', () => {
    const r = probar(validarPage, modificar(precios, (p) => (p.registros[0].esDatoDePrueba = 'sí')));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/registros/0/esDatoDePrueba type');
  });

  it('acepta esDatoDePrueba falso, para cuando el sistema use datos reales', () => {
    const real = modificar(precios, (p) => {
      p.esDatoDePrueba = false;
      p.registros.forEach((registro: { esDatoDePrueba: boolean }) => (registro.esDatoDePrueba = false));
    });
    expect(probar(validarPage, real).valido).toBe(true);
  });
});

describe('page.schema.json: datos "alertas" y umbralHoras en las páginas 101 y 400', () => {
  it.each([
    ['101', paginaAlertas],
    ['400', paginaMapa],
  ])('rechaza la página %s si no declara datos "alertas"', (_n, pagina) => {
    const r = probar(validarPage, modificar(pagina, (p) => delete p.datos));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/datos requerido');
  });

  it.each([
    ['101', paginaAlertas],
    ['400', paginaMapa],
  ])('rechaza la página %s si guarda registros propios (las alertas son una fuente única)', (_n, pagina) => {
    const r = probar(validarPage, modificar(pagina, (p) => (p.registros = portada.registros)));
    expect(r.valido).toBe(false);
  });

  it('rechaza un valor de datos distinto de "alertas"', () => {
    const r = probar(validarPage, modificar(paginaAlertas, (p) => (p.datos = 'precios')));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/datos enum');
  });

  it.each([
    ['la portada', portada],
    ['la página de precios', precios],
    ['la página de alertas', paginaAlertas],
    ['la página del mapa', paginaMapa],
  ])('exige umbralHoras en %s', (_n, pagina) => {
    const r = probar(validarPage, modificar(pagina, (p) => delete p.umbralHoras));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/umbralHoras requerido');
  });

  it.each([['0', 0], ['negativo', -6], ['decimal', 1.5], ['texto', '6'], ['nulo', null]])(
    'rechaza un umbralHoras inválido (%s)',
    (_etiqueta, valor) => {
      const r = probar(validarPage, modificar(paginaAlertas, (p) => (p.umbralHoras = valor)));
      expect(r.valido).toBe(false);
    },
  );

  it('acepta cualquier umbral entero positivo: el valor lo fijan los datos, no el esquema', () => {
    for (const horas of [1, 6, 24, 48]) {
      expect(probar(validarPage, modificar(paginaMapa, (p) => (p.umbralHoras = horas))).valido).toBe(true);
    }
  });

  it('rechaza una portada o una página de precios sin registros, o que declare datos', () => {
    expect(probar(validarPage, modificar(portada, (p) => delete p.registros)).valido).toBe(false);
    expect(probar(validarPage, modificar(precios, (p) => delete p.registros)).valido).toBe(false);
    expect(probar(validarPage, modificar(portada, (p) => (p.datos = 'alertas'))).valido).toBe(false);
    expect(probar(validarPage, modificar(precios, (p) => (p.datos = 'alertas'))).valido).toBe(false);
  });
});

describe('page.schema.json: restricciones del contenido', () => {
  it('rechaza el tipo "salud" y cualquier tipo fuera del MVP', () => {
    for (const tipo of ['salud', 'campanas', '']) {
      const r = probar(validarPage, modificar(portada, (p) => (p.tipo = tipo)));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain('/tipo enum');
    }
  });

  it('rechaza MINSA como fuente de los metadatos', () => {
    const r = probar(validarPage, modificar(portada, (p) => (p.metadatos.fuente = 'MINSA')));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/metadatos/fuente enum');
  });

  it.each([[99], [1000], [100.5], [0], [-100], ['101']])('rechaza el número de página %s', (numero) => {
    const r = probar(validarPage, modificar(paginaAlertas, (p) => (p.numero = numero)));
    expect(r.valido).toBe(false);
  });

  it('acepta los extremos 100 y 999 del número de página', () => {
    expect(probar(validarPage, modificar(paginaAlertas, (p) => (p.numero = 100))).valido).toBe(true);
    expect(probar(validarPage, modificar(paginaAlertas, (p) => (p.numero = 999))).valido).toBe(true);
  });

  it('limita el título a 40 caracteres y no admite títulos vacíos', () => {
    expect(probar(validarPage, modificar(portada, (p) => (p.titulo = 'a'.repeat(40)))).valido).toBe(true);
    expect(probar(validarPage, modificar(portada, (p) => (p.titulo = 'a'.repeat(41)))).valido).toBe(false);
    expect(probar(validarPage, modificar(portada, (p) => (p.titulo = ''))).valido).toBe(false);
  });

  it('limita el nombre de una entrada de menú a 40 caracteres', () => {
    const ok = modificar(portada, (p) => (p.registros[0].nombre = 'a'.repeat(40)));
    const largo = modificar(portada, (p) => (p.registros[0].nombre = 'a'.repeat(41)));
    expect(probar(validarPage, ok).valido).toBe(true);
    expect(probar(validarPage, largo).valido).toBe(false);
  });

  it('exige los metadatos completos: fuente, fecha de publicación y fecha de actualización', () => {
    for (const campo of ['fuente', 'publicadoEn', 'actualizadoEn']) {
      const r = probar(validarPage, modificar(portada, (p) => delete p.metadatos[campo]));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain(`/metadatos/${campo} requerido`);
    }
    expect(probar(validarPage, modificar(portada, (p) => delete p.metadatos)).valido).toBe(false);
  });

  it('rechaza propiedades desconocidas en la página y en sus registros', () => {
    expect(probar(validarPage, modificar(portada, (p) => (p.extra = 1))).errores).toContain('/extra no permitido');
    expect(probar(validarPage, modificar(precios, (p) => (p.registros[0].extra = 1))).valido).toBe(false);
    expect(probar(validarPage, modificar(portada, (p) => (p.registros[0].extra = 1))).valido).toBe(false);
  });

  it('exige que el precio sea un entero en céntimos no negativo o nulo, nunca decimal ni texto', () => {
    for (const valor of [2.5, -1, '2.50', undefined]) {
      const r = probar(
        validarPage,
        modificar(precios, (p) => {
          if (valor === undefined) delete p.registros[0].precioCentimos;
          else p.registros[0].precioCentimos = valor;
        }),
      );
      expect(r.valido).toBe(false);
    }
  });

  it('exige la fecha del precio como fecha de calendario AAAA-MM-DD', () => {
    for (const fecha of ['01/01/2026', '2026-1-1', '2026-13-01', '2026-01-32', '2026-01-01T00:00:00Z', '']) {
      expect(probar(validarPage, modificar(precios, (p) => (p.registros[0].fecha = fecha))).valido).toBe(false);
    }
  });
});

describe('alertas.schema.json: conjunto de alertas válido', () => {
  it('acepta un conjunto con una alerta, y uno sin alertas', () => {
    expect(probar(validarAlertas, dataset)).toEqual({ valido: true, errores: [] });
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas = []))).valido).toBe(true);
  });

  it.each([['SENAMHI'], ['INDECI']])('acepta la fuente %s', (fuente) => {
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].fuente = fuente))).valido).toBe(true);
  });

  it.each(NIVELES_RIESGO.map((n) => [n]))('acepta el nivel normalizado "%s"', (nivel) => {
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].nivel = nivel))).valido).toBe(true);
  });
});

describe('alertas.schema.json: esDatoDePrueba booleano en cada registro', () => {
  it('rechaza el conjunto sin esDatoDePrueba', () => {
    const r = probar(validarAlertas, modificar(dataset, (d) => delete d.esDatoDePrueba));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/esDatoDePrueba requerido');
  });

  it('rechaza una alerta sin esDatoDePrueba o con un valor no booleano', () => {
    const sin = probar(validarAlertas, modificar(dataset, (d) => delete d.alertas[0].esDatoDePrueba));
    expect(sin.valido).toBe(false);
    expect(sin.errores).toContain('/alertas/0/esDatoDePrueba requerido');

    for (const valor of ['true', null, 1]) {
      const r = probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].esDatoDePrueba = valor)));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain('/alertas/0/esDatoDePrueba type');
    }
  });
});

describe('alertas.schema.json: urlOriginal o referencia en cada alerta', () => {
  const conAviso = (cambiar: (aviso: Record<string, unknown>) => void) =>
    modificar(dataset, (d) => cambiar(d.alertas[0].aviso));

  it('rechaza una alerta cuyo aviso no tiene urlOriginal ni referencia', () => {
    const r = probar(validarAlertas, conAviso((aviso) => delete aviso['referencia']));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/alertas/0/aviso anyOf');
  });

  it('acepta solo urlOriginal, solo referencia, o ambas', () => {
    const soloUrl = conAviso((aviso) => {
      delete aviso['referencia'];
      aviso['urlOriginal'] = 'https://ejemplo.invalid/aviso';
    });
    const ambas = conAviso((aviso) => (aviso['urlOriginal'] = 'http://ejemplo.invalid/aviso'));
    expect(probar(validarAlertas, soloUrl).valido).toBe(true);
    expect(probar(validarAlertas, dataset).valido).toBe(true);
    expect(probar(validarAlertas, ambas).valido).toBe(true);
  });

  it.each([['javascript:alert(1)'], ['data:text/html,x'], ['ftp://ejemplo.invalid/a'], ['ejemplo.invalid'], ['https://con espacio'], ['']])(
    'rechaza la urlOriginal "%s" (solo se admiten enlaces http y https)',
    (url) => {
      const r = probar(
        validarAlertas,
        conAviso((aviso) => {
          delete aviso['referencia'];
          aviso['urlOriginal'] = url;
        }),
      );
      expect(r.valido).toBe(false);
    },
  );

  it('rechaza una urlOriginal peligrosa aunque la alerta tenga también una referencia válida', () => {
    const r = probar(validarAlertas, conAviso((aviso) => (aviso['urlOriginal'] = 'javascript:alert(1)')));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/alertas/0/aviso/urlOriginal pattern');
  });

  it(`limita la referencia a ${MAX_REFERENCIA} caracteres y no admite referencias vacías`, () => {
    expect(probar(validarAlertas, conAviso((a) => (a['referencia'] = 'a'.repeat(MAX_REFERENCIA)))).valido).toBe(true);
    expect(probar(validarAlertas, conAviso((a) => (a['referencia'] = 'a'.repeat(MAX_REFERENCIA + 1)))).valido).toBe(false);
    expect(probar(validarAlertas, conAviso((a) => (a['referencia'] = ''))).valido).toBe(false);
  });
});

describe('alertas.schema.json: ninguna alerta sin datos esenciales y sin niveles por defecto', () => {
  it.each(['nivel', 'departamentos', 'vigencia', 'titulo', 'tipoRiesgo', 'fuente', 'publicadoEn', 'actualizadoEn', 'aviso', 'nivelOficial'])(
    'rechaza una alerta sin "%s"',
    (campo) => {
      const r = probar(validarAlertas, modificar(dataset, (d) => delete d.alertas[0][campo]));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain(`/alertas/0/${campo} requerido`);
    },
  );

  it.each(['inicio', 'fin'])('rechaza una vigencia sin "%s"', (campo) => {
    const r = probar(validarAlertas, modificar(dataset, (d) => delete d.alertas[0].vigencia[campo]));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain(`/alertas/0/vigencia/${campo} requerido`);
  });

  it.each([['bajo'], ['MUY ALTO'], ['Rojo'], ['Extremo'], [''], ['Critico']])(
    'rechaza el nivel "%s", que no es un Nivel_de_Riesgo normalizado',
    (nivel) => {
      const r = probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].nivel = nivel)));
      expect(r.valido).toBe(false);
      expect(r.errores).toContain('/alertas/0/nivel enum');
    },
  );

  it('rechaza un nivel nulo y no inventa un valor por defecto', () => {
    const r = probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].nivel = null)));
    expect(r.valido).toBe(false);
  });

  it('exige que nivelOficial tenga texto y esMaximo booleano', () => {
    expect(probar(validarAlertas, modificar(dataset, (d) => delete d.alertas[0].nivelOficial.esMaximo)).valido).toBe(false);
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].nivelOficial.esMaximo = 'no'))).valido).toBe(false);
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].nivelOficial.texto = ''))).valido).toBe(false);
  });

  it.each([['MINSA'], ['MIDAGRI'], ['VARIAS'], ['senamhi']])('rechaza la fuente "%s" en una alerta', (fuente) => {
    const r = probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].fuente = fuente)));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/alertas/0/fuente enum');
  });

  it(`limita el título de la alerta a ${MAX_TITULO_ALERTA} caracteres`, () => {
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].titulo = 'a'.repeat(MAX_TITULO_ALERTA)))).valido).toBe(true);
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].titulo = 'a'.repeat(MAX_TITULO_ALERTA + 1)))).valido).toBe(false);
  });
});

describe('alertas.schema.json: Departamentos', () => {
  const conDepartamentos = (lista: unknown) => modificar(dataset, (d) => (d.alertas[0].departamentos = lista));

  it('acepta los 25 códigos juntos, y cada código por separado', () => {
    expect(probar(validarAlertas, conDepartamentos([...CODIGOS_DEPARTAMENTO])).valido).toBe(true);
    for (const codigo of CODIGOS_DEPARTAMENTO) {
      expect(probar(validarAlertas, conDepartamentos([codigo])).valido).toBe(true);
    }
  });

  it.each([['00'], ['26'], ['1'], ['001'], ['AA'], [''], [1]])('rechaza el código %j', (codigo) => {
    expect(probar(validarAlertas, conDepartamentos([codigo])).valido).toBe(false);
  });

  it('rechaza una lista vacía, ausente o con códigos repetidos', () => {
    expect(probar(validarAlertas, conDepartamentos([])).valido).toBe(false);
    expect(probar(validarAlertas, conDepartamentos(['01', '02', '01'])).errores).toContain('/alertas/0/departamentos uniqueItems');
    expect(probar(validarAlertas, conDepartamentos('01')).valido).toBe(false);
  });

  it('rechaza más de 25 códigos', () => {
    expect(probar(validarAlertas, conDepartamentos([...CODIGOS_DEPARTAMENTO, '01'])).valido).toBe(false);
  });

  it('acepta cualquier subconjunto sin repetidos de los 25 códigos (propiedad sobre listas generadas)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom(...CODIGOS_DEPARTAMENTO), { minLength: 1, maxLength: 25 }), (lista) => {
        return probar(validarAlertas, conDepartamentos(lista)).valido;
      }),
    );
  });

  it('rechaza cualquier lista que repita un código (propiedad sobre listas generadas)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...CODIGOS_DEPARTAMENTO), { minLength: 1, maxLength: 24 }),
        (lista) => !probar(validarAlertas, conDepartamentos([...lista, lista[0]])).valido,
      ),
    );
  });

  it('rechaza cualquier texto que no sea uno de los 25 códigos (propiedad sobre textos generados)', () => {
    const permitidos = new Set<string>(CODIGOS_DEPARTAMENTO);
    fc.assert(
      fc.property(
        fc.string().filter((texto) => !permitidos.has(texto)),
        (texto) => !probar(validarAlertas, conDepartamentos([texto])).valido,
      ),
    );
  });
});

describe('alertas.schema.json: fechas UTC', () => {
  const conVigencia = (inicio: string, fin: string) =>
    modificar(dataset, (d) => {
      d.alertas[0].vigencia = { inicio, fin };
    });

  it.each([['2026-12-31T23:59:59Z'], ['2026-01-01T00:00:00Z'], ['2026-06-15T12:30:45.123Z']])('acepta la fecha UTC %s', (fecha) => {
    expect(probar(validarAlertas, conVigencia(fecha, fecha)).valido).toBe(true);
  });

  it.each([
    ['2026-13-01T00:00:00Z'],
    ['2026-00-10T00:00:00Z'],
    ['2026-01-32T00:00:00Z'],
    ['2026-01-01T24:00:00Z'],
    ['2026-01-01T00:60:00Z'],
    ['2026-01-01T00:00:60Z'],
    ['2026-01-01 00:00:00Z'],
    ['2026-01-01T00:00:00'],
    ['2026-01-01T00:00:00-05:00'],
    ['2026-01-01T00:00:00+00:00'],
    ['01/01/2026 00:00'],
    ['ayer'],
    [''],
  ])('rechaza la fecha "%s", que no es UTC ISO 8601 con sufijo Z', (fecha) => {
    expect(probar(validarAlertas, conVigencia(fecha, '2026-12-31T00:00:00Z')).valido).toBe(false);
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.alertas[0].actualizadoEn = fecha))).valido).toBe(false);
    expect(probar(validarAlertas, modificar(dataset, (d) => (d.metadatos.publicadoEn = fecha))).valido).toBe(false);
  });
});

describe('alertas.schema.json: recomendaciones y resumen del aviso', () => {
  const conAviso = (cambiar: (aviso: Record<string, unknown>) => void) =>
    modificar(dataset, (d) => cambiar(d.alertas[0].aviso));
  const resumen = (texto: string) => ({
    texto,
    hashFuente: 'a'.repeat(64),
    verificacion: { estado: 'aprobado', verificadoEn: FECHA },
  });

  it('acepta un aviso con un resumen aprobado de 1 a 60 palabras', () => {
    for (const n of [1, 2, MAX_PALABRAS_RESUMEN]) {
      expect(probar(validarAlertas, conAviso((a) => (a['resumen'] = resumen(palabras(n))))).valido).toBe(true);
    }
  });

  it.each([[MAX_PALABRAS_RESUMEN + 1], [MAX_PALABRAS_RESUMEN + 40]])('rechaza un resumen de %i palabras', (n) => {
    const r = probar(validarAlertas, conAviso((a) => (a['resumen'] = resumen(palabras(n)))));
    expect(r.valido).toBe(false);
    expect(r.errores).toContain('/alertas/0/aviso/resumen/texto pattern');
  });

  it.each([[''], ['   '], [' con espacio inicial'], ['con espacio final ']])('rechaza el texto de resumen %j', (texto) => {
    expect(probar(validarAlertas, conAviso((a) => (a['resumen'] = resumen(texto)))).valido).toBe(false);
  });

  it.each([['rechazado'], ['no_verificado'], ['pendiente']])(
    'rechaza un resumen con estado "%s": solo se publican resúmenes aprobados',
    (estado) => {
      const r = probar(
        validarAlertas,
        conAviso((a) => (a['resumen'] = { ...resumen('texto'), verificacion: { estado, verificadoEn: FECHA } })),
      );
      expect(r.valido).toBe(false);
    },
  );

  it.each([[''], ['A'.repeat(64)], ['a'.repeat(63)], ['a'.repeat(65)], ['g'.repeat(64)]])(
    'rechaza el hashFuente %j, que no es un SHA-256 en hexadecimal minúscula',
    (hash) => {
      const r = probar(validarAlertas, conAviso((a) => (a['resumen'] = { ...resumen('texto'), hashFuente: hash })));
      expect(r.valido).toBe(false);
    },
  );

  it('acepta un aviso sin recomendaciones, y rechaza una recomendación sin frases', () => {
    expect(probar(validarAlertas, conAviso((a) => (a['recomendaciones'] = []))).valido).toBe(true);
    const r = probar(validarAlertas, conAviso((a) => (a['recomendaciones'] = [{ clave: 'c', frases: [] }])));
    expect(r.valido).toBe(false);
  });

  it('exige textoOriginal y recomendaciones en el aviso', () => {
    expect(probar(validarAlertas, conAviso((a) => delete a['textoOriginal'])).valido).toBe(false);
    expect(probar(validarAlertas, conAviso((a) => delete a['recomendaciones'])).valido).toBe(false);
    expect(probar(validarAlertas, conAviso((a) => (a['textoOriginal'] = ''))).valido).toBe(false);
  });
});
