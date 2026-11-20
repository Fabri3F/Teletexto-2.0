# Implementation Plan: Teletexto 2.0

## Overview

El plan sigue la prioridad del Requisito 19.7 y el calendario de 15 días del diseño para dos personas (A y B). Primero van las Páginas 100 y 101, la navegación y el modo sin conexión (olas 0 a 6). Después vienen los resúmenes con IA y el Verificador. El mapa de la Página 400 y el Indicador_de_Datos se construyen sobre esa base, siguiendo el calendario del diseño. Al final se hacen la Página 200, la seguridad, los límites de tamaño en CI y las pruebas de extremo a extremo.

Todo el código usa TypeScript: Preact y Vite en el cliente, CLI Node en la ingesta y en `tools/geo`, y un Worker de Cloudflare para administración. Las Páginas 101 y 400 leen un único dataset de alertas (`/d/alertas.json`). Cada tarea se integra con las anteriores. Las subtareas de prueba marcadas con `*` son opcionales.

**Tareas que se ejecutan primero (olas 0 y 1):** 1.1 (estructura), 1.2 (esquemas y tipos), 1.4 (tabla de 25 Departamentos) y 3.1 (confirmación de la fuente de la geometría con el Equipo). La ola 2 arranca la ingesta, las utilidades puras, la Portada y la navegación.

## Tasks

- [ ] 1. Preparar el proyecto y el modelo de datos (días 1 a 2)
  - [x] 1.1 Crear la estructura del monorepo y las herramientas
    - Crear `apps/web`, `tools/ingest`, `tools/geo`, `packages/verifier`, `workers/admin` y `data/prueba`
    - Configurar TypeScript, Vite con Preact, Vitest, fast-check (100 iteraciones por defecto), Ajv, Playwright y scripts de npm
    - _Requirements: 16.1, 17.1, 19.1_

  - [x] 1.2 Definir los esquemas JSON y los tipos
    - Escribir `page.schema.json` y `alertas.schema.json`, y los tipos `Page`, `EntradaMenu`, `Precio`, `AlertaRiesgo`, `DatasetAlertas`, `AvisoOficial`, `Metadatos`, `Geometria`, `Manifiesto` y `NivelRiesgo`
    - Exigir `esDatoDePrueba` booleano en cada registro, y `urlOriginal` o `referencia` en cada alerta
    - Declarar `datos: "alertas"` y `umbralHoras` en las páginas 101 y 400
    - _Requirements: 4.14, 9.7, 10.2, 13.1, 17.2_

  - [x] 1.3 Crear los datos de prueba y la tabla de mapeo de niveles
    - Crear archivos de datos para las Páginas 100, 101, 200 y 400 y el dataset de alertas, todos con `esDatoDePrueba: true`
    - Incluir alertas vigentes para al menos 3 Departamentos, con al menos 2 niveles distintos, y al menos 1 Departamento sin alertas vigentes
    - Incluir una alerta que cubra más de un Departamento y avisos con 1 a 3 recomendaciones
    - Crear `data/mapeo-niveles.json` con la escala oficial de cada fuente (supuesto: verde, amarillo, naranja, rojo)
    - Hacer que las fechas de vigencia cubran el día de la demostración
    - _Requirements: 4.14, 4.16, 10.2, 19.2, 19.3_

  - [x] 1.4 Crear la tabla de datos de los 25 Departamentos
    - Crear `risk/departamentos` con `DEPARTAMENTOS: {codigo, nombre}[]` (códigos UBIGEO 01 a 25, Callao como 07), solo datos, sin niveles
    - _Requirements: 4.1, 4.5_

