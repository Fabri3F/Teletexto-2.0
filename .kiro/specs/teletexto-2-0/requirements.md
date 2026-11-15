# Requirements Document

## Introduction

Teletexto 2.0 es una plataforma web de información pública inspirada en el teletexto tradicional. Está pensada para comunidades rurales del Perú con conectividad limitada. Presenta información oficial de SENAMHI, INDECI y MIDAGRI en páginas identificadas con números de tres dígitos, navegables mediante teclado numérico, y consultables sin conexión una vez sincronizadas.

El MVP se desarrolla en 15 días por dos integrantes para una hackathon en Perú. Usa datos de prueba claramente identificados. Una capa de inteligencia artificial resume avisos oficiales en lenguaje sencillo, sin alterar cifras, fechas ni recomendaciones, y muestra el contenido original cuando no puede verificar el resumen.

## Glossary

- **Sistema**: La plataforma web Teletexto 2.0 en su conjunto (cliente y servicios de respaldo).
- **Cliente_Web**: Aplicación web (PWA) que se ejecuta en el navegador del usuario.
- **Servicio_Contenido**: Componente de servidor que almacena y entrega las páginas y sus metadatos.
- **Página**: Unidad de contenido identificada por un número de tres dígitos (por ejemplo, 100, 101, 200, 300).
- **Número_de_Página**: Identificador numérico de tres dígitos de una Página.
- **Portada**: Página 100, que muestra el menú principal.
- **Página_Alertas**: Página 101, con alertas meteorológicas y de emergencia de SENAMHI e INDECI.
- **Página_Precios**: Página 200, con precios agrícolas de MIDAGRI.
- **Página_Salud**: Página 300, con campañas e información de salud del MINSA.
- **Fuente_Oficial**: Entidad pública que origina el contenido (SENAMHI, INDECI, MIDAGRI o MINSA).
- **Metadatos_de_Página**: Fuente oficial, fecha de publicación y fecha de última actualización de una Página.
- **Dato_de_Prueba**: Contenido ficticio o simulado usado en el MVP, no proveniente de una Fuente_Oficial en tiempo real.
- **Etiqueta_de_Prueba**: Indicador visible que identifica una Página o elemento como Dato_de_Prueba.
- **Aviso_Oficial**: Texto publicado por una Fuente_Oficial que puede ser resumido.
- **Resumidor_IA**: Componente que genera un resumen en lenguaje sencillo de un Aviso_Oficial.
- **Verificador**: Componente que comprueba que un resumen conserva fielmente las cifras, fechas, ubicaciones y recomendaciones del Aviso_Oficial.
- **Datos_Críticos**: Cifras, fechas, horas, nombres de lugares, niveles de alerta y recomendaciones presentes en un Aviso_Oficial.
- **Caché_Local**: Almacenamiento del Cliente_Web con las Páginas sincronizadas para consulta sin conexión.
- **Sincronización**: Proceso por el cual el Cliente_Web descarga Páginas y las guarda en la Caché_Local.
- **Conectividad_Limitada**: Condición de red de 2G/3G o equivalente, con ancho de banda de hasta 400 kbps o con interrupciones frecuentes.

## Requirements

### Requirement 1: Portada y menú principal (Página 100)

**User Story:** Como poblador de una comunidad rural, quiero ver una portada con el menú de páginas disponibles, para saber qué información puedo consultar y qué número digitar.

#### Acceptance Criteria

1. WHEN el usuario abre el Cliente_Web sin indicar un Número_de_Página, THE Cliente_Web SHALL mostrar la Portada (Página 100) en un máximo de 2 segundos.
2. THE Portada SHALL listar exactamente tres entradas de menú, correspondientes a las Páginas 101, 200 y 300, y cada entrada SHALL mostrar el nombre de la Página (máximo 40 caracteres) y su Número_de_Página de 3 dígitos.
3. WHEN el usuario selecciona una entrada del menú de la Portada, THE Cliente_Web SHALL mostrar la Página correspondiente en un máximo de 2 segundos.
4. WHILE el contenido del Sistema provenga de Dato_de_Prueba, THE Portada SHALL mostrar la Etiqueta_de_Prueba.
5. IF la Página seleccionada desde el menú no se puede cargar, THEN THE Cliente_Web SHALL mantener visible la Portada y mostrar un mensaje de error que indique que la Página no está disponible.
6. IF el usuario abre el Cliente_Web indicando un Número_de_Página que no existe en el Sistema, THEN THE Cliente_Web SHALL mostrar un mensaje de error que indique que la Página no existe y SHALL ofrecer una acción para volver a la Portada.

### Requirement 2: Alertas meteorológicas y de emergencia (Página 101)

**User Story:** Como poblador rural, quiero consultar alertas meteorológicas y de emergencia de SENAMHI e INDECI, para tomar precauciones ante heladas, lluvias u otros peligros.

#### Acceptance Criteria

