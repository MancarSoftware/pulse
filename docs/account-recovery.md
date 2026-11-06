# Correo y recuperación de cuentas

Gymora usa los flujos de Better Auth ya instalados. No existe un endpoint administrativo que cambie contraseñas ni un código compartido de recuperación.

## Habilitar el remitente

1. Crear una cuenta de Resend y verificar un dominio propio con sus registros DNS.
2. Configurar `AUTH_EMAIL_FROM` con una dirección de ese dominio (sin nombre ni corchetes) y `RESEND_API_KEY` con una clave de envío en el servidor. No colocarla en variables `NEXT_PUBLIC_*`, Git ni el navegador.
3. Reiniciar la aplicación. Tener ambas variables activará la verificación obligatoria de correo, también para cuentas existentes aún no verificadas. Las cuentas de demostración con direcciones ficticias no recibirán correo real: no usarlas como cuentas de producción.
4. Probar con un destinatario propio: registro, confirmación, inicio de sesión, recuperación y acceso con la nueva contraseña. Una aceptación de la API de Resend no prueba que el mensaje haya llegado a la bandeja de entrada.

Sin ambas variables, el acceso local existente continúa funcionando y las pantallas de correo explican que el servicio está pendiente. Una configuración parcial o inválida falla explícitamente. No se usa un remitente ficticio ni se imprimen enlaces de recuperación en consola.

## Flujos

- Registro: cuando el remitente está habilitado, no se crea una sesión antes de verificar el correo. El enlace dura una hora y dirige a iniciar sesión; no inicia sesión automáticamente. Desde `/verify-email` se puede solicitar otro enlace.
- Recuperación: `/forgot-password` solicita el envío sin revelar si la cuenta existe. El enlace dura 15 minutos; `/reset-password` exige una contraseña de 12 a 128 caracteres y confirmación. El servidor consume el token una sola vez y revoca todas las sesiones anteriores.
- Los identificadores de recuperación se almacenan hasheados. Las rutas de cuenta usan `no-store` y `no-referrer`. Los enlaces se construyen desde el origen canónico, nunca desde una cabecera Host del visitante.
- Solicitudes de recuperación y reenvío de verificación: tres por cinco minutos por el identificador de cliente de Better Auth. Restablecimiento: cinco por cinco minutos. El proxy de producción debe sobrescribir cabeceras de IP no confiables.
- Los envíos se mantienen con `after()` de Next.js después de la respuesta, para no diferenciar cuentas por la latencia del proveedor. No se registran destinatarios, tokens ni cuerpos de error del proveedor. Un fallo genera un aviso genérico para operación; el usuario puede solicitar otro enlace. No hay una cola duradera de correo ni garantía de entrega: supervisar los rechazos en Resend.
- El control de correo verificado también se aplica a sesiones anteriores en la operación del gimnasio, configuración inicial y administración SaaS. No se modifica el acceso de suscripción ni se pierden datos del gimnasio.

## Verificación local

`tests/integration/account-access.test.ts` usa un remitente en memoria y PostgreSQL de pruebas para comprobar verificación, expiración, rechazo de redirecciones externas, tokens hasheados, consumo concurrente único y revocación de sesiones. Los tests no envían correos reales. Las pruebas de interfaz cubren confirmación de contraseña, límite de intentos y servicio sin configurar.

Referencias: [opciones de Better Auth](https://better-auth.com/docs/reference/options), [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email).