- [ ] 2. Ingesta: Parser, Pretty_Printer, conectores y generación estática (días 2 a 3)
  - [x] 2.1 Implementar Parser_de_Contenido y Pretty_Printer
    - Implementar `parsePage`, `parseAlertas`, `printPage`, `printAlertas`, `loadAll` y `validatePageConfig` con Ajv
    - Rechazar archivos vacíos, mayores a 1 MB, no JSON o fuera del esquema, con archivo, campo y regla
    - Rechazar alertas sin Departamento válido, sin nivel válido, sin fechas o con fin anterior a inicio, sin asignar nivel por defecto
    - Tratar `esDatoDePrueba` ausente o inválido como `true`
    - _Requirements: 10.3, 13.1, 13.2, 13.3, 13.4, 13.8, 17.3_

  - [ ]* 2.2 Escribir prueba de propiedad para el ida y vuelta del contenido
    - **Property 1: Ida y vuelta del contenido (parser e impresor)**
    - **Validates: Requirements 13.4, 13.5, 9.7**

  - [ ]* 2.3 Escribir prueba de propiedad para archivos inválidos
    - **Property 2: Archivos inválidos se rechazan completos y no alteran el contenido anterior**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.8, 9.6**

  - [ ]* 2.4 Escribir prueba de propiedad para la configuración de páginas
    - **Property 3: Configuración de páginas válida**
    - **Validates: Requirements 17.2, 17.3**

  - [ ]* 2.5 Escribir prueba de propiedad para el dato de prueba por defecto
    - **Property 4: Dato de prueba por defecto**
    - **Validates: Requirements 10.2, 10.3**

  - [ ] 2.6 Implementar conectores y la capa de mapeo de niveles
    - Definir la interfaz `ConectorFuente` con tiempo límite de 10 s e implementar `ConectorPrueba`
    - Implementar `normalizarNivel` con la tabla `data/mapeo-niveles.json`, conservando el texto oficial y `esMaximo`
    - Rechazar valores oficiales sin mapeo, sin nivel por defecto
    - Registrar fallas de conector con la fuente y conservar el último contenido válido
    - _Requirements: 4.15, 13.6, 13.7, 13.8_

  - [ ]* 2.7 Escribir prueba de propiedad para el mapeo de escalas oficiales
    - **Property 31: Mapeo de escalas oficiales**
    - **Validates: Requirements 4.15, 13.6, 13.8**

  - [ ] 2.8 Implementar el CLI de ingesta, el escritor atómico y el manifiesto
    - Escribir `dist.tmp/` con `p/NNN.json`, `d/alertas.json` y `manifest.json` (páginas, recursos `alertas` y `geo`, hashes, bytes y `umbralHoras`: 6 h para 101 y 400, 24 h para 100 y 200), y renombrar a `dist/` solo si todo tiene éxito
    - Generar los Metadatos de las páginas 101 y 400 desde el mismo dataset de alertas
    - Copiar `public/geo/departamentos.json` sin incluirlo en ninguna respuesta de página
    - _Requirements: 2.8, 4.13, 9.6, 9.7, 13.2, 13.7, 14.3, 14.4, 17.2_

- [ ] 3. Geometría del mapa: herramienta `tools/geo` (días 1 a 4)
  - [x] 3.1 Crear la configuración de la fuente y la puerta de confirmación con el Equipo
    - Crear `tools/geo/fuente.config.json` con fuente candidata (INEI o IGN), licencia, atribución, codificación UBIGEO y el campo `confirmadoPorEquipo: false`
    - Hacer que `tools/geo` se niegue a ejecutarse mientras `confirmadoPorEquipo` no sea `true`, y que imprima la fuente, la licencia y la codificación pendientes de confirmar
    - Pasar la licencia y la atribución al campo correspondiente de `Geometria`
    - _Requirements: 4.1, 4.17, 19.6_

  - [x] 3.2 Implementar la herramienta `tools/geo`
    - Leer la fuente confirmada, fusionar o agrupar hasta tener exactamente 25 unidades, simplificar con mapshaper conservando topología, proyectar con una proyección equirrectangular a un `viewBox` fijo y emitir rutas SVG con un decimal y centroides
    - Escribir `public/geo/departamentos.json` con `version`, `fuente`, `licencia`, `viewBox` y los 25 Departamentos
    - Fallar si faltan o sobran códigos respecto de la tabla de 1.4, o si el archivo supera 80 KB comprimidos
    - Decisiones del Equipo aplicadas: `-explode` y Douglas-Peucker, rutas relativas compactas, parámetros de proyección aprobados y fijados en el código, objetivo de 76 800 bytes y límite de 81 920 bytes (gzip nivel 6), y la excepción documentada del hueco `21#6.2` de Puno (39 de 40 partes). Ver `design.md`, `mapa.config.json` y `fuente.config.json`
    - _Requirements: 4.1, 4.17, 14.4_

  - [ ]* 3.3 Escribir pruebas unitarias de `tools/geo`
    - Probar la negativa a ejecutar sin confirmación, el fallo con 24 o 26 unidades, el fallo por tamaño y la salida con exactamente los 25 códigos
    - _Requirements: 4.1, 4.17, 14.4_

