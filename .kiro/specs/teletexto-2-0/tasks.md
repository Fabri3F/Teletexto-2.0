# Implementation Plan: Teletexto 2.0

## Overview

El plan sigue el orden de prioridad del Requisito 18.6 y el calendario de 15 días del diseño: primero Portada (100), Alertas (101), navegación y modo sin conexión; después resúmenes con IA y Verificador; al final Páginas 200 y 300, seguridad y pruebas de extremo a extremo. Todo el código usa TypeScript (Preact + Vite en el cliente, CLI Node en la ingesta, Worker de Cloudflare para administración). Cada tarea se integra con las anteriores. Las subtareas de prueba marcadas con `*` son opcionales.

## Tasks

- [ ] 1. Preparar el proyecto y el modelo de datos (días 1 a 2)
  - [ ] 1.1 Crear la estructura del monorepo y las herramientas
    - Crear `apps/web`, `tools/ingest`, `packages/verifier`, `workers/admin` y `data/prueba`
    - Configurar TypeScript, Vite con Preact, Vitest, fast-check (100 iteraciones por defecto), Ajv y scripts de npm
    - _Requirements: 16.1, 18.1_

  - [ ] 1.2 Definir el esquema JSON, los tipos y los datos de prueba
    - Escribir `page.schema.json` y los tipos `Page`, `Alerta`, `Precio`, `Campana`, `AvisoOficial` y `Metadatos`
    - Crear archivos de datos de prueba para las Páginas 100, 101, 200 y 300, con avisos que tengan de 1 a 3 recomendaciones y `esDatoDePrueba: true`
    - _Requirements: 9.2, 12.1, 18.2_

- [ ] 2. Ingesta: Parser, Pretty_Printer y generación estática (días 2 a 3)
  - [ ] 2.1 Implementar Parser_de_Contenido y Pretty_Printer
    - Implementar `parsePage`, `printPage`, `loadAll` y `validatePageConfig` con Ajv
    - Rechazar archivos vacíos, mayores a 1 MB, no JSON o fuera del esquema, con archivo, campo y regla
    - Tratar `esDatoDePrueba` ausente o inválido como `true`
    - _Requirements: 9.3, 12.1, 12.2, 12.3, 12.4, 16.3_

  - [ ]* 2.2 Escribir prueba de propiedad para el ida y vuelta del contenido
    - **Property 1: Ida y vuelta del contenido (parser e impresor)**
    - **Validates: Requirements 12.4, 12.5, 8.7**

  - [ ]* 2.3 Escribir prueba de propiedad para archivos inválidos
    - **Property 2: Archivos inválidos se rechazan completos y no alteran el contenido anterior**
    - **Validates: Requirements 12.1, 12.2, 12.3, 8.6**

  - [ ]* 2.4 Escribir prueba de propiedad para la configuración de páginas
    - **Property 3: Configuración de páginas válida**
    - **Validates: Requirements 16.2, 16.3**

  - [ ]* 2.5 Escribir prueba de propiedad para el dato de prueba por defecto
    - **Property 4: Dato de prueba por defecto**
    - **Validates: Requirements 9.2, 9.3**

  - [ ] 2.6 Implementar conectores, CLI de ingesta y escritor atómico
    - Definir la interfaz `ConectorFuente` con tiempo límite de 10 s e implementar `ConectorPrueba`
    - Escribir `dist.tmp/p/NNN.json` y `manifest.json`, y renombrar a `dist/` solo si todo tiene éxito
    - Registrar fallas de conector y conservar el último contenido válido
    - _Requirements: 8.6, 8.7, 12.2, 12.6, 12.7, 16.2_

