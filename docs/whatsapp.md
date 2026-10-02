# Membresías y QR por WhatsApp

El primer pago de un socio prepara una bienvenida; cada pago posterior prepara una renovación. Se guarda una única notificación por membresía dentro de la transacción del cobro. El registro del socio, sin pago, no habilita acceso ni envía una credencial de membresía activa.

## Conectar Meta

1. Configurar WhatsApp Business Platform, registrar el número emisor y generar un token de usuario del sistema con permiso `whatsapp_business_messaging`. No compartir el token en chats ni guardarlo en Git.
2. Crear y obtener aprobación para dos plantillas, una de bienvenida y otra de renovación, con **encabezado de imagen** y **seis parámetros posicionales** en el cuerpo. Usar la misma estructura de parámetros para ambas.
3. Completar las variables `WHATSAPP_*` de `.env.example` en el entorno del servidor. `WHATSAPP_GRAPH_VERSION` debe ser una versión soportada por la aplicación de Meta, con formato `vXX.X`. `WHATSAPP_TEMPLATE_LANGUAGE` debe coincidir exactamente con el idioma aprobado. No se inventa una versión de API.
4. `WHATSAPP_ORGANIZATION_ID` identifica explícitamente al gimnasio que usa ese emisor. Nunca se utiliza su token para enviar mensajes de otra organización. Esta primera integración admite un emisor configurado; para ofrecer emisores propios a varios gimnasios se necesita aprovisionar credenciales por organización.
5. Mantener `npm run worker:whatsapp` activo junto con la aplicación. Para un ciclo: `npm run worker:whatsapp -- --once`. El endpoint de cobro también inicia un procesamiento después de confirmar la respuesta; el worker recupera pendientes y reintentos tras reinicios. El despliegue del worker debe disponer de `tsx` y las dependencias del proyecto.

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
