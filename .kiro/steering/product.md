---
inclusion: always
---

# Producto: Teletexto 2.0

Este documento resume qué es el proyecto y por qué existe. Las fuentes de verdad son `.kiro/specs/teletexto-2-0/requirements.md`, `design.md` y `tasks.md`. Si este documento contradice a los specs, mandan los specs y debe corregirse este documento.

## Propósito

Teletexto 2.0 es una plataforma web de información pública inspirada en el teletexto tradicional. Muestra información oficial en páginas identificadas con números de tres dígitos, que el usuario consulta digitando el número. Está pensada para comunidades rurales del Perú con conectividad limitada.

## Problema que resuelve

Las comunidades rurales con poca conectividad tienen dificultad para acceder a alertas, precios agrícolas e información de salud publicados por entidades públicas. El proyecto presenta esa información en páginas livianas, legibles, consultables sin conexión una vez sincronizadas, con la fuente y las fechas siempre visibles.

## Usuarios objetivo

- Pobladores de comunidades rurales con red 2G/3G o intermitente.
- Agricultores que consultan precios de MIDAGRI.
- Usuarios con poca familiaridad con lenguaje técnico, para quienes la IA resume avisos en lenguaje sencillo.
- Usuarios con limitaciones visuales, motrices o de alfabetización (accesibilidad WCAG 2.1 AA).
- Quienes usan celular, computadora o televisor con control remoto.
- Evaluadores de la hackathon, que deben poder distinguir sin duda los datos de prueba de los oficiales.

## Funcionalidades principales (MVP)

| Página | Contenido | Fuente oficial |
|---|---|---|
| 100 | Portada y menú principal (entradas 101, 200 y 300) | n/a |
| 101 | Alertas meteorológicas y de emergencia | SENAMHI e INDECI |
| 200 | Precios agrícolas | MIDAGRI |
| 300 | Campañas e información de salud | MINSA |

Funciones transversales:

- Navegación por número de página, con teclado numérico en pantalla, teclado físico y control remoto. Acciones "Inicio" y "Atrás". Cada página tiene su propia URL.
- Interfaz adaptable de 320 px a 3840 px (celular, computadora, televisor).
- Consulta sin conexión de las páginas ya sincronizadas, con instalación como PWA.
- Cada página muestra fuente oficial, fecha de publicación y fecha de última actualización.
- Datos de prueba con la etiqueta visible "DATOS DE PRUEBA - NO OFICIAL".
- Resúmenes de avisos oficiales con IA en lenguaje sencillo (60 palabras o menos), verificados antes de publicarse. Si no se pueden verificar, se muestra el aviso original.

## Reglas de producto que los agentes deben respetar

1. **La IA no inventa ni altera información.** Un resumen solo se muestra si el Verificador lo aprobó. No se modifican cifras, fechas, horas, lugares, niveles de alerta ni recomendaciones. Ante cualquier duda, se muestra el texto original con el mensaje "Se muestra el aviso original".
2. **La IA solo resume avisos oficiales existentes.** No genera contenido nuevo.
3. **Los datos de prueba siempre se identifican** con "DATOS DE PRUEBA - NO OFICIAL", también desde la caché sin conexión y en los resúmenes derivados de ellos. Un registro sin el atributo `esDatoDePrueba` válido se trata como dato de prueba.
4. **Nunca se muestra un valor estimado.** Un precio sin dato se muestra como "Sin dato". Un metadato faltante se muestra como "No disponible".
5. **Textos de interfaz en español sencillo**, con oraciones de 25 palabras o menos.
6. **Sin cuentas de usuario y sin datos personales** para consultar las páginas.

## Objetivos y restricciones de la hackathon

- Equipo de **2 integrantes**.
- Plazo de **15 días** para un MVP funcional y demostrable de extremo a extremo.
- Aplicación **web** (PWA). Datos de prueba claramente identificados.
- Arquitectura económica (USD 20 al mes o menos), segura y escalable.
- Orden de prioridad (Requisito 18.6): primero Páginas 100 y 101, navegación y modo sin conexión; después resúmenes con IA y Verificador; al final Páginas 200 y 300, seguridad y pruebas de extremo a extremo.
- Guion de demostración: abrir 100, navegar a 101, 200 y 300, mostrar un resumen verificado y consultar una página con la red desactivada.
- Si hay retraso, se recorta primero el filtro de precios y la paginación de salud. Nunca se recorta la verificación de resúmenes.

## Fuera de alcance (no implementar)

- Integración con DIRECTV o cualquier transmisión por televisión.
- Aplicaciones móviles nativas.
- Conexión en tiempo real con las APIs oficiales (el MVP usa datos de prueba).
- Cuentas de usuario, notificaciones push, SMS o WhatsApp.
- Idiomas distintos del español, incluidos quechua y aimara.
- Audio, voz o lectura en voz alta.
- Contenido nuevo generado por IA.
- Páginas distintas de 100, 101, 200 y 300.
- Panel de administración completo (la carga de contenido se hace con archivos de datos).

## Flujo de trabajo

- Se trabaja con Spec-Driven Development. No se agregan funcionalidades que no estén en los specs. Si algo falta o es ambiguo, se propone un cambio al spec y se pide aprobación al equipo antes de implementarlo.
- Las tareas se ejecutan según `tasks.md`. Los agentes no modifican los documentos de `.kiro/specs/` salvo petición expresa.