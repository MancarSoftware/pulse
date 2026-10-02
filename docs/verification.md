# Verificación y límites de entrega

## Cobertura local

- Pruebas unitarias: fechas de calendario, límites de vencimiento, dinero exacto y permisos.
- Membresías de 1/3/6 meses: octubre completo, fines de mes, años bisiestos, renovación anticipada y reactivación de contratos vencidos; validación de teléfono numérico de hasta 10 dígitos y email con formato válido.
- Corrección de contratos antiguos: auditoría, idempotencia, permisos del propietario, conservación de pausas y continuidad de períodos prepagados.
- React Testing Library: etiquetas accesibles, errores de servidor y conservación de idempotencia tras fallo de conexión.
- Integración PostgreSQL: tenants distintos, claves foráneas compuestas, permisos, sucursales, renovación/pago atómicos, doble renovación concurrente, duplicados de acceso, vencimientos, congelación y reactivación, última unidad concurrente, rollback de venta con varias líneas, reversiones, libro inmutable, importes de gastos y pases.
- Regresión temporal: conexión con servidor configurado en otra zona, persistencia contra reloj real y roundtrip del instante de medianoche de Ecuador.
- Playwright/Chromium: registro, organización, sucursal inicial, empleado, servicios y plan, socio, pago y QR, ingreso permitido/denegado, pase, producto/stock/POS, gasto, renovación y reportes; aislamiento por sesión, login/logout, rol de recepción y CSRF.
- Layout de reportes a 375, 768 y 1366 px; capturas y comprobación de ausencia de overflow del documento.
- Rediseño: navegación móvil con apertura, Escape, retorno del foco y cierre al cambiar de ruta; búsqueda global de socios y preferencia de movimiento reducido. Revisión visual de dashboard, socios, acceso, POS, reportes y configuración a 375, 768 y 1440 px; menú y formulario de alta a 320 px. En teléfonos los vencimientos se muestran en filas adaptadas con la acción visible, sin scroll horizontal.
- Compilación de producción, TypeScript estricto, lint sin advertencias y auditoría npm.

## Correcciones durante verificación

1. Creación de líneas de venta ajustada al esquema de relaciones compuestas; ahora el fallo de cualquier línea revierte todo el movimiento.
2. Etiquetas de formularios separadas de opciones y ayudas mediante nombres accesibles explícitos.
3. Conexiones de PostgreSQL en UTC para evitar el desplazamiento de instantes con servidores configurados en hora local.
4. Gráficos sin animación de entrada para lectura inmediata y compatibilidad con movimiento reducido.
5. Renovaciones pagadas futuras excluyen falsas alertas de vencimiento del contrato anterior.
6. Reintentos simultáneos con la misma clave recuperan la misma operación confirmada.

## Límites que requieren infraestructura o dispositivos reales

No se han validado una publicación remota, backup/restore de un proveedor, recepción real de cámara en un dispositivo físico, envío WhatsApp/email, almacenamiento S3 real ni recepción de eventos en una cuenta Sentry. No hay credenciales de esos proveedores en el repositorio. Los adaptadores no devuelven éxito ficticio.

La validación de navegador automatizada cubre Chromium; no equivale a una auditoría formal WCAG, pruebas de lector de pantalla, Safari/Firefox ni una prueba de carga. Estas validaciones deben realizarse en el entorno y dispositivos de lanzamiento. La CI está configurada en el repositorio; su ejecución remota requiere subirlo a un proveedor compatible.

El software emite recibos internos y registra cobros manuales en USD. No implementa facturación electrónica, pasarela bancaria, cálculo fiscal, conciliación, devoluciones parciales ni suscripciones de facturación del propio SaaS. Este alcance sigue las reglas confirmadas.
