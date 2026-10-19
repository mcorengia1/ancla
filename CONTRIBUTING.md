# Contributing to Ancla · Cómo contribuir

_Español más abajo._

Thanks for helping! Ancla is a small, dependency-free extension written in plain JavaScript. There is no build step: the files in `src/` are exactly what Firefox loads.

## Getting started

```bash
npm install
npm start      # Firefox with the extension loaded and live reload
npm run check  # tests + Mozilla's validator; run this before opening a PR
```

## Most common contribution: a feed came back

Sites change their HTML often. When a hidden feed (or YouTube Shorts) shows up again, the fix is almost always a CSS selector.

1. Open the site in Firefox, right-click the element that should be hidden and choose **Inspect**.
2. Find a **stable** selector. In order of preference:
   - `data-testid`, `role` or `aria-*` attributes (X uses `data-testid`, Facebook uses `role="feed"`),
   - custom element names (YouTube uses `ytd-*`, Reddit uses `shreddit-*`),
   - semantic tags like `main` or `article`.
   Avoid generated class names like `x1lliihq` — they change on every deploy.
3. Edit the site's entry in `FEEDS` (or `SHORTS_CSS`) in `src/content.js`:
   - `isFeed(path)`: on which paths the feed is hidden.
   - `css`: rules that only apply on those paths (prefix them with `html[data-ancla-feed]`).
   - `always`: rules for the whole site (e.g. recommendations next to a video).
   - `redirect(path)`: paths that go back to the home page (e.g. Reels).
4. Check that messages, search and profiles still work on that site.
5. Mention in the PR which page you tested and the date — it helps when the site changes again.

## Adding support for a new site's feed

1. Add the domain to `FEED_SITES` in `src/common.js`, with the name and a short hint shown in the panel.
2. Add an entry to `FEEDS` in `src/content.js`.
3. Update the supported sites list in `README.md` and in `store/amo-listing.md`.

## Changing the logic

Schedules, rule merging, strict mode and migrations live in `src/common.js` and are covered by `tests/logic.test.js`. Please add or update a test when you change any of them.

If you change how settings are stored, add a migration in `migrate()` so existing users keep their configuration.

## Pull request checklist

- [ ] `npm run check` passes.
- [ ] Tested by loading `src/manifest.json` in Firefox.
- [ ] Strict mode still only allows making rules stricter.
- [ ] No data leaves the browser (no network requests, no analytics).
- [ ] `CHANGELOG.md` updated under "Unreleased".

## Releases (maintainers)

1. Bump `version` in `src/manifest.json` and `package.json`.
2. Move the "Unreleased" entries in `CHANGELOG.md` to the new version.
3. Push a tag with the same version as the manifest, e.g. `v2.3`. The **Publish** workflow runs the checks, submits the version to Firefox Add-ons and creates a GitHub release. It needs the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository secrets (see the comments in `.github/workflows/publish.yml`).

---

## En español

¡Gracias por sumarte! Ancla es una extensión chica, sin dependencias, escrita en JavaScript plano. No hay paso de compilación: los archivos de `src/` son exactamente los que carga Firefox.

### Primeros pasos

```bash
npm install
npm start      # Firefox con la extensión cargada y recarga automática
npm run check  # tests + validador de Mozilla; correlo antes de abrir un PR
```

### La contribución más común: volvió a aparecer un feed

Los sitios cambian su HTML seguido. Cuando un feed oculto (o los Shorts) vuelve a aparecer, la solución casi siempre es un selector CSS.

1. Abrí el sitio en Firefox, hacé clic derecho sobre el elemento que debería ocultarse y elegí **Inspeccionar**.
2. Buscá un selector **estable**. En orden de preferencia:
   - atributos `data-testid`, `role` o `aria-*` (X usa `data-testid`, Facebook usa `role="feed"`),
   - nombres de elementos propios (YouTube usa `ytd-*`, Reddit usa `shreddit-*`),
   - etiquetas semánticas como `main` o `article`.
   Evitá clases generadas como `x1lliihq`: cambian en cada actualización del sitio.
3. Editá la entrada del sitio en `FEEDS` (o `SHORTS_CSS`) en `src/content.js`:
   - `isFeed(path)`: en qué rutas se oculta el feed.
   - `css`: reglas que solo aplican en esas rutas (con el prefijo `html[data-ancla-feed]`).
   - `always`: reglas para todo el sitio (por ejemplo, los recomendados al lado de un video).
   - `redirect(path)`: rutas que vuelven al inicio (por ejemplo, Reels).
4. Comprobá que mensajes, búsqueda y perfiles sigan funcionando en ese sitio.
5. Contá en el PR qué página probaste y en qué fecha: ayuda cuando el sitio vuelve a cambiar.

### Agregar el feed de un sitio nuevo

1. Agregá el dominio a `FEED_SITES` en `src/common.js`, con el nombre y una descripción corta que se muestra en el panel.
2. Agregá una entrada en `FEEDS` en `src/content.js`.
3. Actualizá la lista de sitios compatibles en `README.md` y en `store/amo-listing.md`.

### Cambios en la lógica

Los horarios, la combinación de reglas, el modo estricto y las migraciones están en `src/common.js` y tienen tests en `tests/logic.test.js`. Si cambiás algo de eso, agregá o actualizá un test.

Si cambiás cómo se guarda la configuración, agregá una migración en `migrate()` para que los usuarios existentes no pierdan la suya.

### Checklist del pull request

- [ ] `npm run check` pasa.
- [ ] Lo probaste cargando `src/manifest.json` en Firefox.
- [ ] El modo estricto sigue permitiendo solo endurecer reglas.
- [ ] Ningún dato sale del navegador (sin pedidos de red ni analíticas).
- [ ] Actualizaste `CHANGELOG.md` en la sección "Unreleased".