- [ ] 4. Utilidades puras del cliente: formato y navegación (días 2 a 4)
  - [x] 4.1 Implementar formato de fechas, reloj, moneda y sanitización
    - `formatLima` (DD/MM/AAAA HH:mm, UTC-5, "No disponible"), `formatLimaConSegundos` (DD/MM/AAAA HH:mm:ss), `formatSoles` sobre céntimos y `escapeText`, con `ahora()` inyectable
    - _Requirements: 1.7, 1.8, 3.2, 9.2, 9.3, 15.6_

  - [ ]* 4.2 Escribir prueba de propiedad para el formato de fechas
    - **Property 13: Formato de fechas**
    - **Validates: Requirements 9.2, 9.3, 7.3, 4.8**

  - [ ]* 4.3 Escribir prueba de propiedad para el formato del reloj de la Portada
    - **Property 14: Formato del reloj de la Portada**
    - **Validates: Requirements 1.7, 1.8**

  - [ ]* 4.4 Escribir prueba de propiedad para el formato de moneda
    - **Property 16: Formato de moneda**
    - **Validates: Requirements 3.2**

  - [ ]* 4.5 Escribir prueba de propiedad para la sanitización
    - **Property 20: Sanitización de contenido externo**
    - **Validates: Requirements 15.6**

  - [x] 4.6 Implementar router, búfer de dígitos e historial
    - `pageToUrl`, `urlToPage`, `isValidPageNumber`, resolución contra el manifiesto, `entryBuffer` (push, cancel, tick con 5 s, display con marcadores) e `history` (visit, back)
    - _Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 6.7, 6.8, 17.2_

  - [ ]* 4.7 Escribir prueba de propiedad para URL y número de página
    - **Property 6: Ida y vuelta entre número de página y URL**
    - **Validates: Requirements 5.11, 5.12, 5.13, 1.6**

  - [ ]* 4.8 Escribir prueba de propiedad para la resolución de número de página
    - **Property 7: Resolución de número de página**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.6, 6.7, 6.8**

  - [ ]* 4.9 Escribir prueba de propiedad para el búfer de dígitos
    - **Property 8: Búfer de dígitos**
    - **Validates: Requirements 5.9, 5.10**

  - [ ]* 4.10 Escribir prueba de propiedad para el historial
    - **Property 9: Historial de sesión**
    - **Validates: Requirements 5.7, 5.8**

