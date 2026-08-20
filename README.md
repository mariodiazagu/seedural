# Herbario procedural

Generador de ilustraciones de plantas/flores construidas por combinación
aleatoria de piezas (tallo, 0-3 hojas, cabeza floral), dibujadas con un
trazo tipo boceto a lápiz (línea temblorosa + tramas de rayado) y manchas
de color sueltas por detrás, todo sobre una textura de papel continua.

## Uso local

Abre `index.html` directamente en el navegador (no necesita servidor ni build).

- Se genera una lámina de 24 ilustraciones (4×6) al cargar.
- Botón `↻` (arriba a la derecha): genera una lámina nueva.
- Clic sobre cualquier ilustración: descarga esa ilustración en PNG a
  alta resolución (pensado para imprimir).

## Publicar en GitHub Pages

1. Sube `index.html`, `style.css` y `app.js` a la raíz del repo (o a `/docs`).
2. En Settings → Pages, selecciona la rama y carpeta correspondientes.
3. Listo — es un sitio 100% estático, sin dependencias.

## Cómo funciona la generación (`app.js`)

- Cada ilustración se genera a partir de una única semilla (seed) con un
  PRNG determinista (`mulberry32`). La misma semilla siempre produce el
  mismo dibujo, tanto en pantalla como en la descarga en alta resolución.
- `buildStem`, `buildLeafPart`, `buildFlower` construyen la geometría
  (curvas Bézier) de cada pieza con parámetros aleatorios independientes.
- `strokeSketchy` dibuja cada trazo en varias pasadas con pequeño jitter
  para simular línea a mano; `hatchFill` rellena con rayado tipo lápiz;
  un ~22% de las piezas se rellenan como silueta sólida en su lugar.
- `drawWash` pinta las manchas de color (gradientes radiales en modo
  "multiply") antes del trazo, más grandes que la forma para que
  desborden el contorno.
- `drawPaper` genera el grano/moteado del papel. Se pinta **una sola vez
  para todo el folio** (no por celda) para que no se noten costuras.

## Ajustes rápidos

En la cabecera de `app.js`:

- `COLS`, `ROWS`: tamaño de la cuadrícula (por defecto 4×6 = 24).
- `EXPORT_SCALE`: resolución de la descarga individual (×4.8 por defecto).
- `PAPER_BASE`: tono base del papel.
