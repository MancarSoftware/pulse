# Operación diaria: socios, recepción y control del propietario

## Coincidencias de socios

El registro y la edición comprueban teléfono exacto, correo sin distinguir mayúsculas y nombre/apellido completos sin distinguir mayúsculas dentro de la organización. Los socios deshabilitados también cuentan: abrir su perfil permite revisar si corresponde reactivarlo. No se buscan coincidencias en otros gimnasios.

La API devuelve `DUPLICATE_MEMBER` (409) sin guardar cuando la identidad coincide con otro registro. La interfaz ofrece los perfiles permitidos por la sucursal y exige confirmar que son personas distintas antes de guardar un contacto compartido. Esa confirmación queda en la auditoría. Cambiar los datos de identidad desmarca la confirmación. Las transacciones serializables evitan que dos altas simultáneas sin confirmación creen silenciosamente el mismo registro.

Recepción no recibe nombres ni enlaces de socios de otras sucursales. Una coincidencia oculta indica que el propietario debe revisarla. La confirmación permite registrar legítimamente a familiares con el mismo contacto; no fusiona socios ni mueve contratos o pagos.

El resumen del perfil distingue acceso vigente, ingreso de hoy ya registrado, membresías congeladas, contratos futuros y perfiles deshabilitados. Muestra el último día inclusivo y las renovaciones ya pagadas. La reactivación conserva la regla de desplazar fechas y contratos futuros, sin sumar días por pausas dentro del mismo día. El historial completo tiene filtros por tipo y páginas de 12 registros.

## Recepción

El lector QR y el ingreso manual comparten el mismo endpoint y presentación de resultados. Un ingreso correcto muestra confirmación verde; un ingreso ya utilizado se distingue de un rechazo. Las membresías vencidas, congeladas, programadas y los servicios no incluidos explican por qué no se autoriza el acceso. La falta de respuesta del servidor nunca se interpreta como autorización: recepción debe consultar los últimos ingresos antes de reintentar.

La lectura de QR puede sustituirse por búsqueda de nombre/teléfono o código manual. Al detener o abandonar el lector se liberan sus controles, incluso si la cámara termina de abrirse después. Las pruebas automatizadas simulan la cámara; la compatibilidad de una cámara física debe validarse en el dispositivo final con los permisos del navegador.

Se conservan las reglas del servidor: sucursal contratada, servicios incluidos y un ingreso diario por socio según America/Guayaquil. Los avisos no conceden acceso ni permiten saltar límites.

## Suscripción del gimnasio

Mi suscripción separa el estado operativo del resultado de revisión del pago. Un pago pendiente no amplía fechas ni reactiva el gimnasio; una aprobación sí actualiza el período según las reglas existentes. Se muestra el límite exacto de acceso, el motivo del rechazo más reciente y la acción disponible. La prueba de 48 horas no tiene gracia; el día de gracia se aplica solamente después de un período pagado.

## Equipo y actividad

En Configuración → Equipo, la referencia de roles se genera desde los permisos reales del servidor. Cambiar acceso o deshabilitar un empleado conserva la invalidación de sus sesiones. Solo el propietario administra empleados; los permisos y la separación de sucursales no se amplían.

Configuración → Actividad permite al propietario filtrar por tipo de operación y persona, con páginas de 12 entradas. Cada consulta limita la organización de la sesión. La presentación solo muestra campos de detalle conocidos: motivo, estado de acceso, rol, contratos afectados y confirmación de coincidencias. No vuelca JSON arbitrario, contraseñas ni tokens. Los registros existentes no se editan ni se eliminan.

## Salud de respaldos

Administración SaaS → Respaldos está reservada a administradores de la plataforma, no a propietarios de otros gimnasios. El proceso escribe `backup-status.json` de forma atómica en la carpeta privada de respaldos, conservando la fecha del último respaldo correcto cuando falla otro intento. Solo se informa éxito después de crear y verificar el archivo cifrado.

La vista distingue respaldo correcto, intento fallido/interrumpido, más de 36 horas sin éxito y ausencia de información válida. Una ejecución con más de dos horas sin finalizar se trata como interrumpida. La pantalla no expone rutas, archivos ni claves y no ejecuta restauraciones. El estado refleja el informe del proceso, no una inspección del Programador de tareas ni una garantía de respaldo externo. Consultar [respaldos](backups.md) para la prueba de restauración y las condiciones de ejecución local.