1. WHEN el usuario solicita la Página 101, THE Cliente_Web SHALL mostrar, en un plazo máximo de 3 segundos, la lista de alertas vigentes, con un máximo de 50 alertas, y cada alerta SHALL incluir título (máximo 100 caracteres), nivel de alerta, zona afectada y Fuente_Oficial.
2. THE Página_Alertas SHALL ordenar las alertas por nivel de severidad, de mayor a menor, y dentro de cada nivel por fecha de publicación, de la más reciente a la más antigua.
3. WHERE una alerta tiene el nivel de severidad más alto de la escala de la Fuente_Oficial, THE Página_Alertas SHALL destacarla con un color de resaltado y con el texto del nivel de alerta visible en la propia alerta, de modo que el destacado no dependa solo del color.
4. IF no existen alertas vigentes, THEN THE Página_Alertas SHALL mostrar el mensaje "No hay alertas vigentes" junto con la fecha y hora de la última actualización exitosa de las alertas.
5. THE Página_Alertas SHALL identificar cada alerta como proveniente de SENAMHI o de INDECI, mostrando el nombre de la fuente en la propia alerta.
6. IF las alertas no se pueden obtener del Servicio_Contenido en un plazo de 10 segundos, THEN THE Página_Alertas SHALL mostrar un mensaje de error que indique que las alertas no están disponibles, conservar y mostrar las últimas alertas obtenidas con éxito, si existen, junto con su fecha y hora de actualización, y permitir al usuario reintentar la consulta.
7. IF el contenido de solo una de las dos fuentes (SENAMHI o INDECI) no está disponible, THEN THE Página_Alertas SHALL mostrar las alertas de la fuente disponible e indicar el nombre de la fuente cuyo contenido no está disponible.

### Requirement 3: Precios agrícolas (Página 200)

**User Story:** Como agricultor, quiero consultar los precios agrícolas publicados por MIDAGRI, para decidir cuándo y dónde vender mis productos.

#### Acceptance Criteria

1. WHEN el usuario solicita la Página 200, THE Cliente_Web SHALL mostrar en un máximo de 3 segundos una tabla con las columnas producto, mercado, unidad de medida, precio en soles y fecha del precio, con un máximo de 20 registros por página de la tabla.
2. THE Página_Precios SHALL mostrar cada precio en soles peruanos con el prefijo "S/", separador decimal punto y exactamente dos decimales (por ejemplo, "S/ 2.50").
3. WHEN el usuario aplica un filtro por producto, THE Página_Precios SHALL mostrar solo los registros cuyo producto coincide con el producto seleccionado, en un máximo de 2 segundos.
4. IF el filtro por producto no coincide con ningún registro, THEN THE Página_Precios SHALL mostrar un mensaje indicando que no hay registros para el producto seleccionado y conservar el filtro aplicado.
5. IF un producto no tiene precio registrado para la fecha vigente, THEN THE Página_Precios SHALL mostrar "Sin dato" en la columna de precio de ese producto y no mostrar ningún valor estimado ni el precio de otra fecha.
6. IF los datos de precios no están disponibles en el Servicio_Contenido o la solicitud supera 10 segundos, THEN THE Cliente_Web SHALL mostrar un mensaje de error indicando que los precios no pudieron cargarse y ofrecer la opción de reintentar.

### Requirement 4: Campañas e información de salud (Página 300)

**User Story:** Como poblador rural, quiero consultar campañas e información de salud del MINSA, para conocer cuándo y dónde puedo acceder a atención y prevención.

#### Acceptance Criteria

1. WHEN el usuario solicita la Página 300, THE Cliente_Web SHALL mostrar, en un plazo máximo de 3 segundos, la lista de campañas e información de salud ordenada por fecha de inicio ascendente, con un máximo de 20 elementos por página, y para cada elemento el título (máximo 80 caracteres), la descripción (máximo 300 caracteres), la fecha de inicio y la fecha de fin de la campaña en formato DD/MM/AAAA, y la ubicación o cobertura (máximo 100 caracteres).
2. WHEN la lista de la Página 300 contiene más de 20 elementos, THE Cliente_Web SHALL mostrar los primeros 20 elementos junto con un control de navegación para acceder a los elementos restantes en páginas de hasta 20 elementos.
3. THE Página_Salud SHALL mostrar el texto "MINSA" como Fuente_Oficial en cada elemento de la lista.
4. IF no existen campañas cuya fecha de fin sea igual o posterior a la fecha actual, THEN THE Página_Salud SHALL mostrar el mensaje "No hay campañas vigentes" junto con la fecha y hora de la última actualización en formato DD/MM/AAAA HH:MM.
5. IF la Página_Salud no puede obtener los datos de campañas o la solicitud supera los 10 segundos, THEN THE Cliente_Web SHALL mostrar un mensaje de error que indique que la información de salud no está disponible, junto con la opción de reintentar, y conservar visibles los datos previamente mostrados si existen.

### Requirement 5: Navegación por número de página

**User Story:** Como usuario, quiero navegar digitando números de página, para moverme por el contenido como en el teletexto tradicional.

#### Acceptance Criteria

