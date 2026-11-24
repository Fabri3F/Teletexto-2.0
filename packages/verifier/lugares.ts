// Catálogo cerrado de lugares del Verificador (tarea 10.1). Requisitos 11.3 y 12.2.
//
// Son solo datos: los 25 Departamentos (24 departamentos y el Callao) con sus formas de escritura. El verificador reconoce un lugar
// únicamente si está aquí. Un nombre que no figura en este catálogo (provincia, distrito, localidad, país) NO se detecta, y esa es una
// limitación conocida. El verificador no usa heurísticas de nombres propios para aprobar lugares.
//
// Cada forma alternativa es una variante ortográfica del mismo nombre (sin tilde, o una grafía histórica como "Cuzco"). Todas dan el
// mismo valor canónico, así que comparar "San Martin" con "San Martín" no oculta ningún cambio.
//
// Los nombres duplican los de `apps/web/risk/departamentos` porque este paquete no puede importar de `apps/web`. Una prueba compara
// ambas listas leyendo ese archivo como texto, para detectar cualquier diferencia.
import type { CodigoDepartamento } from '@teletexto/modelo';

export interface LugarCatalogo {
  /** Nombre del Departamento, con la ortografía oficial. */
  readonly nombre: string;
  /** Formas alternativas de escribirlo, en minúsculas. La forma oficial (en minúsculas) se incluye siempre. */
  readonly variantes: readonly string[];
}

/** Los 25 Departamentos por código. El tipo `Record` obliga a definir los 25. */
export const LUGARES: Readonly<Record<CodigoDepartamento, LugarCatalogo>> = Object.freeze({
  '01': { nombre: 'Amazonas', variantes: ['amazonas'] },
  '02': { nombre: 'Áncash', variantes: ['áncash', 'ancash'] },
  '03': { nombre: 'Apurímac', variantes: ['apurímac', 'apurimac'] },
  '04': { nombre: 'Arequipa', variantes: ['arequipa'] },
  '05': { nombre: 'Ayacucho', variantes: ['ayacucho'] },
  '06': { nombre: 'Cajamarca', variantes: ['cajamarca'] },
  '07': { nombre: 'Callao', variantes: ['callao'] },
  '08': { nombre: 'Cusco', variantes: ['cusco', 'cuzco'] },
  '09': { nombre: 'Huancavelica', variantes: ['huancavelica'] },
  '10': { nombre: 'Huánuco', variantes: ['huánuco', 'huanuco'] },
  '11': { nombre: 'Ica', variantes: ['ica'] },
  '12': { nombre: 'Junín', variantes: ['junín', 'junin'] },
  '13': { nombre: 'La Libertad', variantes: ['la libertad'] },
  '14': { nombre: 'Lambayeque', variantes: ['lambayeque'] },
  '15': { nombre: 'Lima', variantes: ['lima'] },
  '16': { nombre: 'Loreto', variantes: ['loreto'] },
  '17': { nombre: 'Madre de Dios', variantes: ['madre de dios'] },
  '18': { nombre: 'Moquegua', variantes: ['moquegua'] },
  '19': { nombre: 'Pasco', variantes: ['pasco'] },
  '20': { nombre: 'Piura', variantes: ['piura'] },
  '21': { nombre: 'Puno', variantes: ['puno'] },
  '22': { nombre: 'San Martín', variantes: ['san martín', 'san martin'] },
  '23': { nombre: 'Tacna', variantes: ['tacna'] },
  '24': { nombre: 'Tumbes', variantes: ['tumbes'] },
  '25': { nombre: 'Ucayali', variantes: ['ucayali'] },
});
