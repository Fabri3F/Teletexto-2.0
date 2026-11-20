import type { EntradaManifiestoPagina, Manifiesto } from '@teletexto/modelo';
import { describe, expect, it } from 'vitest';
import { isValidPageNumber, NUMERO_PORTADA, pageToUrl, resolverPagina, resolverRuta, urlToPage } from './router.ts';

// Tarea 4.6, parte 1. Requisitos 5.4, 5.6, 5.11, 5.12, 5.13, 6.7, 6.8 y 17.2.

const entrada = (numero: number, titulo = `Página ${numero}`): EntradaManifiestoPagina => ({
  numero,
  titulo,
  ruta: `/p/${numero}.json`,
  hash: `hash-${numero}`,
  bytes: 1000,
  umbralHoras: numero === 101 || numero === 400 ? 6 : 24,
});

const manifiestoCon = (...numeros: number[]): Manifiesto => ({
  version: '1',
  generadoEn: '2026-03-01T14:30:00Z',
  paginas: numeros.map((n) => entrada(n)),
  recursos: [],
});

/** Congela un valor y todo lo que contiene, para comprobar que nada lo modifica. */
function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const hijo of Object.values(valor)) congelar(hijo);
  }
  return valor;
}

const MVP = [100, 101, 200, 400];

describe('isValidPageNumber', () => {
  it.each([[100], [101], [199], [200], [400], [555], [998], [999]])('%d es un número de página válido', (n) => {
    expect(isValidPageNumber(n)).toBe(true);
  });

  it.each([[99], [0], [1], [10], [-100], [1000], [1001], [10_000], [100.5], [100.0000001], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], [2 ** 53]])(
    '%d no lo es',
    (n) => {
      expect(isValidPageNumber(n)).toBe(false);
    },
  );

  it('los límites son exactamente 100 y 999', () => {
    expect(isValidPageNumber(99)).toBe(false);
    expect(isValidPageNumber(100)).toBe(true);
    expect(isValidPageNumber(999)).toBe(true);
    expect(isValidPageNumber(1000)).toBe(false);
  });

  it('rechaza lo que no es un número: textos, null, undefined, objetos, booleanos y BigInt', () => {
    for (const valor of ['101', '100', ' 101', '', null, undefined, {}, [], [101], true, 101n, new Number(101)]) {
      expect(isValidPageNumber(valor), String(valor)).toBe(false);
    }
  });

  it('la Portada es la página 100 y es un número válido', () => {
    expect(NUMERO_PORTADA).toBe(100);
    expect(isValidPageNumber(NUMERO_PORTADA)).toBe(true);
  });
});

describe('pageToUrl: URL canónica /NNN', () => {
  it.each([
    [100, '/100'],
    [101, '/101'],
    [200, '/200'],
    [400, '/400'],
    [555, '/555'],
    [999, '/999'],
  ])('%d -> %s', (n, esperado) => {
    expect(pageToUrl(n)).toBe(esperado);
  });

  it('no usa hash ni prefijo ni barra final', () => {
    for (const n of [100, 123, 999]) {
      const url = pageToUrl(n) as string;
      expect(url).toMatch(/^\/\d{3}$/);
      expect(url).not.toContain('#');
      expect(url).not.toContain('/p/');
    }
  });

  it('cada página tiene una URL distinta (Requisito 5.11)', () => {
    const urls = new Set<string>();
    for (let n = 100; n <= 999; n++) urls.add(pageToUrl(n) as string);
    expect(urls.size).toBe(900);
  });

  it.each([[99], [0], [-1], [1000], [100.5], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY]])('devuelve undefined para %d', (n) => {
    expect(pageToUrl(n)).toBeUndefined();
  });

  it('devuelve undefined si no recibe un número', () => {
    for (const valor of ['101', null, undefined, {}, true]) {
      expect(pageToUrl(valor as unknown as number), String(valor)).toBeUndefined();
    }
  });
});