- [ ] 5. Lógica pura del cliente: alertas, sincronización, indicador y mapa (días 3 a 9)
  - [x] 5.1 Implementar `risk/alertas`
    - `esVigente`, `alertasVigentes`, `riesgoPorDepartamento` (25 entradas, nivel máximo o `null`, sin nivel por defecto), `detalleDepartamento`, `sortAlerts` y `mergeSources`, con `ahora()` inyectable
    - Incluir cada alerta en todos los Departamentos que cubre y ordenar el detalle por nivel y por fecha de actualización
    - _Requirements: 2.2, 2.7, 2.8, 4.2, 4.5, 4.6, 4.9, 4.13, 4.16, 4.20_

  - [ ]* 5.2 Escribir prueba de propiedad para el orden de alertas y la fusión de fuentes
    - **Property 18: Orden de alertas y fusión de fuentes**
    - **Validates: Requirements 2.2, 2.7**

  - [ ]* 5.3 Escribir prueba de propiedad para el riesgo por departamento
    - **Property 27: Riesgo por departamento**
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.9, 18.8**

  - [ ]* 5.4 Escribir prueba de propiedad para la vigencia con reloj inyectado
    - **Property 28: Vigencia con reloj inyectado**
    - **Validates: Requirements 4.6, 2.1**

  - [ ]* 5.5 Escribir prueba de propiedad para alertas de varios departamentos
    - **Property 29: Alerta de varios departamentos**
    - **Validates: Requirements 4.16**

  - [ ]* 5.6 Escribir prueba de propiedad para la consistencia entre las Páginas 101 y 400
    - **Property 30: Consistencia entre las Páginas 101 y 400**
    - **Validates: Requirements 2.8, 4.13**

  - [ ]* 5.7 Escribir prueba de propiedad para el detalle y orden de alertas del departamento
    - **Property 32: Detalle y orden de alertas del departamento**
    - **Validates: Requirements 4.7, 4.8, 4.9, 4.20, 9.5**

  - [ ] 5.8 Implementar el reducer de estado de sincronización y la frescura
    - `sync/estadoSync` (`reducir` con eventos `abrir`, `contenidoListo`, `syncInicia`, `syncOk`, `syncFalla`, `offline`, `online`) y `sync/frescura` (`estadoFrescura`: nunca, vigente, desactualizada)
    - _Requirements: 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 7.9, 7.10, 7.11, 7.12_

  - [ ]* 5.9 Escribir prueba de propiedad para la desactualización
    - **Property 35: Desactualización**
    - **Validates: Requirements 7.9, 7.10, 7.11, 7.13**

  - [ ]* 5.10 Escribir prueba de propiedad para el estado de sincronización
    - **Property 36: Estado de sincronización**
    - **Validates: Requirements 1.13, 1.14, 1.15, 1.16, 1.17, 1.18**

  - [ ] 5.11 Implementar el módulo puro `meter/datos`
    - `acumular` (suma solo bytes medidos, ignora cero, negativos y no finitos), `formatMB` con aritmética entera y `textoIndicador` según las capacidades medibles
    - Mantener el contador solo en memoria, sin solicitudes de red propias
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11, 8.12, 8.15_

  - [ ]* 5.12 Escribir prueba de propiedad para el acumulador y el formato del indicador
    - **Property 37: Acumulador y formato del Indicador_de_Datos**
    - **Validates: Requirements 8.2, 8.3, 8.8, 8.10, 8.11, 8.15**

  - [ ]* 5.13 Escribir prueba de propiedad para el texto del indicador
    - **Property 38: Texto del indicador según lo medible**
    - **Validates: Requirements 8.1, 8.4, 8.5, 8.6, 8.7, 8.9**

  - [ ] 5.14 Implementar `risk/mapNav`
    - `ordenRecorrido` y `mover` (Departamento más cercano por centroides, con avance de respaldo para alcanzar los 25)
    - _Requirements: 4.10, 6.2, 6.6_

  - [ ]* 5.15 Escribir prueba de propiedad para el recorrido del mapa por teclado
    - **Property 33: Recorrido del mapa por teclado**
    - **Validates: Requirements 4.10, 6.2, 6.6**

  - [ ] 5.16 Implementar `a11y/contrast` y la paleta
    - `contrastRatio`, paleta del estilo teletexto (texto 7:1), colores y patrones de los cuatro niveles y del Estilo_Neutro, con pruebas unitarias de contraste de 3:1 entre colores, patrones y bordes
    - _Requirements: 4.4, 6.5, 18.1, 18.3, 18.10_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Cliente: carga, pantalla de carga, Portada y Página 101 (días 3 a 7)
  - [ ] 7.1 Implementar `pageLoader` y la política de reintentos
    - `backoffSchedule` (1, 2 y 4 s) y `loadPage` con respaldo a la Caché_Local y errores tipados
    - _Requirements: 5.5, 14.7, 14.8, 14.9_

  - [ ]* 7.2 Escribir prueba de propiedad para los reintentos de red
    - **Property 10: Política de reintentos de red**
    - **Validates: Requirements 14.7, 14.8, 14.9, 5.5**

  - [ ] 7.3 Implementar la Pantalla_de_Carga
    - Marcado con "Teletexto 2.0" y logotipo SVG en `index.html` y `splash.css`, sin scripts, estilos en línea, imágenes rasterizadas ni librerías, con peso de 5 KB comprimidos o menos
    - Ocultarla con una animación CSS a los 1.5 s y con la clase `listo` cuando la Portada tenga contenido, sin animaciones con `prefers-reduced-motion`
    - _Requirements: 1.9, 1.10, 1.11, 1.12, 14.2_

  - [ ] 7.4 Construir el armazón de la aplicación
    - Encabezado con número de página, teclado numérico en pantalla, teclado físico y control remoto (direccionales, confirmación, Inicio, Atrás) y foco visible de 2 px o más
    - Estilo teletexto, texto de 24 px o más desde 1280 px, controles de 44 px bajo 600 px, diseño de 320 a 3840 px
    - Etiqueta "DATOS DE PRUEBA - NO OFICIAL" por registro, Metadatos_de_Página y enlace al original, con etiquetas semánticas y ARIA en el orden número, título y metadatos
    - Mensajes "Página no encontrada" y de error de carga que conservan la página previa
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.9, 6.10, 9.1, 9.3, 9.4, 9.5, 10.1, 10.4, 10.6, 18.2, 18.3, 18.4, 18.5, 18.7_

  - [ ] 7.5 Implementar la Portada (Página 100)
    - Menú con exactamente tres entradas (101, 200 y 400) con nombre y número, etiqueta de prueba y manejo de error que mantiene la Portada
    - Reloj de Perú con tick alineado al segundo, y estado de sincronización con texto e icono por valor, conectado al reducer
    - Diseño sin desplazamiento horizontal desde 320 px
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 18.9_

  - [ ] 7.6 Implementar la Página de Alertas (101)
    - Leer `/d/alertas.json` con `alertasVigentes`, `sortAlerts` y `mergeSources`
    - Nivel en texto e icono distintos, destacado del nivel máximo, mensaje "No hay alertas vigentes" con la fecha de la última actualización, límite de 50 y error con reintento
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 18.6_

  - [ ]* 7.7 Escribir prueba de propiedad para el render de alertas
    - **Property 19: Render de alertas**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 18.6**

  - [ ]* 7.8 Escribir prueba de propiedad para la etiqueta de prueba
    - **Property 5: Etiqueta de prueba**
    - **Validates: Requirements 1.4, 10.1, 10.4, 10.5, 10.6, 10.7**

  - [ ]* 7.9 Escribir prueba de propiedad para metadatos y enlace al original
    - **Property 15: Metadatos y enlace al original**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 18.4**

