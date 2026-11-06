# Respaldos cifrados y restauración

## Alcance

`pg_dump` crea una instantánea consistente de una base PostgreSQL en formato custom. Se cifra en streaming con AES-256-GCM, un nonce nuevo y autenticación del encabezado. El archivo temporal solo contiene datos cifrados; se publica con extensión `.gymora` después de verificarlo. No se escribe un dump sin cifrar en disco ni se pasan contraseñas como argumentos de procesos.

Incluye las organizaciones, cuentas, socios, contratos, caja, auditoría, cola de WhatsApp y esquema de la base. No incluye roles globales de PostgreSQL, variables de entorno ni archivos de un bucket S3. Las fotos requieren versionado y respaldo del bucket por separado. Los tokens de WhatsApp siguen cifrados: también hay que conservar `WHATSAPP_ENCRYPTION_KEY` fuera del respaldo de la base.

## Configuración

- `BACKUP_ENCRYPTION_KEY`: 32 bytes aleatorios en hexadecimal (64 caracteres). Guardar una copia en un gestor de contraseñas independiente. Perderla hace irrecuperables los archivos. No cambiarla sin conservar las claves anteriores y comprobar sus respaldos.
- `BACKUP_DIRECTORY`: carpeta privada fuera del directorio público; en este equipo se configuró `%LOCALAPPDATA%/Gymora/backups`.
- `POSTGRES_BIN_DIR`: directorio de `pg_dump` y `pg_restore`; usar una versión compatible con el servidor (PostgreSQL 18 en este entorno). En otros sistemas pueden estar en PATH.
- `DATABASE_URL`: base de origen. `RESTORE_DATABASE_URL`: solo para una restauración en una base de prueba vacía y distinta cuyo nombre termine en `_restore_test`.

```sh
npm run backup:create
npm run backup:verify -- RUTA_AL_ARCHIVO.gymora
npm run backup:restore -- RUTA_AL_ARCHIVO.gymora
```

La autenticación completa del archivo ocurre antes de ejecutar SQL. La restauración usa una transacción y se niega a sobrescribir una base con tablas, vistas o secuencias. El comando no crea ni elimina bases: preparar una nueva base vacía de pruebas con permisos suficientes. La recuperación a producción requiere planificar un cambio de conexión a la base recuperada y validar la aplicación; no ejecutar una limpieza sobre la base activa.

## Automatización local

El comando de creación registra inicio, éxito verificado o fallo en `backup-status.json`, sin nombres de archivos ni credenciales. Administración SaaS → Respaldos muestra ese resultado únicamente a administradores de la plataforma. Conserva el último éxito al fallar un intento y señala atrasos mayores de 36 horas. No sustituye la supervisión del Programador de tareas ni la prueba de restauración.

En Windows, `scripts/install-backup-task.ps1` registra `Gymora-Encrypted-Database-Backup` a las 03:00 de la zona horaria del equipo. Ejecuta con el usuario actual, sin privilegios elevados, con reanudación cuando esté disponible y evitando ejecuciones simultáneas. No reemplaza una tarea existente. Se necesita una sesión de Windows iniciada, PostgreSQL accesible y la carpeta del proyecto disponible. Revisar el resultado en el Programador de tareas; `LastTaskResult = 0` indica finalización correcta. Un fallo debe revisarse, no interpretarse como un respaldo creado.

Los archivos se conservan: no se borra automáticamente ningún respaldo. Supervisar espacio y antigüedad, y definir una política de retención al preparar el alojamiento. El respaldo local protege frente a errores de datos; la copia externa, PITR/WAL y las alertas de producción se configurarán con el alojamiento. No se ha contratado ni habilitado almacenamiento externo.

## Prueba de recuperación

`tests/integration/database-backup.test.ts` crea un respaldo de la base aislada `_test`, restaura en una base temporal nueva, compara los conteos de cuentas, organizaciones, socios, membresías, movimientos y mensajes, y comprueba los triggers. Verifica que una clave equivocada o un archivo alterado fallen y que un destino con datos sea rechazado. Solo elimina la base temporal que el propio test acaba de crear. Requiere permisos de creación de bases en el entorno de pruebas.

Referencias: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html). Para una base en producción con objetivos estrictos de recuperación, complementar estas instantáneas lógicas con el respaldo administrado del proveedor y recuperación a un punto en el tiempo.