describe('urlToPage', () => {
  it.each([
    ['/100', 100],
    ['/101', 101],
    ['/200', 200],
    ['/400', 400],
    ['/999', 999],
    ['/555', 555],
  ])('%s -> %d', (ruta, esperado) => {
    expect(urlToPage(ruta)).toBe(esperado);
  });

  it('acepta una barra final: /NNN/ es la misma página que /NNN', () => {
    expect(urlToPage('/101/')).toBe(101);
    expect(urlToPage('/100/')).toBe(100);
    expect(urlToPage('/999/')).toBe(999);
  });

  it('la raíz y la cadena vacía son la Portada (abrir el cliente sin número)', () => {
    expect(urlToPage('/')).toBe(100);
    expect(urlToPage('')).toBe(100);
  });

  it.each([
    ['/099'], // tres dígitos pero menor que 100
    ['/000'],
    ['/0101'], // cero de más
    ['/1000'], // cuatro dígitos
    ['/12'],
    ['/1'],
    ['/10a'],
    ['/abc'],
    ['/-101'],
    ['/+101'],
    ['/1e3'],
    ['/0x65'],
    ['/10.1'],
    ['/101.json'], // el archivo de contenido no es una página
    ['/p/101'],
    ['/p/101.json'],
    ['/101/x'],
    ['/101//'],
    ['//101'],
    ['//'],
    ['///'],
    ['101'], // sin barra inicial
    ['/101?x=1'], // consulta
    ['/101#a'], // hash
    ['#/101'],
    ['/#/101'],
    [' /101'],
    ['/101 '],
    ['/ 101'],
    ['/101\n'],
    ['/101\r\n'],
    ['/\n101'],
    ['/%31%30%31'], // porcentajes: no se decodifican
    ['/１０１'], // dígitos de ancho completo
    ['/١٠١'], // dígitos arábigos orientales
    ['https://ejemplo.pe/101'],
    ['\\101'],
  ])('%j no corresponde a ninguna página', (ruta) => {
    expect(urlToPage(ruta)).toBeUndefined();
  });

  it('devuelve undefined si no recibe un texto', () => {
    for (const valor of [null, undefined, 101, {}, ['/101']]) {
      expect(urlToPage(valor as unknown as string), String(valor)).toBeUndefined();
    }
  });
});

describe('Ida y vuelta entre número y URL (Requisitos 5.11, 5.12)', () => {
  it('urlToPage(pageToUrl(n)) es n para todos los números de 100 a 999', () => {
    for (let n = 100; n <= 999; n++) {
      expect(urlToPage(pageToUrl(n) as string), String(n)).toBe(n);
    }
  });

  it('la URL con barra final vuelve a la misma URL canónica sin ella', () => {
    for (let n = 100; n <= 999; n++) {
      expect(pageToUrl(urlToPage(`/${n}/`) as number), String(n)).toBe(`/${n}`);
    }
  });

  it('pageToUrl(urlToPage(ruta)) devuelve la ruta canónica, y la raíz es /100', () => {
    expect(pageToUrl(urlToPage('/') as number)).toBe('/100');
    expect(pageToUrl(urlToPage('') as number)).toBe('/100');
  });
});

