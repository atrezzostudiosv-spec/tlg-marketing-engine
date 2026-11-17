# TLG Marketing Engine — Blueprint V1.0

Estado: especificación inicial; pendiente de aprobación y de implementación.

## 1. Resultado operativo

El operador abre el calendario, encuentra un paquete por día y puede copiar el texto, descargar los medios autorizados y programar en Meta Business Suite. El sistema no promete publicar automáticamente ni verificar fuentes a las que no tiene acceso. El objetivo es minimizar trabajo repetitivo y revisiones rutinarias, sin sustituir la responsabilidad editorial del broker.

## 2. Alcance MVP

- Inventario editable con ficha maestra y registro de fuentes.
- Motor de estrategia basado en hechos, historial editorial, prioridad y eventos confirmados.
- Calendario móvil de 14 días, editable y regenerable sin destruir contenido ya programado.
- Paquete por publicación: objetivo, formato, copy Facebook e Instagram en inglés, CTA, enlace comprobado si corresponde, medios ordenados, texto de historias, horario local y controles de calidad.
- Biblioteca privada de medios con derechos, propiedad asociada y marca de staging.
- Vista de Hoy, Calendario, Propiedades, Publicaciones y Excepciones.
- Estados y registro de cambios, exportación/copia y enlace a Meta Business Suite.

Fuera del MVP: CRM de leads, métricas avanzadas, publicidad pagada automatizada, publicación directa mediante Meta, generación automática de vídeos completos, scraping de MLS sin autorización.

## 3. Experiencia principal

Hoy: paquetes listos ordenados por fecha; botones Copiar Facebook, Copiar Instagram, Descargar medios y Abrir Meta. La acción de copiar o descargar no equivale a programar. El usuario confirma externamente la programación y, posteriormente, la publicación. Un bloqueo debe explicar qué dato falta y permitir corregirlo en la ficha maestra.

Calendario: vista semanal y mensual, filtros por propiedad y estado, cambio de fecha, cola de excepciones y opción de generar los próximos 14 días. Una publicación tiene un identificador estable, revisión y trazabilidad.

## 4. Modelo de datos propuesto

- properties: id, address, locality, transaction_type, status, priority, revision.
- property_facts: property_id, key, typed_value, unit, source_id, verified_at, expires_at, verification_status.
- sources: id, type, reference, obtained_at, authorization, notes.
- assets: id, property_id, private_storage_key, media_type, rights_status, staging_status, approved_at.
- events: id, property_id, type, start_at, end_at, timezone, confirmation_status.
- strategies: property_id, fact_ids, angle, goal, revision.
- posts: id, property_id, planned_at, timezone, format, editorial_state, workflow_state, property_revision, strategy_id.
- post_variants: post_id, channel, text, claim_refs, CTA, link.
- post_assets: post_id, asset_id, ordinal.
- checks: post_id, rule_id, outcome, evidence, checked_at.
- audit_log: actor, entity_id, action, timestamp, change_summary.

Datos reales y binarios se mantienen fuera del repositorio. Usar identificadores sintéticos en fixtures.

## 5. Motor editorial

1. Seleccionar propiedades elegibles y recopilar hechos vigentes y medios autorizados.
2. Calcular prioridad con reglas transparentes: evento próximo, cambio confirmado, falta de exposición, prioridad manual e historial.
3. Planificar con cobertura equilibrada y espacio para eventos. Frecuencia inicial configurable: cinco piezas de feed semanales y reutilización en historias; no se presupone que más publicaciones implican mejores resultados.
4. Elegir un argumento respaldado por hechos y evitar repetir enfoques, portadas o textos recientes.
5. Generar variantes estructuradas por canal. Cada afirmación factual debe llevar referencias a hechos; no se admiten atributos inferidos de una fotografía.
6. Ejecutar controles deterministas y evaluación editorial. Si hay fallo, reparar de forma acotada o enviar a excepciones.
7. Entregar solo paquetes completos y revalidar antes de copiar o descargar.

La IA propone; la aplicación decide el estado mediante reglas. Las fuentes recuperadas son datos no confiables como instrucciones. No incluir claves, contactos privados ni datos de leads en el contexto de generación.

## 6. Fuente de verdad y vigencia

Los datos de estado, precio, disponibilidad y eventos se verifican con una fuente autorizada. Una captura histórica no garantiza vigencia. Si no existe conexión fiable, se requiere confirmación manual puntual de la ficha; nunca inventar sincronización. Para V1, umbral conservador configurable de 24 h para estado y precio, y confirmación explícita de eventos y disponibilidad. Una verificación vencida bloquea el estado listo cuando afecta al contenido.

