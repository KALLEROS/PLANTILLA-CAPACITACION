# Plantilla de capacitación: plan técnico

Las decisiones de negocio (cliente, empresa, precios) viven en Obsidian, no aquí: este repositorio es público.

## 1. Producto
App web instalable que convierte el manual de capacitación de un restaurante en estudio diario: tarjetas con repetición espaciada, examen, guía con buscador y plan semanal.

- `main`: primer borrador, en línea y sin inicio de sesión (contenido de ejemplo: Come Camila).
- `inicio-sesion`: rama de trabajo para cuentas, métricas y licencias.

## 2. Cuentas
- Cada empleado entra **con su cuenta de Google**.
- **El administrador del restaurante da de alta** al personal (por correo) desde el panel *Equipo*. Si un correo no está dado de alta, la app no deja pasar y dice a quién pedir acceso.
- Roles: `admin` (gerente o capacitador) y `personal`.

## 3. Métricas (comprobante de uso)
Por persona, visibles para el administrador y exportables a CSV:
- **Frecuencia:** último acceso y días activos en los últimos 7 y 30 días.
- **Tiempo:** minutos con la app abierta y en uso (se cuenta solo con la pantalla visible y actividad reciente).
- **Resultados:** tarjetas vistas y dominadas sobre el total, exámenes hechos y calificación del último.

## 4. Licencia
- Cada organización tiene un **límite de usuarios activos** y una **fecha de vigencia**.
- La base de datos no permite activar más usuarios que el límite. Al vencer la licencia, la app muestra un aviso y deja de cargar el contenido.

## 5. Contenido por restaurante
- El código es la plantilla. El menú de cada cliente se guarda **en la base de datos**, detrás del inicio de sesión, nunca en este repositorio.
- `data.js` queda como contenido de demostración. `herramientas/contenido-a-sql.js` convierte un archivo de menú en la instrucción para cargarlo a la base.
- Piloto: se carga el menú del restaurante de prueba cuando lo manden.

## 6. Distribución
1. **Ahora:** el enlace que hoy ponen en Google Drive apunta a la app. El empleado la abre, la ancla con *Agregar a inicio* (botón **Instalar** en Android) e inicia sesión.
2. **Después:** versión en App Store y Google Play, empaquetando esta misma app (Capacitor). Costos: Apple Developer 99 USD al año; Google Play 25 USD una vez; revisión de cada tienda.

## 7. Arquitectura
- **Supabase** (plan gratis): inicio de sesión con Google, base Postgres y reglas de acceso por fila (RLS). La página sigue siendo estática.
- Esquema en `supabase/schema.sql`: `organizaciones`, `miembros`, `contenido`, `progreso`, `actividad`, `examenes`, el disparador del límite de usuarios y las funciones `entrar()`, `sumar_actividad()` y `resumen_equipo()`.
- Sin `config.js` configurado, la app corre en **modo demostración** igual que `main`.

## 8. Lo que tiene que hacer el dueño de las cuentas
1. Crear un proyecto en supabase.com y pasar la **Project URL** y la **anon public key**. Esa llave es pública por diseño; la protección la dan las reglas RLS.
2. Crear el cliente OAuth de Google (Google Cloud Console) y pegar el Client ID y el secreto en Supabase → Authentication → Providers → Google. El secreto no se comparte con nadie más.
3. Correr `supabase/schema.sql` en el SQL Editor y dar de alta la primera organización y su administrador.

## 9. Riesgos
- **Google en iPhone con la app instalada:** el inicio de sesión sale de la app y regresa. Hay que probarlo en un iPhone real. Plan B: código de acceso por correo, que Supabase también soporta.
- **Métricas sin señal:** se guardan en el teléfono y se mandan al recuperar conexión.
- **Cambio de nombre del repositorio:** cambia el enlace de la app. Hay que hacer QR nuevo y reinstalar.
