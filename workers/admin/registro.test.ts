import { describe, expect, it } from 'vitest';
import {
  MAX_CARACTERES_RECURSO,
  MOTIVOS_RECHAZO,
  NO_DISPONIBLE,
  construirRegistro,
  formatearFechaUtc,
  limpiarMetodo,
  limpiarRecurso,
  serializarRegistro,
  validarIp,
  type DatosRechazo,
} from './registro.ts';
// Tarea 14.2. Requisito 15.10. Registro de rechazos: fecha UTC, IP validada, recurso sin consulta, estado, motivo y método.
const BASE: DatosRechazo = {
  ahoraMs: Date.UTC(2030, 0, 15, 12, 0, 0, 999),
  ip: '203.0.113.7',
  ruta: '/admin/reload',
  metodo: 'POST',
  estado: 401,
  motivo: 'sin_credencial',
};
describe('validarIp', () => {
  it.each(['0.0.0.0', '1.2.3.4', '203.0.113.7', '255.255.255.255', '10.0.0.1'])('acepta la IPv4 %s tal cual', (ip) => {
    expect(validarIp(ip)).toBe(ip);
  });
  it.each([
    ['256.1.1.1'],
    ['1.1.1.256'],
    ['01.1.1.1'],
    ['1.1.1'],
    ['1.1.1.1.1'],
    ['1.1.1.'],
    ['.1.1.1'],
    [' 1.1.1.1'],
    ['1.1.1.1 '],
    ['1.1.1.1\n'],
    ['1.1.1.1\r\nSet-Cookie: x=y'],
    ['1.1.1.1, 2.2.2.2'],
    ['1.1.1.1:80'],
    ['a.b.c.d'],
    ['0x7f.0.0.1'],
    ['127.1'],
    ['999.999.999.999'],
    ['-1.1.1.1'],
  ])('rechaza la IPv4 inválida %j', (ip) => {
    expect(validarIp(ip)).toBe(NO_DISPONIBLE);
  });
  it.each([
    ['::1', '::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['fe80::1', 'fe80::1'],
    ['2001:DB8:0:0:0:0:0:1', '2001:db8::1'],
    ['1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7:8'],
  ])('acepta la IPv6 %s y la escribe en forma normalizada', (ip, esperada) => {
    expect(validarIp(ip)).toBe(esperada);
  });
  it('acepta una IPv6 con IPv4 incrustada', () => {
    expect(validarIp('::ffff:1.2.3.4')).not.toBe(NO_DISPONIBLE);
  });
  it.each([
    ['::g'],
    [':::'],
    ['1:2:3:4:5:6:7:8:9'],
    ['2001:db8::1::2'],
    ['12345::1'],
    ['[::1]'],
    ['::1%eth0'],
    ['::1/64'],
    ['::1\n'],
    ['::1 '],
    ['fe80::1\r\nX-Inyectado: si'],
    ['::1]/x?y#'],
    [':'],
  ])('rechaza la IPv6 inválida %j', (ip) => {
    expect(validarIp(ip)).toBe(NO_DISPONIBLE);
  });
  it.each([[null], [''], ['x'.repeat(46)], ['x'.repeat(10_000)], ['localhost'], ['example.com'], ['unknown']])(
    'rechaza un valor que no es una IP: %j',
    (valor) => {
      expect(validarIp(valor)).toBe(NO_DISPONIBLE);
    },
  );
});
describe('formatearFechaUtc', () => {
  it('escribe AAAA-MM-DDTHH:mm:ssZ en UTC, sin milisegundos', () => {
    expect(formatearFechaUtc(Date.UTC(2030, 0, 15, 12, 0, 0, 999))).toBe('2030-01-15T12:00:00Z');
    expect(formatearFechaUtc(Date.UTC(2031, 11, 31, 23, 59, 59))).toBe('2031-12-31T23:59:59Z');
    expect(formatearFechaUtc(0)).toBe('1970-01-01T00:00:00Z');
  });
  it('no depende de la zona horaria del proceso', () => {
    expect(formatearFechaUtc(Date.UTC(2030, 5, 1, 4, 5, 6))).toBe('2030-06-01T04:05:06Z');
  });
  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], [8.64e15 + 1], [-8.64e15 - 1]])(
    'devuelve "No disponible" para un reloj inválido (%s) en lugar de inventar una fecha',
    (valor) => {
      expect(formatearFechaUtc(valor)).toBe(NO_DISPONIBLE);
    },
  );
});
describe('limpiarRecurso: prevención de inyección en el registro', () => {
  it('deja intacta una ruta normal', () => {
    expect(limpiarRecurso('/admin/reload')).toBe('/admin/reload');
  });
  it.each([
    ['salto de línea', '/admin/reload\n{"evento":"falso"}'],
    ['retorno de carro', '/admin/reload\r\nX: y'],
    ['tabulador', '/a\tb'],
    ['nulo', '/a\u0000b'],
    ['escape ANSI', '/a\u001b[31mroja'],
    ['separador de línea Unicode', '/a\u2028b'],
    ['separador de párrafo Unicode', '/a\u2029b'],
    ['NEL', '/a\u0085b'],
    ['borrar', '/a\u007fb'],
    ['carácter no ASCII', '/ñandú/日本'],
    ['emoji', '/a\u{1F600}b'],
    ['comilla y barra invertida', '/a"b\\c'],
  ])('no deja caracteres fuera de ASCII imprimible: %s', (_nombre, ruta) => {
    const limpio = limpiarRecurso(ruta);
    expect(limpio).toMatch(/^[\x20-\x7e]*$/);
  });
  it('recorta a 200 caracteres', () => {
    expect(MAX_CARACTERES_RECURSO).toBe(200);
    expect(limpiarRecurso('/'.padEnd(5000, 'a')).length).toBe(200);
    expect(limpiarRecurso('/'.padEnd(200, 'a')).length).toBe(200);
  });
  it('la línea serializada es una sola línea JSON aunque la ruta sea hostil', () => {
    const hostiles = ['/x\n{"evento":"falso","estado":200}', '/x\r\n', '/x\u2028\u2029', '/x"},{"a":"', '/x\u001b[2J'];
    for (const ruta of hostiles) {
      const linea = serializarRegistro(construirRegistro({ ...BASE, ruta }));
      expect(linea).not.toMatch(/[\n\r\u2028\u2029\u0085\u001b]/);
      const analizado = JSON.parse(linea) as Record<string, unknown>;
      expect(Object.keys(analizado).sort()).toEqual(['estado', 'evento', 'ip', 'metodo', 'motivo', 'recurso', 'timestamp']);
      expect(analizado['evento']).toBe('admin_rechazo');
      expect(analizado['estado']).toBe(401);
    }
  });
});
describe('limpiarMetodo', () => {
  it.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('acepta %s', (metodo) => {
    expect(limpiarMetodo(metodo)).toBe(metodo);
    expect(limpiarMetodo(metodo.toLowerCase())).toBe(metodo);
  });
  it.each(['TRACE', 'CONNECT', 'PROPFIND', 'GET\nX: y', '', 'x'.repeat(10_000), 'POST /admin'])('lo reemplaza por OTRO: %j', (metodo) => {
    expect(limpiarMetodo(metodo)).toBe('OTRO');
  });
});
describe('construirRegistro y serializarRegistro (Requisito 15.10)', () => {
  it('tiene fecha UTC, IP, recurso, estado, motivo y método', () => {
    expect(construirRegistro(BASE)).toEqual({
      evento: 'admin_rechazo',
      timestamp: '2030-01-15T12:00:00Z',
      ip: '203.0.113.7',
      recurso: '/admin/reload',
      estado: 401,
      motivo: 'sin_credencial',
      metodo: 'POST',
    });
  });
  it('registra un 403 con su motivo', () => {
    expect(construirRegistro({ ...BASE, estado: 403, motivo: 'rol_insuficiente' })).toMatchObject({ estado: 403, motivo: 'rol_insuficiente' });
  });
  it('con una IP inválida escribe "No disponible" y no el valor recibido', () => {
    const registro = construirRegistro({ ...BASE, ip: '1.1.1.1\r\nX: y' });
    expect(registro.ip).toBe(NO_DISPONIBLE);
    expect(serializarRegistro(registro)).not.toContain('X: y');
  });
  it('sin IP escribe "No disponible"', () => {
    expect(construirRegistro({ ...BASE, ip: null }).ip).toBe(NO_DISPONIBLE);
  });
  it('con un reloj inválido escribe "No disponible" en la fecha', () => {
    expect(construirRegistro({ ...BASE, ahoraMs: Number.NaN }).timestamp).toBe(NO_DISPONIBLE);
  });
  it('la serialización es JSON de una línea y se puede leer de vuelta', () => {
    const registro = construirRegistro(BASE);
    const linea = serializarRegistro(registro);
    expect(linea).not.toContain('\n');
    expect(JSON.parse(linea)).toEqual(registro);
  });
  it('el registro no tiene campos para token, cabeceras ni consulta: el tipo no los admite', () => {
    const campos = Object.keys(construirRegistro(BASE)).sort();
    expect(campos).toEqual(['estado', 'evento', 'ip', 'metodo', 'motivo', 'recurso', 'timestamp']);
  });
  it('la lista de motivos es cerrada y sin duplicados', () => {
    expect(new Set(MOTIVOS_RECHAZO).size).toBe(MOTIVOS_RECHAZO.length);
    expect([...MOTIVOS_RECHAZO].sort()).toEqual(
      [
        'aun_no_valido',
        'algoritmo_no_permitido',
        'claims_invalidos',
        'esquema_invalido',
        'expirado',
        'firma_invalida',
        'rol_insuficiente',
        'sin_credencial',
        'token_demasiado_grande',
        'token_malformado',
      ].sort(),
    );
  });
});
