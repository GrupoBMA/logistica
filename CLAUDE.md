# CLAUDE.md

Guía para Claude Code en la app **Logística** de Grupo BMA. Todo en español (UI, datos, comentarios y nombres de funciones).

**Regla de mantenimiento:** cada cambio significativo se documenta aquí en el mismo commit. Lo que todavía no se sabe se marca como *pendiente* en vez de suponerlo.

## Qué es

Tablero de las entregas de unidades vendidas (motocarros, mototaxis, recreativos) que salen de la granja: en qué paso del taller va cada una, hacia dónde va, quién la lleva y qué le falta. Reemplaza al Excel "ENTREGAS GRANJA SUNL". Debe ser minimalista y fácil de leer.

El Excel tiene las hojas VENTAS, RECREATIVOS, ENTREGADO, SHOWROOM SUCURSALES, FLETEROS y DIST. **Se empezó solo con VENTAS** (9-nov-2026).

### Campos de una entrega (hoja VENTAS)

Vendedor, vehículo (texto libre, p. ej. "1 MC 300 CABINA CERRADA CAJA FOOD TRUCK"), los 5 pasos del taller, fecha de venta, remisión (puede tener partes: 153/1, 153/2), destino, activación (S. Cruz o Bodega 2), costo de envío, fletero, ETA, faltante y quién la prepara (columna sin título en el Excel).

**Pasos del taller:** AR armada, H herrería, F forrado, P pintura, R revisión. Cada uno va "OK", "X" o vacío. No todas las unidades llevan los 5 (hay unidades con H o P vacíos que ya pasaron revisión).

**Colores del destino (zona):** naranja = local cerca; naranja oscuro = local más lejos; amarillo = foránea, necesita tráiler; rojo = se recoge en granja; azul y verde = sucursales (Wash, Américas, AGS, Tepic).

### Reglas confirmadas por el usuario (9-nov-2026)

- **Color en la columna vehículo** = no hay vehículo o piezas para empezar a trabajarlo; hay que esperar a que lleguen. En los datos cuadra: las 73 con color casi no tienen pasos y ninguna tiene los 5 OK. Estado **"Esperando piezas"**.
- **Motoplaza** es un **distribuidor** al que se le vende. Va en la zona "Distribuidores" y lleva la etiqueta "Distribuidor".
- **Activación** = la **bodega** donde se arma. S. Cruz = **Bodega 1, "Granja"**; la otra es Bodega 2. Las dos propuestas tienen un filtro de bodega.
- **Con los 5 pasos en OK** hay que **mandar el flete** a su zona de destino, **con prioridad por fecha de venta** (la más antigua primero). Cada una lleva su número de prioridad.

### Prioridad actual

Ir de poco en poco, empezando por lo más importante: el vehículo, su entrega y que el flujo funcione. La fecha es un dato. La app es **de solo lectura** (no mueve ni edita nada).

### Pendientes por confirmar con el usuario

- Qué significa la **X** en los pasos del taller (hoy se pinta en rojo).
- Mochis, Culiacán, Mazatlán, Vallarta y Lo de Marcos vienen en azul claro (6FA8DC). Hoy van con sucursales.
- El umbral de **45 días** para marcar una unidad como atrasada (`VIEJA`).
- ~~Elegir entre la propuesta A y la B~~: **el usuario eligió la B** (9-nov-2026). Lo que le gustó es que se usa como un videojuego, es intuitiva y es fácil encontrar todo. Ojo: no quiere gráficos de videojuego; una versión pixel-art se descartó. Las siguientes mejoras siguen esa línea.

## Estado actual (9-nov-2026)

`index.html` es la app, que se usa como un videojuego (era la "propuesta B"; la propuesta A, de lista y flujo, se quitó cuando el usuario eligió esta). Es un solo archivo sin librerías, con letra Geist. Las reglas viven en **`logica.js`**, que convierte cada renglón del Excel en una unidad con: modelo y detalle cortos (`nombre()`), tipo (`tipo()`, como sunldemexico.com), estado, zona, distribuidor, bodega, días y prioridad del flete.

**Estados:** Esperando piezas (color en el vehículo) → Por empezar (sin pasos) → En proceso (algún paso, menos de 5) → **Completo** (5 OK; toca mandar el flete) → En camino → Entregada. "En camino" y "Entregada" no existen en la hoja VENTAS (*pendiente*: Entregada vendrá de la hoja ENTREGADO).