- [ ] 3. Utilidades puras del cliente: formato y navegación (días 2 a 4)
  - [ ] 3.1 Implementar formato de fechas, moneda y sanitización
    - `formatLima` (DD/MM/AAAA HH:mm, UTC-5, "No disponible"), `formatSoles` sobre céntimos y `escapeText`
    - _Requirements: 3.2, 8.2, 8.3, 14.6_

  - [ ]* 3.2 Escribir prueba de propiedad para el formato de fechas
    - **Property 13: Formato de fechas**
    - **Validates: Requirements 8.2, 8.3, 7.3, 4.4**

  - [ ]* 3.3 Escribir prueba de propiedad para el formato de moneda
    - **Property 15: Formato de moneda**
    - **Validates: Requirements 3.2**

  - [ ]* 3.4 Escribir prueba de propiedad para la sanitización
    - **Property 20: Sanitización de contenido externo**
    - **Validates: Requirements 14.6**

  - [ ] 3.5 Implementar router, búfer de dígitos e historial
    - `pageToUrl`, `urlToPage`, `isValidPageNumber`, resolución contra el manifiesto, `entryBuffer` (push, cancel, tick con 5 s, display con marcadores) e `history` (visit, back)
    - _Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 6.7, 6.8_

  - [ ]* 3.6 Escribir prueba de propiedad para URL y número de página
    - **Property 6: Ida y vuelta entre número de página y URL**
    - **Validates: Requirements 5.11, 5.12, 5.13**

  - [ ]* 3.7 Escribir prueba de propiedad para la resolución de número de página
    - **Property 7: Resolución de número de página**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.6, 6.7, 6.8**

  - [ ]* 3.8 Escribir prueba de propiedad para el búfer de dígitos
    - **Property 8: Búfer de dígitos**
    - **Validates: Requirements 5.9, 5.10**

  - [ ]* 3.9 Escribir prueba de propiedad para el historial
    - **Property 9: Historial de sesión**
    - **Validates: Requirements 5.7, 5.8**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Cliente: carga de páginas, Portada y Página 101 (días 4 a 7)
  - [ ] 5.1 Implementar `pageLoader` y la política de reintentos
    - `backoffSchedule` (1, 2 y 4 s), `loadPage` con respaldo a la Caché_Local y errores tipados
    - _Requirements: 5.5, 13.6, 13.7, 13.8_

  - [ ]* 5.2 Escribir prueba de propiedad para los reintentos de red
    - **Property 10: Política de reintentos de red**
    - **Validates: Requirements 13.6, 13.7, 13.8, 5.5**

  - [ ] 5.3 Construir el armazón de la aplicación
    - Encabezado con número de página, teclado numérico en pantalla, soporte de teclado físico y control remoto (direccionales, confirmación, Inicio, Atrás)
    - Estilo teletexto: cuadrícula, contraste, texto de 24 px o más desde 1280 px, controles de 44 px, foco visible, diseño de 320 a 3840 px
    - Etiqueta "DATOS DE PRUEBA - NO OFICIAL" por registro, metadatos y enlace al original con atributos ARIA en el orden número, título y metadatos
    - Mensajes "Página no encontrada" y de error de carga que conservan la página previa
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.3, 8.4, 8.5, 9.1, 9.4, 9.6, 17.2, 17.3, 17.4, 17.5, 17.7_

  - [ ] 5.4 Implementar la Portada (Página 100)
    - Menú con exactamente tres entradas (101, 200, 300), etiqueta de prueba y manejo de error que mantiene la Portada
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ] 5.5 Implementar la Página de Alertas (101)
    - `sortAlerts`, `mergeSources`, render con nivel en texto e icono distintos, destacado del nivel máximo, mensaje "No hay alertas vigentes", límite de 50 y error con reintento
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 17.6_

  - [ ]* 5.6 Escribir prueba de propiedad para el orden de alertas
    - **Property 17: Orden de alertas y fusión de fuentes**
    - **Validates: Requirements 2.2, 2.7**

  - [ ]* 5.7 Escribir prueba de propiedad para el render de alertas
    - **Property 18: Render de alertas**
    - **Validates: Requirements 2.1, 2.3, 2.5, 17.6**

  - [ ]* 5.8 Escribir prueba de propiedad para la etiqueta de prueba
    - **Property 5: Etiqueta de prueba**
    - **Validates: Requirements 1.4, 9.1, 9.4, 9.5, 9.6**

  - [ ]* 5.9 Escribir prueba de propiedad para metadatos y enlace al original
    - **Property 14: Metadatos y enlace al original**
    - **Validates: Requirements 8.1, 8.3, 8.4, 8.5, 17.4**