- [ ] 8. Modo sin conexión, PWA e Indicador_de_Datos (días 5 a 7)
  - [ ] 8.1 Implementar el service worker
    - Precaché de la aplicación base (sin la geometría) y `sync` de las Páginas 100, 101, 200 y 400, `/d/alertas.json` y `/geo/departamentos.json`, con límite de 10 s por solicitud y 30 s en total
    - Tratar 101 y 400 como una unidad con el dataset de alertas, de modo que `syncedAt` solo cambie si ambos tienen éxito
    - Hasta 3 reintentos con 30 s o más entre ellos, conservación de la versión anterior y de `syncedAt`, y cache-first con actualización en segundo plano sin cambiar lo mostrado
    - Exponer `getCacheStatus`, `getGeoStatus`, `listCachedPages`, `getUmbral` y mensajes `sync` (inicia, ok, falla); guardar `syncedAt` en IndexedDB
    - _Requirements: 4.17, 7.1, 7.2, 7.5, 7.6, 7.7, 7.9, 14.6_

  - [ ] 8.2 Integrar el modo sin conexión y la frescura en la interfaz
    - Pie común con "En línea" o "Sin conexión" con icono, fecha de la última sincronización por página y "Nunca sincronizada"
    - Aviso "Información desactualizada" con texto, icono y nombre accesible, mensaje y lista de páginas disponibles sin conexión, aviso "no se pudo actualizar", manifiesto web e instalación de la PWA
    - Conectar los mensajes del service worker al reducer de sincronización
    - _Requirements: 1.16, 1.17, 7.2, 7.3, 7.4, 7.7, 7.8, 7.10, 7.11, 7.12, 7.13, 18.9_

  - [ ]* 8.3 Escribir prueba de propiedad para la sincronización
    - **Property 11: Sincronización conserva la última versión buena**
    - **Validates: Requirements 7.5, 7.6, 7.7**

  - [ ]* 8.4 Escribir prueba de propiedad para la consulta sin conexión
    - **Property 12: Consulta sin conexión**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [ ] 8.5 Implementar el canal de medición del service worker a la página
    - En el service worker, medir cada respuesta de red (Resource Timing, luego `Content-Length`, luego conteo por copia) e informar `{tipo: "bytes", descargados}` solo al cliente que originó la solicitud, incluidos fallos y cancelaciones
    - En la página, adaptador con `PerformanceObserver` que cuenta solo entradas sin service worker (`workerStart === 0`), ignora las de caché (`transferSize` 0) y alimenta `acumular`
    - Detectar capacidades: bytes enviados no medibles
    - _Requirements: 8.2, 8.4, 8.5, 8.6, 8.12, 8.15, 15.11_

  - [ ] 8.6 Integrar el Indicador_de_Datos en el pie de todas las páginas
    - Mostrar "Datos usados por esta aplicación en esta sesión" y el texto "No incluye otras aplicaciones ni el consumo total de Internet del dispositivo"
    - Actualizar con tope de una vez por segundo y dentro de 5 s, sin regiones `aria-live`, con texto completo legible por lector de pantalla
    - Limitar código y estilos a 2 KB comprimidos, sin librerías
    - _Requirements: 8.1, 8.3, 8.6, 8.7, 8.9, 8.10, 8.13, 8.14, 18.1, 18.3_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Resúmenes con IA y Verificador (días 7 a 9)
  - [ ] 10.1 Implementar el Verificador determinista
    - `extraerCriticos` (cifras, fechas, horas, lugares, niveles), reglas de añadido, modificación y omisión de recomendaciones, límite de 5 s y rechazo ante la duda
    - Registro `{estado, motivo (máx. 500), verificadoEn}` en UTC con precisión de segundos
    - _Requirements: 11.3, 12.1, 12.2, 12.3, 12.4, 12.8, 12.9_

  - [ ]* 10.2 Escribir prueba de propiedad para la verificación de resúmenes
    - **Property 21: Verificación de resúmenes aprobados**
    - **Validates: Requirements 11.3, 12.1, 12.2, 12.3, 12.4, 12.9**

  - [ ]* 10.3 Escribir prueba de propiedad para el registro de verificación
    - **Property 25: Registro de verificación**
    - **Validates: Requirements 12.8**

  - [ ] 10.4 Implementar el Resumidor_IA y el orquestador de resúmenes
    - Cliente del LLM con clave en variable de entorno y límite de 30 s, `hashTexto`, `publicarResumen` con un intento más 2 reintentos, validación de 1 a 60 palabras, reemplazo solo con resumen aprobado y registro en `logs/verificacion.jsonl`
    - Integrar el orquestador en el CLI de ingesta (2.8) sin invocar al Resumidor si el texto no cambió
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.8, 12.5, 12.6, 15.4, 15.5, 16.3, 16.4, 16.5_

  - [ ]* 10.5 Escribir prueba de propiedad para el orquestador
    - **Property 22: Orquestador de resúmenes**
    - **Validates: Requirements 11.1, 11.2, 11.6, 12.6, 16.5, 19.5**

  - [ ]* 10.6 Escribir prueba de propiedad para la idempotencia del resumen
    - **Property 23: Idempotencia y conservación del resumen**
    - **Validates: Requirements 11.5, 11.8, 16.3, 16.4**

  - [ ] 10.7 Mostrar el resumen o el aviso original en el cliente
    - Etiqueta "Resumen generado con IA", enlace al texto original en la misma pantalla, etiqueta de prueba en la primera línea del resumen, mensaje "Se muestra el aviso original" y aviso de resumen no disponible sin perder la página
    - _Requirements: 10.5, 11.4, 11.7, 12.5, 12.7, 19.5_

  - [ ]* 10.8 Escribir prueba de propiedad para la presentación del resumen
    - **Property 24: Presentación del resumen frente al original**
    - **Validates: Requirements 11.4, 11.7, 12.5, 12.7**

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Mapa interactivo de riesgos climáticos, Página 400 (días 8 a 13)
  - [ ] 12.1 Implementar el componente `MapaRiesgos`
    - SVG en línea con un `<path>` por Departamento, colores y patrones de relleno por nivel, Estilo_Neutro para los Departamentos sin alertas vigentes y nombre accesible "Nombre, Nivel" o "Nombre, Sin información disponible"
    - Leyenda con cinco entradas (cuatro niveles y Estilo_Neutro), cada una con color, texto, patrón e icono
    - Selección con ratón, toque, teclado y control remoto, foco itinerante con direccionales, confirmación y Tab, e indicador de foco de 2 px o más con contraste de 3:1
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.10, 6.2, 6.6, 18.3, 18.8, 18.10_

  - [ ] 12.2 Implementar el panel de detalle del Departamento
    - Mostrar nombre y alertas vigentes en 1 s o menos, con tipo de riesgo, nivel, inicio y fin de vigencia, fecha de actualización (DD/MM/AAAA HH:mm), fuente y enlace o referencia al documento oficial
    - Texto exacto "Sin información disponible" sin alertas vigentes y etiqueta de prueba en la primera línea del detalle
    - _Requirements: 4.7, 4.8, 4.9, 4.20, 9.4, 9.5, 10.7_

  - [ ] 12.3 Implementar la vista alternativa en lista y el respaldo ante falla de geometría
    - Tabla accesible con los 25 Departamentos, su nivel en texto o "Sin información disponible" y su número de alertas vigentes, operable por teclado y control remoto, con áreas táctiles de 44 x 44 px
    - Mostrar esta tabla con el aviso de mapa no disponible si falla la geometría, conservando las alertas ya obtenidas
    - Ajustar el mapa desde 320 px sin desplazamiento horizontal, con ampliación del contenedor bajo 600 px y acceso destacado a la tabla
    - _Requirements: 4.11, 4.12, 4.18, 6.4, 18.2_

  - [ ] 12.4 Integrar la Página 400 en la aplicación
    - Cargar la geometría solo al abrir la Página 400 o durante la sincronización, usar el mismo dataset que la Página 101 y mostrar mapa y detalle en 1 s o menos desde la Caché_Local sin conexión
    - Añadir la atribución de la geometría si la licencia lo exige y el aviso de desactualización de la Página 400
    - _Requirements: 4.1, 4.13, 4.17, 4.19, 7.2, 7.10, 14.1_

  - [ ]* 12.5 Escribir prueba de propiedad para la vista alternativa en lista
    - **Property 34: Vista alternativa en lista**
    - **Validates: Requirements 4.11, 4.12**

  - [ ]* 12.6 Escribir pruebas unitarias del mapa
    - Probar 25 Departamentos renderizados, leyenda con cinco entradas, nombres accesibles, ausencia de color de nivel en Departamentos sin alertas y foco visible
    - _Requirements: 4.3, 4.5, 4.10, 18.8_

