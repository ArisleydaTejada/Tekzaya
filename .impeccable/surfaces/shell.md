---
version: 1
slug: "shell"
primary_target: "shell"
related_targets: ["login"]
---

## Direction contract

THESIS: La barra lateral y la barra superior son el marco de cabina de toda la app: se quedan en el panel nocturno en **ambos temas**, como el marco de una cabina alrededor del parabrisas. Solo el contenido cambia de placa clara a panel oscuro con el selector de tema. Refusa la barra lateral gris neutra intercambiable de cualquier SaaS.

OWN-WORLD (heredado de `login`, con esta extensión): sidebar y topbar en `#111318` con texto luminoso `#F5F7FA` en ambos temas; el ítem activo del menú lleva un resplandor índigo `#6C5CE7` y un indicador lateral tipo aguja; el punto de disponibilidad (verde `#2FA36B` / gris) se dibuja como una luz de instrumento, no un punto plano. El resto del sistema es el heredado: Big Shoulders para números y placas (contador de tickets, badges), Hanken Grotesk para el resto del texto; semáforo SLA verde-ámbar-rojo reservado estrictamente a ese uso.

ESTRUCTURA: Sidebar fija — logo, Tablero, Tickets (con contador), "Activos y mantenimiento" (deshabilitado, etiqueta "Próximamente"), Reportes (todos los roles), sección Administración (solo admin: Usuarios · Áreas y categorías · Configuración). Topbar — buscador global (número o título), botón "+ Nuevo ticket" siempre visible, campana de notificaciones con contador, selector de tema claro/oscuro, avatar con nombre/área/rol/disponibilidad y menú (perfil, cambiar disponibilidad, cerrar sesión).

ESTADOS: sidebar colapsada a icon-rail en pantallas pequeñas; contador de notificaciones en vivo (Socket.IO); tema persistido por usuario; disponibilidad ausente con fecha de regreso en tooltip.

FORM: Extiende el mundo "Panel de instrumentos nocturno" confirmado en `login` (seed key `4369c73d`); sin sorteo de concepto — la topología del shell está fijada por la especificación §7.0. Cambio de sistema durable: el marco (sidebar+topbar) queda fijo en material oscuro sea cual sea el tema del contenido; confirmado por el usuario junto con el resto de esta ronda.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
