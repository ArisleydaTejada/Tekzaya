---
name: Tekzaya
description: Panel de instrumentos nocturno para soporte interno asistido por IA.
colors:
  panel: "#221f2c"
  panel-surface: "#201c29"
  panel-surface-2: "#292432"
  panel-bezel: "#3a3444"
  panel-seam: "#58506a"
  panel-ink: "#f5f3f7"
  panel-ink-dim: "#948da3"
  placard: "#f9f9f9"
  placard-surface: "#ffffff"
  placard-border: "#e0e0e0"
  placard-ink: "#12141a"
  placard-ink-dim: "#606060"
  accent: "#58479d"
  accent-soft: "#b5a3cf"
  accent-dim: "#463a7e"
  steel: "#7c8cae"
  green: "#15703f"
  amber: "#965000"
  red: "#b42318"
  green-dark: "#39d98a"
  amber-dark: "#f5a623"
  red-dark: "#ff7a7f"
  chart-cat-1: "#2f6fcb"
  chart-cat-2: "#d6449c"
  chart-cat-3: "#0e9c8e"
  chart-cat-4: "#c67f1e"
  chart-cat-5: "#7c8cae"
  chart-cat-6: "#8a6d1e"
  chart-cat-7: "#a0522d"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.14em"
  caption:
    fontFamily: "Nunito Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Nunito Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dim}"
  button-lever:
    backgroundColor: "{colors.placard-surface}"
    textColor: "{colors.placard-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  status-card-error:
    backgroundColor: "{colors.red}"
    textColor: "{colors.red}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  status-card-success:
    backgroundColor: "{colors.green}"
    textColor: "{colors.green}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  input-field:
    backgroundColor: "{colors.placard-surface}"
    textColor: "{colors.placard-ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: Tekzaya

## Overview

**Creative North Star: "El panel de instrumentos nocturno"**

Tekzaya no se presenta como un formulario con un degradado de marca al lado: se presenta como un instrumento que ya está trabajando antes de que la persona escriba una sola letra. El mundo nace en el login (dirección "Panel de instrumentos nocturno", fusión de `signals-instruments-night-flight-six-pack`, seed `4369c73d`) y hoy es el único mundo construido; el resto de pantallas de Fase 1 (tablero, tickets, crear ticket, detalle, administración, reportes) tienen brief pero no código, y heredarán este sistema, no uno nuevo.

Cada pantalla se materializa como **dos placas físicamente unidas**: un panel de instrumentos casi negro (donde vive la IA, siempre morado, siempre en movimiento cuando actúa) y una placa clara donde vive la tarea del usuario (formularios, listas, datos). Entre ambas hay una costura visible — nunca un corte de color plano — porque el mundo trata la interfaz como hardware montado, no como paneles de CSS apilados.

La **barra lateral** es la excepción: sigue al tema de quien mira (`--rail-*`), porque es cromo que acompaña todo el rato y un bloque oscuro pegado a una página clara se lee como un descuido, no como una plancha. El resto del mundo "instrumento" —la plancha del login, las placas de los diales— sí se queda oscuro en los dos temas, que es donde el contraste es intención.

**Key Characteristics:**
- Un dial circular protagonista por tablero; el resto de cifras, en lecturas compactas. Nada de barras de progreso genéricas.
- El índigo-violeta es exclusivo de la IA y de la acción primaria; nunca decorativo.
- Toda tarjeta de estado semántico (error, bloqueo, éxito) lleva un borde de 2px de su color, no solo un tinte de fondo.
- Textura de material (grano en placas y panel) viene de un patrón de puntos en mosaico, nunca de ruido `feTurbulence`.
- El mundo se traduce a tema claro y oscuro por igual: la placa clara y el panel oscuro son las dos caras del mismo sistema, no un modo "apagado".

## Colors

Paleta de instrumento: negro casi puro para el panel, blanco cálido para la placa, un único acento vivo (índigo) y un semáforo estricto de tres colores para SLA/prioridad.

