# MANCAR Gym

Aplicación multiempresa para gimnasios en Ecuador: socios, planes configurables, membresías, cobros, recepción QR, pases diarios, POS, inventario, gastos y reportes. USD y recibos internos; **no incluye facturación fiscal ni procesamiento de tarjetas**. Los pagos registran cobros que el empleado ya recibió.

## Requisitos e instalación

- Node.js 24 LTS, npm y PostgreSQL 18.
- Base propia para desarrollo y otra terminada en `_test` para pruebas.
- No ejecutar pruebas ni demo contra datos de clientes.

```sh
npm ci
cp .env.example .env
# Completar DATABASE_URL, BETTER_AUTH_SECRET (32+ caracteres aleatorios), BETTER_AUTH_URL
npm run db:generate
npm run db:deploy
npm run dev
```

En Windows, usar `Copy-Item .env.example .env`; si PowerShell bloquea scripts npm, ejecutar `npm.cmd`.

Abrir http://localhost:3000, crear la cuenta del propietario y completar organización/sucursal. Luego configurar servicios y planes, empleados, productos y categorías de gastos. La aplicación funciona con una base vacía: no necesita seed.

## Entorno

Para revisar desde el teléfono, conecta ambos dispositivos al mismo Wi-Fi y ejecuta `npm run dev:mobile`. Abre la dirección que imprime la terminal y mantenla abierta. El comando detecta la IPv4 local, usa el puerto 3001 y configura el origen de autenticación sin modificar `.env`. No usa el Wi-Fi de invitados. La vista HTTP local no permite usar la cámara QR en algunos navegadores móviles; para ese flujo se necesita HTTPS.

`.env.example` contiene únicamente placeholders. Nunca agregar archivos `.env*` reales, respaldos, dumps o claves a Git. No hay secretos públicos `NEXT_PUBLIC_*`.

| Variable                                | Uso                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| DATABASE_URL                            | PostgreSQL; usar un rol dedicado con privilegios mínimos en producción           |
| BETTER_AUTH_SECRET                      | Secreto de firma aleatorio; idéntico entre réplicas                              |
| BETTER_AUTH_URL                         | Origen canónico; HTTPS público en producción                                     |
| SENTRY_DSN                              | Opcional; diagnóstico sanitizado desde el servidor                               |
| S3_REGION / S3_BUCKET                   | Bucket privado opcional para fotos                                               |
| S3_ENDPOINT                             | Endpoint opcional para proveedores compatibles con S3                            |
| S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | Credenciales del bucket privado, únicamente en servidor                          |
| ALLOW_DEMO_SEED / DEMO_PASSWORD         | Exclusivamente seed local; habilitación explícita y contraseña de 12+ caracteres |

Las fotografías se decodifican y convierten a WebP, limitadas a 2 MB/16 megapíxeles. Se sirven por una ruta autenticada; no requieren buckets públicos. Sin S3, la operación informa que no está configurada. WhatsApp/email permanecen deshabilitados mediante adaptadores explícitos: no se simulan envíos. Las alertas internas consultan vencimientos reales.

## Arquitectura y seguridad

Monolito modular Next.js 16, React 19, TypeScript estricto, Prisma 7 y PostgreSQL. Better Auth mantiene sesiones persistidas. Zod valida entradas. Tailwind/CSS tokens y Radix aportan la interfaz; Recharts visualiza agregados. Ver [decisiones](docs/architecture.md).

```text
src/app                 Rutas y presentación
src/components          Formularios y componentes visuales
src/modules             Servicios de aplicación por negocio
src/infrastructure      PostgreSQL, entorno, HTTP y almacenamiento
src/shared              Fechas, dinero, errores y contratos
prisma/migrations       Esquema y restricciones de integridad
tests                   Unitarias, integración PostgreSQL, navegador
```

La organización se deriva de sesión → empleado. No se acepta un tenant enviado por el navegador. Claves compuestas impiden relaciones entre tenants. OWNER administra empleados; ADMIN administra operación y reportes; RECEPTIONIST opera su sucursal; TRAINER accede al listado básico de socios. Cada operación verifica permisos en servidor y cada consulta filtra organización. Deshabilitar o cambiar acceso de un empleado invalida sus sesiones.