- [ ] 6. Modo sin conexión y PWA (días 6 a 7)
  - [ ] 6.1 Implementar el service worker
    - Precaché de la aplicación base, `sync` de las Páginas 100, 101, 200 y 300 con límite de 10 s, 3 reintentos con 30 s o más, conservación de la versión anterior y de `syncedAt`, estrategia cache-first con actualización en segundo plano sin cambiar lo mostrado
    - Exponer `getCacheStatus` y `listCachedPages`; guardar `syncedAt` en IndexedDB
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 7.7_

  - [ ] 6.2 Integrar el modo sin conexión en la interfaz
    - Indicador sin conexión, fecha de la última sincronización, mensaje y lista de páginas disponibles, aviso "no se pudo actualizar", manifiesto web e instalación de la PWA
    - _Requirements: 7.2, 7.3, 7.4, 7.7, 7.8, 13.7_

  - [ ]* 6.3 Escribir prueba de propiedad para la sincronización
    - **Property 11: Sincronización conserva la última versión buena**
    - **Validates: Requirements 7.5, 7.6, 7.7**

  - [ ]* 6.4 Escribir prueba de propiedad para la consulta sin conexión
    - **Property 12: Consulta sin conexión**
    - **Validates: Requirements 7.2, 7.3, 7.4**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Resúmenes con IA y Verificador (días 8 a 10)
  - [ ] 8.1 Implementar el Verificador determinista
    - `extraerCriticos` (cifras, fechas, horas, lugares, niveles), reglas de añadido, modificación y omisión de recomendaciones, límite de 5 s y política de rechazo ante la duda
    - Registro `{estado, motivo (máx. 500), verificadoEn}` en UTC con precisión de segundos
    - _Requirements: 10.3, 11.1, 11.2, 11.3, 11.4, 11.8, 11.9_

  - [ ]* 8.2 Escribir prueba de propiedad para la verificación de resúmenes
    - **Property 21: Verificación de resúmenes aprobados**
    - **Validates: Requirements 10.3, 11.1, 11.2, 11.3, 11.4, 11.9**

  - [ ]* 8.3 Escribir prueba de propiedad para el registro de verificación
    - **Property 25: Registro de verificación**
    - **Validates: Requirements 11.8**

  - [ ] 8.4 Implementar el Resumidor_IA y el orquestador de resúmenes
    - Cliente del LLM con clave en variable de entorno y límite de 30 s, `hashTexto`, `publicarResumen` con un intento más 2 reintentos, validación de 1 a 60 palabras, reemplazo solo con resumen aprobado y registro en `logs/verificacion.jsonl`
    - Integrar el orquestador en el CLI de ingesta
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.8, 11.5, 11.6, 14.4, 14.5, 15.3, 15.4, 15.5_

  - [ ]* 8.5 Escribir prueba de propiedad para el orquestador
    - **Property 22: Orquestador de resúmenes**
    - **Validates: Requirements 10.2, 10.6, 11.6, 15.5, 18.4**

  - [ ]* 8.6 Escribir prueba de propiedad para la idempotencia del resumen
    - **Property 23: Idempotencia y conservación del resumen**
    - **Validates: Requirements 10.5, 10.8, 15.3, 15.4**

  - [ ] 8.7 Mostrar el resumen o el aviso original en el cliente
    - Etiqueta "Resumen generado con IA", enlace al texto original, etiqueta de prueba en el resumen, mensaje "Se muestra el aviso original" y aviso de resumen no disponible sin perder la página
    - _Requirements: 9.5, 10.4, 10.7, 11.5, 11.7, 18.4_

  - [ ]* 8.8 Escribir prueba de propiedad para la presentación del resumen
    - **Property 24: Presentación del resumen frente al original**
    - **Validates: Requirements 10.4, 10.7, 11.5, 11.7**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Páginas de Precios (200) y Salud (300) (días 11 a 13)
  - [ ] 10.1 Implementar la Página de Precios
    - Tabla con producto, mercado, unidad, precio y fecha, `filterByProduct`, `paginate` de 20, "Sin dato", mensaje sin registros con filtro conservado y error con reintento
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 10.2 Escribir prueba de propiedad para el filtro de precios
    - **Property 16: Filtro y precios sin dato**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ] 10.3 Implementar la Página de Salud
    - `sortByStart`, `activeCampaigns`, `paginate` de 20 con control de navegación, fechas DD/MM/AAAA, fuente "MINSA", mensaje "No hay campañas vigentes" y error que conserva datos previos
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 10.4 Escribir prueba de propiedad para orden, vigencia y paginación
    - **Property 19: Orden, vigencia y paginación de listas**
    - **Validates: Requirements 3.1, 4.1, 4.2, 4.3, 4.4**