1. THE Cliente_Web SHALL ofrecer un teclado numérico en pantalla con los dígitos del 0 al 9 y aceptar entrada de dígitos desde el teclado físico o el control remoto.
2. WHEN el usuario ingresa tres dígitos que corresponden a una Página existente que está en la Caché_Local, THE Cliente_Web SHALL mostrar esa Página en un máximo de 1 segundo desde el tercer dígito ingresado.
3. WHEN el usuario ingresa tres dígitos que corresponden a una Página existente que no está en la Caché_Local, THE Cliente_Web SHALL mostrar esa Página en un máximo de 3 segundos desde el tercer dígito ingresado.
4. IF el usuario ingresa tres dígitos que no corresponden a ninguna Página existente, THEN THE Cliente_Web SHALL mostrar el mensaje "Página no encontrada" junto con una opción para volver a la Portada, y conservar visible la Página mostrada antes de la entrada.
5. IF la Página solicitada no puede obtenerse en 3 segundos porque falla la red o el servidor, THEN THE Cliente_Web SHALL mostrar un mensaje que indique el fallo de carga y una opción para reintentar, y conservar visible la Página mostrada antes de la entrada.
6. WHEN el usuario activa la acción "Inicio" o ingresa 100, THE Cliente_Web SHALL mostrar la Portada en un máximo de 1 segundo si está en la Caché_Local.
7. WHEN el usuario activa la acción "Atrás" y existe una Página anterior en el historial de la sesión, THE Cliente_Web SHALL mostrar la Página consultada inmediatamente antes.
8. IF el usuario activa la acción "Atrás" y no existe una Página anterior en el historial de la sesión, THEN THE Cliente_Web SHALL mantener la Página actual sin cambios.
9. WHILE el usuario ha ingresado uno o dos dígitos, THE Cliente_Web SHALL mostrar los dígitos ingresados en la pantalla, con los dígitos faltantes representados por un marcador de posición, hasta que se complete el tercer dígito o el usuario cancele la entrada.
10. WHEN el usuario cancela la entrada de dígitos o transcurren 5 segundos sin ingresar un nuevo dígito, THE Cliente_Web SHALL descartar los dígitos ingresados y mostrar nuevamente el Número_de_Página de la Página actual.
11. THE Cliente_Web SHALL asignar a cada Página una URL propia basada en su Número_de_Página, para permitir acceso directo y compartir enlaces.
12. WHEN el usuario abre una URL de una Página existente, THE Cliente_Web SHALL mostrar esa Página.
13. IF el usuario abre una URL que corresponde a un Número_de_Página inexistente, THEN THE Cliente_Web SHALL mostrar el mensaje "Página no encontrada" con la opción de volver a la Portada.

### Requirement 6: Interfaz adaptable a celulares, computadoras y televisores

**User Story:** Como usuario, quiero usar el Sistema desde un celular, una computadora o un televisor, para consultar la información con el dispositivo que tenga disponible.

#### Acceptance Criteria

1. THE Cliente_Web SHALL ajustar su diseño a anchos de pantalla desde 320 px hasta 3840 px sin desplazamiento horizontal del contenido principal.
2. WHERE el dispositivo es un televisor o se navega con control remoto, THE Cliente_Web SHALL permitir toda la navegación con teclas direccionales, teclas numéricas y la tecla de confirmación.
3. WHILE el ancho de pantalla es de 1280 px o más, THE Cliente_Web SHALL usar un tamaño de texto base de al menos 24 px para lectura a distancia.
4. WHILE el ancho de pantalla es menor a 600 px, THE Cliente_Web SHALL mostrar los controles táctiles con un área mínima de 44 por 44 px.
5. THE Cliente_Web SHALL mantener un estilo visual inspirado en el teletexto, con cuadrícula de texto, una relación de contraste de al menos 7:1 entre texto y fondo, y un encabezado con Número_de_Página visible en todas las páginas.
6. WHEN el usuario presiona una tecla direccional con el control remoto, THE Cliente_Web SHALL mover el foco al siguiente elemento interactivo en esa dirección y mostrar un indicador de foco visible en un máximo de 100 ms.
7. WHEN el usuario ingresa un Número_de_Página de 3 dígitos con las teclas numéricas y presiona la tecla de confirmación, THE Cliente_Web SHALL mostrar la página solicitada.
8. IF el usuario ingresa un Número_de_Página que no existe, THEN THE Cliente_Web SHALL mantener la página actual y mostrar un mensaje que indique que la página no existe.
9. IF el ancho de pantalla es menor a 320 px, THEN THE Cliente_Web SHALL mantener el diseño del ancho de 320 px y permitir el desplazamiento horizontal.
10. IF el ancho de pantalla es mayor a 3840 px, THEN THE Cliente_Web SHALL mantener el diseño del ancho de 3840 px centrado en la pantalla.

### Requirement 7: Consulta sin conexión

**User Story:** Como poblador de una zona con conexión intermitente, quiero consultar páginas ya descargadas sin internet, para acceder a la información aunque no tenga señal.

#### Acceptance Criteria