- [ ] 13. Página de Precios (200) (días 10 a 11)
  - [ ] 13.1 Implementar la Página de Precios
    - Tabla con producto, mercado, unidad, precio y fecha, `filterByProduct`, `paginate` de 20, "Sin dato", mensaje sin registros con filtro conservado y error con reintento a los 10 s
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 13.2 Escribir prueba de propiedad para el filtro, la paginación y los precios sin dato
    - **Property 17: Filtro, paginación y precios sin dato**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

- [ ] 14. Seguridad y límites de tamaño en CI (días 12 a 14)
  - [ ] 14.1 Configurar cabeceras y despliegue en Cloudflare Pages
    - Crear `public/_headers` con CSP sin scripts ni estilos en línea, X-Content-Type-Options, X-Frame-Options y HSTS, la redirección HTTPS y el límite de 60 solicitudes por 60 s con 429 y `Retry-After`
    - _Requirements: 15.1, 15.2, 15.7, 15.8, 15.9, 16.2_

  - [ ] 14.2 Implementar el Worker de administración
    - `authorize` con JWT firmado, rol admin y expiración, 401 y 403 con registro de fecha, IP y recurso, y disparo del workflow de ingesta
    - _Requirements: 15.3, 15.4, 15.10_

  - [ ]* 14.3 Escribir prueba de propiedad para la autorización de escritura
    - **Property 26: Autorización de escritura**
    - **Validates: Requirements 15.3, 15.10**

  - [ ] 14.4 Crear el script de CI para los límites de tamaño
    - Con `zlib` sobre `dist/`, fallar si la carga inicial (incluidas pantalla de carga e Indicador_de_Datos) supera 150 KB, una página o el dataset de alertas supera 20 KB, la geometría supera 80 KB, la pantalla de carga supera 5 KB, el Indicador_de_Datos supera 2 KB o una imagen supera 10 KB
    - _Requirements: 1.11, 4.17, 8.13, 14.2, 14.3, 14.4, 14.5_

  - [ ] 14.5 Crear scripts de CI para secretos y llamadas a la IA
    - Ejecutar gitleaks y verificar que el bundle del cliente no contiene claves ni solicitudes al Resumidor_IA
    - _Requirements: 15.4, 15.5_