### Primary
- **Morado de marca** (`#58479d`, secundario `#b5a3cf`, oscuro `#463a7e`): son los dos colores del logo. Reservado a la actividad de la IA (resplandor del dial "Precisión de la IA", etiquetas de clasificación) y a la acción primaria (botón "Iniciar sesión", enlaces). Nunca aparece como color decorativo de fondo.
- **`--accent-contrast`**: el de los dos que se lee contra el fondo de quien mira — el primario sobre claro, el secundario sobre oscuro. Lo usan el anillo de foco, el indicador de la barra lateral y la aguja de los diales, porque un valor fijo perdía el contraste en uno de los dos temas.

### Secondary
- **Acero** (`#7c8cae`): segundo tono neutro para diferenciar un dial "positivo" (p. ej. "Resueltos por mí") de los contadores neutros sin pedir prestado un color semántico reservado.

### Neutral
- **Panel** (`#221f2c`): carbón violáceo, no negro azulado; fondo del instrumento a toda superficie (estrategia Drenched).
- **Superficie del panel** (`#201c29` / `#292432`): placas y tarjetas sobre el panel oscuro, y el lienzo del tema oscuro.
- **Bisel del panel** (`#3a3444`): bordes, remaches y anillos de bisel de los diales. **Costura** (`#58506a`): el brillo de la costura de montaje del login.
- **Tinta del panel** (`#f5f3f7` texto principal / `#948da3` texto secundario).
- **Placard** (`#f9f9f9`): fondo de la placa clara, a toda superficie. Gris neutro, sin tinte azulado.
- **Superficie de la placa** (`#ffffff`): campos, botones y tarjetas sobre la placa clara.
- **Borde de la placa** (`#e0e0e0`).
- **Tinta de la placa** (`#12141a` texto principal / `#606060` texto secundario, 6:1 sobre el lienzo).

### Chart categorical (identity, not a reading)
Cuando un color codifica una **categoría** en una gráfica (área, persona, categoría) en vez de una **lectura de estado** (SLA, éxito/error), nunca toma prestado el trío semántico. La rampa `--chart-cat-1…7` abre con el **morado de la marca** `#58479d` (lila `#b5a3cf` en oscuro) y sigue con azul `#2f6fcb`, magenta `#d6449c`, verde azulado `#0e9c8e`, ocre `#c67f1e`, acero `#7c8cae` y oliva `#8a6d1e`. No usa el trío rojo/ámbar/verde.
- La serie "Recibidos" va en el morado de la marca.
- En las gráficas por prioridad, "Urgente" es rojo (es una lectura, ver abajo) y "Baja" es **Acero**: la prioridad más baja no compite con las demás ni se confunde con el verde de "resuelto".

### Estados del ticket
El texto siempre acompaña al color. **Abierto** y **Asignado** son acero (un ticket recién llegado es lo normal, no una alarma); **En progreso**, azul (trabajo en marcha); **En espera**, ámbar (depende de alguien); **Resuelto**, verde; **Cerrado**, **Cancelado** y **Fusionado**, grises. **Reabierto** es el único sólido y rojo, porque pide mirarlo ya. Una garantía vencida es un dato (texto atenuado); solo "Vence pronto" lleva ámbar.

### Named Rules
**The Reserved Glow Rule.** El índigo vivo en la interfaz significa "la IA está actuando" o "esta es la acción principal". Las dos excepciones son la marca en los datos: el dial y la primera serie de las gráficas llevan el morado, porque son la identidad de Tekzaya en Reportes y en los tableros.

**The Semantic Three Rule.** Verde = SLA en tiempo / éxito. Ámbar = SLA en riesgo / advertencia. Rojo = SLA vencido / urgente / error. Sobre claro son tonos oscuros que pasan AA (`#15703f`, `#965000`, `#b42318`); sobre oscuro, los vivos (`#39d98a`, `#f5a623`, `#ff7a7f`). Estos tres colores son una **lectura de estado**, nunca una identidad de categoría: una gráfica que agrupa por prioridad, área o persona usa la paleta "Chart categorical" de arriba, no este trío, aunque prioridad y SLA compartan pantalla (ver "Resueltos por persona" y la tabla "Tickets del período" en Reportes, donde ambos vocabularios conviven sin pisarse).