**Tipos:** Motocarro 150 cc, 200 cc, 300 cc doble rodado, 300 cc cabina cerrada, Mototaxis, ATV, UTV, Minimotos, Areneros. "Motocarro 300 cc" a secas (la pipa), "Motocarro 350 cc" y "Accesorios y otros" (el toldo) son extras, porque la página no los tiene.

**Cómo se usa:**
- **Menú fijo** a la izquierda (en celular, una fila que se desliza) con contadores, en este orden (lo pidió el usuario): **Completo** (5 pasos en OK; antes se llamaba "Mandar flete"), **Con faltante**, **En proceso** (antes "En taller"), **Por empezar**, **Esperando piezas** y **Todas**. Los atajos 1–6 siguen ese orden. Abajo, el medidor "Listas para salir".
- Cada vista tiene un **objetivo** en una frase. En Completo van de la venta más antigua a la más reciente. **No** se marca cuál sale primero ni se ponen números de prioridad: eso lo decide el jefe del usuario (pedido del usuario, 9-nov-2026).
- Las unidades van en **casillas, 3 por fila** (2 en pantallas medianas, 1 en celular; se probaron 1 y 2 por fila y el usuario prefirió 3). Arriba a la izquierda va la **remisión** en grande, junto al ícono de estado; arriba a la derecha, la **fecha de venta**; abajo a la izquierda, el **destino con un punto a la izquierda del mismo color que trae en el Excel** (`color_destino`, que el extractor saca de la celda; sin color, el punto es gris); abajo a la derecha, los **días desde la venta** (en rojo si pasan de 45). Íconos de estado (palomita = completo, llave = en taller, play = por empezar, candado = esperando piezas). Si tiene faltante, sale una línea amarilla "Falta: …". **Pasos del taller como 5 rayitas** (armado, herrería, forrado, pintura, revisión): **verde = OK, amarillo = X, gris = vacío**. Van grandes, con "n de 5", en **todas** las casillas (se probaron chiquitas arriba y el usuario prefirió las grandes).
- **Ver como tarjetas o lista:** junto al filtro hay dos botones con ícono, como en las carpetas de Windows. **Tarjetas** (las casillas, 3 por fila) o **Lista**: un renglón por unidad con ícono, remisión, vehículo (o lo que le falta), las 5 rayitas, destino con su punto de color, fecha de venta y días, y encabezados arriba. En celular la lista va en dos líneas. La elección se recuerda en el navegador (`localStorage`, clave `logistica.modo`). Se probó dejar solo Completo en 1 por fila y se descartó.
- **Orden:** en **todas** las vistas (y en la búsqueda), las casillas van de **más días desde la venta a menos** (pedido del usuario). No se marca cuál sale primero.
- **Filtro por tipo** en un desplegable ("Filtrar por tipo de vehículo", con el conteo de cada tipo y "Quitar filtro"); antes eran botones, que distraían, **buscador global** (busca en todas las vistas), selector de **bodega** (Todas, Granja, Bodega 2) y **atajos**: 1–6 cambian de vista, / busca y Esc cierra.
- **Ficha** lateral: qué sigue con esa unidad, sus 5 pasos y sus datos (destino, zona, bodega, tipo, fecha, vendedor, remisión, faltante).
- **Datos del Excel:** el Excel guarda algunas remisiones como fecha ("16/1" queda como 16 de enero); el extractor las regresa a "día/mes". `datos/datos.js` (fuera del repo) lo genera `python datos/extraer_excel.py "<ruta del Excel>" datos/datos.js`. En la página publicada no existe, así que se ve vacía. Después vendrán de Supabase con inicio de sesión.
- **Diseño:** el skill `design-taste-frontend` en modo pantalla de app. Hay modo claro y modo oscuro, y funciona en celular.
- **Probar:** `.claude/launch.json` levanta `python -m http.server 8768`.

## Regla estricta: nada con datos reales en el repo

El repo es **público** (GitHub Pages en el plan gratis). Ventas, clientes, remisiones, costos y teléfonos de fleteros **nunca** se suben: `datos/`, los Excel y los CSV están en `.gitignore`. Revisar `git status` antes de cada commit.

## Repositorio y despliegue