- [ ] 15. Pruebas de extremo a extremo y demostración (días 14 a 15)
  - [ ]* 15.1 Escribir pruebas Playwright y axe-core para el mapa
    - Recorrido con direccionales, Tab y confirmación, foco visible, detalle en 1 s, vista en lista sin geometría, 320 px sin desplazamiento horizontal, áreas táctiles de 44 px y mapa sin conexión
    - _Requirements: 4.7, 4.10, 4.12, 4.18, 4.19, 6.2, 18.2, 18.8_

  - [ ]* 15.2 Escribir pruebas Playwright para la pantalla de carga y el Indicador_de_Datos
    - Verificar pantalla de carga como primer contenido, retiro a 1.5 s, sin animación con movimiento reducido, y que el indicador coincide con los bytes de un servidor local dentro del margen, sin sumar la caché ni hacer solicitudes propias
    - _Requirements: 1.9, 1.10, 1.12, 8.2, 8.12, 8.15_

  - [ ]* 15.3 Escribir el guion de demostración de extremo a extremo
    - Abrir la Página 100, ir a 101, 200 y 400, mostrar un resumen con IA verificado, seleccionar un Departamento y ver sus alertas, y consultar una página con la red desactivada, en una sola sesión
    - _Requirements: 19.2, 19.3, 19.4, 5.2, 7.2_

  - [ ]* 15.4 Escribir pruebas generales de accesibilidad y teclado
    - Teclado sin trampas, foco, zoom de 200 % sin desplazamiento horizontal a 1280 px, ARIA, nombres accesibles de estados y ausencia de llamadas del navegador a la IA
    - _Requirements: 6.2, 18.2, 18.3, 18.4, 18.5, 18.9, 15.5_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Orden obligatorio (Requisito 19.7): primero las Páginas 100 y 101, la navegación y el modo sin conexión (secciones 4, 5.8, 7 y 8.1 a 8.4). Las tareas de funciones opcionales empiezan después.