1. WHEN el Cliente_Web detecta que tiene conexión, THE Cliente_Web SHALL sincronizar las Páginas 100, 101, 200 y 300 y guardarlas en la Caché_Local en un plazo máximo de 30 segundos desde que detecta la conexión.
2. WHILE el Cliente_Web no tiene conexión, THE Cliente_Web SHALL mostrar las Páginas guardadas en la Caché_Local en un plazo máximo de 1 segundo desde la solicitud del usuario.
3. WHILE el Cliente_Web no tiene conexión, THE Cliente_Web SHALL mostrar un indicador de modo sin conexión y la fecha y hora de la última Sincronización exitosa de la Página mostrada, en formato día/mes/año hh:mm de 24 horas en la zona horaria del dispositivo.
4. IF el usuario solicita sin conexión una Página que no está en la Caché_Local, THEN THE Cliente_Web SHALL mostrar un mensaje que indique que la Página no fue sincronizada y la lista de las Páginas disponibles sin conexión, identificadas por su número, y conservar en pantalla la Página mostrada anteriormente como disponible mediante la lista.
5. WHEN el Cliente_Web recupera la conexión, THE Cliente_Web SHALL actualizar la Caché_Local en segundo plano en un plazo máximo de 30 segundos, sin interrumpir la lectura de la Página mostrada, sin recargarla ni cambiar su contenido visible hasta que el usuario navegue a otra Página o la vuelva a solicitar.
6. IF una Sincronización falla por error de red, respuesta inválida o tiempo de espera superior a 10 segundos, THEN THE Cliente_Web SHALL conservar sin modificación la versión anterior de la Página en la Caché_Local y reintentar la Sincronización hasta 3 veces, con un intervalo mínimo de 30 segundos entre intentos.
7. IF los 3 reintentos de Sincronización de una Página fallan, THEN THE Cliente_Web SHALL mantener la fecha y hora de la última Sincronización exitosa de esa Página sin cambios y mostrar un aviso de que la Página no se pudo actualizar.
8. WHEN el Cliente_Web se abre por primera vez con conexión, THE Cliente_Web SHALL cumplir los requisitos del navegador para ofrecer la instalación como aplicación en el dispositivo, y SHALL permitir iniciar la instalación mediante la función de instalación del navegador.

### Requirement 8: Transparencia de fuente y fechas

**User Story:** Como usuario, quiero ver la fuente oficial, la fecha de publicación y la última actualización de cada información, para evaluar si es confiable y vigente.

#### Acceptance Criteria

1. WHEN el usuario abre una Página, THE Cliente_Web SHALL mostrar en esa Página la Fuente_Oficial, la fecha de publicación y la fecha de última actualización, dentro de los 1000 ms posteriores a la visualización del contenido de la Página.
2. WHEN el Cliente_Web muestra una fecha, THE Cliente_Web SHALL presentarla en formato DD/MM/AAAA HH:mm (reloj de 24 horas) con la hora local de Perú (UTC-5), convirtiendo desde UTC cualquier fecha recibida en otra zona horaria.
3. IF una Página carece de la Fuente_Oficial, de la fecha de publicación o de la fecha de última actualización, o si el valor recibido está vacío o no es una fecha válida, THEN THE Cliente_Web SHALL mostrar el texto "No disponible" en cada campo afectado y SHALL mostrar los demás campos sin modificación.
4. WHERE el elemento mostrado proviene de un Aviso_Oficial, THE Cliente_Web SHALL mostrar un enlace al documento oficial original que se abra en una pestaña nueva, o, si el documento no tiene URL, una referencia textual con el título y el identificador del documento, de máximo 200 caracteres.
5. IF un Aviso_Oficial no tiene enlace ni referencia al documento oficial original, THEN THE Cliente_Web SHALL mostrar el texto "No disponible" en el lugar del enlace.
6. WHEN el Servicio_Contenido guarda o actualiza una Página, THE Servicio_Contenido SHALL almacenar los Metadatos_de_Página junto con esa Página como una sola operación, de modo que si falla el almacenamiento de cualquiera de los dos no se conserve ninguno.
7. WHEN el Servicio_Contenido responde una solicitud de una Página, THE Servicio_Contenido SHALL incluir en la respuesta los Metadatos_de_Página de esa Página, con las fechas en formato UTC ISO 8601.

### Requirement 9: Identificación clara de datos de prueba

**User Story:** Como evaluador de la hackathon y como usuario, quiero que los datos de prueba estén claramente identificados, para no confundirlos con información oficial real.

#### Acceptance Criteria

