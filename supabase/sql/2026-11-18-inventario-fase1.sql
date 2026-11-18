-- Inventario de bodegas, fase 1: catálogos, contenedores, revisión de recepción, inventario,
-- bitácora y anulaciones. Aplicado en Supabase como migración "inventario_fase1" (18-nov-2026).
-- Nadie lee estas tablas directo: solo las funciones public.inv_* (security definer), que revisan
-- rol y bodega de la sesión en logistica.usuarios.

-- ---------------------------------------------------------------- Catálogos
create table logistica.inv_modelos (
  id bigint generated always as identity primary key,
  nombre text not null, orden int not null default 0, activo boolean not null default true);
create unique index inv_modelos_nombre on logistica.inv_modelos (upper(btrim(nombre)));

create table logistica.inv_caracteristicas (
  id bigint generated always as identity primary key,
  nombre text not null, orden int not null default 0, activo boolean not null default true);
create unique index inv_caracteristicas_nombre on logistica.inv_caracteristicas (upper(btrim(nombre)));

create table logistica.inv_opciones (
  id bigint generated always as identity primary key,
  caracteristica_id bigint not null references logistica.inv_caracteristicas(id),
  nombre text not null, orden int not null default 0, activo boolean not null default true);
create unique index inv_opciones_nombre on logistica.inv_opciones (caracteristica_id, upper(btrim(nombre)));

-- Qué opciones se permiten en cada modelo
create table logistica.inv_modelo_opciones (
  modelo_id bigint not null references logistica.inv_modelos(id),
  opcion_id bigint not null references logistica.inv_opciones(id),
  primary key (modelo_id, opcion_id));

create table logistica.inv_colores (
  id bigint generated always as identity primary key,
  nombre text not null, orden int not null default 0, activo boolean not null default true);
create unique index inv_colores_nombre on logistica.inv_colores (upper(btrim(nombre)));

create table logistica.inv_defectos (
  id bigint generated always as identity primary key,
  nombre text not null, orden int not null default 0, activo boolean not null default true);
create unique index inv_defectos_nombre on logistica.inv_defectos (upper(btrim(nombre)));

create table logistica.inv_piezas (
  id bigint generated always as identity primary key,
  nombre text not null,
  lleva_color boolean not null default false,   -- toma el color del vehículo (carrocería sí, llantas no)
  con_serie boolean not null default false,     -- el chasis: se le captura número de serie (fase 2)
  activo boolean not null default true);
create unique index inv_piezas_nombre on logistica.inv_piezas (upper(btrim(nombre)));

-- Lista de materiales: base del modelo (modelo_id) o lo que agrega/quita una opción (opcion_id)
create table logistica.inv_materiales (
  id bigint generated always as identity primary key,
  modelo_id bigint references logistica.inv_modelos(id),
  opcion_id bigint references logistica.inv_opciones(id),
  pieza_id bigint not null references logistica.inv_piezas(id),
  cantidad int not null check (cantidad <> 0),
  check ((modelo_id is null) <> (opcion_id is null)));
create unique index inv_materiales_unico on logistica.inv_materiales (coalesce(modelo_id,0), coalesce(opcion_id,0), pieza_id);

-- ---------------------------------------------------------------- Contenedores y revisión
create table logistica.inv_contenedores (
  id bigint generated always as identity primary key,
  bodega text not null check (bodega in ('bodega1','bodega2')),
  numero text not null,
  llegada date not null,
  observaciones text,
  estado text not null default 'recibido' check (estado in ('recibido','revisado','anulado')),
  creado timestamptz not null default now(), creado_por uuid,
  revisado timestamptz, revisado_por uuid);
-- Un número no se repite (sin importar espacios ni mayúsculas); los anulados liberan el número
create unique index inv_contenedores_numero on logistica.inv_contenedores (upper(btrim(numero))) where estado <> 'anulado';

