// Esquemas JSON del modelo de datos, para validar con Ajv (lo hace solo la ingesta; el cliente no los importa).
//
// Uso con Ajv:
//   const ajv = new Ajv({ allErrors: true });
//   for (const esquema of ESQUEMAS) ajv.addSchema(esquema);
//   const validarPagina = ajv.getSchema(ID_ESQUEMA_PAGE);

import alertas from './alertas.schema.json' with { type: 'json' };
import comun from './comun.schema.json' with { type: 'json' };
import page from './page.schema.json' with { type: 'json' };

export const ID_ESQUEMA_COMUN = 'teletexto/comun.schema.json';
export const ID_ESQUEMA_PAGE = 'teletexto/page.schema.json';
export const ID_ESQUEMA_ALERTAS = 'teletexto/alertas.schema.json';

/** Todos los esquemas, en el orden en que deben registrarse (`comun` primero porque los otros lo referencian). */
export const ESQUEMAS = [comun, page, alertas] as const;

export { alertas as esquemaAlertas, comun as esquemaComun, page as esquemaPage };
