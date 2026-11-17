# Fase 02 — Base técnica y primera interfaz (en curso)

## Verificado en GitHub

- 24 pruebas de dominio, servidor y calendario, compilación TypeScript/Vite y dos pruebas Chromium de navegación y responsive: run 44075571873.
- Migraciones e aislamiento en PostgreSQL desechable: run 44075419647. El fallo inicial por identificador SQL reservado se corrigió.
- Capturas de escritorio y móvil y build demo disponibles en artefactos de Frontend build. No equivalen a una auditoría visual humana o una aplicación privada desplegada.
- Lockfile generado por npm en CI e incorporado a Git; siguientes builds usan npm ci.

## Implementado

- React/TypeScript/Vite, SDK Supabase y autenticación por correo y contraseña con sesión en memoria, sin registro público en la UI. Solo se acepta clave publicable sb_publishable_ en frontend.
- Lectura por workspace, protegida por RLS; sin escrituras o exportación desde UI. No se muestran resultados parciales si se alcanza el límite de consultas.
- Esqueleto visual: Hoy, calendario semanal navegable, propiedades, excepciones y detalle. Demo ficticia sin fotos o copies reales; exportación desactivada hasta implementar revalidación completa.
- RPC transaccional de confirmación de estado y precio, bloqueo de pendientes, alertas de programación externa y auditoría. No modifica Meta.

## Pendientes

1. Provisionar Supabase de desarrollo y probar Auth, PostgREST y Storage reales. Desactivar registro público en el servicio y asignar membresías autorizadas.
2. Completar CRUD, confirmación de otros hechos, firma de medios, control de fuentes, resolución de alertas y Quality Gate.
3. Auditoría visual y accesibilidad; planificación de 14 días, generación y paquetes completos en fases posteriores.
4. Confirmar repositorio privado y desplegar aplicación protegida antes de cargar datos reales.

No hay conexión real a Supabase ni entorno privado desplegado. El repositorio sigue público. La fase continúa abierta.

## Incremento de ficha maestra

Se añadió creación de fichas pendientes, registro de fuentes por propiedad mediante atestación explícita del operador y confirmación tipada de nueve campos: estado, precio, habitaciones, baños, superficie, terreno, descripción, enlace y disponibilidad. La ficha presenta datos registrados, vigencia y fuente. La confirmación de un dato cambia la revisión e invalida publicaciones dependientes mediante la misma RPC transaccional; las programaciones de Meta generan alertas, no modificaciones externas. La demo simula cambios en memoria sin persistencia. No se realiza verificación independiente de las fuentes ni comprobación de enlaces todavía. Las pruebas específicas de esta ampliación deben comprobarse en Actions. El backend desplegado y Supabase real siguen pendientes.
