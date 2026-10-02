# Membresías y QR por WhatsApp

El primer pago de un socio prepara una bienvenida; cada pago posterior prepara una renovación. Se guarda una única notificación por membresía dentro de la transacción del cobro. El registro del socio, sin pago, no habilita acceso ni envía una credencial de membresía activa.

## Conectar Meta

### Configuración única del SaaS (administrador técnico)

1. Crear una aplicación empresarial de Meta con WhatsApp y Facebook Login for Business, completar los requisitos de Tech Provider, verificación y revisión de permisos correspondientes. En desarrollo, Meta limita el acceso a usuarios con roles de la aplicación. Consultar el [ejemplo oficial de Meta](https://github.com/fbsamples/business-messaging-sample-tech-provider-app) para los requisitos actuales.
2. Publicar el sistema en HTTPS y configurar `BETTER_AUTH_URL` con esa dirección. Registrar el dominio en App Domains y Allowed Domains for the JavaScript SDK y las URI autorizadas en Facebook Login for Business. El código devuelto por el SDK se canjea sin una URI de redirección personalizada, como en el ejemplo oficial. No se puede autorizar desde el enlace local HTTP del gimnasio.
3. Crear una configuración de Embedded Signup para WhatsApp Cloud API que devuelva un código de autorización, con los permisos `whatsapp_business_management` y `whatsapp_business_messaging`. Configurar `WHATSAPP_META_APP_ID`, `WHATSAPP_META_APP_SECRET` y `WHATSAPP_META_CONFIG_ID` en el servidor. El flujo actual usa `sessionInfoVersion: "3"`, un número Cloud API y eventos `FINISH` con WABA y número; no implementa migración de On-Premises ni coexistencia con la app móvil WhatsApp Business.
4. Generar `WHATSAPP_ENCRYPTION_KEY` con 32 bytes aleatorios codificados como 64 caracteres hexadecimales. Ejemplo local: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guardar en un gestor de secretos, separado de respaldos de la BD y nunca en Git. Respaldar esta clave: perderla impide recuperar los tokens y PIN de registro cifrados. Para rotarla, volver a autorizar cada conexión; no cambiarla silenciosamente en producción.
5. Configurar `WHATSAPP_GRAPH_VERSION` con una versión soportada por la app, y los nombres `WHATSAPP_WELCOME_TEMPLATE`, `WHATSAPP_RENEWAL_TEMPLATE` e idioma exacto `WHATSAPP_TEMPLATE_LANGUAGE`. Cada cuenta empresarial debe tener las dos plantillas aprobadas con encabezado IMAGE y los seis parámetros posicionales de abajo. El sistema comprueba su estructura y aprobación; no crea ni aprueba plantillas automáticamente. Configurar el método de pago necesario en Meta.
6. Aplicar `npm run db:deploy` y mantener `npm run worker:whatsapp` activo. Para un ciclo: `npm run worker:whatsapp -- --once`. El worker recorre las conexiones de todas las organizaciones, resuelve únicamente sus credenciales y recupera pendientes tras reinicios. Debe disponer de `tsx` y las dependencias del proyecto. Los cobros y la verificación de una conexión lista también inician un procesamiento posterior a la respuesta. Supervisar el worker y los rechazos del proveedor.

### Conexión del propietario

En Configuración → WhatsApp, pulsar **Conectar WhatsApp**, luego **Continuar en Meta**. Este segundo clic permite abrir la ventana de autorización sin bloqueos del navegador. Meta guía la selección del negocio, el número y su verificación. El propietario no introduce tokens ni secretos en el formulario del gimnasio.

El servidor canjea el código, comprueba que el número verificado pertenece a la WABA autorizada y guarda el token y el PIN aleatorio de registro con AES-256-GCM, vinculados a la organización. Los intentos duran diez minutos, pertenecen al propietario autenticado y se consumen una sola vez. Un mismo número emisor no puede vincularse a dos organizaciones. Se auditan autorización y verificaciones sin guardar credenciales en la auditoría.

**Sin conectar**: no existe autorización. **Conectado · requiere revisión**: se guardó la conexión, pero falta registro, aprobación de plantillas o verificación de permisos. **Listo para enviar**: Meta confirmó número y registro, y ambas plantillas están aprobadas; la entrega sigue dependiendo del worker, las credenciales y las condiciones de Meta. Pulsar **Revisar conexión** tras aprobar plantillas. Un cambio de configuración o clave deshabilita el envío hasta una nueva conexión. Revocaciones posteriores también pueden producir rechazos en la cola; el estado muestra la última verificación, no monitoreo continuo.

Si falla el registro de un número que ya tiene PIN o requisitos de migración, se conserva la conexión pendiente para revisión; no se muestra un falso éxito. El SDK solo se carga al preparar la conexión y no se carga cuando faltan las variables del servidor. La CSP admite únicamente los dominios necesarios de Meta para el SDK y el diálogo.

La configuración anterior mediante `WHATSAPP_ORGANIZATION_ID`, `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` continúa disponible para un único emisor configurado manualmente. Una conexión guardada para esa organización tiene prioridad y bloquea este respaldo si no está lista. Los estados visibles de conexión guiada se refieren a la conexión verificada, no a la simple presencia de variables antiguas.

El estado aparece en Configuración → WhatsApp y en el perfil del socio. Sin credenciales válidas no se contacta a Meta. La disponibilidad del worker y del proveedor debe supervisarse en el despliegue.

## Plantillas propuestas

Encabezado: imagen. El sistema carga directamente el PNG del QR en Meta y usa su ID de medio; no publica la credencial en una URL pública.

Bienvenida:

```text
¡Bienvenido/a, {{1}}! Tu membresía en {{2}} fue registrada.
Plan: {{3}}.
Válida desde {{4}} hasta {{5}}, inclusive.
Servicios: {{6}}.
Presenta el QR adjunto en recepción. Permite un ingreso por día mientras tu membresía esté vigente. Para dejar de recibir estos mensajes, comunícalo a recepción.
```

Renovación:

```text
¡Gracias por renovar, {{1}}! Tu renovación en {{2}} fue registrada.
Plan: {{3}}.
Válida desde {{4}} hasta {{5}}, inclusive.
Servicios: {{6}}.
Conserva el QR adjunto y preséntalo en recepción. Permite un ingreso por día durante la vigencia. Para dejar de recibir estos mensajes, comunícalo a recepción.
```

Parámetros: nombre del socio, gimnasio, nombre del plan, primer día, último día inclusive y servicios. Las fechas se obtienen del contrato vigente al procesar, incluyendo ajustes por congelación. No se suman 30 días: los planes son de 1, 3 o 6 meses calendario.

Registrar la autorización del socio antes del primer pago. Solo se admiten móviles ecuatorianos `09XXXXXXXX`, convertidos a `5939XXXXXXXX`. Un cambio de teléfono retira la autorización; guardar el nuevo teléfono y volver a confirmar el permiso. Recepción puede retirar el permiso en Editar perfil; eso cancela los pendientes que aún no iniciaron un envío. No se procesa automáticamente la respuesta a mensajes: recepción debe atender las solicitudes de baja.

## Acceso diario y estados

El QR identifica al socio; el servidor comprueba membresía, fechas, estado, sucursal y servicio en cada ingreso. Un único ingreso diario por socio, tanto con QR como con registro manual, entre medianoches de `America/Guayaquil`. La limitación no se reinicia con otro servicio ni con otro contrato. Una restricción única protege los nuevos ingresos simultáneos; los registros históricos se conservan y también cuentan para el día actual.

`PENDING`: espera configuración o el próximo intento. `PROCESSING`: reservado por un procesador. `ACCEPTED`: Meta aceptó el mensaje, **no confirma entrega ni lectura**. `FAILED`: respuesta de rechazo o reintentos agotados; recepción puede solicitar un reintento tras resolver la causa. `REVIEW`: resultado incierto; no se reenvía automáticamente para evitar mensajes duplicados. Recepción puede abrir Revisar envío y confirmar explícitamente que Meta no recibió el mensaje antes de autorizar un reenvío; esta confirmación se audita. `CANCELLED`: permiso retirado, socio deshabilitado o membresía cancelada/vencida. Las membresías congeladas esperan reactivación. Las renovaciones anticipadas pueden avisarse de inmediato con su fecha futura de inicio.

Fallos de carga del QR y límites HTTP 429 admiten reintentos con espera incremental, hasta cinco intentos. Un timeout, error de servidor o caída tras comenzar el envío requiere revisión. No existe una garantía de entrega exactamente una vez del proveedor; nunca se simula entrega. Una API aceptada se guarda antes de procesar otra notificación. Tokens, teléfonos y credenciales no se escriben en logs.

La entrega real necesita las credenciales, plantillas aprobadas y una prueba con un destinatario autorizado. Los tests locales usan un proveedor falso y no envían WhatsApp reales.

Referencias: [plantillas oficiales de Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TemplateObject/), [mensajes multimedia](https://whatsappbusiness.com/blog/media-messages-via-app/), [política de WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=es_LA).