1. WHILE el contenido de una Página sea Dato_de_Prueba, THE Cliente_Web SHALL mostrar la Etiqueta_de_Prueba con el texto exacto "DATOS DE PRUEBA - NO OFICIAL" en la primera línea visible de esa Página, antes de cualquier otro contenido de la Página.
2. THE Servicio_Contenido SHALL incluir en cada registro un atributo booleano que indique si es Dato_de_Prueba, con valor verdadero o falso y sin valores nulos ni ausentes.
3. IF un registro no contiene el atributo de Dato_de_Prueba o este tiene un valor distinto de verdadero o falso, THEN THE Servicio_Contenido SHALL tratar el registro como Dato_de_Prueba.
4. WHEN la Página con Dato_de_Prueba se consulta desde la Caché_Local, THE Cliente_Web SHALL mostrar la Etiqueta_de_Prueba con el mismo texto y en la misma posición que en una consulta al Servicio_Contenido.
5. WHEN el Cliente_Web muestra un resumen generado a partir de un Aviso_Oficial que es Dato_de_Prueba, THE Cliente_Web SHALL incluir la Etiqueta_de_Prueba con el texto exacto "DATOS DE PRUEBA - NO OFICIAL" en la primera línea del resumen.
6. WHERE el Sistema se configura para usar datos reales, THE Cliente_Web SHALL ocultar la Etiqueta_de_Prueba en los registros cuyo atributo de Dato_de_Prueba sea falso y SHALL mantenerla visible en los registros cuyo atributo sea verdadero.

### Requirement 10: Resumen de avisos con IA en lenguaje sencillo

**User Story:** Como poblador con poca familiaridad con lenguaje técnico, quiero que los avisos oficiales se expliquen en lenguaje sencillo, para entenderlos y actuar a tiempo.

#### Acceptance Criteria

1. WHEN un Aviso_Oficial se publica o actualiza en el Servicio_Contenido, THE Resumidor_IA SHALL generar un resumen en español en lenguaje sencillo dentro de los 60 segundos siguientes a la publicación o actualización.
2. THE Resumidor_IA SHALL generar cada resumen con una extensión de entre 1 y 60 palabras.
3. THE Resumidor_IA SHALL basar el resumen exclusivamente en el texto del Aviso_Oficial recibido, sin incluir datos (fechas, cifras, lugares, nombres o instrucciones) que no aparezcan en dicho texto.
4. WHEN el Cliente_Web muestra un resumen, THE Cliente_Web SHALL mostrarlo con la etiqueta "Resumen generado con IA" y con un enlace de acceso al texto original completo del Aviso_Oficial en la misma pantalla.
5. WHEN un usuario consulta un Aviso_Oficial, THE Servicio_Contenido SHALL entregar el resumen previamente almacenado sin invocar al Resumidor_IA durante la consulta.
6. IF el Resumidor_IA no genera un resumen válido (error, tiempo de espera superior a 30 segundos o resumen de más de 60 palabras), THEN THE Servicio_Contenido SHALL reintentar la generación hasta 2 veces, y si todos los intentos fallan, SHALL registrar el fallo y publicar el Aviso_Oficial sin resumen.
7. WHILE un Aviso_Oficial no tiene resumen almacenado, THE Cliente_Web SHALL mostrar el texto original completo del Aviso_Oficial sin la etiqueta "Resumen generado con IA".
8. WHEN un Aviso_Oficial se actualiza, THE Servicio_Contenido SHALL reemplazar el resumen almacenado por el nuevo resumen solo cuando este se haya generado y verificado correctamente, y conservar el resumen anterior hasta entonces.

### Requirement 11: Verificación de resúmenes y respaldo al contenido original

**User Story:** Como usuario, quiero que la IA no invente ni modifique información crítica, para confiar en lo que leo.

#### Acceptance Criteria

1. WHEN el Resumidor_IA genera un resumen, THE Verificador SHALL comparar cada uno de los Datos_Críticos del resumen (cifras, fechas, horas, lugares, niveles de alerta y recomendaciones o instrucciones de seguridad) con los del Aviso_Oficial y completar la verificación en un máximo de 5 segundos.
2. IF el resumen contiene una cifra, fecha, hora, lugar o nivel de alerta que no aparece en el Aviso_Oficial, THEN THE Verificador SHALL rechazar el resumen y registrar como motivo de rechazo el tipo de dato crítico añadido.
3. IF el resumen omite una o más recomendaciones o instrucciones de seguridad presentes en el Aviso_Oficial, THEN THE Verificador SHALL rechazar el resumen y registrar como motivo de rechazo la omisión de la recomendación o instrucción.
4. IF el resumen contiene una cifra o fecha cuyo valor difiere del valor de la misma cifra o fecha en el Aviso_Oficial (incluida cualquier diferencia de unidad, signo, día, mes o año), THEN THE Verificador SHALL rechazar el resumen y registrar como motivo de rechazo la modificación del valor.
5. IF el Verificador rechaza un resumen, o la verificación no se completa por error o por superar los 5 segundos, THEN THE Sistema SHALL mostrar el texto original completo del Aviso_Oficial en lugar del resumen, no mostrar ninguna parte del resumen rechazado y registrar el estado del resumen como "rechazado" o "no verificado" según corresponda.
6. IF el servicio de IA no responde en 10 segundos o devuelve un error, THEN THE Servicio_Contenido SHALL aplicar la política de reintentos del Requisito 10 y, si no obtiene un resumen, publicar el Aviso_Oficial sin resumen, registrando el estado "no verificado" con el motivo "servicio de IA no disponible".
7. WHEN el Cliente_Web muestra el texto original por falta de resumen verificado, THE Cliente_Web SHALL mostrar el mensaje "Se muestra el aviso original" en una posición visible junto al texto original, y no mostrar ningún resumen.
8. WHEN el Verificador termina la verificación de un resumen, THE Servicio_Contenido SHALL registrar el estado de verificación (aprobado, rechazado o no verificado), el motivo del rechazo (obligatorio si el estado es rechazado, con un máximo de 500 caracteres) y la fecha y hora de verificación en formato UTC con precisión de segundos.
9. FOR ALL Avisos_Oficiales con un resumen aprobado, el conjunto de Datos_Críticos del resumen SHALL ser un subconjunto exacto del conjunto de Datos_Críticos del Aviso_Oficial, sin diferencias de valor, unidad ni formato, y el resumen SHALL incluir el 100% de las recomendaciones e instrucciones de seguridad del Aviso_Oficial (propiedad de invariante).