describe('resolverPagina', () => {
  const manifiesto = congelar(manifiestoCon(...MVP));

  it('una página del manifiesto se muestra con su entrada', () => {
    const r = resolverPagina(manifiesto, 101);
    expect(r).toEqual({ tipo: 'pagina', numero: 101, entrada: entrada(101) });
    if (r.tipo === 'pagina') expect(r.entrada).toBe(manifiesto.paginas[1]); // la entrada del manifiesto, no una copia
  });

  it.each([[200], [400]])('la página %d del manifiesto se muestra', (n) => {
    expect(resolverPagina(manifiesto, n).tipo).toBe('pagina');
  });

  it('el 100 es la Portada y trae la entrada del manifiesto si existe', () => {
    const r = resolverPagina(manifiesto, 100);
    expect(r.tipo).toBe('portada');
    expect(r).toEqual({ tipo: 'portada', numero: 100, entrada: entrada(100) });
  });

  it('el 100 es la Portada aunque no haya manifiesto, y no se inventa ninguna entrada ni ruta de contenido', () => {
    for (const sinManifiesto of [undefined, null, manifiestoCon(), manifiestoCon(101, 200, 400), {} as unknown as Manifiesto, { paginas: 'no es lista' } as unknown as Manifiesto]) {
      const r = resolverPagina(sinManifiesto, 100);
      expect(r.tipo, JSON.stringify(sinManifiesto)).toBe('portada');
      if (r.tipo === 'portada') {
        expect(r.numero).toBe(100);
        expect(r.entrada).toBeUndefined();
      }
    }
  });

  it('un número válido que no está en el manifiesto es "no encontrada" (Requisitos 5.4 y 6.8)', () => {
    for (const n of [101, 150, 300, 555, 999]) {
      const r = resolverPagina(manifiestoCon(100, 200, 400), n);
      expect(r, String(n)).toEqual({ tipo: 'no_encontrada', numero: n });
    }
  });

  it('sin manifiesto, solo la Portada existe: cualquier otra página es "no encontrada"', () => {
    for (const sinManifiesto of [undefined, null, manifiestoCon(), {} as unknown as Manifiesto]) {
      expect(resolverPagina(sinManifiesto, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
    }
  });

  it('los números inválidos son "no encontrada", aunque el manifiesto los traiga', () => {
    const conInvalidos = { ...manifiestoCon(...MVP), paginas: [...MVP, 99, 1000, 100.5, 0].map((n) => entrada(n)) };
    for (const n of [99, 1000, 100.5, 0, -100]) {
      expect(resolverPagina(conInvalidos, n), String(n)).toEqual({ tipo: 'no_encontrada', numero: n });
    }
  });

  it('los valores que no son números finitos son "no encontrada" y no traen número', () => {
    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY, '101', null, undefined, {}]) {
      expect(resolverPagina(manifiesto, valor as unknown as number), String(valor)).toEqual({ tipo: 'no_encontrada', numero: undefined });
    }
  });

  it('agregar una página con solo datos la hace alcanzable, sin tocar el código de navegación (Requisito 17.2)', () => {
    expect(resolverPagina(manifiestoCon(...MVP), 777)).toEqual({ tipo: 'no_encontrada', numero: 777 });
    const ampliado = manifiestoCon(...MVP, 777);
    expect(resolverPagina(ampliado, 777)).toEqual({ tipo: 'pagina', numero: 777, entrada: entrada(777) });
    expect(resolverRuta(ampliado, '/777')).toEqual({ tipo: 'pagina', numero: 777, entrada: entrada(777) });
    expect(resolverPagina(ampliado, 101).tipo).toBe('pagina'); // las demás no cambian
  });

  it('quitar una página del manifiesto la deja "no encontrada"', () => {
    expect(resolverPagina(manifiestoCon(100, 101, 400), 200)).toEqual({ tipo: 'no_encontrada', numero: 200 });
  });

  it('ignora las entradas mal formadas del manifiesto, que viene de la red', () => {
    const roto = {
      version: '1',
      generadoEn: '2026-03-01T14:30:00Z',
      recursos: [],
      paginas: [null, undefined, 5, 'x', [], { numero: '101' }, { numero: 101.5 }, { titulo: 'sin número' }, entrada(101)],
    } as unknown as Manifiesto;
    expect(resolverPagina(roto, 101)).toEqual({ tipo: 'pagina', numero: 101, entrada: entrada(101) });
    expect(resolverPagina(roto, 200)).toEqual({ tipo: 'no_encontrada', numero: 200 });
  });

  it('si el manifiesto repite un número, vale la primera entrada', () => {
    const repetido: Manifiesto = { ...manifiestoCon(), paginas: [entrada(300, 'primera'), entrada(300, 'segunda')] };
    const r = resolverPagina(repetido, 300);
    expect(r.tipo === 'pagina' && r.entrada.titulo).toBe('primera');
  });

  it('no modifica el manifiesto (está congelado) y es determinista', () => {
    const a = resolverPagina(manifiesto, 400);
    const b = resolverPagina(manifiesto, 400);
    expect(a).toEqual(b);
    expect(manifiesto.paginas).toHaveLength(4);
    expect(() => resolverPagina(manifiesto, 555)).not.toThrow();
  });

  it('para los 900 números, el resultado coincide con la regla: Portada, en el manifiesto o no encontrada', () => {
    const conocidos = new Set([101, 200, 400, 555]);
    const m = manifiestoCon(101, 200, 400, 555);
    for (let n = 100; n <= 999; n++) {
      const r = resolverPagina(m, n);
      const esperado = n === 100 ? 'portada' : conocidos.has(n) ? 'pagina' : 'no_encontrada';
      expect(r.tipo, String(n)).toBe(esperado);
    }
  });
});