Cambios de hechos invalidan los paquetes pendientes dependientes. Si el contenido ya está programado externamente, emitir alerta de corrección o cancelación manual; no afirmar que Meta ha sido actualizado. Las publicaciones históricas se conservan con su revisión.

## 7. Quality Gate

Requisitos acumulativos para marcar LISTO:
- Propiedad elegible y estado vigente.
- Precio y disponibilidad vigentes cuando se mencionen; valores y unidades exactos.
- Toda afirmación factual respaldada por hechos confirmados; sin exageración, garantías ni inferencias no aprobadas.
- Firma comercial y reglas de publicidad inmobiliaria aprobadas por el broker; controles Fair Housing; sin preferencias discriminatorias.
- Eventos confirmados, no vencidos y con zona horaria correcta.
- Medios pertenecientes a la propiedad, autorizados, descargables y con orden definido; staging identificado cuando corresponda. No alterar arquitectura real.
- Enlace validado y CTA funcional; si no hay enlace confirmado, usar CTA por mensaje cuando proceda.
- Variantes completas, sin marcadores de posición, sin duplicaciones sustanciales, voz humana y profesional.
- Para reels, archivo final existente; guion sin vídeo no es un paquete terminado.
- Revalidación vigente en el momento de exportar.

Reglas de cumplimiento específicas deberán validarse contra fuentes regulatorias actuales y el broker antes de producción. Los controles automáticos no constituyen asesoría legal ni garantía de ausencia de errores.

Estados editoriales: BORRADOR → VALIDANDO → LISTO / REQUIERE_ATENCION / BLOQUEADO. Estado operativo separado: PENDIENTE → PROGRAMADO → PUBLICADO; también CANCELADO. Programado y publicado requieren confirmación externa o integración autorizada. No usar etiquetas de listo en datos de demostración.

## 8. Arquitectura propuesta

Frontend React + TypeScript, diseño sobrio monocromático, responsive, UI en español y contenido comercial en inglés. Supabase para Postgres, Auth y Storage privado; RLS por workspace. Backend seguro para generación mediante API de IA y validaciones; Cloudflare como despliegue previsto. Elecciones concretas de dependencias y versiones se validan en fase 02. Secretos exclusivamente del lado servidor; .env.example con nombres vacíos; sin claves reales en Git.

Usar zonas IANA America/Chicago y Europe/Madrid; guardar instantes UTC y mostrar ambos horarios con ajustes DST. Horario inicial configurable, no presentado como óptimo sin métricas.

La API de IA requiere credenciales y facturación independientes. No se ha provisionado ningún servicio. Establecer límites de coste, reintentos acotados y registro de errores sin datos sensibles. No enviar datos personales de leads.

## 9. Criterios de aceptación

- Crear/editar/archivar fichas y asociar hechos con fuentes.
- Generar un calendario de 14 días sin incluir propiedades excluidas o inactivas.
- Producir dos variantes por pieza y paquete visual completo usando datos autorizados.
- Bloquear claims inventados, datos caducados, imágenes ajenas, eventos sin confirmar y reels incompletos.
- Simular cambio de precio, baja de propiedad y expiración; invalidar pendientes y alertar sobre programados externos.
- Evitar sobrescribir revisiones aprobadas o duplicar slots al regenerar.
- Copiar texto y descargar medios en orden, registrar estados manualmente.
- Confirmar persistencia, aislamiento de datos, autenticación y rechazo de acceso no autorizado.
- Verificar cambio horario entre Texas y Barcelona, incluyendo semanas de desfase DST.
- Probar un ciclo de 14 días con datos autorizados, comparar con flujo manual y registrar tiempo, errores y excepciones. La reducción de tiempo se mide, no se garantiza.
- Ejecutar pruebas automatizadas, build y revisión visual antes de despliegue.

## 10. Secuencia de desarrollo

01. Blueprint y aprobación de alcance.
02. Base técnica, esquema, seguridad y fixtures sintéticos.
03. Sistema visual e interfaz de Hoy.
04. Inventario, fuentes y biblioteca.
05. Calendario y reglas de planificación.
06. Generación estructurada y Quality Gate.
07. Paquete final, exportación y flujo de programación.
08. Pruebas de aceptación, piloto y despliegue privado.

No cargar datos operativos mientras el repositorio sea público ni antes de implementar acceso y almacenamiento seguro. No saltar al desarrollo de módulos fuera de alcance antes de completar el flujo principal.