### Requirement 12: Ingesta y modelo de contenido

**User Story:** Como integrante del equipo, quiero un formato de contenido estructurado y validado, para cargar datos de prueba hoy y conectar fuentes reales después.

#### Acceptance Criteria

1. WHEN el Servicio_Contenido inicia o recibe una solicitud de recarga, THE Servicio_Contenido SHALL cargar el contenido de las Páginas desde archivos de datos JSON y validar cada archivo contra el esquema definido, con un tamaño máximo de 1 MB por archivo.
2. WHEN se carga un archivo de datos que cumple el esquema, THE Parser_de_Contenido SHALL convertirlo en objetos Página, cada uno con todos sus Metadatos_de_Página, y reemplazar el contenido anterior por el nuevo contenido en una sola operación, de modo que ningún Cliente_Web reciba contenido parcial.
3. IF un archivo de datos no cumple el esquema, no es JSON válido, está vacío o supera 1 MB, THEN THE Parser_de_Contenido SHALL rechazar el archivo completo, devolver un mensaje de error que indique el nombre del archivo, el campo inválido (o la causa, si no hay campo identificable) y la regla incumplida, y conservar sin cambios el contenido cargado anteriormente.
4. WHEN se solicita serializar un objeto Página válido, THE Pretty_Printer SHALL producir un archivo de datos JSON codificado en UTF-8 que cumpla el esquema definido.
5. FOR ALL objetos Página válidos, THE Parser_de_Contenido SHALL producir un objeto igual al original (comparación campo por campo, incluidos los Metadatos_de_Página) al parsear la salida del Pretty_Printer, y el Pretty_Printer SHALL producir un texto idéntico al volver a imprimir ese objeto (propiedad de ida y vuelta: parsear, imprimir, parsear).
6. THE Servicio_Contenido SHALL aislar la lectura de cada Fuente_Oficial detrás de una interfaz de conector única, de modo que sustituir el conector de datos de prueba por el de una fuente real no requiera ningún cambio en el código ni en la configuración del Cliente_Web.
7. IF un conector de Fuente_Oficial no devuelve datos en 10 segundos o devuelve un error, THEN THE Servicio_Contenido SHALL registrar la falla con la identificación de la fuente, conservar el último contenido válido cargado y notificar el error a quien solicitó la carga.

### Requirement 13: Rendimiento con conectividad limitada

**User Story:** Como usuario con conexión lenta, quiero que el Sistema cargue rápido y use pocos datos, para poder usarlo con mi plan y señal.

#### Acceptance Criteria

1. WHILE la red es de Conectividad_Limitada, WHEN el usuario solicita una Página no sincronizada, THE Cliente_Web SHALL mostrar el contenido de la Página en un máximo de 5 segundos desde la solicitud hasta que el texto completo de la Página es visible.
2. THE Cliente_Web SHALL limitar la carga inicial (HTML, CSS, JavaScript y fuentes) a un máximo de 150 KB transferidos y comprimidos, medidos en la primera visita con Caché_Local vacía.
3. THE Servicio_Contenido SHALL entregar cada Página con un tamaño máximo de 20 KB comprimidos, incluyendo el contenido y los metadatos de la respuesta.
4. THE Cliente_Web SHALL representar las Páginas usando texto y gráficos ligeros, y SHALL NOT cargar ninguna imagen de más de 10 KB transferidos por Página.
5. WHEN el usuario solicita una Página ya sincronizada cuyo contenido no cambió, THE Servicio_Contenido SHALL responder mediante validación de caché sin reenviar el contenido de la Página, con un cuerpo de respuesta de 0 bytes.
6. IF una solicitud de red falla por interrupción, THEN THE Cliente_Web SHALL reintentar hasta 3 veces con esperas crecientes de 1, 2 y 4 segundos entre intentos.
7. IF los 3 reintentos fallan y existe una versión de la Página en la Caché_Local, THEN THE Cliente_Web SHALL mostrar la versión de la Caché_Local e indicar que el contenido puede estar desactualizado.
8. IF los 3 reintentos fallan y no existe una versión de la Página en la Caché_Local, THEN THE Cliente_Web SHALL mostrar un mensaje de error que indique que no hay conexión ni contenido guardado, y SHALL permitir al usuario reintentar manualmente.

### Requirement 14: Seguridad

