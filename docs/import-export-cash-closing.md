# Importación, exportación y cierre diario

## Permisos y navegación

El propietario accede a **Importar y exportar** desde el menú, Socios o Reportes. Solamente OWNER puede importar y exportar; el servidor aplica esta regla independientemente de los controles visibles. Propietarios y administradores con `reports:read` acceden a **Cierre de caja**. No se amplían permisos de recepción ni entrenadores.

## Importar socios y membresías previas

Usar la plantilla de la página: CSV UTF-8, coma o punto y coma como separador, hasta 100 socios y 256 KB por archivo. Se admiten comillas, comillas escapadas y notas con saltos de línea. Las columnas desconocidas o repetidas se rechazan para evitar descartar información silenciosamente.

| Columna                      | Uso                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| nombres, apellidos, telefono | Obligatorios. Teléfono de hasta 10 dígitos; conservar el cero inicial.                                                            |
| email, notas                 | Opcionales. El correo se valida y normaliza a minúsculas.                                                                         |
| plan                         | Nombre exacto de un plan habilitado ya configurado en este gimnasio.                                                              |
| inicio, ultimo_dia           | Fechas originales AAAA-MM-DD. El último día es inclusivo en Ecuador.                                                              |
| importe                      | Importe original declarado, con hasta dos decimales. Puede ser cero para contratos migrados. No es un cobro registrado en Gymora. |
| congelada_desde              | Opcional: fecha original de congelación, anterior al vencimiento y no futura. Se conserva para calcular la reactivación.          |

Una fila puede crear un perfil y **un contrato inicial previo**. Sin datos de contrato se crea únicamente el perfil. No se actualizan perfiles existentes ni se importan varias filas como contratos adicionales de la misma persona. Para el contrato se copian los servicios actuales del plan, mostrados en la vista previa; configurar primero los planes que correspondan a los contratos anteriores.

La vista previa muestra filas válidas, inválidas y coincidentes, incluyendo coincidencias dentro del archivo. Solo las válidas pueden seleccionarse. Los contactos compartidos se revisan mediante el registro manual existente; la importación no elude esa revisión. La confirmación vuelve a comprobar duplicados y planes en una transacción: cualquier cambio impide guardar el lote completo.

La vista previa está firmada, vinculada a usuario, gimnasio, sucursal, archivo y definición de los planes, y vence en 15 minutos. El identificador de solicitud hace seguro reintentar una confirmación cuya respuesta se perdió; reutilizarlo con datos distintos se rechaza. Cada lote y sus filas quedan auditados sin guardar una copia del CSV en logs.

Los contratos importados llevan origen `IMPORT` y referencia al lote. Conservan las fechas declaradas, incluida la pausa si se proporcionó. No crean entradas de caja ni mensajes de WhatsApp y no se contabilizan como ventas nuevas o renovaciones del período. Sí participan en las validaciones de acceso y en las cifras actuales de membresías vigentes. Una renovación posterior registrada en Gymora crea el cobro real habitual y se considera renovación de un cliente existente.

Los perfiles y contratos quedan en la misma organización. Se genera una nueva credencial de Gymora; no se importan QR antiguos, contraseñas o permisos de WhatsApp. La corrección histórica de planes de días no modifica contratos migrados. No existe borrado de lotes: revisar antes de confirmar y deshabilitar perfiles incorrectos, preservando la auditoría.

## Exportar registros

La descarga prepara un CSV UTF-8 con BOM para socios, membresías o movimientos. Puede limitarse por sucursal; las fechas filtran el alta del perfil, inicio del contrato o fecha del movimiento, respectivamente. En movimientos ambas fechas son obligatorias; el intervalo máximo es de 366 días. Socios y membresías admiten exportación sin fechas.

El límite es 5000 registros. Si se supera se exige reducir los filtros; no se entrega una descarga truncada. Solo se incluyen filas de la organización de la sesión y se comprueba que la sucursal pertenezca a ella. Se audita la preparación del archivo, no se afirma que el navegador lo haya guardado.

No se exportan contraseñas, tokens ni credenciales QR. Las celdas de texto potencialmente interpretables como fórmulas se neutralizan con un apóstrofo; los importes numéricos controlados conservan sus signos y decimales. Los formatos de exportación son reportes y no sustituyen la plantilla de importación. En una hoja de cálculo, importar teléfonos como texto para evitar que el programa quite el cero inicial.

## Cierre diario por sucursal

El cierre consolida un día de calendario de America/Guayaquil y una sucursal habilitada. Es un control diario compartido de la sucursal, no un sistema de turnos o múltiples cajones independientes. No admite días futuros.

1. Consultar la fecha y sucursal.
2. Revisar entradas, salidas y neto por forma de pago. Las salidas incluyen gastos y devoluciones; las correcciones se toman con su signo real del libro.
3. Seleccionar explícitamente qué formas representan efectivo físico. Tarjetas y transferencias pueden revisarse como referencia sin agregarlas al efectivo.
4. Registrar fondo inicial y efectivo contado. Esperado = fondo inicial + neto de las formas seleccionadas. Diferencia = contado − esperado. El fondo no crea ingresos.
5. Explicar diferencias y confirmar el conteo. Toda nueva versión requiere motivo, aunque la diferencia sea cero.

El servidor recalcula con Decimal y rechaza datos de una vista previa desactualizada. La misma solicitud no crea dos cierres. Se guardan importes, formas y nombres históricos, conteo de movimientos, responsable y motivo. Los cierres no pueden editarse ni eliminarse en PostgreSQL; una corrección crea otra versión.

Cerrar hoy no impide seguir operando. La página señala movimientos posteriores o gastos registrados con fecha anterior que cambien el día cerrado. Las versiones previas no se reescriben. Un faltante no genera un gasto ni una devolución automática; corregir una operación requiere su procedimiento habitual de reversión.

## Verificación y límites

Las pruebas de PostgreSQL cubren importación sin ingresos ficticios, duplicados y reintentos concurrentes, cambios de planes, aislamiento, cifras exactas, versiones inmutables, devoluciones y movimientos con fecha anterior. Las pruebas de navegador ejercitan la carga de CSV, revisión y confirmación, descarga real, cierres y nuevas versiones, permisos y diseños a 375, 768 y 1440 px.

Las capturas y emulación móvil se ejecutan localmente. Una prueba física del lector QR, permisos de cámara y conexión desde el teléfono necesita el dispositivo del usuario y un origen accesible adecuado; no se afirma que una cámara física haya sido validada por las pruebas automatizadas.

Para la prueba física pendiente: iniciar sesión como propietario y como recepción, abrir un socio, revisar una renovación, leer su QR y comprobar el rechazo del segundo ingreso del día, probar la búsqueda con cámara denegada, cargar un CSV de prueba, comprobar la descarga y completar un cierre con una diferencia explicada. Usar datos ficticios. Registrar modelo de teléfono, navegador y resultado; no confundir la emulación de pantalla con validación del hardware.

## Migraciones

Aplicar `20261106000000_member_import_cash_closing` y `20261106001000_import_declared_amount`. Agregan lotes, cierres, origen de contratos, relaciones compuestas por organización y restricciones de inmutabilidad. Los contratos existentes reciben origen PAYMENT; las reglas de cobros nuevos siguen exigiendo importes positivos. Antes de aplicar en otra instalación, crear y verificar un respaldo y ejecutar primero las pruebas con `.env.test`.
