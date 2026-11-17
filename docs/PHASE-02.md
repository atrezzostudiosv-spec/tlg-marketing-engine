# Fase 02 — Base técnica (en curso)

## Implementado en Git

- Contratos TypeScript, vigencia, revisión, fuentes, derechos y formatos; no equivalen al Quality Gate completo.
- Migraciones iniciales de esquema, aislamiento, integridad por propiedad y bucket privado.
- Actualización transaccional de precio y estado mediante RPC restringida a service_role. Identidad verificada en servidor, rol comprobado en SQL, revisión optimista, fuente autorizada, registro de auditoría, invalidación persistente y alertas para programaciones externas.
- Confirmar nuevamente un dato idéntico no cambia la revisión ni invalida publicaciones. Cambiar un dato bloquea pendientes; retirar una propiedad cancela pendientes, sin modificar Meta ni publicaciones históricas.
- Adaptador HTTP para Cloudflare Pages Functions, sin credenciales en cliente. Solo soporta precio y estado en esta etapa; no es CRUD completo ni integración desplegada.
- CI de dominio y CI de PostgreSQL desechable con fixtures sintéticos. La emulación de esquemas auth/storage no sustituye las pruebas de Supabase real.

## Verificación

13 pruebas anteriores pasaron en GitHub Actions (run 44070639287). Nuevas pruebas de servidor y SQL incorporadas; comprobar sus ejecuciones en el historial de Actions. No afirmar que pasaron hasta observar resultado.

## Pendientes

- Verificar nuevas ejecuciones de CI y corregir fallos.
- Provisionar Supabase de desarrollo, aplicar migraciones y probar Auth, PostgREST y Storage reales.
- Completar CRUD, confirmación de otros hechos, políticas de exportación y firma de medios, verificación de existencia, control de cambios de fuentes, resolución de alertas y Quality Gate.
- Incorporar frontend React/TypeScript, autenticación, build y despliegue privado.
- Repositorio todavía público: no cargar datos operativos, medios ni secretos.

No se ha desplegado la aplicación ni conectado una base de datos externa. La fase continúa abierta.