**User Story:** Como equipo responsable de la plataforma, queremos proteger el Sistema y a sus usuarios, para evitar la manipulación de la información pública.

#### Acceptance Criteria

1. THE Sistema SHALL servir el 100% de las respuestas del Cliente_Web y del Servicio_Contenido mediante HTTPS.
2. IF una solicitud HTTP plana (sin cifrado) llega al Sistema, THEN THE Sistema SHALL redirigirla a la URL equivalente con HTTPS o rechazarla, sin devolver contenido de las Páginas por HTTP.
3. WHEN un usuario envía una solicitud de creación, edición o eliminación de contenido, THE Servicio_Contenido SHALL ejecutar la operación solo si la solicitud incluye una credencial válida y no expirada de un usuario con rol de administrador.
4. THE Sistema SHALL mantener las claves de la IA y otros secretos fuera del código fuente y del Cliente_Web, en variables de entorno o un gestor de secretos.
5. THE Cliente_Web SHALL invocar al Resumidor_IA solo a través del Servicio_Contenido, sin ninguna solicitud directa desde el navegador al Resumidor_IA.
6. WHEN el Sistema recibe contenido de texto de las fuentes, THE Sistema SHALL escapar o sanear el contenido antes de mostrarlo, de modo que las etiquetas de script y los atributos de eventos HTML se presenten como texto o se eliminen y no se ejecuten.
7. THE Sistema SHALL incluir en el 100% de las respuestas HTTP del Cliente_Web una política de seguridad de contenido (CSP) que prohíba scripts en línea y solo permita scripts del propio origen, además de las cabeceras X-Content-Type-Options, X-Frame-Options (o la directiva equivalente frame-ancestors) y Strict-Transport-Security.
8. IF una misma dirección IP envía más de 60 solicitudes en una ventana de 60 segundos a los puntos de consulta pública, THEN THE Servicio_Contenido SHALL rechazar las solicitudes excedentes con un código 429 e incluir el tiempo de espera en segundos antes de poder reintentar, hasta que la ventana se reinicie.
9. THE Sistema SHALL permitir consultar las Páginas sin cuenta de usuario y sin almacenar datos personales (nombre, correo electrónico, dirección IP asociada a un perfil o identificadores de seguimiento de terceros).
10. IF se recibe una solicitud de modificación de contenido sin credencial válida o de un usuario sin rol de administrador, THEN THE Servicio_Contenido SHALL rechazar la solicitud con un código 401 (credencial ausente o inválida) o 403 (rol insuficiente), dejar el contenido sin cambios y registrar el intento con fecha y hora, dirección IP y recurso solicitado.

### Requirement 15: Costo

**User Story:** Como equipo con presupuesto limitado, queremos una arquitectura económica, para sostener el MVP sin gasto significativo.

#### Acceptance Criteria

1. WHILE el Sistema opera para la demostración de la hackathon, THE Sistema SHALL mantener el costo total facturado de todos sus componentes en un máximo de USD 20 por mes calendario, usando únicamente niveles gratuitos o planes de pago.
2. WHEN un cliente solicita contenido público, THE Servicio_Contenido SHALL responder desde archivos estáticos o desde respuestas almacenadas en la caché de una red de distribución de contenido (CDN), sin ejecutar cómputo bajo demanda por solicitud.
3. WHEN se publica un Aviso_Oficial nuevo o se actualiza el contenido de un Aviso_Oficial existente, THE Resumidor_IA SHALL generar el resumen exactamente una vez y almacenarlo asociado a ese Aviso_Oficial.
4. WHEN se consulta un Aviso_Oficial cuyo contenido no cambió desde la última generación de su resumen, THE Servicio_Contenido SHALL devolver el resumen almacenado sin invocar al Resumidor_IA.
5. IF la generación de un resumen falla, THEN THE Resumidor_IA SHALL reintentar como máximo 2 veces, y si todos los intentos fallan, THE Sistema SHALL conservar el Aviso_Oficial sin resumen y registrar el fallo para su revisión, sin generar más invocaciones al Resumidor_IA para ese Aviso_Oficial hasta su próxima actualización.
6. THE Sistema SHALL documentar el costo mensual estimado en USD de cada componente de la arquitectura, junto con el total, que debe ser menor o igual a USD 20, y la suposición de volumen de uso (número de solicitudes mensuales y de resúmenes generados) en que se basa la estimación.

### Requirement 16: Escalabilidad

**User Story:** Como equipo, queremos que la arquitectura crezca después de la hackathon, para incorporar más páginas, fuentes y usuarios sin rediseñarla.

#### Acceptance Criteria