**The SLA Needle Rule.** SLA y prioridad son dos lecturas distintas y llevan dos marcas distintas: la prioridad es un punto de color sólido (`PriorityBadge`); el SLA es la mini-aguja de instrumento (`SlaNeedleIcon`, un arco + aguja en miniatura). Nunca el mismo glifo para ambas, aunque compartan color en un caso puntual.

## Typography

**Display Font:** Poppins (con system-ui, sans-serif), pesos 400–700
**Body Font:** Nunito Variable (con system-ui, sans-serif), con cursiva

**Character:** Poppins es una geométrica de trazo firme — la voz de los títulos, las placas, las etiquetas y los badges. Nunito es redondeada y amable y lleva todo el texto de trabajo: formularios, párrafos, botones largos. Ambas vienen de Google Fonts, empaquetadas con `@fontsource` para que la app funcione sin internet.

**Números alineados:** Poppins no tiene cifras de ancho fijo. Lo que lleva `font-display` y `tabular` a la vez (números de ticket y orden en columnas, cifras de indicadores) se pinta en Nunito, que sí las tiene (regla `.font-display.tabular` en `index.css`).

### Hierarchy
- **Display** (600, 1.875rem/tight, -0.01em): títulos de pantalla ("Bienvenido de nuevo"), wordmark "TEKZAYA".
- **Title** (600, 1.0625rem–1.3125rem): números protagonistas dentro de los diales (cifras tabulares).
- **Label** (500, 0.625rem, tracking 0.14em, mayúsculas): etiquetas grabadas de los diales, micro-etiquetas de estado ("dato de ejemplo").
- **Body** (400, 0.875rem/1.5): todo el texto de formulario, párrafos y botones.
- **Caption** (400, 0.75rem): metadatos, ayudas bajo un campo, chips de SLA, notas de una fila. Es el tamaño más pequeño para texto que se lee; por debajo solo quedan la etiqueta de placa (Label) y los contadores numéricos en píldora.

### Named Rules
**The Plate Label Rule.** Una etiqueta en mayúsculas y tracking amplio solo existe dentro de una placa de instrumento (bajo un dial, en una franja de estado) — nunca flotando sola sobre un encabezado como un eyebrow/kicker. Esa forma está prohibida por el piso de calidad del sistema; la etiqueta de placa es un objeto físico, no un adorno tipográfico.

## Layout

Login: dos columnas a `lg` (≥1024px), 54%/46% con una costura de 8px entre ambas; por debajo de `lg` el panel de instrumentos se oculta y la placa ocupa todo el ancho, pero conserva una vista compacta del dial protagonista + la franja de ticket para no perder la tesis de "la IA ya está trabajando". El panel de instrumentos usa una cuadrícula de 3 columnas para sus seis diales, con separación de 12px (`gap-3`). Espaciado mayor entre bloques (32px, `mb-8`) y menor dentro de un componente (12–16px). Ancho máximo del formulario: `max-w-sm` (24rem).

**El resto de la app (shell interior):** la barra lateral y la superior siguen al tema de quien mira (`--rail-*`), igual que el área de contenido, que cambia de placa clara a panel oscuro con el selector de tema. Los tableros abren con **un dial protagonista** (cumplimiento de SLA en el tablero de área, preventivos de la semana en el panel de mantenimiento) y los contadores a su lado. Esto se implementa con variables CSS reactivas al tema (`--content-bg`, `--content-surface`, `--content-border`, `--content-ink`, `--content-ink-dim`, `--content-shadow`, más `--chart-*` para las gráficas), redeclaradas bajo `[data-theme="dark"]`; los componentes de contenido nunca usan directamente `bg-placard`/`bg-panel`, siempre las variables `--content-*`. Los diales conservan su cara oscura interna (vidrio de instrumento) en ambos temas — solo la placa que los contiene cambia; ver Shapes.