describe('resolverRuta', () => {
  const manifiesto = congelar(manifiestoCon(...MVP));

  it('la raíz y la cadena vacía son la Portada', () => {
    expect(resolverRuta(manifiesto, '/')).toEqual({ tipo: 'portada', numero: 100, entrada: entrada(100) });
    expect(resolverRuta(manifiesto, '').tipo).toBe('portada');
    expect(resolverRuta(manifiesto, '/100').tipo).toBe('portada');
    expect(resolverRuta(undefined, '/').tipo).toBe('portada');
    expect(resolverRuta(undefined, '/100').tipo).toBe('portada');
  });

  it('la URL de una página existente muestra esa página, con o sin barra final (Requisito 5.12)', () => {
    expect(resolverRuta(manifiesto, '/101')).toEqual({ tipo: 'pagina', numero: 101, entrada: entrada(101) });
    expect(resolverRuta(manifiesto, '/101/')).toEqual({ tipo: 'pagina', numero: 101, entrada: entrada(101) });
    expect(resolverRuta(manifiesto, '/400').tipo).toBe('pagina');
  });

  it('la URL de un número que no existe es "no encontrada" y conserva el número pedido (Requisito 5.13)', () => {
    expect(resolverRuta(manifiesto, '/555')).toEqual({ tipo: 'no_encontrada', numero: 555 });
    expect(resolverRuta(manifiesto, '/999')).toEqual({ tipo: 'no_encontrada', numero: 999 });
  });

  it.each([['/abc'], ['/099'], ['/1000'], ['/0101'], ['/101.json'], ['/p/101'], ['/101?x=1'], ['/101#a'], ['101'], ['/101/x']])(
    '%j no tiene forma de página: "no encontrada" sin número',
    (ruta) => {
      expect(resolverRuta(manifiesto, ruta)).toEqual({ tipo: 'no_encontrada', numero: undefined });
    },
  );

  it('es coherente con resolverPagina para las 900 páginas: resolverRuta(pageToUrl(n)) = resolverPagina(n)', () => {
    const m = manifiestoCon(101, 200, 400, 555);
    for (let n = 100; n <= 999; n++) {
      expect(resolverRuta(m, pageToUrl(n) as string), String(n)).toEqual(resolverPagina(m, n));
    }
  });

  it('con un manifiesto ampliado, la URL nueva funciona sin tocar el código (Requisito 17.2)', () => {
    expect(resolverRuta(manifiestoCon(...MVP), '/321').tipo).toBe('no_encontrada');
    expect(resolverRuta(manifiestoCon(...MVP, 321), '/321').tipo).toBe('pagina');
  });
});