create table logistica.inv_renglones (
  id bigint generated always as identity primary key,
  contenedor_id bigint not null references logistica.inv_contenedores(id),
  modelo_id bigint not null references logistica.inv_modelos(id),
  opciones bigint[] not null default '{}',
  color_id bigint not null references logistica.inv_colores(id),
  cantidad int not null check (cantidad > 0),   -- lo que dice la hoja del contenedor
  contados int check (contados >= 0));          -- lo que se contó en la revisión
create index on logistica.inv_renglones (contenedor_id);

create table logistica.inv_revision_piezas (
  contenedor_id bigint not null references logistica.inv_contenedores(id),
  pieza_id bigint not null references logistica.inv_piezas(id),
  color_id bigint references logistica.inv_colores(id),
  esperadas int not null check (esperadas >= 0),
  llegaron int not null check (llegaron >= 0),
  danadas int not null default 0 check (danadas >= 0 and danadas <= llegaron));
create unique index inv_revision_piezas_unico on logistica.inv_revision_piezas (contenedor_id, pieza_id, coalesce(color_id,0));

create table logistica.inv_revision_defectos (
  id bigint generated always as identity primary key,
  contenedor_id bigint not null references logistica.inv_contenedores(id),
  pieza_id bigint references logistica.inv_piezas(id),
  color_id bigint references logistica.inv_colores(id),
  defecto_id bigint not null references logistica.inv_defectos(id),
  gravedad text not null check (gravedad in ('leve','media','grave')),
  cantidad int not null check (cantidad > 0));
create index on logistica.inv_revision_defectos (contenedor_id);

-- ---------------------------------------------------------------- Bitácora y anulaciones
create table logistica.inv_bitacora (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  user_id uuid, bodega text,
  accion text not null,        -- alta, edicion, revision, anulacion_pedida, anulacion_autorizada, anulacion_rechazada
  tabla text not null, registro bigint,
  antes jsonb, despues jsonb, motivo text,
  visto boolean not null default false);
create index on logistica.inv_bitacora (visto, fecha desc);

create table logistica.inv_anulaciones (
  id bigint generated always as identity primary key,
  contenedor_id bigint not null references logistica.inv_contenedores(id),
  motivo text not null,
  pedida_por uuid, pedida timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','autorizada','rechazada')),
  resuelta_por uuid, resuelta timestamptz);
create unique index inv_anulaciones_una_pendiente on logistica.inv_anulaciones (contenedor_id) where estado = 'pendiente';

