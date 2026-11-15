---
inclusion: always
---

# Estructura del proyecto: Teletexto 2.0

Este documento organiza el código según `.kiro/specs/teletexto-2-0/design.md` y la tarea 1.1 de `tasks.md`. Los nombres de carpetas y módulos son los del diseño. No se crean carpetas, paquetes ni módulos nuevos sin justificarlo en el diseño y obtener la aprobación del equipo.

## Estructura de carpetas

```
Teletexto-2.0/
├── .kiro/
│   ├── specs/teletexto-2-0/        # requirements.md, design.md, tasks.md (no modificar sin petición)
│   └── steering/                   # product.md, tech.md, structure.md
├── apps/
│   └── web/                        # Cliente_Web (Preact + Vite + TypeScript)
│       ├── sw.ts                   # Service worker escrito a mano
│       ├── nav/                    # entryBuffer, router, history
│       ├── data/                   # pageLoader, retry
│       ├── format/                 # dates, money, sanitize
│       ├── pages/                  # Portada, Alertas, Precios, Salud + alertSort, pricesView, healthView
│       └── a11y/                   # contrast
├── packages/
│   └── verifier/                   # Verificador determinista (extraerCriticos, verificar)
├── tools/
│   └── ingest/                     # CLI de ingesta: Parser, Pretty_Printer, conectores, orquestador
├── workers/
│   └── admin/                      # Worker de Cloudflare /admin/reload
├── data/
│   └── prueba/                     # Datos de prueba (*.json) de las páginas 100, 101, 200 y 300
├── public/
│   └── _headers                    # CSP, HSTS y demás cabeceras de seguridad
├── dist/                           # Salida generada (p/NNN.json, manifest.json). No se edita a mano
└── logs/
    └── verificacion.jsonl          # Registro de verificación (auditoría, no se publica)
```

Elementos de soporte previstos por el diseño y las tareas: `page.schema.json` (esquema JSON de página), scripts de CI en GitHub Actions (tamaños y gitleaks) y archivos de configuración de TypeScript, Vite, Vitest y fast-check. El diseño no fija su ubicación exacta. Antes de crearlos, se decide con el equipo y se mantiene coherente con esta estructura.

`dist/`, `dist.tmp/` y `logs/` son artefactos generados y no se versionan salvo decisión del equipo.

## Módulos y responsabilidades

### `apps/web` (Cliente_Web)

| Módulo | Responsabilidad |
|---|---|
| `nav/entryBuffer` | Máquina de estados de dígitos (puro): `push`, `cancel`, `tick`, `display` |
| `nav/router` | `pageToUrl`, `urlToPage`, `isValidPageNumber` y resolución contra el manifiesto |
| `nav/history` | Historial de sesión: `visit`, `back` |
| `data/pageLoader` | `loadPage` con reintentos y respaldo a la Caché_Local |
| `data/retry` | `backoffSchedule` (1, 2 y 4 s), pura |
| `format/dates` | `formatLima` (`DD/MM/AAAA HH:mm` o "No disponible") |
| `format/money` | `formatSoles` sobre céntimos enteros |
| `format/sanitize` | `escapeText` para todo texto externo |
| `pages/Portada`, `Alertas`, `Precios`, `Salud` | Vistas. Reciben un `Page` ya validado |
| `pages/alertSort` | `sortAlerts`, `mergeSources` |
| `pages/pricesView` | `filterByProduct`, `paginate` (20) |
| `pages/healthView` | `sortByStart`, `activeCampaigns`, `paginate` (20) |
| `a11y/contrast` | `contrastRatio`, usado en pruebas de la paleta |
| `sw.ts` | Precaché, `sync` de páginas, estrategia de caché, `getCacheStatus`, `listCachedPages` |

### `tools/ingest` (Servicio_Contenido en build)

- Parser_de_Contenido: `parsePage`, `loadAll`, `validatePageConfig` (con Ajv).
- Pretty_Printer: `printPage` (JSON UTF-8, claves en orden fijo, sangría de 2 espacios, `\n` final).
- Conectores: interfaz `ConectorFuente` y `ConectorPrueba` (lee `data/prueba/*.json`).
- Orquestador de resúmenes: `publicarResumen`, `hashTexto`, cliente del Resumidor_IA con límite de 30 s.
- Escritor atómico: `dist.tmp/` renombrado a `dist/`; genera `manifest.json`.

### `packages/verifier`

`extraerCriticos(texto)` y `verificar(aviso, resumen)` con resultado `aprobado`, `rechazado` (con motivo) o `no_verificado`. No depende de ningún LLM ni de la red.

### `workers/admin`

`authorize` (JWT, rol admin, expiración) y `POST /admin/reload`. Es el único punto de escritura. No contiene lógica de contenido.

## Reglas de dependencia (obligatorias)

1. **El Cliente_Web no importa código de `tools/ingest` ni de `workers/admin`.** Solo lee `/p/NNN.json` y `/manifest.json` del mismo origen.
2. **Ningún código del cliente accede a la API de IA** ni contiene claves. El Resumidor_IA solo se invoca desde `tools/ingest`.
3. **`packages/verifier` es independiente**: no importa de `apps/web`, `tools/ingest` ni `workers/admin`. `tools/ingest` lo consume.
4. **Las vistas de `pages/` no contienen lógica reutilizable**: orden, filtros, paginación, formato y navegación viven en funciones puras de sus módulos y se prueban con propiedades.
5. **Las vistas no leen la red ni el reloj directamente.** Reciben datos o dependencias inyectadas (`deps`).
6. **El modelo de datos es único.** Los tipos (`Page`, `Alerta`, `Precio`, `Campana`, `AvisoOficial`, `Metadatos`) y `page.schema.json` se definen una vez y se reutilizan. No se duplican definiciones entre cliente e ingesta.
7. **Agregar una página nueva es cambio de datos y configuración**, no de código de navegación. El manifiesto es la fuente para saber qué páginas existen.
8. **Los datos de prueba solo viven en `data/prueba/`** y todo registro lleva `esDatoDePrueba`. Nunca se mezclan con datos reales.

## Convenciones de nombres y archivos

- Carpetas y archivos de módulos como en las tablas anteriores (por ejemplo `entryBuffer`, `pageLoader`, `alertSort`).
- Páginas de contenido numeradas con tres dígitos: `p/100.json`, `p/101.json`, `p/200.json`, `p/300.json`.
- Identificadores del dominio en español, igual que el diseño.
- Pruebas junto al módulo que prueban, con nombre que indique la propiedad o el comportamiento. Cada prueba de propiedad lleva `Feature: teletexto-2-0, Property N` y `Validates: Requirements ...`.
- Cada tarea de `tasks.md` referencia requisitos. Los cambios de código deben poder trazarse a una tarea y a un requisito.

## Instrucciones para agentes

1. Antes de crear un archivo, confirma que su lugar está en esta estructura. Si no lo está, pregunta.
2. Implementa solo lo que pide la tarea actual de `tasks.md`. Respeta el orden de olas del Task Dependency Graph.
3. No modifiques `.kiro/specs/` salvo petición expresa.
4. No agregues dependencias, servicios ni tecnologías que no estén en `tech.md`.
5. No edites a mano `dist/` ni `logs/`.
6. No implementes nada fuera de alcance (ver `product.md`).
7. Al terminar una tarea, ejecuta las pruebas relacionadas y no marques la tarea como completa si fallan.