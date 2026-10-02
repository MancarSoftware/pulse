# Acceso móvil mediante HTTPS en Render

## Qué se publica

El mismo monolito Next.js, con sus API y sesiones, como un servicio Node.js permanente y PostgreSQL 18 administrado en la misma región. Render entrega una dirección HTTPS `https://<nombre-asignado>.onrender.com`; funciona desde Wi-Fi o datos móviles, sin mantener encendida la computadora. No requiere comprar un dominio. No se publica una exportación estática ni se abre el PostgreSQL de tu computadora a Internet.

`render.yaml` define ambos recursos, conexión interna a PostgreSQL, secreto de autenticación generado por Render, migraciones previas y `/api/health` como comprobación de disponibilidad. Los planes configurados son de pago: **revisar el precio total mostrado por Render antes de crear recursos**. No se ha contratado hosting desde el repositorio. Los despliegues posteriores son manuales para evitar publicar cambios sin revisar.

Fuentes: [Next.js en Render](https://render.com/docs/deploy-nextjs-app), [Blueprints](https://render.com/docs/blueprint-spec), [HTTPS](https://render.com/docs/tls).

## Pasos para publicar

1. Guardar los cambios en Git y subirlos a `MancarSoftware/pulse`. No subir `.env`, `.local`, datos demo, respaldos ni contraseñas. El asistente no crea un commit automáticamente.
2. Crear o abrir una cuenta en [Render](https://dashboard.render.com/) y conectar el repositorio GitHub. No compartir la contraseña ni códigos de acceso con el asistente.
3. Elegir **New → Blueprint**, seleccionar el repositorio y la rama que contiene `render.yaml`. Revisar los dos recursos, planes y costo. Aplicar solamente después de decidir contratar esos recursos.
4. El build instala dependencias, ejecuta `deploy:check` y compila la aplicación. La etapa pre-deploy ejecuta las migraciones sobre la nueva base de Render. Ninguna etapa ejecuta el seed ni importa información local.
5. Esperar estado **Live** y copiar la dirección HTTPS real mostrada por Render. Abrir `/api/health`: debe responder `{"status":"ok"}` sin información privada.
6. Abrir esa dirección en el teléfono con datos móviles, crear la cuenta del propietario y su organización. La nube comienza vacía: las cuentas locales no se copian. El nuevo gimnasio exige el primer pago SaaS confirmado.
7. Desde **Shell** del servicio, conceder acceso de administrador de plataforma a la cuenta real autorizada. Como Render proporciona el entorno y no existe `.env`, ejecutar `node node_modules/tsx/dist/cli.mjs scripts/platform-admin.ts --email CORREO_REAL`. No usar el correo ficticio demo. Configurar instrucciones de pago en `/platform`; la integración Payphone y Meta sigue pendiente.

Si no tienes acceso a Render/GitHub o no has contratado recursos, estos pasos quedan preparados pero **no existe todavía una dirección pública funcional**.

## Origen y dominio

Sin `BETTER_AUTH_URL`, el servidor usa `RENDER_EXTERNAL_URL`, proporcionado por Render; no usa el encabezado Host del visitante. El mismo origen se utiliza para sesiones, cookies Secure, validación de Origin y configuración Meta. Si añades un dominio personalizado, configura `BETTER_AUTH_URL=https://tu-dominio` en Environment y vuelve a desplegar. Usa solo origen, sin ruta, parámetros ni credenciales. El acceso debe realizarse desde ese dominio canónico para que autenticación y mutaciones coincidan.

`npm run deploy:check` valida configuración pública HTTPS y prohíbe el seed demo en producción. No contacta la base ni imprime secretos. En local, cargando `.env`, se espera que rechace `localhost`, porque ese origen no constituye un despliegue público.

## Base de datos y privilegios

El Blueprint restringe conexiones externas a la base (`ipAllowList: []`). La aplicación usa la conexión interna, nunca la dirección `127.0.0.1` local. Render inicialmente entrega una credencial propietaria de migración. Antes de incorporar datos reales, separar el rol operativo de ese propietario:

1. Desde una sesión PostgreSQL interna autorizada, crear un rol `mancar_app` con LOGIN sin privilegios de creación ni superusuario. Configurar su contraseña mediante `\password mancar_app`, sin guardarla en el repositorio o historial de comandos.
2. Conceder CONNECT a `mancar`, USAGE en `public`, y SELECT/INSERT/UPDATE/DELETE en sus tablas y USAGE/SELECT en secuencias. El rol no debe ser propietario de tablas ni tener CREATE en el esquema. Los triggers siguen protegiendo libro y auditoría append-only.
3. Configurar privilegios predeterminados para las futuras tablas y secuencias creadas por `mancar_migration`.
4. Guardar la conexión limitada como `DATABASE_URL` del servicio. Conservar la conexión propietaria en un secreto `DATABASE_MIGRATION_URL`; cambiar el comando pre-deploy a `DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:deploy`. Cambiar la entrada `DATABASE_URL` del Blueprint a `sync: false` para que futuras sincronizaciones no restablezcan la credencial propietaria.
5. Verificar acceso de aplicación y que ese rol no puede crear/truncar tablas. No habilitar acceso externo general para hacer esta configuración.

## Archivos, mensajes y respaldos

- Las fotos requieren un bucket S3 privado y las variables de `.env.example`; no guardarlas en el disco efímero del servicio. Sin configurar S3, las fotos permanecen deshabilitadas.
- No crear un worker WhatsApp hasta configurar Meta. Después crear un Background Worker en la misma región con build `npm ci --include=dev && npm run db:generate`, comando `node node_modules/tsx/dist/cli.mjs scripts/whatsapp-worker.ts`, la misma conexión limitada, origen HTTPS y las variables Meta. Guardar la clave de cifrado fuera de respaldos de la base. No usar el script local `worker:whatsapp`, que busca un `.env` inexistente.
- Revisar la retención y recuperación de respaldos del plan contratado, habilitar alertas del proveedor y comprobar una restauración en una base aislada antes de aceptar datos reales.
- Importar la base local es una tarea aparte: respaldo, transferencia segura, restauración y revisión de datos. No copiar una demo como si fueran clientes reales.

## Comprobación desde el teléfono

Abrir la dirección HTTPS real, entrar/salir y volver a entrar; buscar un socio y revisar un formulario sin desbordamiento. En `/check-in`, autorizar cámara y probar QR con un socio de pruebas cuya membresía pagada esté vigente. Verificar que una organización no ve datos de otra. Probar con datos móviles para confirmar que no depende de la LAN. Si la cámara está bloqueada, comprobar HTTPS y el permiso del navegador; usar búsqueda manual mientras tanto.

## Fallos y recuperación

- Build detenido por `deploy:check`: revisar el origen y los nombres de variables, sin copiar valores secretos a logs.
- Migración fallida: consultar el log privado del pre-deploy y corregir; no usar reset ni borrar tablas. El build nuevo no se publica cuando falla esa etapa.
- Health 503: comprobar estado y conexión interna de PostgreSQL. Health no valida todos los flujos de negocio; completar la aceptación manual.
- Inicio de sesión falla tras añadir dominio: ajustar `BETTER_AUTH_URL`, desplegar y entrar por ese dominio.
- Revertir aplicación: desplegar el commit anterior compatible con las migraciones aplicadas. No deshacer facturación borrando registros.
