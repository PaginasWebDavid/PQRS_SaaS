# Comercial de PQRS Services

Pieza de 46,7 s para mostrar el producto: el residente radica desde el celular, la
administración recibe, gestiona y cierra con evidencia, y el consejo tiene sus reportes.

Los vídeos **no están en el repositorio**: pesan demasiado para git y quedarían en la
historia para siempre aunque después se borren. Están ignorados en `.gitignore` y viven
sólo en esta carpeta de tu máquina. Si cambias de computador, hay que volver a copiarlos
o a renderizarlos.

## Qué archivo usar

| Archivo | Medidas | Peso | Para qué |
|---|---|---|---|
| `pqrs-services-comercial.mp4` | 1920 × 1080 | 30,5 MB | **Máster.** LinkedIn, YouTube, la página web, presentaciones, Drive |
| `pqrs-services-comercial-whatsapp.mp4` | 1280 × 720 | 9,7 MB | **WhatsApp y correo.** Se ve igual de bien en teléfono |

**Para WhatsApp usa siempre el segundo.** El límite de WhatsApp son 16 MB: el máster no
pasa, y si lo intentas la aplicación lo recomprime sola y lo deja borroso. El de 720p ya
está por debajo del límite con margen, así que llega intacto.

Por correo (Gmail corta en 25 MB) también va el de WhatsApp.

## Ficha técnica

- 46,66 s · 1920 × 1080 · 30 fps · H.264 + AAC estéreo
- Música: **"Funky Diesel - 0:47 (Short Edit)"** de 21 On The Block, licenciada en
  Uppbeat. El archivo está en `assets/audio/funky-diesel.mp3`.
- Sin voz ni locución: el vídeo se entiende con el sonido apagado, que es como lo va a
  ver la mayoría de la gente en el teléfono.
- Todas las pantallas son capturas reales del producto con los datos del conjunto de
  demostración. No hay ni una pantalla dibujada ni un dato inventado.

## Dónde se hizo

El proyecto de vídeo está aparte, en `../../../pqrs-style-test/`, y **no forma parte de
esta aplicación**: no comparte código, ni dependencias, ni toca la base de datos.

Para volver a generarlo:

```bash
cd pqrs-style-test
npx remotion render src/index.ts Commercial out/comercial.mp4 --codec h264 --crf 18
```

Tarda unos 25 minutos. `REVIEW-V3.md` en esa carpeta documenta las decisiones de montaje
y su relación con la música.

## Si hay que actualizar las capturas

Las capturas están en `pqrs-style-test/public/shots/`. Si la interfaz cambia lo
suficiente como para que el vídeo se vea desactualizado, hay que volver a tomarlas con
las mismas medidas y volver a renderizar. Las que salen del portátil son 3024 × 1890 y la
del teléfono 1170 × 2532; si cambian esas proporciones hay que ajustar `A_DESK` y
`A_PHONE` en `src/scenes/Commercial.tsx`.
