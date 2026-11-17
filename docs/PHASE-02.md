# Fase 02 — Base técnica (en curso)

## Implementado en Git

- Contratos TypeScript, vigencia de hechos y revisión de propiedades.
- Validación preliminar de fuentes autorizadas, asociación de hechos y medios, derechos, identificación de staging y presencia del formato final.
- Proyección pura de invalidación de paquetes: bloquea pendientes, cancela pendientes de propiedades inactivas y conserva programaciones externas para que el operador las corrija; no modifica Meta.
- Migraciones SQL: esquema inicial, RLS de lectura, revocación explícita de escrituras de cliente, integridad de estrategia y hechos por propiedad, definición de bucket privado con acceso directo denegado.
- Configuración de secretos de ejemplo y exclusión de archivos privados.

## Verificación realizada

13 pruebas de dominio pasaron en Node 22.16.0 con --experimental-strip-types, sobre copias de código verificadas por SHA Git (los archivos nuevos se comprueban al subir). TypeScript estricto también pasó mediante tsc --noEmit --strict --allowImportingTsExtensions --module nodenext --target es2022 src/domain/*.ts.

Estas pruebas no prueban una base de datos ni servicios externos. No prueban la veracidad de texto generado, disponibilidad real de medios o cumplimiento normativo. La validación de entradas no establece el estado LISTO.

## Decisiones y pendientes

Node >=22.18 es el objetivo de ejecución del repositorio. El frontend React/TypeScript y sus dependencias aún no se han incorporado. Las escrituras y descargas deben pasar por backend autorizado, con verificación de identidad y rol.

- Aplicar migraciones en un proyecto Supabase de desarrollo y probar aislamiento de dos usuarios/workspaces, referencias cruzadas y denegación de acceso a medios.
- Implementar backend de mutación, revisión transaccional, auditoría, invalidación persistente y alertas; la función actual de invalidación es pura y no se ejecuta automáticamente.
- Implementar validación de existencia del objeto, firma temporal y autorización al exportar.
- Configurar CI, frontend, autenticación y build.
- Confirmar repositorio privado antes de cualquier información real.

No se han provisionado servicios externos ni aplicado migraciones. No hay datos reales ni aplicación desplegada. La fase continúa abierta.
