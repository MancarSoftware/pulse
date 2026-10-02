# Suscripciones comerciales de MANCAR

Esta facturación pertenece a la plataforma SaaS. No utiliza ni incrementa el libro de movimientos, productos, planes de socios o caja de un gimnasio.

## Política inicial

- Sin prueba gratuita. Un gimnasio nuevo debe informar un pago y recibir aprobación antes de usar la operación normal.
- Al vencer una suscripción pagada, hay tres días calendario de gracia en Ecuador. Después se bloquean las páginas y API operativas, incluyendo fotos y credenciales. Los mensajes WhatsApp pendientes se pausan.
- El propietario conserva acceso a `/subscription` para informar pagos, revisar el resultado y cerrar sesión. Los empleados ven una explicación y deben contactar al propietario.
- La suspensión no borra socios, contratos, movimientos ni usuarios. Una aprobación restaura el acceso en la siguiente solicitud. No se requiere un cron para determinar vencimientos.
- La renovación anticipada comienza al finalizar el período pagado. Una cuenta vencida o inicial comienza el día de la aprobación. Son meses calendario y el último día mostrado es inclusivo. La fecha de presentación de una referencia no confirma pago ni inicia vigencia.
- Las advertencias aparecen en el sistema durante los siete días previos al vencimiento y durante la gracia. No se envían recordatorios externos por email o WhatsApp en esta versión.

## Activación comercial

1. Aplicar `npm run db:deploy`. Las cuentas existentes sin pagos SaaS quedan pendientes de activación; sus registros permanecen almacenados. No se genera ningún pago ficticio ni una prueba gratuita.
2. Crear una cuenta y conceder acceso de plataforma desde un terminal autorizado: `npm run platform:admin -- --email cuenta@ejemplo.com`. Para revocar: agregar `--revoke`. Esto no crea usuarios ni depende del rol OWNER de un gimnasio; el cambio se audita. No ejecutar para cuentas no autorizadas.
3. Iniciar sesión y abrir `/platform`. En **Planes SaaS**, editar el borrador mensual: definir precio USD mayor a cero y marcar Publicado. Se pueden ofrecer planes mensuales o anuales; el precio representa el período completo. No hay cobros automáticos ni límites por tier en esta versión.
4. En **Datos de pago**, publicar instrucciones reales (banco, titular, cuenta y referencia). No guardar claves bancarias. Los pagos permanecen deshabilitados si no hay plan publicado o instrucciones.
5. El propietario abre **Mi suscripción**, realiza el pago fuera del sistema e informa método y referencia. Solo hay un pago pendiente por gimnasio. La solicitud conserva precio, nombre y duración del plan, aunque posteriormente cambie el catálogo.
6. La administración de plataforma verifica el dinero en su banco o recibo de efectivo. En **Pagos**, abrir Revisar y aprobar, escribir una referencia verificada única incluyendo banco/cuenta, describir la comprobación y marcar la confirmación (inicialmente desmarcada). Rechazar exige motivo y no activa acceso.

No se infiere una transferencia recibida por una captura o referencia aportada por el cliente. Esta versión permite referencias textuales, no carga de comprobantes. Los pagos online, webhooks bancarios, facturas fiscales, reembolsos SaaS y cancelación con reembolso necesitan una integración posterior; no se simulan.

## Seguridad y consistencia

Las rutas `/api/platform/*` verifican sesión, origen y una asignación PlatformAdmin activa. Un propietario común no puede aprobar su pago ni consultar otras organizaciones. El CLI de aprovisionamiento requiere acceso al servidor; no existe una opción pública de ascenso de permisos.

Las aprobaciones y extensión del período se guardan en una transacción serializable. Repetir una aprobación no vuelve a ampliar acceso, una referencia bancaria verificada no respalda dos pagos y presentar dos pagos pendientes simultáneos no crea dobles solicitudes. Cada presentación, revisión y configuración genera auditoría de plataforma. Revocar el administrador se comprueba nuevamente al aprobar dentro de la transacción.

Precio publicado cero está prohibido en servidor y base de datos. El plan inicial es un borrador de cero dólares deshabilitado, no una oferta gratuita. El precio se valida contra la cotización mostrada. Las fechas y permisos se comprueban en el servidor, sin depender de esconder botones.

Cambiar los días de gracia en configuración afecta al próximo pago aprobado; los períodos pagados existentes conservan su gracia. Se retiene la información durante la suspensión. Cualquier política futura de eliminación debe ser independiente y explícita.

## Verificación

`npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run lint`, `npm run build`. Las pruebas cubren ausencia de pago, gracia, suspensión, reactivación, aislamiento, permisos, referencias repetidas, aprobaciones concurrentes, rechazo y cotizaciones conservadas. Los pagos de pruebas pertenecen únicamente a la base `_test` y no confirman dinero real.
