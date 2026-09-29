---
version: 1
slug: "ticket-detalle"
primary_target: "ticket-detalle"
related_targets: ["login","shell","tickets"]
---

## Direction contract

THESIS: El detalle es la cabina de un solo ticket: el encabezado muestra sus instrumentos de estado, la conversación es la bitácora de vuelo, y las notas internas nunca se confunden con la respuesta pública.

OWN-WORLD (heredado): estado y SLA del encabezado como mini-diales; notas internas sobre fondo ámbar suave con 🔒; ghost text de autocompletado en gris itálico (Tab acepta, Esc descarta); banner de encuesta CSAT como una placa con 5 estrellas grandes; el modal "Fusionar…" se presenta como el acoplamiento de dos placas, con motivo obligatorio.

ESTRUCTURA: tres columnas (lista compacta plegable de la pestaña actual · encabezado + resumen IA plegable + línea de tiempo (mensajes públicos, notas internas, eventos de sistema) + editor Pública/🔒 Interna con adjuntos y menú Enviar · panel de detalles + historial de cambios), colapsa a una columna en móvil. El solicitante ve solo la columna central con mensajes públicos y un panel simple (estado, responsables, prioridad, categoría con "Cambiar"), sin notas internas ni resumen IA. Un miembro del área que no es responsable ve todo con la franja "Estás viendo este ticket como miembro del área. Toma el ticket o únete para responder al solicitante."

ESTADOS: banner CSAT tras pasar a Resuelto (con "Sí, se resolvió" / "No, sigue el problema"); modal Fusionar con buscador de duplicados del área, checkboxes, ticket principal por defecto el más antiguo, casillas de responsables/aviso, motivo obligatorio; ticket ya fusionado muestra "Fusionado con TK-000123" con enlace; aviso "Respondió el solicitante" / "Te respondieron" cuando aplica.

FORM: Extiende el mundo de `login`/`shell`; sin sorteo de concepto — el layout de tres columnas está fijado por §7.5 (inspirado en `conversation.webp`), la fusión por §7.5.1 y la encuesta por §7.6.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