do $$ declare t text; begin
  foreach t in array array['inv_modelos','inv_caracteristicas','inv_opciones','inv_modelo_opciones','inv_colores','inv_defectos',
    'inv_piezas','inv_materiales','inv_contenedores','inv_renglones','inv_revision_piezas','inv_revision_defectos','inv_bitacora','inv_anulaciones']
  loop
    execute format('alter table logistica.%I enable row level security', t);
    execute format('revoke all on logistica.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Ayudantes (no expuestos)
-- La cuenta de la sesión, o error si no tiene acceso
create function logistica.inv_yo() returns logistica.usuarios
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios;
begin
  select * into u from logistica.usuarios where user_id = (select auth.uid());
  if not found then raise exception 'Sin acceso a logística' using errcode = '42501'; end if;
  return u;
end $$;

-- Para guardar: admin o bodega. Regresa la bodega donde se guarda (la bodega siempre usa la suya)
create function logistica.inv_bodega_escribe(u logistica.usuarios, p_bodega text) returns text
language plpgsql immutable set search_path to '' as $$
begin
  if u.rol = 'bodega' then return u.bodega; end if;
  if u.rol <> 'admin' then raise exception 'Esta cuenta es de solo lectura' using errcode = '42501'; end if;
  if p_bodega is null or p_bodega not in ('bodega1','bodega2') then raise exception 'Escoge la bodega'; end if;
  return p_bodega;
end $$;

-- Para leer: la bodega siempre la suya; los demás, la que pidan (null = las dos)
create function logistica.inv_bodega_lee(u logistica.usuarios, p_bodega text) returns text
language sql immutable set search_path to '' as $$
  select case when u.rol = 'bodega' then u.bodega else nullif(p_bodega, '') end $$;

-- Contenedor que la sesión puede ver, o error
create function logistica.inv_contenedor_de(u logistica.usuarios, p_id bigint) returns logistica.inv_contenedores
language plpgsql stable security definer set search_path to '' as $$
declare c logistica.inv_contenedores;
begin
  select * into c from logistica.inv_contenedores where id = p_id;
  if not found or (u.rol = 'bodega' and c.bodega <> u.bodega) then raise exception 'Ese contenedor no existe'; end if;
  return c;
end $$;

create function logistica.inv_anotar(p_accion text, p_tabla text, p_registro bigint, p_bodega text,
  p_antes jsonb, p_despues jsonb, p_motivo text) returns void
language sql security definer set search_path to '' as $$
  insert into logistica.inv_bitacora (user_id, bodega, accion, tabla, registro, antes, despues, motivo)
  values ((select auth.uid()), p_bodega, p_accion, p_tabla, p_registro, p_antes, p_despues, nullif(btrim(p_motivo), '')) $$;

-- Foto de un contenedor (para la bitácora y para la ficha)
create function logistica.inv_foto(p_id bigint) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'contenedor', (select to_jsonb(c) from logistica.inv_contenedores c where c.id = p_id),
    'renglones', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from logistica.inv_renglones r where r.contenedor_id = p_id), '[]'),
    'piezas', coalesce((select jsonb_agg(to_jsonb(p) order by p.pieza_id, p.color_id) from logistica.inv_revision_piezas p where p.contenedor_id = p_id), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from logistica.inv_revision_defectos d where d.contenedor_id = p_id), '[]'),
    'anulacion', (select to_jsonb(a) from logistica.inv_anulaciones a where a.contenedor_id = p_id order by a.pedida desc limit 1)) $$;

-- ---------------------------------------------------------------- Funciones públicas
create function public.inv_sesion() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  return jsonb_build_object('rol', u.rol, 'bodega', u.bodega);
end $$;

create function public.inv_catalogo() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform logistica.inv_yo();
  return jsonb_build_object(
    'modelos', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_modelos x), '[]'),
    'caracteristicas', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('opciones',
        coalesce((select jsonb_agg(to_jsonb(o) order by o.orden, o.nombre) from logistica.inv_opciones o where o.caracteristica_id = c.id), '[]'))
        order by c.orden, c.nombre) from logistica.inv_caracteristicas c), '[]'),
    'modelo_opciones', coalesce((select jsonb_agg(to_jsonb(x)) from logistica.inv_modelo_opciones x), '[]'),
    'colores', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_colores x), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_defectos x), '[]'),
    'gravedades', '["leve","media","grave"]'::jsonb,
    'piezas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from logistica.inv_piezas x), '[]'),
    'materiales', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from logistica.inv_materiales x), '[]'));
end $$;

-- Solo admin. p_tabla: modelos, caracteristicas, opciones, colores, defectos, piezas, modelo_opciones, materiales.
-- Con "id" actualiza; sin "id" agrega. Nada se borra: se desactiva con activo=false
-- (excepto modelo_opciones y materiales, que son parte de una lista y se quitan con "quitar": true).
create function public.inv_catalogo_guardar(p_tabla text, p_fila jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p_fila->>'id')::bigint;
  v_nombre text := nullif(btrim(p_fila->>'nombre'), '');
