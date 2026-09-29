---
version: 1
slug: "crear-ticket"
primary_target: "crear-ticket"
related_targets: ["login","shell","tickets"]
---

## Direction contract

THESIS: Crear un ticket se siente como llenar una sola placa de vuelo, no un formulario burocrático: cuatro campos, confirmación en menos de un minuto.

OWN-WORLD (heredado): la tarjeta de sugerencia de IA usa el resplandor índigo con un patrón de "instrumento en lectura" (✨ + barra de confianza tipo arco de dial); tras enviar, la confirmación se lee como un recibo sellado, con el número TK-000123 grande en Big Shoulders.

ESTRUCTURA: se abre como página propia o panel lateral amplio desde "+ Nuevo ticket". Columna izquierda: 0) Solicitante (por defecto "Yo"; enlace "Crear en nombre de un compañero" → buscador de miembros de mi área, o cualquiera si es admin) · 1) Título (contador 64/120) · 2) Descripción (indicador "✨ IA analizando…") · 3) Departamento de destino (preseleccionado si la confianza de IA ≥60%, con tarjeta "Sugerido por IA Tekzaya: Área · X% de confianza") · 4) Adjuntos (arrastrar/soltar, máx. 5 archivos de 10 MB). Columna derecha, antes de enviar: consejos breves + tiempo estimado de respuesta. Tras enviar, la misma columna muestra la confirmación: número, área, solicitante (si aplica), categoría de IA con enlace "Cambiar", prioridad de IA, primera respuesta estimada, aviso de notificación, botones "Ir al ticket" / "Crear otro".

ESTADOS: confianza de IA <60% (sugerencia visible pero sin preseleccionar); borrador local recuperable si se cierra con texto escrito; error de envío o de clasificación de IA (ticket se crea igual, prioridad Media, etiqueta "Pendiente de clasificación").

FORM: Extiende el mundo de `login`/`shell`; sin sorteo de concepto — el formulario de 4 campos y la confirmación están fijados por §7.4, inspirados en `crear_ticket.png`/`crear_ticket2.png` sin calcarlas (el campo "Activo afectado" de esa referencia queda fuera, es de Fase 2).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