1. THE Sistema SHALL exponer el Cliente_Web, el Servicio_Contenido y el Resumidor_IA como componentes separados que se comunican únicamente a través de interfaces documentadas, de modo que cada componente pueda desplegarse y reemplazarse sin modificar el código de los otros dos.
2. WHEN se agrega una nueva Página con su Número_de_Página mediante datos y configuración, THE Sistema SHALL mostrar la Página al ingresar su Número_de_Página en el Cliente_Web sin modificar el código del mecanismo de navegación.
3. IF la configuración de una nueva Página tiene un Número_de_Página duplicado o que no es un número de tres dígitos entre 100 y 999, THEN THE Sistema SHALL rechazar la configuración, indicar el motivo del rechazo y conservar las Páginas existentes sin cambios.
4. WHILE hay hasta 1000 usuarios concurrentes consultando Páginas públicas, THE Sistema SHALL cumplir los tiempos de respuesta del Requisito 13 y responder correctamente al menos el 99% de las solicitudes mediante caché y distribución estática.
5. THE Servicio_Contenido SHALL no conservar en memoria del servidor ningún estado de sesión ni de usuario entre solicitudes, de modo que cualquier instancia responda de forma idéntica a la misma solicitud.
6. WHEN se ejecutan 2 o más instancias del Servicio_Contenido simultáneamente, THE Sistema SHALL atender cada solicitud con éxito sin importar qué instancia la reciba.

### Requirement 17: Accesibilidad

**User Story:** Como usuario con limitaciones visuales, motrices o de alfabetización, quiero una interfaz accesible, para poder usar el Sistema con autonomía.

#### Acceptance Criteria

1. THE Cliente_Web SHALL cumplir una relación de contraste de color de al menos 4.5:1 entre texto normal y fondo, y de al menos 3:1 entre texto grande (18 pt o más, o 14 pt o más en negrita) y fondo, según WCAG 2.1 nivel AA.
2. THE Cliente_Web SHALL permitir ejecutar el 100 % de las funciones disponibles con ratón mediante teclado únicamente, sin trampas de foco.
3. WHILE un elemento interactivo tiene el foco del teclado, THE Cliente_Web SHALL mostrar un indicador de foco visible con contraste de al menos 3:1 respecto a los colores adyacentes y un grosor mínimo de 2 px.
4. WHEN una página de teletexto se muestra, THE Cliente_Web SHALL exponer mediante etiquetas semánticas y atributos ARIA el Número_de_Página, el título y los Metadatos_de_Página, de modo que un lector de pantalla los anuncie en ese orden.
5. WHEN el usuario amplía el texto hasta 200 % mediante la configuración del navegador, THE Cliente_Web SHALL mostrar todo el contenido y mantener operables todas las funciones, sin desplazamiento horizontal en un ancho de ventana de 1280 px.
6. WHEN una alerta se muestra, THE Cliente_Web SHALL indicar su nivel mediante una etiqueta de texto y un icono distintos para cada nivel, además del color.
7. THE Cliente_Web SHALL redactar los textos de interfaz en español con oraciones de máximo 25 palabras.

### Requirement 18: Alcance del MVP y restricciones del proyecto

**User Story:** Como equipo de dos integrantes con 15 días, queremos un alcance acotado, para entregar un MVP funcional y demostrable en la hackathon.

#### Acceptance Criteria

1. WHEN transcurren 15 días calendario desde el inicio del proyecto, THE Sistema SHALL estar desplegado como aplicación web accesible desde un navegador, con las Páginas 100, 101, 200 y 300 disponibles.
2. THE Sistema SHALL incluir en el MVP exactamente las Páginas 100, 101, 200 y 300, y cada una SHALL mostrar al menos un registro de Dato_de_Prueba.
3. WHEN el Equipo ejecuta la demostración, THE Sistema SHALL completar sin intervención manual fuera del guion, en una sola sesión, el siguiente flujo: abrir la Página 100, navegar a la Página 101, 200 y 300, mostrar un resumen con IA verificado, y consultar al menos una página con la conexión de red desactivada.
4. IF el servicio de IA no responde en 10 segundos o devuelve un error durante la generación de un resumen, THEN THE Sistema SHALL mostrar el texto original de la página y un aviso indicando que el resumen no está disponible, sin perder la página actual.
5. WHILE el diseño técnico no esté aprobado por los 2 integrantes del Equipo, THE Equipo SHALL abstenerse de iniciar la implementación de código del producto.
6. THE Equipo SHALL completar las tareas de las Páginas 100 y 101, la navegación y el modo sin conexión antes de iniciar cualquier tarea de funciones opcionales.
## Fuera de alcance (primera versión)

Los siguientes elementos no forman parte del MVP:

1. Integración con DIRECTV o cualquier transmisión por televisión satelital, por cable o por señal abierta.
2. Aplicaciones móviles nativas (Android o iOS); el MVP es una aplicación web.
3. Conexión en tiempo real con las APIs o sistemas oficiales de SENAMHI, INDECI, MIDAGRI y MINSA; el MVP usa Dato_de_Prueba.
4. Cuentas de usuario, inicio de sesión público y personalización por usuario.
5. Notificaciones push y mensajería (SMS o WhatsApp).
6. Idiomas distintos del español, incluidos quechua y aimara.
7. Funciones de audio, voz o lectura en voz alta.
8. Generación de contenido nuevo por IA; la IA solo resume avisos oficiales existentes.
9. Páginas adicionales a 100, 101, 200 y 300.
10. Panel de administración completo; la carga de contenido se realiza con archivos de datos.
