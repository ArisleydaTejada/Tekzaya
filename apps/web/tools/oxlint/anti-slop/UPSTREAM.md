# Procedencia de anti-slop

- Repositorio de origen: https://github.com/dmmulroy/anti-slop
- Commit de origen: 13909c9e07590f5a85d93c62712259fe14a883f7 (copia incluida en la skill `install-anti-slop`)
- Instalado: 2026-11-10
- Rutas instaladas: `apps/web/tools/oxlint/anti-slop/` (plugin genérico `index.ts`; el plugin `effect/` se copió pero no está activado porque el proyecto no depende de `effect`)
- Dependencia: `@oxlint/plugins` 1.86.0 fijada a la versión exacta de `oxlint` instalada en `apps/web`
- Desviaciones intencionadas: ninguna en el código. Se instaló dentro de `apps/web` (no en la raíz) porque `oxlint` solo existe en ese workspace.
