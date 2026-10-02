# MANCAR Gym — decisiones y entrega

## Reglas confirmadas

Ecuador, USD, recibos internos sin facturación fiscal. America/Guayaquil como zona inicial. Duración en días calendario, fin exclusivo a las 00:00 del día posterior al último día contratado. Renovación anticipada concatenada al fin vigente; vencida desde el día del pago. Acceso solo a la sucursal contratada. No se incluye una pasarela: los pagos son registros de cobros realizados por el empleado.

## Arquitectura

Monolito modular Next.js: presentación → servicios de aplicación → Prisma/PostgreSQL. Better Auth mantiene sesiones en base de datos; cookies HTTP-only, expiración y protección CSRF. Una cuenta de empleado pertenece a una organización; propietarios administran sus sucursales. El contexto de organización se resuelve desde la sesión y la asignación persistida, nunca del cuerpo enviado por el navegador. OWNER administra equipo; ADMIN gestiona configuración operativa; RECEPTIONIST cobra y registra accesos; TRAINER consulta asistencia e información mínima.

Todos los recursos tienen organizationId. Claves foráneas compuestas protegen relaciones dentro del tenant. Los servicios verifican tenant, permiso y sucursal. Las operaciones de cobro, renovación, venta, ajuste y reversión usan transacciones serializables e idempotencia. El stock se modifica condicionalmente y registra movimientos; no se permite negativo. Importes Decimal(14,2), entrada decimal como texto, redondeo HALF_UP. El libro registra entradas y salidas inmutables; las correcciones son contrapartidas.

## Modelo

User/Session/Account/Verification/RateLimit son autenticación. Organization → Branch/Staff/Member/Service/Plan/PaymentMethod/ExpenseCategory/Product. PlanService relaciona servicios; Membership conserva precio, nombre y servicios contratados en una instantánea histórica. CheckIn registra asistencia; DayPass registra visitas pagadas. Sale/SaleLine y Inventory/InventoryMovement soportan comercio. LedgerEntry registra ingresos, gastos y reversiones; AuditEvent guarda actor, acción y referencia. Todas las relaciones operativas se limitan a la misma organización.

## Rutas

/login, /register, /setup; /dashboard; /members y /members/[id]; /check-in; /pos; /inventory; /expenses; /reports; /settings. API autenticada bajo /api/gym, autenticación bajo /api/auth. Listados paginados con filtros URL. Las listas vacías no dependen de datos demo.

## Dirección visual

Concepto: un club deportivo en movimiento, diseñado para recepción. Las acciones de acceso y venta preceden a la actividad actual; el seguimiento de membresías y el balance del período ocupan una segunda zona. Navegación tinta, lima para la acción principal y la ruta activa, teal para acciones operativas, verde para membresías vigentes, melocotón para actividad de recepción y rojo para errores. La tipografía Segoe UI/sistema combina títulos deportivos compactos con cifras tabulares grandes. Iconos SVG de trazo consistente, superficies claras, bordes suaves y radios de 9–18 px. El indicador circular muestra únicamente el porcentaje real de socios activos con membresía vigente; no representa una meta ni datos ficticios.

La búsqueda de socios permanece disponible en la cabecera. En móvil se usa un menú lateral Radix con foco contenido, cierre con Escape y cierre al navegar; las tablas conservan desplazamiento horizontal deliberado. Las transiciones duran 150–350 ms y el indicador se revela una vez; `prefers-reduced-motion` desactiva animaciones y transiciones. El sistema no depende de imágenes decorativas, fuentes remotas ni librerías adicionales de animación. Los colores y la jerarquía se comparten con formularios, caja, reportes, estados y autenticación.

## Pruebas y fases

1. Base: autenticación, organización, sucursales, RBAC, shell y entorno.
2. Socios, servicios, planes, membresías, cobros y renovación.
3. Credencial QR, acceso, asistencia y pases diarios.
4. POS, stock, gastos y libro.
5. Consultas reales y reportes.
6. Integración PostgreSQL, E2E, revisión visual/responsive, seguridad, CI y documentación.

Cada fase debe validar tipos, lint, comportamiento y build antes de considerarse completa. Pruebas unitarias para fechas, dinero y permisos; integración PostgreSQL para atomicidad, aislamiento e inventario concurrente; Playwright para flujos completos y errores. Publicación requiere pasar la aceptación del brief y configurar backups, HTTPS, secretos e integraciones opcionales. Ningún documento sustituye la comprobación del producto.

## Dependencias

Prisma 7 estable por compatibilidad publicada con Better Auth (no Prisma 8 RC). Zod valida entradas. QRCode genera credenciales visuales y ZXing lee cámaras donde esté permitido. SDK S3 para almacenamiento privado. Sentry captura errores sanitizados si está configurado. Recharts se limita a reportes cliente. Radix aporta diálogos accesibles.
