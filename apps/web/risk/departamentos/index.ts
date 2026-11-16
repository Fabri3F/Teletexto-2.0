import type { DepartamentoGeometria } from '@teletexto/modelo';

// Tabla de datos de los 25 Departamentos (los 24 departamentos y la Provincia Constitucional del
// Callao, que se trata como un Departamento). Es solo una tabla de datos: no contiene lógica ni
// niveles de riesgo, colores ni alertas (design.md, "Tabla de Departamentos").
//
// Los códigos son los del UBIGEO del INEI y son un supuesto por confirmar junto con la fuente de la
// geometría del mapa (tarea 3.1). El conjunto cerrado de códigos válidos se define una sola vez en
// @teletexto/modelo (CODIGOS_DEPARTAMENTO); aquí solo se les asigna el nombre.

/** Un Departamento de la tabla: únicamente código y nombre. */
export type Departamento = Pick<DepartamentoGeometria, 'codigo' | 'nombre'>;

export const DEPARTAMENTOS: readonly Departamento[] = [
  { codigo: '01', nombre: 'Amazonas' },
  { codigo: '02', nombre: 'Áncash' },
  { codigo: '03', nombre: 'Apurímac' },
  { codigo: '04', nombre: 'Arequipa' },
  { codigo: '05', nombre: 'Ayacucho' },
  { codigo: '06', nombre: 'Cajamarca' },
  { codigo: '07', nombre: 'Callao' },
  { codigo: '08', nombre: 'Cusco' },
  { codigo: '09', nombre: 'Huancavelica' },
  { codigo: '10', nombre: 'Huánuco' },
  { codigo: '11', nombre: 'Ica' },
  { codigo: '12', nombre: 'Junín' },
  { codigo: '13', nombre: 'La Libertad' },
  { codigo: '14', nombre: 'Lambayeque' },
  { codigo: '15', nombre: 'Lima' },
  { codigo: '16', nombre: 'Loreto' },
  { codigo: '17', nombre: 'Madre de Dios' },
  { codigo: '18', nombre: 'Moquegua' },
  { codigo: '19', nombre: 'Pasco' },
  { codigo: '20', nombre: 'Piura' },
  { codigo: '21', nombre: 'Puno' },
  { codigo: '22', nombre: 'San Martín' },
  { codigo: '23', nombre: 'Tacna' },
  { codigo: '24', nombre: 'Tumbes' },
  { codigo: '25', nombre: 'Ucayali' },
];