- Repo **`GrupoBMA/logistica`** en la organización `GrupoBMA`, hermano de `GrupoBMA/administracion` y `GrupoBMA/catalogo`. Se publica con GitHub Pages desde `main` en <https://grupobma.github.io/logistica/>. **Cada push a `main` sale en vivo.**
- Clon local: `OneDrive\Claude Code\Logistica`.
- Flujo: editar, hacer un commit descriptivo, `git push origin main` y decirle al usuario dónde verlo.

## Datos y seguridad

- **Supabase:** el mismo proyecto que GVF, administración y catálogo (`jlfendrdwptwmttrahre`), con el **esquema propio `logistica`**. Ese esquema no está expuesto en la API y sus tablas tienen RLS sin reglas, así que nadie las lee directo.
- Tablas: `logistica.usuarios` (cuentas con acceso) y `logistica.entregas` (una fila por unidad).
- **Única puerta:** las funciones `public.logistica_datos()` (leer) y `public.logistica_subir(datos)` (reemplazar las pendientes con lo del Excel). Las dos son `security definer` y primero revisan que la sesión esté en `logistica.usuarios`. `anon` no puede llamarlas.
- **Cuentas:** se crean en el panel de Supabase (Authentication → Users → Add user, con "Auto Confirm"), con correo `usuario@logistica.bma`; en la app se escribe solo `usuario` (si se escribe un correo completo, se usa tal cual). Luego se agrega su id a `logistica.usuarios`. Si olvida la contraseña, se cambia desde el panel.
- **Inicio de sesión (desde el 9-nov-2026):** la app abre con la pantalla "Entrar" y, con sesión, lee todo con `logistica_datos()` (que también regresa `subido`, la fecha de la última subida). Los días desde la venta se cuentan contra el día de hoy. Abajo del menú están la fecha de la última subida y "Salir".
- **Fuente de datos: el Excel en Google Drive** (pedido del usuario, 9-nov-2026; el jefe tiene que ver los datos al momento). Archivo: `.xlsx` con id `18c-Xbt9d8ml0QaI1Xh9Du68uAcXGUiNU`. Cada vez que alguien entra (o da "Volver a leer el Drive"), la app llama a la función de Supabase **`logistica-drive`** (código en `supabase/functions/logistica-drive/`):
  - revisa con `logistica_acceso()` que la cuenta tenga acceso;
  - entra al Drive **con la cuenta de Google del usuario** (el archivo no es suyo, se lo comparten, y no quiere que aparezca nadie nuevo en los compartidos; por eso no se usa un robot). El usuario da **"Conectar con Google"** en la app: se abre Google con permiso **`drive.readonly`** (+ `openid email`), Google regresa a la función **`logistica-google`** (sin sesión de Supabase; la protege un código de un solo uso de 15 minutos creado con `logistica_google_inicio()`), que guarda el permiso permanente (refresh token) en `logistica.google`. Ese token solo lo leen las funciones (`service_role`), nunca la app;
  - usa el cliente OAuth del proyecto de Google **"Grupo BMA"** (el mismo de Administración). Su secreto está en el secreto **`GOOGLE_CLIENT_SECRET`** de Supabase; la dirección de regreso `https://jlfendrdwptwmttrahre.supabase.co/functions/v1/logistica-google` debe estar en "URI de redireccionamiento autorizados" del cliente;
  - como la app de Google está en **modo prueba**, Google corta el permiso **cada 7 días**: la función lo detecta (`invalid_grant`), lo borra y la app vuelve a mostrar "Conectar con Google". La cuenta debe estar en los usuarios de prueba. Respaldo opcional (no se usa): cuenta de servicio en el secreto `GOOGLE_SA_JSON`;
  - baja el .xlsx (si fuera una hoja de Google, la exporta), lo lee con SheetJS (`excel.js`, misma lógica que `datos/extraer_excel.py`; comprobado: 133 renglones, 0 diferencias) y lo guarda con `logistica_subir`;
  - la app luego lee con `logistica_datos()`. Si el Drive falla, se muestran los últimos datos guardados con un aviso. Abajo del menú dice cuándo se guardó el Excel en el Drive y a qué hora se leyó.
  - El año de la fecha de venta no viene en el Excel: se toma el año actual, o el anterior si la fecha quedaría en el futuro.
- `logistica.entregas` tiene también `color_destino` (el color exacto de la celda del destino).
