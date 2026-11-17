# TLG Marketing Engine

Aplicación interna de planificación y producción de contenido inmobiliario.

## Objetivo

Entregar un calendario editorial con paquetes de publicación completos, comprobados y listos para los canales sociales. La publicación externa se mantiene bajo control humano.

## Estado

Fase 02: base técnica y primera interfaz React. La demostración navegable usa datos ficticios. El entorno privado, el CRUD completo, la generación y exportación aún no están operativos.

## Documentación

- [Blueprint V1.0](docs/BLUEPRINT.md)
- [Estado de fase 02](docs/PHASE-02.md)

## Desarrollo

Node 22.18+; npm ci; npm test; npm run build. CI compila, prueba PostgreSQL con fixtures sintéticos y ejecuta pruebas de navegador. Las capturas y el build de demostración están en los artefactos del workflow Frontend build.

## Seguridad

No almacenar credenciales, datos personales, información comercial privada, fotografías sin autorización ni inventarios reales. Utilizar variables de entorno y almacenamiento privado. El frontend solo acepta la clave publicable de Supabase; nunca una clave de servicio. Antes de cargar información real, confirmar visibilidad privada, servicios de desarrollo y controles de acceso.

## Principio

Analizar → planificar → producir → verificar → entregar.
