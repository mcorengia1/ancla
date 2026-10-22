# Ficha de Complementos de Firefox (AMO)

Textos listos para copiar en el Developer Hub. AMO permite cargar la ficha en varios idiomas: cargá primero español (idioma por defecto) y después agregá inglés.

Las capturas están en `store/screenshots/` (1280×800, el tamaño que recomienda AMO).

---

## Datos generales

| Campo | Valor |
|---|---|
| Nombre | Ancla — foco sin distracciones |
| Categorías (hasta 2) | Social & Communication · Other _(revisá las opciones que te ofrezca el formulario)_ |
| Etiquetas | productivity, focus, social media, youtube, distraction blocker |
| Licencia | MIT |
| Política de privacidad | Pegá el texto de `PRIVACY.md` |
| Página principal | URL del repositorio en GitHub |
| Soporte | URL de issues del repositorio (`…/issues`) |

---

## Español

### Resumen (máx. 250 caracteres)

Ocultá los feeds de X, Instagram, YouTube, Facebook y Reddit sin bloquear los sitios. Bloqueá distracciones, poné límites de tiempo y blanco y negro, con perfiles por horario y un modo estricto contra impulsos.

### Descripción

Ancla te ayuda a usar internet sin quedarte enganchado. En vez de bloquear tus redes por completo, oculta lo que te atrapa —el feed, las historias, los Reels, los recomendados— y te deja usar lo que necesitás: mensajes, búsquedas y perfiles.

Perfiles con su propio horario
Armá perfiles como "Redes sociales" (lunes a viernes, todo el día) u "Horario laboral" (lunes a viernes de 9 a 18). Pueden estar activos varios a la vez, y para cada sitio gana la regla más estricta. El fin de semana, si no hay ningún perfil activo, todo se ve normal.

Reglas por sitio
• Ocultar feed en X (Para ti, Explorar, tendencias), Instagram (feed y sus historias, Reels, Explorar), YouTube (inicio, recomendados, pantallas finales), Facebook (feed, historias, Watch, Reels) y Reddit (portada, Popular, All).
• Bloquear el sitio entero, para los que no tienen un feed compatible.
• Blanco y negro, para que sean menos atractivos.
• Límite diario en minutos, con un aviso cuando quedan 5.
• Ocultar los Shorts de YouTube.

Modo estricto (opcional)
Mientras haya un perfil activo solo podés endurecer las reglas. Para aflojarlas tenés que pedir un desbloqueo y esperar con una pestaña abierta; cada desbloqueo del día puede duplicar la espera. Es una fricción pensada para cortar el impulso, no una cerradura: la extensión siempre se puede desinstalar.

La pestaña "Ahora" muestra qué perfiles están activos y qué se aplica a cada sitio en este momento.

Privacidad
Ancla no recolecta ni envía ningún dato. Todo se guarda en tu navegador. El código es abierto (licencia MIT).

Los sitios cambian su diseño cada tanto. Si algún feed vuelve a aparecer, avisanos en la página de soporte.

---

## English

### Summary (max. 250 characters)

Hide feeds on X, Instagram, YouTube, Facebook and Reddit without blocking the sites. Block distractions, set time limits and grayscale, with scheduled profiles and a strict mode against impulses.

### Description

Ancla helps you use the web without getting hooked. Instead of blocking your social networks entirely, it hides what pulls you in —the feed, stories, Reels, recommendations— and lets you keep using what you need: messages, search and profiles.

Profiles with their own schedule
Create profiles like "Social media" (Monday to Friday, all day) or "Work hours" (Monday to Friday, 9 to 6). Several can be active at the same time, and the strictest rule wins for each site. On weekends, if no profile is active, everything looks normal.

Per-site rules
• Hide the feed on X (For you, Explore, trends), Instagram (feed and its stories, Reels, Explore), YouTube (home, recommendations, end screens), Facebook (feed, stories, Watch, Reels) and Reddit (front page, Popular, All).
• Block the whole site, for those without a supported feed.
• Grayscale, to make them less appealing.
• Daily limit in minutes, with a notice when 5 are left.
• Hide YouTube Shorts.

Strict mode (optional)
While a profile is active you can only make rules stricter. To loosen them you request an unlock and wait with a tab open; each unlock of the day can double the wait. It's friction designed to break the impulse, not a lock: the extension can always be uninstalled.

The "Now" tab shows which profiles are active and what applies to each site right now.

Note: the interface is currently in Spanish. Translations are welcome on the project repository.

Privacy
Ancla does not collect or send any data. Everything is stored in your browser. Open source (MIT license).

Sites change their design from time to time. If a feed shows up again, let us know on the support page.

---

## Notas para los revisores de Mozilla (campo "Notes to Reviewers")

```
Ancla has no build step and no third-party libraries: the uploaded files are the source.
Source code: <URL del repositorio>

Permissions:
- <all_urls>: the content script applies the user's rules (hide feeds via CSS,
  block page overlay, grayscale filter, usage time counting) on the sites the user
  configures. It does not read or transmit page content.
- storage: settings and daily usage per site, stored locally.

No network requests, no remote code, no analytics.
data_collection_permissions is set to "none".

To test strict mode: Profiles tab → create a profile with "Siempre" (always) →
Estricto tab → turn on strict mode → set the wait to 1 minute.
```

---

## Capturas

| Archivo | Leyenda sugerida |
|---|---|
| `1-perfiles-activos.png` | Varios perfiles activos a la vez: para cada sitio gana la regla más estricta. |
| `2-perfiles.png` | Cada perfil con su propio horario. |
| `3-reglas-por-sitio.png` | Por sitio: ocultar el feed, bloquear, blanco y negro o un límite diario. |
| `4-modo-estricto.png` | Modo estricto: para aflojar las reglas hay que esperar. |

Conviene sumar una o dos capturas tuyas de un sitio real con el feed oculto (por ejemplo Instagram con la tarjeta "Feed oculto por Ancla"), tapando cualquier dato personal.
