# Fase 02 — Base técnica y primera interfaz (en curso)

## Verificado previamente

19 pruebas de dominio y servidor (run 44072450285) y migraciones/aislamiento en PostgreSQL desechable (run 44072450503). El fallo inicial por identificador SQL reservado fue corregido. No equivale a verificación de servicios Supabase reales.

## Incorporado

- React/TypeScript/Vite y SDK Supabase, con versiones directas fijadas; lockfile pendiente.
- Autenticación por correo y contraseña con sesión en memoria, sin registro público en la UI. Solo se acepta clave publicable sb_publishable_ en frontend. El servicio Supabase debe desactivar altas públicas y asignar membresías manualmente antes del piloto.
- Lectura explícita por workspace, protegida por RLS; sin escrituras ni exportación desde la UI. No cargar datos parciales cuando se alcanza el límite de consultas.
- Esqueleto visual monocromático: Hoy, calendario semanal navegable, propiedades, excepciones y detalle. Demo separada con datos ficticios, sin fotos ni copies reales, sin acceso a servicios. No se marca contenido como listo; estado LISTO exige revalidación y exportación permanece desactivada.
- Pruebas de fechas civiles de Texas y navegación semanal; CI de compilación y artefacto estático de demo. La compilación y nuevas pruebas quedan pendientes de resultado en Actions.

## Pendientes

1. Verificar nueva compilación y pruebas; fijar lockfile y revisar dependencias.
2. Provisionar Supabase de desarrollo, aplicar migraciones y probar Auth, PostgREST y Storage reales. Crear usuario y workspace de prueba; desactivar registro público.
3. Completar CRUD y mutaciones autorizadas, control de fuentes, firma de medios, resolución de alertas y Quality Gate.
4. Auditoría visual y accesibilidad; calendario de 14 días, generación y paquetes completos en fases posteriores.

No se ha conectado Supabase ni desplegado una aplicación privada. El repositorio sigue público: no cargar datos reales, medios o secretos.
