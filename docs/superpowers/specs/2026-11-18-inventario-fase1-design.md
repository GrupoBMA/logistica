# Inventario de bodegas — Fase 1: catálogos, recepción e inventario de piezas

Fecha: 18-nov-2026 · Estado: **borrador, falta aprobación del usuario**

## Por qué

El control de inventario de las bodegas vive hoy en un Excel con macros (`Control Inventario/`), un archivo por bodega, solo en una computadora. Se pasa a la app de **Logística** para que:

- las bodegas capturen desde tablet o computadora, con su propia cuenta;
- el usuario (admin) vea las dos bodegas al momento, sin juntar archivos;
- el mismo vehículo se siga de punta a punta: llega en un contenedor → se revisa → se arma → listo para venta → se vende (remisión) → se entrega (lo que ya hace Logística);
- con el tiempo, lo que hoy se captura en el Excel ENTREGAS del Drive también se capture en la app y se deje de leer el Drive.

## Decisiones ya tomadas por el usuario

- Va **dentro de Logística** (mismo enlace, mismas cuentas, mismo Supabase), no en otra app.
- Se construye **por fases, empezando por la recepción** (opción A):
  1. **Catálogos, recepción, revisión de recepción e inventario de piezas** ← este documento.
  2. Armado y etapas (número de serie al entrar a armado; estándar o especial; descuento automático de piezas; sobrantes; herrería y forrado solo especiales; revisión de armado; pruebas mecánicas; detallado y pintura; control de calidad; listo para venta), piezas dañadas y préstamos.
  3. Ventas: asignar remisión a un número de serie que ya entró a armado; mudar el resto de ENTREGAS; apagar el Drive.
  4. Conteo físico, solo si el usuario lo aprueba.
- Convivencia con el Drive: **cada vehículo tiene una sola fuente**. Cuando un número de serie ya tiene remisión en la app, la app manda; lo demás se sigue leyendo del Drive.
- Cuentas: `bodega1` y `bodega2` **solo capturan lo de su bodega** y no ven lo de Logística. No agregan catálogos: si falta un color, se lo piden al jefe y el jefe al usuario (igual que en GVF).
- **Bitácora:** las bodegas editan directo con **motivo obligatorio**; cada cambio queda guardado (quién, cuándo, antes, después, motivo). El admin tiene una lista de cambios por revisar y los marca como vistos. **Anular** requiere autorización del admin.
- Defectos: se captura **cantidad**, **tipo** (lista) y **gravedad** (lista: Leve, Media, Grave).
- "Por asignar" del Excel se llama **"En espera de armado"**.
- Pintura **no cambia** el color del vehículo.
- Sin traspasos entre bodegas por ahora. Sin número de motor por ahora.
- Pantallas pensadas para **tablet y computadora** (celular, más adelante).

## Catálogos (los maneja solo el admin)

- **Modelos:** MC 150, MC 200, MC 300.
- **Colores:** Blanco, Azul, Rojo, Tinto, Plata, Negro, Rosa, Verde, Naranja, Amarillo.
- **Características** (en vez de una sola lista de "versiones"; *propuesta, pendiente de aprobar*):
  - **Hidráulico:** Con (C/H) / Sin (S/H).
  - **Rodado:** Sencillo / Doble.
  - Por cada modelo se marca qué opciones existen (p. ej. doble rodado solo en MC 300, si así es). Se pueden agregar características después (p. ej. cabina cerrada) sin rehacer nada.
- **Tipos de defecto:** los 17 del Excel (Golpe / abolladura, Rayón, Pintura, Faltante de pieza, Falla eléctrica, Falla de motor, Transmisión / clutch, Frenos, Llantas / rines, Batería, Óxido / corrosión, Cristales / espejos / faros, Asiento / vestiduras, Documentación / llaves, Sin motor en chasis, Error de armado, Chorreadura de motor). **Gravedad:** Leve, Media, Grave.
- **Piezas:** nombre y si **lleva el color del vehículo** (p. ej. carrocería sí, llantas no). El chasis se marca como pieza con número de serie (se usa en la fase 2).
- **Lista de materiales:** por modelo, las piezas base y su cantidad (1 chasis, 4 llantas…), **más** lo que agrega o quita cada opción de característica (Con hidráulico: +1 hidráulico; Doble rodado: +2 llantas…). Así no hay que mantener una lista completa por cada combinación.

## Lo que hacen las bodegas

1. **Recepción de contenedor.** Número de contenedor (no se repite), fecha de llegada, observaciones y renglones como dice la hoja que trae: *modelo + características + color + cantidad*. Ej.: "MC 150 · Sin hidráulico · Sencillo · Azul · 40".
2. **Revisión de recepción** del contenedor:
   - **Conteo por color** de los vehículos contra lo declarado; la diferencia se marca en rojo.
   - **Piezas:** la app calcula las piezas que debería traer (renglones × lista de materiales) y las muestra todas. En cada una: un check si coincide; si no, cuántas llegaron (la app marca **faltante** o **sobrante**) y cuántas llegaron **dañadas**, con tipo de defecto y gravedad.
   - Al cerrar la revisión, los vehículos pasan a **En espera de armado** y las piezas entran al inventario como **disponibles** o **dañadas**.
3. **Inventario (consulta):** piezas por nombre y color con disponibles y dañadas; vehículos en espera de armado por modelo, características y color.

## Lo que hace el admin

- Todo lo de las bodegas, de las dos.
- Pantalla de **Catálogos**.
- **Cambios por revisar** (bitácora) y **autorizar anulaciones**.
- Logística como hoy.

## Cómo se ve cada cuenta

| Cuenta | Ve |
|---|---|
| admin | Logística + Inventario (las dos bodegas) + Catálogos + Cambios |
| carlos | Logística e Inventario, sin cambiar nada (*pendiente*: qué recortarle) |
| bodega1 / bodega2 | Solo Inventario de su bodega: Recepción, Revisión e Inventario. Sin pestañas de Logística, sin leer el Drive |

## Restricciones

- Repo **público**: nada de datos reales en el código. Todo dato vive en Supabase.
- Supabase: esquema `logistica`, tablas nuevas con prefijo `inv_`. Nadie lee tablas directo: todo pasa por funciones `security definer` que revisan **rol y bodega** de la sesión (el filtro lo hace Supabase, no la pantalla).
- El código del inventario va en su propio archivo (`inventario.js`), no dentro de `index.html`, que ya tiene ~1,200 líneas.
- Nada se borra: se **anula** con motivo.

## Fuera de la fase 1

Armado y etapas, números de serie, especiales y sobrantes por especial, préstamos, reparaciones y bajas, ventas y remisiones, conteo físico, traspasos, captura desde celular.

## Lo que queda al constructor

Nombres de tablas y funciones, el diseño visual (siguiendo el estilo actual de Logística), el orden de las pantallas y cómo se muestran los avisos.

## Pendiente del usuario

- **La lista de materiales real** de cada modelo (qué piezas y cuántas), y qué pieza cambia con cada característica.
- Confirmar qué combinaciones existen (¿doble rodado solo en MC 300? ¿hidráulico en los tres?).
