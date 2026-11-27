# Capacitación de piso — Sala de Despecho (piloto)

App para capacitar al personal de piso de Sala de Despecho: tarjetas, examen, guía del menú y panel de equipo.
Contenido tomado del menú de cocina, el recetario de coctelería y el Manual de Servicio del restaurante.
Colores de la marca: negro `#0D0F10`, dorado `#D9A25F` y verde menta `#92E1D8`.

**App:** https://kalleros.github.io/PLANTILLA-CAPACITACION/sala-de-despecho/ (QR en `qr-sala-de-despecho.png`)
(en iPhone: Safari → Compartir → Agregar a inicio; en Android: botón **Instalar**)

## Qué trae
- **Hoy:** tarjetas con repetición espaciada. Lo que fallas vuelve mañana; lo que dominas se espacia hasta 16 días.
- **Examen:** 10 preguntas de opción múltiple sobre platillos, cocteles, preparaciones y el manual de servicio.
- **Guía:** el menú completo en 10 etapas (tostadas y aguachiles, botanas, tacos, cortes y postres, coctelería, shots, salsas y preparaciones, manual), con buscador por ingrediente, vaso, garnitura y patrones para memorizar.
- **Plan:** 4 semanas contadas desde el día en que cada persona abre la app por primera vez.
- **Equipo:** panel del gerente (en este piloto, con personas de ejemplo).

Esta versión no pide inicio de sesión: el progreso se guarda solo en el teléfono. El inicio de sesión con Google se agrega después, a partir de la rama `inicio-sesion`.

## Pendiente de confirmar con el restaurante
Están marcados en la app con «Ojo»:
- Garnitura del Hugo Spritz (viene en blanco).
- Con qué se escarcha el vaso del Pompis.
- Vaso del St. Clements (dice Chabela y también copa de agua).
- Qué significa «(Chile en nogada)» junto al Pastel Sorpresa.

Al cambiar archivos, sube el número de `CACHE` en `sw.js` para que los teléfonos reciban la versión nueva.
El contenido vive en `data.js`.