begin
  if u.rol <> 'admin' then raise exception 'Solo el administrador cambia los catálogos' using errcode = '42501'; end if;
  begin
    if p_tabla in ('modelos','caracteristicas','colores','defectos') then
      if v_id is null then
        if v_nombre is null then raise exception 'Escribe el nombre'; end if;
        execute format('insert into logistica.%I (nombre, orden) values ($1, coalesce($2, (select coalesce(max(orden),0)+1 from logistica.%I)))',
          'inv_' || p_tabla, 'inv_' || p_tabla) using v_nombre, (p_fila->>'orden')::int;
      else
        execute format('update logistica.%I set nombre = coalesce($2, nombre), orden = coalesce($3, orden), activo = coalesce($4, activo) where id = $1',
          'inv_' || p_tabla) using v_id, v_nombre, (p_fila->>'orden')::int, (p_fila->>'activo')::boolean;
      end if;
    elsif p_tabla = 'opciones' then
      if v_id is null then
        if v_nombre is null then raise exception 'Escribe el nombre'; end if;
        insert into logistica.inv_opciones (caracteristica_id, nombre, orden)
        values ((p_fila->>'caracteristica_id')::bigint, v_nombre, coalesce((p_fila->>'orden')::int, 0));
      else
        update logistica.inv_opciones set nombre = coalesce(v_nombre, nombre), orden = coalesce((p_fila->>'orden')::int, orden),
          activo = coalesce((p_fila->>'activo')::boolean, activo) where id = v_id;
      end if;
    elsif p_tabla = 'piezas' then
      if v_id is null then
        if v_nombre is null then raise exception 'Escribe el nombre'; end if;
        insert into logistica.inv_piezas (nombre, lleva_color, con_serie)
        values (v_nombre, coalesce((p_fila->>'lleva_color')::boolean, false), coalesce((p_fila->>'con_serie')::boolean, false));
      else
        update logistica.inv_piezas set nombre = coalesce(v_nombre, nombre), lleva_color = coalesce((p_fila->>'lleva_color')::boolean, lleva_color),
          con_serie = coalesce((p_fila->>'con_serie')::boolean, con_serie), activo = coalesce((p_fila->>'activo')::boolean, activo) where id = v_id;
      end if;
    elsif p_tabla = 'modelo_opciones' then
      if coalesce((p_fila->>'quitar')::boolean, false) then
        delete from logistica.inv_modelo_opciones where modelo_id = (p_fila->>'modelo_id')::bigint and opcion_id = (p_fila->>'opcion_id')::bigint;
      else
        insert into logistica.inv_modelo_opciones (modelo_id, opcion_id)
        values ((p_fila->>'modelo_id')::bigint, (p_fila->>'opcion_id')::bigint) on conflict do nothing;
      end if;
    elsif p_tabla = 'materiales' then
      if coalesce((p_fila->>'quitar')::boolean, false) then
        delete from logistica.inv_materiales where id = v_id;
      elsif v_id is null then
        insert into logistica.inv_materiales (modelo_id, opcion_id, pieza_id, cantidad)
        values ((p_fila->>'modelo_id')::bigint, (p_fila->>'opcion_id')::bigint, (p_fila->>'pieza_id')::bigint, (p_fila->>'cantidad')::int);
      else
        update logistica.inv_materiales set cantidad = (p_fila->>'cantidad')::int where id = v_id;
      end if;
    else
      raise exception 'Catálogo desconocido';
    end if;
  exception when unique_violation then
    raise exception 'Ese nombre ya existe';
  end;
  return public.inv_catalogo();
end $$;

create function public.inv_contenedores(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'bodega', c.bodega, 'numero', c.numero, 'llegada', c.llegada, 'estado', c.estado, 'observaciones', c.observaciones,
      'vehiculos', (select coalesce(sum(r.cantidad),0) from logistica.inv_renglones r where r.contenedor_id = c.id),
      'anulacion_pendiente', exists (select 1 from logistica.inv_anulaciones a where a.contenedor_id = c.id and a.estado = 'pendiente'))
    order by c.llegada desc, c.id desc)
    from logistica.inv_contenedores c where b is null or c.bodega = b), '[]');
end $$;

