# Estudio Come Camila

App para aprender el menú de Come Camila y pasar de runner a mesero.

**App:** https://kalleros.github.io/PLANTILLA-CAPACITACION/
(en iPhone: Safari → Compartir → Agregar a inicio; en Android: botón **Instalar**)

## Qué trae
- **Hoy:** tarjetas con repetición espaciada. Lo que fallas vuelve mañana; lo que dominas se espacia hasta 16 días.
- **Examen:** 10 preguntas de opción múltiple sobre ingredientes, complementos, vinos y códigos.
- **Guía:** el menú completo por etapas, con buscador por ingrediente y patrones para memorizar.
- **Plan:** 4 semanas hasta el 1 de diciembre.

Funciona sin señal y el progreso se guarda solo en el teléfono de quien la usa.

## Archivos
- `data.js`: el menú (platillos, ingredientes, complementos, vinos, licores, códigos y reglas). Si algo cambia en el restaurante, se corrige aquí.
- `app.js`: tarjetas, examen, guía y plan.
- `pwa.js`, `sw.js`, `manifest.webmanifest`, `icon-*.png`: instalación y modo sin señal.
- `qr-estudio.png` / `qr-estudio.svg`: QR que abre la app.

Al cambiar archivos, sube el número de `CACHE` en `sw.js` para que los teléfonos reciban la versión nueva.
