Tekzaya
Plataforma web de gestión de tickets de soporte técnico y mantenimiento de activos empresariales.

Descripcion:
Tekzaya es una aplicación web para la gestión integral del soporte técnico y el mantenimiento de activos empresariales. Centraliza en un solo entorno la atención de incidencias, la gestión de tickets y el mantenimiento de equipos, facilitando la organización y el seguimiento de las actividades técnicas de una empresa.

La plataforma se compone de dos módulos principales:

Gestión de tickets de soporte técnico. Permite a los empleados registrar incidencias y consultar el estado de sus solicitudes. La inteligencia artificial analiza cada incidencia, le asigna una prioridad y determina si corresponde al área de TI u otra area (Mantenimiento, Ventas, Marketing, etc). A partir de esa clasificación, los supervisores de cada area o el administrador puede asignar el ticket a un técnico específico del área correspondiente, o bien los propios técnicos pueden autoasignarse los tickets de su área. El sistema actualiza el estado del ticket en cada etapa y genera resúmenes automáticos que apoyan al personal encargado de su resolución.

Gestión del mantenimiento empresarial. Permite registrar y administrar los equipos y activos de la organización: historial de mantenimiento, averías, asignación de trabajos a técnicos, programación de mantenimientos preventivos y control de repuestos y costos. También genera alertas y reportes sobre las actividades de mantenimiento.

La integración de ambos módulos ofrece a las empresas una herramienta centralizada para organizar sus operaciones de soporte y mantenimiento, mejorar el seguimiento de incidencias y activos, y aprovechar la información generada para optimizar sus procesos tecnológicos.

Puesta en marcha. Primera Fase:
Primero, se trabajara con el modulo de gestion de tickets. describo las pantallas necesarias para esta primera fase:
1. Login: debera ser un login atractivo, con poco texto. Que permita poder ingresar con google
2. Tablero: esto sera lo primero que vea el empleado, un tablero con todas sus estadisticas.
    1. Para el empleado normal: 4 tableros en la parte superior que especifiquen: total de tickets pendientes, tickets resueltos por mi, tickets pendientes para mi, tickets urgentes.
    Abajo de esto, aparecera un grafico que el empleado podra filtrar por semana, meses o años. En este grafico, aparecera el total de tickets resueltos en un periodo de tiempo, ya sea, el semanal, por meses o por años que ha trabajado.
    Al lado de la grafica, el empleado podra ver un preview del ticket que creo:
    1-Si no le han respondido, se mostrara solo el numero del ticket y el titulo y dira: sin respuesta
    2-si le respondieron, se mostrara el numero del ticket y un preview de la respuesta, se podria dar click para ir directamente a leer y responder el ticket si hace falta.
    3-Si no ha creado tickets, le aparece vacio.

    2. Para el supervisor: Habran 2 opciones. la predeterminada sera por el area (ej: IT) y la otra personal, igual que la de un empleado normal. defino la que es por area: 3 tableros en la parte superior: tickets pendientes, tickets resueltos, tiempo de respuesta promedio. 
    Abajo de esto, aparecera un grafico que podra filtrar por dia, mes o año. En este grafico, aparecera el total de tickets resueltos de cada persona del departamento. Otra grafica al lado igual pero del tiempo de respuesta. Otra grafica circular abajo o al lado de solicitudes por tipo. Otra grafica de total de solicitudes por semanas, meses o años.
    EL SUPERVISOR SOLO PODRA VER LAS ESTADISTICAS DE SU AREA
    3. Administrador y supervisor recursos humanos: este podra ver todo lo que defini en el apartado del supervisor, pero por area. estara el apartado de todas las areas, una area en especifico, una persona en especifico o el/ella mismo/a
3. Tickets: esta pantalla va incluir: ID del ticket, Titulo, Empleado, Prioridad, Asignado a, Status, Tiempo de respuesta y de resolucion, fecha y hora de creacion (si es del mismo dia solo poner cuantos minutos o horas tiene). Se puede ordenar los tickets por lista y grupos. tal y como en las imagenes de referencia. 
Crear tickets: debe ser conciso y sencillo, con solo darle al boton ver los siguientes campos: Asunto o titulo, Departamento de destino (Sugerido por IA), Descripcion y adjuntos.
Usar las imagenes de referencia "crear_ticket.png" y "crear_ticket2.png" para hacer un diseño mas atractivo
Conversacion: Se podran agregar notas internas y publicas. mientras escribes, la ia podra ayudarte si le das al tab para completar. Tambien recomendarte cosas para resolver el ticket.
El supervisor del area correspondiente podra ver la conversacion de cada ticket.
El supervisor del area podra asignar los tickets (debera verse un boton de asignar)
El supervisor decidir a quien asignarle el ticket viendo los tickets que tienen por resolver cada quien.