create function public.inv_contenedor(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  perform logistica.inv_contenedor_de(u, p_id);
  return logistica.inv_foto(p_id);
end $$;

-- p = {id?, bodega?, numero, llegada, observaciones, renglones:[{modelo_id, opciones:[ids], color_id, cantidad}]}
-- Al corregir lo que trae un contenedor ya revisado, vuelve a "por revisar" (los conteos ya no corresponden).
create function public.inv_contenedor_guardar(p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  u logistica.usuarios := logistica.inv_yo();
  b text; v_id bigint := (p->>'id')::bigint; c logistica.inv_contenedores;
  v_numero text := nullif(btrim(p->>'numero'), ''); v_llegada date := nullif(p->>'llegada','')::date;
  x jsonb; v_ops bigint[]; antes jsonb; nuevos jsonb; viejos jsonb;
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_numero is null then raise exception 'Escribe el número de contenedor'; end if;
  if v_llegada is null then raise exception 'Escribe la fecha de llegada'; end if;
  if jsonb_typeof(p->'renglones') is distinct from 'array' or jsonb_array_length(p->'renglones') = 0 then raise exception 'Agrega al menos un vehículo'; end if;
  if exists (select 1 from logistica.inv_contenedores o where upper(btrim(o.numero)) = upper(v_numero)
             and o.estado <> 'anulado' and o.id is distinct from v_id) then
    raise exception 'Ese contenedor ya está registrado';
  end if;
  -- Revisar cada renglón contra el catálogo
  for x in select * from jsonb_array_elements(p->'renglones') loop
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    if not exists (select 1 from logistica.inv_modelos m where m.id = (x->>'modelo_id')::bigint and m.activo) then raise exception 'Escoge el modelo'; end if;
    if not exists (select 1 from logistica.inv_colores k where k.id = (x->>'color_id')::bigint and k.activo) then raise exception 'Escoge el color'; end if;
    v_ops := array(select (e)::bigint from jsonb_array_elements_text(coalesce(x->'opciones','[]')) e);
    if exists (select 1 from unnest(v_ops) o where not exists (select 1 from logistica.inv_modelo_opciones mo
               where mo.modelo_id = (x->>'modelo_id')::bigint and mo.opcion_id = o))
       or (select count(*) from logistica.inv_opciones o where o.id = any(v_ops))
          <> (select count(distinct o.caracteristica_id) from logistica.inv_opciones o where o.id = any(v_ops))
       or (select count(*) from logistica.inv_opciones o where o.id = any(v_ops)) <> cardinality(v_ops) then
      raise exception 'Esa combinación no existe para este modelo';
    end if;
  end loop;
  -- Renglones normalizados (opciones ordenadas) para guardar y comparar
  nuevos := (select jsonb_agg(jsonb_build_object('modelo_id', (x2->>'modelo_id')::bigint,
              'opciones', (select coalesce(jsonb_agg(e::bigint order by e::bigint), '[]') from jsonb_array_elements_text(coalesce(x2->'opciones','[]')) e),
              'color_id', (x2->>'color_id')::bigint, 'cantidad', (x2->>'cantidad')::int))
             from jsonb_array_elements(p->'renglones') x2);

  if v_id is null then
    insert into logistica.inv_contenedores (bodega, numero, llegada, observaciones, creado_por)
    values (b, v_numero, v_llegada, nullif(btrim(p->>'observaciones'),''), (select auth.uid())) returning id into v_id;
    insert into logistica.inv_renglones (contenedor_id, modelo_id, opciones, color_id, cantidad)
    select v_id, (n->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(n->'opciones') e), (n->>'color_id')::bigint, (n->>'cantidad')::int
    from jsonb_array_elements(nuevos) n;
    perform logistica.inv_anotar('alta', 'contenedores', v_id, b, null, logistica.inv_foto(v_id), null);
  else
    c := logistica.inv_contenedor_de(u, v_id);
    if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    antes := logistica.inv_foto(v_id);
    viejos := (select jsonb_agg(jsonb_build_object('modelo_id', r.modelo_id, 'opciones', to_jsonb(r.opciones), 'color_id', r.color_id, 'cantidad', r.cantidad))
               from logistica.inv_renglones r where r.contenedor_id = v_id);
    update logistica.inv_contenedores set numero = v_numero, llegada = v_llegada, observaciones = nullif(btrim(p->>'observaciones'),'')
      where id = v_id;
    -- ¿Cambió lo que trae? (se comparan como conjuntos, sin importar el orden)
    if (select jsonb_agg(e order by e::text) from jsonb_array_elements(coalesce(viejos,'[]')) e)
       is distinct from (select jsonb_agg(e order by e::text) from jsonb_array_elements(nuevos) e) then
      delete from logistica.inv_renglones where contenedor_id = v_id;
      insert into logistica.inv_renglones (contenedor_id, modelo_id, opciones, color_id, cantidad)
      select v_id, (n->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(n->'opciones') e), (n->>'color_id')::bigint, (n->>'cantidad')::int
      from jsonb_array_elements(nuevos) n;
      update logistica.inv_contenedores set estado = 'recibido', revisado = null, revisado_por = null where id = v_id;
    end if;
    perform logistica.inv_anotar('edicion', 'contenedores', v_id, c.bodega, antes, logistica.inv_foto(v_id), p_motivo);
  end if;
  return jsonb_build_object('id', v_id);
end $$;

-- p = {contados:[{renglon_id, contados}], piezas:[{pieza_id, color_id, esperadas, llegaron, danadas}],
--      defectos:[{pieza_id, color_id, defecto_id, gravedad, cantidad}]}
create function public.inv_revision_guardar(p_id bigint, p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); c logistica.inv_contenedores; antes jsonb; x jsonb;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');   -- solo revisa que pueda escribir
  c := logistica.inv_contenedor_de(u, p_id);
  if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
  if c.estado = 'revisado' and nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
  antes := logistica.inv_foto(p_id);

  for x in select * from jsonb_array_elements(coalesce(p->'contados','[]')) loop
    if coalesce((x->>'contados')::int, -1) < 0 then raise exception 'Revisa los vehículos contados'; end if;
    update logistica.inv_renglones set contados = (x->>'contados')::int where id = (x->>'renglon_id')::bigint and contenedor_id = p_id;
  end loop;
  if exists (select 1 from logistica.inv_renglones where contenedor_id = p_id and contados is null) then
    raise exception 'Falta contar los vehículos';
  end if;

  delete from logistica.inv_revision_piezas where contenedor_id = p_id;
  delete from logistica.inv_revision_defectos where contenedor_id = p_id;
  for x in select * from jsonb_array_elements(coalesce(p->'piezas','[]')) loop
    if coalesce((x->>'llegaron')::int, -1) < 0 or coalesce((x->>'danadas')::int, 0) < 0 or coalesce((x->>'esperadas')::int, -1) < 0 then
      raise exception 'Las cantidades no pueden ser negativas';
    end if;
    if coalesce((x->>'danadas')::int, 0) > (x->>'llegaron')::int then
      raise exception 'No puede haber más dañadas que las que llegaron';
    end if;
    insert into logistica.inv_revision_piezas (contenedor_id, pieza_id, color_id, esperadas, llegaron, danadas)
    values (p_id, (x->>'pieza_id')::bigint, (x->>'color_id')::bigint, (x->>'esperadas')::int, (x->>'llegaron')::int, coalesce((x->>'danadas')::int, 0));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
    insert into logistica.inv_revision_defectos (contenedor_id, pieza_id, color_id, defecto_id, gravedad, cantidad)
    values (p_id, (x->>'pieza_id')::bigint, (x->>'color_id')::bigint, (x->>'defecto_id')::bigint, x->>'gravedad', (x->>'cantidad')::int);
  end loop;

  update logistica.inv_contenedores set estado = 'revisado', revisado = now(), revisado_por = (select auth.uid()) where id = p_id;
  perform logistica.inv_anotar(case when c.estado = 'revisado' then 'edicion' else 'revision' end, 'revision', p_id, c.bodega,
    antes, logistica.inv_foto(p_id), p_motivo);
  return jsonb_build_object('id', p_id);
end $$;

create function public.inv_inventario(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(t order by t->>'pieza', t->>'color') from (
        select jsonb_build_object('pieza_id', rp.pieza_id, 'pieza', pz.nombre, 'color_id', rp.color_id, 'color', k.nombre,
          'disponibles', sum(rp.llegaron - rp.danadas), 'danadas', sum(rp.danadas)) t
        from logistica.inv_revision_piezas rp
        join logistica.inv_contenedores c on c.id = rp.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        join logistica.inv_piezas pz on pz.id = rp.pieza_id
        left join logistica.inv_colores k on k.id = rp.color_id
        group by rp.pieza_id, pz.nombre, rp.color_id, k.nombre) s), '[]'),
    'espera', coalesce((select jsonb_agg(t order by t->>'modelo', t->>'opciones_txt', t->>'color') from (
        select jsonb_build_object('modelo_id', r.modelo_id, 'modelo', m.nombre, 'opciones', to_jsonb(r.opciones),
          'opciones_txt', (select string_agg(o.nombre, ' · ' order by ca.orden) from logistica.inv_opciones o
                           join logistica.inv_caracteristicas ca on ca.id = o.caracteristica_id where o.id = any(r.opciones)),
          'color_id', r.color_id, 'color', k.nombre, 'cantidad', sum(r.contados)) t
        from logistica.inv_renglones r
        join logistica.inv_contenedores c on c.id = r.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        join logistica.inv_modelos m on m.id = r.modelo_id
        join logistica.inv_colores k on k.id = r.color_id
        group by r.modelo_id, m.nombre, r.opciones, r.color_id, k.nombre
        having sum(r.contados) > 0) s), '[]'));
