# AI Lab (Vanilla) – Listo para GitHub Pages

Sitio **estático** (HTML+CSS+JS) sin build. Solo súbelo a GitHub Pages o ábrelo localmente.

## Estructura
- `index.html`
- `assets/` (CSS + JS)
- `public/models/` (coloca tus modelos Teachable Machine)
- `public/samples/` (clips de audio e imágenes)

## Publicar en GitHub Pages
1. Crea un repositorio y sube todos los archivos de esta carpeta (tal cual).
2. En GitHub: **Settings → Pages → Source: Deploy from a branch → main /(root)**.
3. Abre la URL de GitHub Pages (HTTPS).

## Modelos
- Emociones: `public/models/emotions/{model.json,weights.bin,metadata.json}`
- Sonidos:   `public/models/animals/...`
- Formaciones:`public/models/formations/...`

Si un modelo no está, verás **modo demo** para UI.

## Permisos
Cámara/Micrófono requieren **HTTPS** (GitHub Pages) o `localhost`.