- Calendario para dos personas, según el diseño:
  - Días 1 a 2: A hace 1.2, 1.3, 2.1 y 2.6. B hace 1.1, 1.4, 3.1 y el CI.
  - Días 3 a 5: A hace 7.3, 7.5, 7.6 y 5.8. B hace 4.6, 7.1 y 8.1.
  - Día 6: A hace 7.4 y 4.1. B hace 5.11, 8.5 y 8.6.
  - Días 7 a 9: A hace 10.1 a 10.7. B hace 3.2, 5.1 y 5.14.
  - Días 10 a 11: A hace 13.1. B hace 12.1 y 12.2.
  - Días 12 a 13: A hace 14.1 a 14.3. B hace 12.3 y 12.4.
  - Días 14 a 15: A hace 14.4, 14.5 y 15.3. B hace 15.1, 15.2 y 15.4.
- La tarea 3.1 debe estar confirmada por los 2 integrantes antes del día 4. Mientras `confirmadoPorEquipo` sea `false`, `tools/geo` no genera la geometría y no se versionan datos de fuentes sin licencia revisada.
- Si hay retraso, recortar en este orden: (1) la ampliación del mapa y el ajuste fino bajo 600 px de 12.3, que deja solo la vista en lista; (2) el detalle del Indicador_de_Datos de 8.6, que deja solo el total descargado y los textos obligatorios; (3) el filtro por producto y la paginación de 13.1. Nunca se recorta la verificación de resúmenes (10.1 a 10.4), la navegación ni el modo sin conexión, ni el núcleo del mapa (12.1, 12.2 y la tabla de 12.3).
- Las propiedades 1, 2, 21, 22, 27 y 28 deben estar listas antes del día 9.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Las pruebas de propiedad validan las 38 propiedades de correctness del diseño. Las pruebas unitarias validan ejemplos y casos de borde.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.2", "4.1", "4.6", "5.1", "5.8", "5.11", "5.14", "5.16", "7.3", "10.1", "14.1", "14.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.3", "4.2", "4.3", "4.4", "4.5", "4.7", "4.8", "4.9", "4.10", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.9", "5.10", "5.12", "5.13", "5.15", "7.1", "10.2", "10.3", "14.3", "14.5"] },
    { "id": 4, "tasks": ["2.7", "2.8", "7.2", "7.4", "8.1"] },
    { "id": 5, "tasks": ["7.5", "7.6", "8.2", "8.3", "8.4", "8.5", "10.4", "12.1", "13.1", "14.4"] },
    { "id": 6, "tasks": ["7.7", "7.8", "7.9", "8.6", "10.5", "10.6", "10.7", "12.2", "13.2"] },
    { "id": 7, "tasks": ["10.8", "12.3"] },
    { "id": 8, "tasks": ["12.4", "12.5", "12.6"] },
    { "id": 9, "tasks": ["15.1", "15.2", "15.3", "15.4"] }
  ]
}
```