end $$;

create function public.inv_anulacion_pedir(p_contenedor bigint, p_motivo text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); c logistica.inv_contenedores; v_id bigint;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  c := logistica.inv_contenedor_de(u, p_contenedor);
  if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo'; end if;
  if exists (select 1 from logistica.inv_anulaciones where contenedor_id = p_contenedor and estado = 'pendiente') then
    raise exception 'Ya se pidió anular este contenedor';
  end if;
  insert into logistica.inv_anulaciones (contenedor_id, motivo, pedida_por) values (p_contenedor, btrim(p_motivo), (select auth.uid()))
  returning id into v_id;
  perform logistica.inv_anotar('anulacion_pedida', 'contenedores', p_contenedor, c.bodega, null, null, p_motivo);
  return jsonb_build_object('id', v_id);
end $$;

create function public.inv_anulacion_resolver(p_id bigint, p_autorizar boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); a logistica.inv_anulaciones; b text;
begin
  if u.rol <> 'admin' then raise exception 'Solo el administrador autoriza anulaciones' using errcode = '42501'; end if;
  select * into a from logistica.inv_anulaciones where id = p_id and estado = 'pendiente';
  if not found then raise exception 'Esa anulación ya no está pendiente'; end if;
  update logistica.inv_anulaciones set estado = case when p_autorizar then 'autorizada' else 'rechazada' end,
    resuelta_por = (select auth.uid()), resuelta = now() where id = p_id;
  if p_autorizar then update logistica.inv_contenedores set estado = 'anulado' where id = a.contenedor_id; end if;
  select bodega into b from logistica.inv_contenedores where id = a.contenedor_id;
  perform logistica.inv_anotar(case when p_autorizar then 'anulacion_autorizada' else 'anulacion_rechazada' end,
    'contenedores', a.contenedor_id, b, null, null, a.motivo);
  return jsonb_build_object('id', p_id);
