import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { escapeText } from './sanitize.ts';

// Tarea 4.1. Requisito 15.6: el texto externo con etiquetas o atributos de evento se presenta como texto, no como HTML.

describe('escapeText', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapa %j como %j', (entrada, esperado) => {
    expect(escapeText(entrada)).toBe(esperado);
  });

  it('escapa una etiqueta script, de modo que no queda ninguna etiqueta', () => {
    expect(escapeText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapa un atributo de evento con comillas dobles y simples', () => {
    expect(escapeText('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeText(`<a href='x' onclick='f()'>`)).toBe('&lt;a href=&#39;x&#39; onclick=&#39;f()&#39;&gt;');
  });

  it('escapa el & primero: una entidad que ya viene en el texto se muestra tal cual, como texto', () => {
    expect(escapeText('&amp;')).toBe('&amp;amp;');
    expect(escapeText('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
    expect(escapeText('<&>')).toBe('&lt;&amp;&gt;');
    expect(escapeText('Tom & "Jerry" <3')).toBe('Tom &amp; &quot;Jerry&quot; &lt;3');
  });

  it('no es idempotente: escapar dos veces escapa también lo que añadió la primera', () => {
    expect(escapeText(escapeText('<'))).toBe('&amp;lt;');
  });

  it('deja intacto el texto sin caracteres especiales, incluidos tildes, eñes, emojis y saltos de línea', () => {
    for (const texto of ['', 'Lluvia intensa en Áncash', 'Año 2026: ñandú, güero ✓ 🌧️', 'línea 1\nlínea 2\ttab', 'S/ 2.50 (50%)', 'a/b\\c`d=e']) {
      expect(escapeText(texto), texto).toBe(texto);
    }
  });

  it('con cualquier mezcla, la salida no contiene <, > ni comillas sin escapar', () => {
    const entradas = [
      '<script>alert("x")</script>',
      `'><svg/onload=alert(1)>`,
      '"><iframe src="javascript:alert(1)">',
      '<<>><<>>',
      `&<>"'&<>"'`,
      'texto normal <b>negrita</b> & más',
    ];
    for (const entrada of entradas) {
      const salida = escapeText(entrada);
      expect(salida, entrada).not.toMatch(/[<>"']/);
      // Todo & de la salida abre una de las cinco entidades que se escriben aquí.
      expect(salida.replace(/&(?:amp|lt|gt|quot|#39);/g, ''), entrada).not.toContain('&');
    }
  });

  it('conserva el contenido: quitar el escape devuelve el texto original', () => {
    const desescapar = (t: string): string =>
      t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    for (const entrada of ['<script>', 'a & b', '&amp;', '"x" \'y\'', '<<&&>>', '']) {
      expect(desescapar(escapeText(entrada)), entrada).toBe(entrada);
    }
  });

  it('el módulo no usa innerHTML ni inserta HTML en el DOM', () => {
    const codigo = readFileSync(new URL('./sanitize.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('//'))
      .join('\n');
    expect(codigo).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\./);
  });
});