describe('Entradas del manifiesto incompletas o mal tipadas (el manifiesto viene de la red)', () => {
  const CAMPOS = ['titulo', 'ruta', 'hash', 'bytes', 'umbralHoras'] as const;

  /** Manifiesto con una sola entrada para el número 101, con los cambios indicados. `undefined` en un campo lo deja ausente. */
  const conEntrada = (cambios: Record<string, unknown>): Manifiesto => {
    const crudo: Record<string, unknown> = { ...entrada(101), ...cambios };
    for (const [campo, valor] of Object.entries(cambios)) if (valor === undefined) delete crudo[campo];
    return { version: '1', generadoEn: '2026-03-01T14:30:00Z', recursos: [], paginas: [crudo as unknown as EntradaManifiestoPagina] };
  };

  /** Lo que debe pasar con una entrada rechazada para una página que no es la Portada: es como si no existiera. */
  const noExiste = (m: Manifiesto): void => {
    expect(resolverPagina(m, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
    expect(resolverRuta(m, '/101')).toEqual({ tipo: 'no_encontrada', numero: 101 });
    expect(resolverRuta(m, '/101/')).toEqual({ tipo: 'no_encontrada', numero: 101 });
  };

  it('la entrada completa y correcta se acepta, con la misma identidad que la del manifiesto', () => {
    const m = conEntrada({});
    const r = resolverPagina(m, 101);
    expect(r.tipo).toBe('pagina');
    if (r.tipo === 'pagina') expect(r.entrada).toBe(m.paginas[0]);
    expect(resolverRuta(m, '/101').tipo).toBe('pagina');
  });

  it('una entrada con solo el número se rechaza', () => {
    noExiste({ ...conEntrada({}), paginas: [{ numero: 101 } as unknown as EntradaManifiestoPagina] });
  });

  it.each(CAMPOS.map((campo) => [campo]))('rechaza la entrada a la que le falta %s', (campo) => {
    noExiste(conEntrada({ [campo]: undefined }));
  });

  it.each(CAMPOS.map((campo) => [campo]))('rechaza la entrada con %s explícitamente undefined o null', (campo) => {
    noExiste({ ...conEntrada({}), paginas: [{ ...entrada(101), [campo]: null } as unknown as EntradaManifiestoPagina] });
    noExiste({ ...conEntrada({}), paginas: [{ ...entrada(101), [campo]: undefined } as unknown as EntradaManifiestoPagina] });
  });

  it.each([
    ['titulo', 5],
    ['titulo', true],
    ['titulo', []],
    ['titulo', {}],
    ['titulo', ''], // el título de una página tiene al menos 1 carácter
    ['titulo', 'x'.repeat(41)], // y como máximo 40 (MAX_TITULO_PAGINA)
    ['ruta', 5],
    ['ruta', true],
    ['ruta', []],
    ['ruta', {}],
    ['ruta', ''],
    ['hash', 5],
    ['hash', true],
    ['hash', []],
    ['hash', {}],
    ['hash', ''],
    ['bytes', '1000'],
    ['bytes', true],
    ['bytes', []],
    ['bytes', {}],
    ['bytes', 10n],
  ])('rechaza el tipo incorrecto de %s: %s', (campo, valor) => {
    noExiste(conEntrada({ [campo as string]: valor }));
  });

  it.each([
    ['bytes', -1], // un tamaño no es negativo
    ['bytes', -1000],
    ['bytes', 0.5],
    ['bytes', 1000.25],
    ['bytes', Number.NaN],
    ['bytes', Number.POSITIVE_INFINITY],
    ['bytes', Number.NEGATIVE_INFINITY],
    ['bytes', 2 ** 53], // no es un entero seguro
    ['bytes', Number.MAX_VALUE],
    ['umbralHoras', 0], // page.schema.json: entero de 1 o más
    ['umbralHoras', -6],
    ['umbralHoras', 1.5],
    ['umbralHoras', 0.5],
    ['umbralHoras', Number.NaN],
    ['umbralHoras', Number.POSITIVE_INFINITY],
    ['umbralHoras', Number.NEGATIVE_INFINITY],
    ['umbralHoras', '6'],
    ['umbralHoras', 6n],
    ['umbralHoras', 2 ** 53],
  ])('rechaza el valor numérico fuera de las restricciones de %s: %s', (campo, valor) => {
    noExiste(conEntrada({ [campo as string]: valor }));
  });

  it.each([
    ['numero', '101'],
    ['numero', 101.5],
    ['numero', 99],
    ['numero', 1000],
    ['numero', Number.NaN],
  ])('una entrada con %s inválido (%j) no sirve para el 101', (campo, valor) => {
    noExiste(conEntrada({ [campo as string]: valor }));
  });

  it.each([
    ['bytes', 0],
    ['bytes', 1],
    ['bytes', 20_480],
    ['bytes', 1_048_576],
    ['bytes', Number.MAX_SAFE_INTEGER], // el proyecto no fija un máximo: no se inventa uno
    ['umbralHoras', 1],
    ['umbralHoras', 6],
    ['umbralHoras', 24],
    ['umbralHoras', 48],
    ['umbralHoras', 10_000], // el valor lo fijan los datos
    ['titulo', 'x'],
    ['titulo', 'x'.repeat(40)],
    ['titulo', 'Á'.repeat(40)],
    ['titulo', '😀'.repeat(40)], // 40 caracteres Unicode aunque ocupen 80 unidades UTF-16, como cuenta el esquema JSON
    ['ruta', '/p/101.json'],
    ['ruta', 'x'],
    ['hash', 'x'],
    ['hash', 'a'.repeat(64)],
  ])('acepta el valor límite o libre de %s: %j', (campo, valor) => {
    const r = resolverPagina(conEntrada({ [campo as string]: valor }), 101);
    expect(r.tipo).toBe('pagina');
  });

  it('el título de 41 caracteres Unicode se rechaza aunque tenga 41 emojis', () => {
    noExiste(conEntrada({ titulo: '😀'.repeat(41) }));
  });

  it('los campos de más no invalidan una entrada completa', () => {
    const r = resolverPagina(conEntrada({ extra: 1, tipo: 'alertas' }), 101);
    expect(r.tipo).toBe('pagina');
  });

  it('una entrada que es un arreglo o que solo hereda los campos no es una entrada', () => {
    const arreglo = Object.assign([], entrada(101));
    const heredada = Object.create(entrada(101)) as EntradaManifiestoPagina;
    noExiste({ ...conEntrada({}), paginas: [arreglo as unknown as EntradaManifiestoPagina] });
    noExiste({ ...conEntrada({}), paginas: [heredada] });
  });

  it('el rechazo es por entrada: las demás páginas del mismo manifiesto no se ven afectadas', () => {
    const m: Manifiesto = {
      ...conEntrada({}),
      paginas: [entrada(100), { ...entrada(101), umbralHoras: 0 }, entrada(200), { numero: 400 } as unknown as EntradaManifiestoPagina],
    };
    expect(resolverPagina(m, 100).tipo).toBe('portada');
    expect(resolverPagina(m, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
    expect(resolverPagina(m, 200)).toEqual({ tipo: 'pagina', numero: 200, entrada: entrada(200) });
    expect(resolverPagina(m, 400)).toEqual({ tipo: 'no_encontrada', numero: 400 });
  });
});

describe('Entradas repetidas con alguna incompleta', () => {
  const incompleta = (cambios: Record<string, unknown>, numero = 101): EntradaManifiestoPagina => {
    const crudo: Record<string, unknown> = { ...entrada(numero, 'incompleta'), ...cambios };
    for (const [campo, valor] of Object.entries(cambios)) if (valor === undefined) delete crudo[campo];
    return crudo as unknown as EntradaManifiestoPagina;
  };
  const manifiestoDe = (...paginas: EntradaManifiestoPagina[]): Manifiesto => ({ version: '1', generadoEn: '2026-03-01T14:30:00Z', recursos: [], paginas });

  const variantesIncompletas: [string, Record<string, unknown>][] = [
    ['sin título', { titulo: undefined }],
    ['sin ruta', { ruta: undefined }],
    ['sin hash', { hash: undefined }],
    ['sin bytes', { bytes: undefined }],
    ['sin umbralHoras', { umbralHoras: undefined }],
    ['con título numérico', { titulo: 5 }],
    ['con bytes negativos', { bytes: -1 }],
    ['con umbralHoras en 0', { umbralHoras: 0 }],
    ['con umbralHoras en texto', { umbralHoras: '6' }],
  ];

  it.each(variantesIncompletas)('una entrada %s antes de una completa: vale la completa', (_etiqueta, cambios) => {
    const completa = entrada(101, 'completa');
    const m = manifiestoDe(incompleta(cambios), completa);
    const r = resolverPagina(m, 101);
    expect(r.tipo).toBe('pagina');
    if (r.tipo === 'pagina') {
      expect(r.entrada).toBe(completa);
      expect(r.entrada.titulo).toBe('completa');
    }
    expect(resolverRuta(m, '/101')).toEqual(r);
  });

  it('varias incompletas antes de la completa: vale la completa', () => {
    const completa = entrada(101, 'completa');
    const m = manifiestoDe(incompleta({ titulo: undefined }), incompleta({ bytes: -1 }), { numero: 101 } as unknown as EntradaManifiestoPagina, completa);
    const r = resolverPagina(m, 101);
    expect(r.tipo === 'pagina' && r.entrada).toBe(completa);
  });

  it('dos completas: vale la primera, aunque haya una incompleta delante', () => {
    const primera = entrada(101, 'primera');
    const segunda = entrada(101, 'segunda');
    const r = resolverPagina(manifiestoDe(incompleta({ hash: undefined }), primera, segunda), 101);
    expect(r.tipo === 'pagina' && r.entrada).toBe(primera);
  });

  it('completa seguida de incompleta: vale la completa', () => {
    const completa = entrada(101, 'completa');
    const r = resolverPagina(manifiestoDe(completa, incompleta({ ruta: undefined })), 101);
    expect(r.tipo === 'pagina' && r.entrada).toBe(completa);
  });

  it('si todas las entradas repetidas están incompletas, la página no existe', () => {
    const m = manifiestoDe(incompleta({ titulo: undefined }), incompleta({ bytes: -1 }), incompleta({ umbralHoras: 0 }));
    expect(resolverPagina(m, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
    expect(resolverRuta(m, '/101')).toEqual({ tipo: 'no_encontrada', numero: 101 });
  });

  it('una entrada completa de OTRO número no sustituye a la incompleta del pedido', () => {
    const m = manifiestoDe(incompleta({ titulo: undefined }), entrada(200));
    expect(resolverPagina(m, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
  });
});

describe('La Portada con entradas del manifiesto incompletas', () => {
  const portadaConEntradas = (...paginas: unknown[]): Manifiesto => ({ version: '1', generadoEn: '2026-03-01T14:30:00Z', recursos: [], paginas: paginas as EntradaManifiestoPagina[] });

  it.each([
    ['sin titulo', { titulo: undefined }],
    ['sin ruta', { ruta: undefined }],
    ['sin hash', { hash: undefined }],
    ['sin bytes', { bytes: undefined }],
    ['sin umbralHoras', { umbralHoras: undefined }],
    ['con titulo de tipo incorrecto', { titulo: 5 }],
    ['con ruta de tipo incorrecto', { ruta: 5 }],
    ['con hash de tipo incorrecto', { hash: [] }],
    ['con bytes de tipo incorrecto', { bytes: '1000' }],
    ['con umbralHoras de tipo incorrecto', { umbralHoras: '24' }],
    ['con bytes negativos', { bytes: -1 }],
    ['con umbralHoras en 0', { umbralHoras: 0 }],
  ])('la entrada del 100 %s: es la Portada con entrada undefined', (_etiqueta, cambios) => {
    const crudo: Record<string, unknown> = { ...entrada(100), ...cambios };
    for (const [campo, valor] of Object.entries(cambios)) if (valor === undefined) delete crudo[campo];
    const m = portadaConEntradas(crudo);
    for (const r of [resolverPagina(m, 100), resolverRuta(m, '/'), resolverRuta(m, '/100'), resolverRuta(m, '')]) {
      expect(r.tipo).toBe('portada');
      if (r.tipo === 'portada') {
        expect(r.numero).toBe(100);
        expect(r.entrada).toBeUndefined();
      }
    }
  });

  it('con una entrada incompleta y otra completa para el 100, la Portada usa la completa', () => {
    const completa = entrada(100, 'completa');
    const r = resolverPagina(portadaConEntradas({ numero: 100 }, completa), 100);
    expect(r.tipo).toBe('portada');
    if (r.tipo === 'portada') expect(r.entrada).toBe(completa);
  });

  it('con una entrada completa del 100 la Portada la trae, y sin ninguna sigue siendo la Portada', () => {
    const completa = entrada(100);
    const conEntrada = resolverPagina(portadaConEntradas(completa), 100);
    expect(conEntrada.tipo === 'portada' && conEntrada.entrada).toBe(completa);
    const sinEntrada = resolverPagina(portadaConEntradas(entrada(101)), 100);
    expect(sinEntrada.tipo === 'portada' && sinEntrada.entrada).toBeUndefined();
  });
});

describe('Lo que no se exige del manifiesto para resolver páginas', () => {
  it('no hacen falta version, generadoEn ni recursos', () => {
    const soloPaginas = { paginas: [entrada(100), entrada(101), entrada(555)] } as unknown as Manifiesto;
    expect(resolverPagina(soloPaginas, 101)).toEqual({ tipo: 'pagina', numero: 101, entrada: entrada(101) });
    expect(resolverRuta(soloPaginas, '/555')).toEqual({ tipo: 'pagina', numero: 555, entrada: entrada(555) });
    expect(resolverPagina(soloPaginas, 100)).toEqual({ tipo: 'portada', numero: 100, entrada: entrada(100) });
  });

  it('tampoco importa si version, generadoEn o recursos tienen un tipo inesperado', () => {
    const raro = { version: 1, generadoEn: null, recursos: 'no es lista', paginas: [entrada(101)] } as unknown as Manifiesto;
    expect(resolverPagina(raro, 101).tipo).toBe('pagina');
  });

  it('un manifiesto sin una lista de páginas válida solo deja a la Portada', () => {
    for (const m of [{}, { paginas: null }, { paginas: {} }, { paginas: 'x' }, { paginas: [null, 5, 'x'] }] as unknown as Manifiesto[]) {
      expect(resolverPagina(m, 100).tipo).toBe('portada');
      expect(resolverPagina(m, 101)).toEqual({ tipo: 'no_encontrada', numero: 101 });
    }
  });
});