end $$;

create function public.inv_bitacora(p_pendientes boolean default true) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  if u.rol <> 'admin' then raise exception 'Solo el administrador ve los cambios' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(t order by (t->>'fecha') desc) from (
    select jsonb_build_object('id', bt.id, 'fecha', bt.fecha, 'quien', split_part(au.email, '@', 1), 'bodega', bt.bodega,
      'accion', bt.accion, 'tabla', bt.tabla, 'registro', bt.registro,
      'numero', (select c.numero from logistica.inv_contenedores c where c.id = bt.registro),
      'antes', bt.antes, 'despues', bt.despues, 'motivo', bt.motivo, 'visto', bt.visto) t
    from logistica.inv_bitacora bt left join auth.users au on au.id = bt.user_id
    where not p_pendientes or not bt.visto
    order by bt.fecha desc limit 500) s), '[]');
end $$;

create function public.inv_bitacora_visto(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  if u.rol <> 'admin' then raise exception 'Solo el administrador ve los cambios' using errcode = '42501'; end if;
  update logistica.inv_bitacora set visto = true where id = any(p_ids);
  return jsonb_build_object('ok', true);
end $$;

-- Permisos: solo cuentas con sesión; nadie anónimo
do $$ declare f text; begin
  foreach f in array array['inv_sesion()','inv_catalogo()','inv_catalogo_guardar(text,jsonb)','inv_contenedores(text)',
    'inv_contenedor(bigint)','inv_contenedor_guardar(jsonb,text)','inv_revision_guardar(bigint,jsonb,text)','inv_inventario(text)',
    'inv_anulacion_pedir(bigint,text)','inv_anulacion_resolver(bigint,boolean)','inv_bitacora(boolean)','inv_bitacora_visto(bigint[])']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['inv_yo()','inv_bodega_escribe(logistica.usuarios,text)','inv_bodega_lee(logistica.usuarios,text)',
    'inv_contenedor_de(logistica.usuarios,bigint)','inv_anotar(text,text,bigint,text,jsonb,jsonb,text)','inv_foto(bigint)']
  loop
    execute format('revoke all on function logistica.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- Datos iniciales (catálogos del usuario, 18-nov-2026)
insert into logistica.inv_modelos (nombre, orden) values ('MC 150',1),('MC 200',2),('MC 300',3);
insert into logistica.inv_colores (nombre, orden) values ('Blanco',1),('Azul',2),('Rojo',3),('Tinto',4),('Plata',5),
  ('Negro',6),('Rosa',7),('Verde',8),('Naranja',9),('Amarillo',10);
insert into logistica.inv_caracteristicas (nombre, orden) values ('Hidráulico',1),('Rodado',2);
insert into logistica.inv_opciones (caracteristica_id, nombre, orden)
  select c.id, o.nombre, o.orden from logistica.inv_caracteristicas c
  join (values ('Hidráulico','Con',1),('Hidráulico','Sin',2),('Rodado','Sencillo',1),('Rodado','Doble',2)) o(car, nombre, orden) on o.car = c.nombre;
-- Por ahora todas las opciones en los 3 modelos (pendiente: el usuario confirma qué combinaciones existen)
insert into logistica.inv_modelo_opciones (modelo_id, opcion_id) select m.id, o.id from logistica.inv_modelos m cross join logistica.inv_opciones o;
insert into logistica.inv_defectos (nombre, orden) select d, row_number() over () from unnest(array[
  'Golpe / abolladura','Rayón','Pintura','Faltante de pieza','Falla eléctrica','Falla de motor','Transmisión / clutch','Frenos',
  'Llantas / rines','Batería','Óxido / corrosión','Cristales / espejos / faros','Asiento / vestiduras','Documentación / llaves',
  'Sin motor en chasis','Error de armado','Chorreadura de motor']) d;