- [ ] 11. Seguridad y despliegue (días 12 a 14)
  - [ ] 11.1 Configurar cabeceras y despliegue en Cloudflare Pages
    - Crear `public/_headers` con CSP, X-Content-Type-Options, X-Frame-Options y HSTS, y la configuración de redirección HTTPS y de límite de 60 solicitudes por 60 s con 429 y `Retry-After`
    - _Requirements: 14.1, 14.2, 14.7, 14.8, 14.9, 15.2, 18.1_

  - [ ] 11.2 Implementar el Worker de administración
    - `authorize` con JWT firmado, rol admin y expiración, 401 y 403 con registro de fecha, IP y recurso, y disparo del workflow de ingesta
    - _Requirements: 14.3, 14.4, 14.10_

  - [ ]* 11.3 Escribir prueba de propiedad para la autorización de escritura
    - **Property 26: Autorización de escritura**
    - **Validates: Requirements 14.3, 14.10**

  - [ ] 11.4 Crear scripts de CI para tamaños y secretos
    - Verificar carga inicial de 150 KB o menos, páginas de 20 KB o menos e imágenes de 10 KB o menos, y ejecutar gitleaks
    - _Requirements: 13.2, 13.3, 13.4, 14.4_

- [ ] 12. Pruebas de integración y demostración (días 14 a 15)
  - [ ]* 12.1 Escribir pruebas de extremo a extremo con Playwright y axe-core
    - Guion de demostración: 100, 101, 200, 300, resumen verificado y una página sin conexión
    - Verificar teclado, foco, zoom de 200 % y ausencia de llamadas del navegador a la IA
    - _Requirements: 6.2, 6.6, 14.5, 17.2, 17.3, 17.5, 18.3_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Si hay retraso, recortar primero lo no obligatorio del Requisito 18.6 (filtro de precios y paginación de salud), nunca la verificación de resúmenes.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Las pruebas de propiedad validan las 26 propiedades de correctness del diseño; las propiedades 1, 2, 21 y 22 deben estar listas antes del día 8.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "3.5", "5.1", "8.1", "11.1", "11.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "3.4", "3.6", "3.7", "3.8", "3.9", "5.2", "8.2", "8.3", "11.3"] },
    { "id": 4, "tasks": ["5.3", "8.4", "6.1"] },
    { "id": 5, "tasks": ["5.4", "5.5", "10.1", "10.3", "8.5", "8.6", "11.4"] },
    { "id": 6, "tasks": ["5.6", "5.7", "5.8", "5.9", "6.2", "8.7", "10.2", "10.4"] },
    { "id": 7, "tasks": ["6.3", "6.4", "8.8"] },
    { "id": 8, "tasks": ["12.1"] }
  ]
}
```
