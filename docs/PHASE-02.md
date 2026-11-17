# Fase 02 — Base técnica (inicio)

## Implementado en Git

- Contratos de dominio TypeScript y validación preliminar de vigencia/revisión.
- Pruebas nativas de Node, sin dependencias externas en esta etapa.
- Migración SQL inicial con claves compuestas para aislamiento entre workspaces y políticas RLS de lectura; escritura desde navegador denegada por defecto.
- Configuración de secretos de ejemplo y exclusión de archivos privados.

## Decisiones

Node >=22.18 permite ejecutar las pruebas TypeScript mediante el soporte nativo de eliminación de tipos. El frontend React/TypeScript se incorpora en la siguiente etapa técnica; no se ha fijado aún una versión de React ni del resto de dependencias. La elegibilidad básica no equivale al Quality Gate completo.

Las escrituras deben realizarse mediante backend autorizado con verificación de identidad y rol. El backend, la comprobación de autorización de fuentes, la actualización transaccional de revisiones, las políticas de almacenamiento, la invalidación de publicaciones y la auditoría de mutaciones aún no están implementados. No habilitar escrituras de cliente para simplificar la integración.

## Verificación pendiente

- Ejecutar npm test en un entorno Node compatible.
- Aplicar migración en un proyecto Supabase de desarrollo y probar aislamiento con dos usuarios y dos workspaces; verificar denegación de escrituras, referencias cruzadas y accesos a medios.
- Configurar un bucket privado y sus políticas antes de almacenar archivos.
- Crear backend y verificar las transiciones editoriales antes de permitir el estado LISTO.
- Configurar CI y frontend, revisar dependencias y ejecutar build.
- Confirmar repositorio privado antes de cualquier información real.

No se han provisionado servicios externos ni se ha ejecutado la migración. No hay datos reales ni una aplicación desplegada. La fase continúa abierta.