Las contraseñas las procesa Better Auth/scrypt; cookies HTTP-only, SameSite, expiración de 12 horas y cookies Secure bajo HTTPS. Better Auth limita endpoints de autenticación en PostgreSQL. Las mutaciones de negocio validan Origin contra el origen canónico. Configurar el proxy para sobrescribir cabeceras de IP y limitar solicitudes/tamaño del cuerpo antes de la aplicación. No publicar PostgreSQL a Internet.

## Reglas importantes

- Zona de calendario: Ecuador continental, America/Guayaquil. La fecha final se almacena como instante exclusivo; acceso hasta finalizar el último día pagado.
- Conexiones PostgreSQL fijadas a UTC, incluso cuando el servidor usa una zona local; conversión a Ecuador únicamente en las reglas de calendario y presentación.
- Renovación anticipada inicia cuando acaba el último contrato; vencida, desde el día del cobro. El contrato conserva servicios y precio históricos.
- Acceso solo a sucursal contratada; una mudanza de socio con contratos vigentes/congelados se rechaza.
- Congelar conserva días de calendario; al reactivar desplaza vencimientos y contratos futuros. Una pausa y reactivación en el mismo día no agrega días. No se renueva mientras haya congelación.
- Cobros, ventas y gastos usan idempotencia y transacciones serializables. La renovación valida que otro empleado no haya cambiado el último contrato. Las ventas validan el precio mostrado y descuentan stock condicionalmente.
- NUMERIC(14,2), cálculos Decimal y HALF_UP. No se aceptan importes con más de dos decimales. El cliente muestra importes; el servidor decide precio y total.
- Libro, movimientos de stock y auditoría son append-only con triggers PostgreSQL. Reversiones completas, motivo obligatorio, misma forma de pago; las membresías revertidas se cancelan. Devolver stock exige confirmación explícita.
- Los totales son flujo registrado, no utilidad contable ni conciliación bancaria. Ventas por producto se muestran brutas; devoluciones aparecen separadas en el libro.

## Migraciones y datos demo

```sh
npm run db:migrate -- --name nombre_del_cambio  # desarrollo
npm run db:deploy                             # despliegue
```

El seed se habilita exclusivamente con `ALLOW_DEMO_SEED=true` y `DEMO_PASSWORD` local. Después ejecutar `npm run db:seed`. Crea una organización marcada DEMO con personas ficticias, servicios, planes, stock, cobros, gastos y asistencia. No sobrescribe una demo existente. Usuarios `owner@mancar-demo.example` y `reception@mancar-demo.example`; contraseña suministrada en el entorno. El seed nunca se habilita en producción.

## Verificación

Crear `.env.test` con una base distinta cuyo nombre termine en `_test`, un secreto propio y `BETTER_AUTH_URL=http://localhost:3000`. Aplicar migraciones a esa base:

```sh
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
```

Playwright inicia el build de producción con `.env.test` en el puerto 3000; ese puerto debe estar libre. Los tests crean datos ficticios únicos en la base de pruebas y no borran datos. Las pruebas de concurrencia necesitan PostgreSQL real. CI ejecuta los mismos controles con un PostgreSQL efímero limitado al runner. Las trazas pueden contener datos del escenario de prueba: no usar clientes reales.

## Despliegue

1. Preparar PostgreSQL administrado o dedicado, un rol de migración y un rol de aplicación separado sin DDL/TRUNCATE; configurar TLS.
2. Configurar secretos en el proveedor, HTTPS/origen canónico y un bucket privado si se necesitan fotografías.
3. `npm ci`, `npm run db:generate`, ejecutar controles, `npm run build`.
4. Respaldar base; `npm run db:deploy` con credenciales del rol de migración.
5. `npm run start` con credenciales limitadas de aplicación; exponer detrás de un proxy HTTPS con límites y cabeceras IP confiables.
6. Verificar `/api/health`, iniciar sesión y ejecutar aceptación en staging.

Backups diarios cifrados y retención definida por el operador; comprobar restauración periódicamente en una base aislada. Usar migraciones compatibles con el build anterior para rollback; revertir la aplicación primero, nunca borrar registros financieros para deshacer un despliegue. Rotar credenciales si aparecen en Git o logs, incluyendo su historial. La publicación y conexiones a proveedores requieren configuración real; el repositorio no fabrica esas validaciones.

Las versiones de `deepmerge-ts` y `mysql2` están fijadas mediante overrides para corregir avisos transitivos del CLI de Prisma, verificados con migraciones/generación y tests. Revisar y retirar los overrides cuando la dependencia principal incorpore las correcciones.