**Pestañas de registros:** el detalle de ticket abre cada registro en una pestaña de la barra superior, al estilo de un navegador, para saltar entre tickets sin volver a la lista. Por debajo de 80rem, los datos del ticket se pliegan bajo la cabecera en un resumen «Detalles».

## Elevation & Depth

Sistema híbrido: las placas no usan sombras planas de UI genérica, sino una ilusión de metal/plástico moldeado — resalte interior superior (`inset 0 1px 0 rgba(255,255,255,.04)`) más una sombra externa difusa y oscura (`0 12px 30px -12px rgba(0,0,0,.6)`). Los botones tipo "palanca" añaden un escalón inferior sólido (`0 4px 0 var(--color-placard-border)`) que se comprime al presionar, en vez de una sombra de elevación estándar.

### Shadow Vocabulary
- **shadow-instrument** (`inset 0 1px 0 rgba(255,255,255,.04), 0 12px 30px -12px rgba(0,0,0,.6)`): placas y diales sobre el panel oscuro.
- **shadow-placard** (`0 1px 2px rgba(18,20,26,.04), 0 12px 24px -14px rgba(18,20,26,.18)`): tarjetas sobre la placa clara.
- **lever-rest** (`0 1px 0 #fff inset, 0 4px 0 var(--color-placard-border), 0 10px 18px -10px rgba(18,20,26,.4)`): botón "Continuar con Google" en reposo; se reduce a `0 1px 0 #fff inset` más un desplazamiento de 3px al presionar.

### Named Rules
**The Grain, Never Turbulence Rule.** La textura de material (grano del panel, de las placas) se produce con un patrón de puntos en mosaico (`radial-gradient` de 0.5px repetido cada 3px, `mix-blend-overlay`). El filtro SVG `feTurbulence` está prohibido en todo el sistema: el piso de calidad lo marca como una señal de trabajo amateur.

## Shapes

Radios: 8px (`rounded-lg`) para tarjetas de estado semántico, 12px (`rounded-xl`) para botones y campos, 16px (`rounded-2xl`) para placas y diales, completo (`rounded-full`) para píldoras y divisores. Los diales son círculos perfectos con bisel de dos anillos (metal + cristal) y cuatro remaches en las esquinas de su placa contenedora — el remache es la firma geométrica recurrente del mundo instrumento.

## Components

### Buttons
- **Shape:** 12px de radio (`{rounded.md}`).
- **Primary:** fondo índigo (`{colors.accent}`), texto blanco, `padding: 12px 16px`; hover oscurece a `{colors.accent-dim}`.
- **Lever (Google):** fondo de placa blanca, borde `{colors.placard-border}`, sombra escalonada de reposo (`lever-rest`) con una ranura horizontal recesada visible bajo la etiqueta incluso sin interacción; al presionar, se hunde 3px y la sombra colapsa.

### Status cards
- **Estilo:** fondo del color semántico al 10% de opacidad **más borde sólido de 2px del mismo color** (nunca solo el tinte); radio 8px; icono de alerta o check alineado a la izquierda.
- **Uso:** error de credenciales (rojo), cuenta no habilitada (rojo), bloqueo temporal (ámbar), confirmación de sesión (verde).

### Inputs / Fields
- **Style:** placa blanca, borde `{colors.placard-border}`, radio 12px, icono a la izquierda dentro del campo.
- **Focus:** borde índigo + anillo `ring-2` índigo al 25% de opacidad.
- **Error:** borde rojo sólido.

### Dial (Gauge)
Un dial protagonista por tablero (cumplimiento de SLA en el de área, preventivos de la semana en el de mantenimiento), dibujado según `docs/ideas_diseno/dial.png`: tarjeta clara (`--content-surface`), arco de 270° con una **línea fina en degradado de la marca** (`--dial-start` → `--dial-end`, del morado `#58479d` al lila `#b5a3cf`; en oscuro, versiones aclaradas) y, por dentro, una **banda ancha y suave** del mismo degradado translúcido que se llena hasta el valor. Sin esfera oscura, sin aguja y sin remaches: sobre una pantalla clara, el bloque negro pesaba más que la cifra. La cifra va en Nunito ligera (300), grande, con el `%` pequeño arriba a la derecha; bajo el arco, una píldora con el contexto (el período: «Mes»). Si el período no tiene datos, el dial mira el siguiente más amplio y lo dice en el pie; sin ningún dato, la línea queda gris y sin banda. El estado (en tiempo, en riesgo) lo cuentan la cifra y el pie, no el color del arco. El resto de KPI son lecturas compactas (`Readouts`) junto al dial.

### SLA needle
Marca miniatura (14px) exclusiva de una lectura de SLA: un arco tenue + una aguja corta en `currentColor`, heredando el color semántico (verde/ámbar/rojo) del texto que acompaña. Vive siempre junto al texto del estado, nunca sola. Ver The SLA Needle Rule.

### Avatar stack
Círculos de 24px (`sm`) con iniciales en Poppins, fondo `steel/20`, anillo `ring-2` del color de fondo del contenedor. Solapamiento de `-6px` como máximo (`-ml-1.5`); el avatar más a la izquierda siempre pinta encima (z-index descendente) para que sus iniciales nunca queden cortadas. Máximo 3 visibles + una burbuja "+N".

### Tablas densas (Operate)
Usadas en Tickets, Administración y "Tickets del período" de Reportes. Encabezado en `--content-ink-dim`, filas separadas por `--content-border`, sin cebra. Prioridad y SLA siempre como sus propios componentes (punto + aguja), nunca texto plano.

## Do's and Don'ts

### Do:
- **Do** reservar el índigo vivo de la interfaz a la IA y a la acción primaria; en los datos, solo el dial y la primera serie de las gráficas (The Reserved Glow Rule).
- **Do** dar a toda tarjeta de estado semántico un borde sólido de 2px de su color, no solo un tinte de fondo.
- **Do** construir la textura de material con el patrón de puntos en mosaico, nunca con `feTurbulence`.
- **Do** mostrar una versión compacta del dial protagonista + la franja de "ticket entrante" en cualquier viewport donde el panel de instrumentos completo no quepa (la tesis de "la IA ya está trabajando" no puede depender solo del ancho de pantalla).
- **Do** etiquetar todo dato de ejemplo/demostración como "dato de ejemplo" quede donde quede.
- **Do** usar la rampa "Chart categorical" (morado de la marca primero) cuando un color de gráfica identifica una categoría, nunca el trío semántico.
- **Do** dibujar el SLA con la mini-aguja (`SlaNeedleIcon`) y la prioridad con un punto sólido — nunca el mismo glifo para los dos.
- **Do** reemplazar todo glifo Unicode (`★`, `👋`, `💡`…) por un icono dibujado del sistema, o quitarlo si no aporta información.

### Don't:
- **Don't** usar los colores semánticos (verde/ámbar/rojo) para nada que no sea SLA, prioridad o el resultado directo de una acción (éxito/error/advertencia) — tampoco para identidad de categoría en una gráfica.
- **Don't** poner una etiqueta en mayúsculas y tracking amplio flotando sola sobre un encabezado (eyebrow/kicker) — solo existe dentro de una placa de instrumento física.
- **Don't** usar una sombra de elevación genérica de "tarjeta de SaaS" (`box-shadow: 0 1px 3px rgba(0,0,0,.1)`); el sistema usa la ilusión de placa metálica (`shadow-instrument` / `shadow-placard`) o el escalón de palanca.
- **Don't** dejar que el panel oscuro y la placa clara se toquen en un corte de color plano sin la costura de montaje.
- **Don't** usar un emoji o glifo Unicode como icono; todo icono se dibuja en el mismo trazo de `components/icons.tsx`.
