-- Producción y ventas (20-nov-2026). Diseño: docs/superpowers/specs/2026-11-20-produccion-ventas-design.md
-- Nueva venta (remisión, vehículo, especial, vendedor, fecha, destino) → Por armar / Esperando piezas.
-- Entrar a producción (venta o showroom, número de serie) → etapas: Armado, Revisión 1, Herrería y Forrado
-- (solo especiales), Mecánica, Detallado y pintura, Revisión final → Listo.
-- Si la Revisión 1 encuentra un "Faltante de pieza", el vehículo queda en Faltantes hasta que se pongan.

-- ---------------------------------------------------------------- Tablas
create table logistica.inv_ventas (
  id bigint generated always as identity primary key,
  bodega text not null check (bodega in ('bodega1','bodega2')),
  remision text not null,
  fecha date not null,
  vendedor text not null,
  destino text not null,
  tipo_destino text,
  modelo_id bigint not null references logistica.inv_modelos(id),
  opciones bigint[] not null default '{}',
  color_id bigint not null references logistica.inv_colores(id),
  especial boolean not null default false,
  especial_que text,
  costo_envio numeric, pago text check (pago in ('liquidado','anticipo')), fletero text, eta text, entregada date,
  estado text not null default 'activa' check (estado in ('activa','anulada')),
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid());
create unique index inv_ventas_remision on logistica.inv_ventas (upper(btrim(remision))) where estado <> 'anulada';

create table logistica.inv_vehiculos (
  id bigint generated always as identity primary key,
  bodega text not null check (bodega in ('bodega1','bodega2')),
  serie text not null,
  modelo_id bigint not null references logistica.inv_modelos(id),
  opciones bigint[] not null default '{}',
  color_id bigint not null references logistica.inv_colores(id),
  para text not null check (para in ('venta','showroom')),
  venta_id bigint unique references logistica.inv_ventas(id),
  especial boolean not null default false,
  etapa text not null default 'armado'
    check (etapa in ('armado','revision1','herreria','forrado','mecanica','detallado','revision_final','listo')),
  etapa_desde timestamptz not null default now(),
  faltantes boolean not null default false,
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  check ((para = 'venta') = (venta_id is not null)));
create unique index inv_vehiculos_serie on logistica.inv_vehiculos (upper(btrim(serie)));

-- Historial de etapas (y notas: "No pasó la revisión final: …")
create table logistica.inv_vehiculo_etapas (
  id bigint generated always as identity primary key,
  vehiculo_id bigint not null references logistica.inv_vehiculos(id) on delete cascade,
  etapa text not null,
  accion text not null check (accion in ('entro','no_paso','faltantes','faltantes_listos')),
  nota text,
  fecha timestamptz not null default now(),
  user_id uuid default auth.uid());
create index on logistica.inv_vehiculo_etapas (vehiculo_id);

-- Daños y faltantes que se encontraron en la Revisión 1
create table logistica.inv_vehiculo_defectos (
  id bigint generated always as identity primary key,
  vehiculo_id bigint not null references logistica.inv_vehiculos(id) on delete cascade,
  etapa text not null,
  defecto_id bigint not null references logistica.inv_defectos(id),
  gravedad text not null check (gravedad in ('leve','media','grave')),
  cantidad int not null check (cantidad > 0),
  resuelto boolean not null default false,
  creado timestamptz not null default now());
create index on logistica.inv_vehiculo_defectos (vehiculo_id);

do $$ declare t text; begin
  foreach t in array array['inv_ventas','inv_vehiculos','inv_vehiculo_etapas','inv_vehiculo_defectos'] loop
    execute format('alter table logistica.%I enable row level security', t);
    execute format('revoke all on logistica.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Ayudantes (no expuestos)
create function logistica.inv_ordenar(a bigint[]) returns bigint[]
language sql immutable set search_path to '' as $$
  select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(a, '{}')) x $$;

-- Siguiente etapa. Herrería y forrado solo para especiales.
create function logistica.inv_siguiente(p_etapa text, p_especial boolean) returns text
language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'armado' then 'revision1'
    when 'revision1' then case when p_especial then 'herreria' else 'mecanica' end
    when 'herreria' then 'forrado'
    when 'forrado' then 'mecanica'
    when 'mecanica' then 'detallado'
    when 'detallado' then 'revision_final'
    when 'revision_final' then 'listo'
  end $$;

-- Vehículos en espera de armado: lo contado en contenedores revisados menos lo que ya entró a producción.
-- Por bodega, modelo, opciones (ordenadas) y color.
create function logistica.inv_espera(b text) returns table (bodega text, modelo_id bigint, opciones bigint[], color_id bigint, cantidad bigint)
language sql stable security definer set search_path to '' as $$
  with llego as (
    select c.bodega, r.modelo_id, logistica.inv_ordenar(r.opciones) as opciones, rc.color_id, sum(rc.contados)::bigint as n
    from logistica.inv_renglones r
    join logistica.inv_contenedores c on c.id = r.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
    join logistica.inv_renglon_colores rc on rc.renglon_id = r.id
    group by 1, 2, 3, 4),
  uso as (
    select v.bodega, v.modelo_id, v.opciones, v.color_id, count(*)::bigint as n
    from logistica.inv_vehiculos v where (b is null or v.bodega = b)
    group by 1, 2, 3, 4)
  select coalesce(l.bodega, u.bodega), coalesce(l.modelo_id, u.modelo_id), coalesce(l.opciones, u.opciones), coalesce(l.color_id, u.color_id),
         coalesce(l.n, 0) - coalesce(u.n, 0)
  from llego l full join uso u on u.bodega = l.bodega and u.modelo_id = l.modelo_id and u.opciones = l.opciones and u.color_id = l.color_id $$;

create function logistica.inv_vehiculo_de(u logistica.usuarios, p_id bigint) returns logistica.inv_vehiculos
language plpgsql stable security definer set search_path to '' as $$
declare v logistica.inv_vehiculos;
begin
  select * into v from logistica.inv_vehiculos where id = p_id;
  if not found or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Ese vehículo no existe'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------- Ventas
-- p = {id?, bodega?, remision, fecha, vendedor, destino, tipo_destino, modelo_id, opciones, color_id, especial, especial_que}
-- Al corregir (con id) se pide motivo. Modelo, opciones, color y especial ya no cambian si la venta ya entró a producción.
create function public.inv_venta_guardar(p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p->>'id')::bigint; b text; antes logistica.inv_ventas;
  v_rem text := btrim(coalesce(p->>'remision','')); v_ops bigint[];
  v_esp boolean := coalesce((p->>'especial')::boolean, false); v_que text := nullif(btrim(coalesce(p->>'especial_que','')), '');
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_rem = '' then raise exception 'Escribe la remisión'; end if;
  if nullif(btrim(coalesce(p->>'vendedor','')), '') is null then raise exception 'Escribe el vendedor'; end if;
  if nullif(btrim(coalesce(p->>'destino','')), '') is null then raise exception 'Escribe el destino'; end if;
  if (p->>'fecha') is null then raise exception 'Escribe la fecha de compra'; end if;
  if not exists (select 1 from logistica.inv_modelos where id = (p->>'modelo_id')::bigint) then raise exception 'Escoge el modelo'; end if;
  if not exists (select 1 from logistica.inv_colores where id = (p->>'color_id')::bigint) then raise exception 'Escoge el color'; end if;
  if v_esp and v_que is null then raise exception 'Escribe qué lleva el especial'; end if;
  select logistica.inv_ordenar(array_agg(x::bigint)) into v_ops from jsonb_array_elements_text(coalesce(p->'opciones','[]')) x;
  if exists (select 1 from logistica.inv_ventas where upper(btrim(remision)) = upper(v_rem) and estado <> 'anulada' and id is distinct from v_id) then
    raise exception 'Esa remisión ya está registrada';
  end if;

  if v_id is null then
    insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino, modelo_id, opciones, color_id, especial, especial_que)
    values (b, v_rem, (p->>'fecha')::date, btrim(p->>'vendedor'), btrim(p->>'destino'), nullif(p->>'tipo_destino',''),
      (p->>'modelo_id')::bigint, v_ops, (p->>'color_id')::bigint, v_esp, case when v_esp then v_que end)
    returning id into v_id;
    perform logistica.inv_anotar('alta', 'ventas', v_id, b, null, (select to_jsonb(x) from logistica.inv_ventas x where x.id = v_id), null);
  else
    select * into antes from logistica.inv_ventas where id = v_id;
    if not found or (u.rol = 'bodega' and antes.bodega <> u.bodega) then raise exception 'Esa venta no existe'; end if;
    if antes.estado = 'anulada' then raise exception 'Esa venta está anulada'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    if exists (select 1 from logistica.inv_vehiculos where venta_id = v_id) and
       (antes.modelo_id <> (p->>'modelo_id')::bigint or antes.opciones <> v_ops or antes.color_id <> (p->>'color_id')::bigint or antes.especial <> v_esp) then
      raise exception 'Ya entró a producción: el vehículo y si es especial ya no se pueden cambiar';
    end if;
    update logistica.inv_ventas set remision = v_rem, fecha = (p->>'fecha')::date, vendedor = btrim(p->>'vendedor'), destino = btrim(p->>'destino'),
      tipo_destino = nullif(p->>'tipo_destino',''), modelo_id = (p->>'modelo_id')::bigint, opciones = v_ops, color_id = (p->>'color_id')::bigint,
      especial = v_esp, especial_que = case when v_esp then v_que end
    where id = v_id;
    update logistica.inv_vehiculos set especial = v_esp where venta_id = v_id;
    perform logistica.inv_anotar('edicion', 'ventas', v_id, antes.bodega, to_jsonb(antes),
      (select to_jsonb(x) from logistica.inv_ventas x where x.id = v_id), p_motivo);
  end if;
  return jsonb_build_object('id', v_id);
end $$;

-- Ventas con su estado: esperando (no hay vehículo para armar), por_armar, produccion, faltantes, lista.
-- Las que no tienen vehículo se reparten lo que hay en espera de armado por fecha de compra (la más antigua primero).
create function public.inv_ventas(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(t order by t->>'fecha', (t->>'id')::bigint) from (
    select to_jsonb(v) || jsonb_build_object(
      'estado_venta', case
        when h.id is not null then case when h.faltantes then 'faltantes' when h.etapa = 'listo' then 'lista' else 'produccion' end
        when s.rn <= coalesce(e.cantidad, 0) then 'por_armar'
        else 'esperando' end,
      'vehiculo', case when h.id is null then null else jsonb_build_object('id', h.id, 'serie', h.serie, 'etapa', h.etapa, 'faltantes', h.faltantes) end) t
    from logistica.inv_ventas v
    left join logistica.inv_vehiculos h on h.venta_id = v.id
    left join (select x.id, row_number() over (partition by x.bodega, x.modelo_id, x.opciones, x.color_id order by x.fecha, x.id) rn
               from logistica.inv_ventas x
               where x.estado = 'activa' and not exists (select 1 from logistica.inv_vehiculos y where y.venta_id = x.id)) s on s.id = v.id
    left join logistica.inv_espera(b) e on e.bodega = v.bodega and e.modelo_id = v.modelo_id and e.opciones = v.opciones and e.color_id = v.color_id
    where v.estado = 'activa' and (b is null or v.bodega = b)) q), '[]');
end $$;

-- ---------------------------------------------------------------- Producción
-- Lo que se puede meter a producción (en espera de armado, ya descontado lo que entró)
create function public.inv_espera_armado(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('bodega', e.bodega, 'modelo_id', e.modelo_id, 'opciones', to_jsonb(e.opciones),
      'color_id', e.color_id, 'cantidad', e.cantidad) order by e.bodega, e.modelo_id, e.color_id)
    from logistica.inv_espera(b) e where e.cantidad > 0), '[]');
end $$;

-- p = {venta_id, serie} o {para:'showroom', bodega, modelo_id, opciones, color_id, serie}
create function public.inv_produccion_entrar(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); v logistica.inv_ventas; b text; v_id bigint; v_ops bigint[];
  v_serie text := btrim(coalesce(p->>'serie','')); v_mod bigint; v_col bigint; v_hay bigint;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');   -- solo revisa que pueda escribir
  if v_serie = '' then raise exception 'Escribe el número de serie'; end if;
  if exists (select 1 from logistica.inv_vehiculos where upper(btrim(serie)) = upper(v_serie)) then raise exception 'Ese número de serie ya está registrado'; end if;
  if (p->>'venta_id') is not null then
    select * into v from logistica.inv_ventas where id = (p->>'venta_id')::bigint and estado = 'activa';
    if not found or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa venta no existe'; end if;
    if exists (select 1 from logistica.inv_vehiculos where venta_id = v.id) then raise exception 'Esa venta ya está en producción'; end if;
    b := v.bodega; v_mod := v.modelo_id; v_ops := v.opciones; v_col := v.color_id;
  else
    b := logistica.inv_bodega_escribe(u, p->>'bodega');
    v_mod := (p->>'modelo_id')::bigint; v_col := (p->>'color_id')::bigint;
    select logistica.inv_ordenar(array_agg(x::bigint)) into v_ops from jsonb_array_elements_text(coalesce(p->'opciones','[]')) x;
  end if;
  select e.cantidad into v_hay from logistica.inv_espera(b) e
    where e.bodega = b and e.modelo_id = v_mod and e.opciones = v_ops and e.color_id = v_col;
  if coalesce(v_hay, 0) < 1 then raise exception 'No hay vehículos de ese modelo y color en espera de armado'; end if;

  insert into logistica.inv_vehiculos (bodega, serie, modelo_id, opciones, color_id, para, venta_id, especial)
  values (b, v_serie, v_mod, v_ops, v_col, case when v.id is null then 'showroom' else 'venta' end, v.id, coalesce(v.especial, false))
  returning id into v_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (v_id, 'armado', 'entro');
  perform logistica.inv_anotar('alta', 'vehiculos', v_id, b, null, (select to_jsonb(x) from logistica.inv_vehiculos x where x.id = v_id), null);
  return jsonb_build_object('id', v_id);
end $$;

-- Vehículos en producción (y listos), con su venta
create function public.inv_produccion(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(to_jsonb(h) || jsonb_build_object(
      'venta', case when v.id is null then null else jsonb_build_object('id', v.id, 'remision', v.remision, 'especial_que', v.especial_que, 'destino', v.destino) end)
      order by h.etapa_desde)
    from logistica.inv_vehiculos h left join logistica.inv_ventas v on v.id = h.venta_id
    where (b is null or h.bodega = b)), '[]');
end $$;

-- Ficha de un vehículo: datos, venta, historial y daños
create function public.inv_vehiculo(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos := logistica.inv_vehiculo_de(u, p_id);
begin
  return jsonb_build_object(
    'vehiculo', to_jsonb(h),
    'venta', (select to_jsonb(v) from logistica.inv_ventas v where v.id = h.venta_id),
    'historial', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha, x.id) from logistica.inv_vehiculo_etapas x where x.vehiculo_id = p_id), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from logistica.inv_vehiculo_defectos d where d.vehiculo_id = p_id), '[]'));
end $$;

-- Pasar a la siguiente etapa.
-- Revisión 1: p = {defectos:[{defecto_id, gravedad, cantidad}]}; si hay "Faltante de pieza", queda en Faltantes.
-- Revisión final: p = {pasa: true} o {pasa: false, nota}; si no pasa, se queda hasta que se corrija.
create function public.inv_vehiculo_avanzar(p_id bigint, p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; x jsonb; v_sig text; v_falta boolean := false;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  if h.etapa = 'listo' then raise exception 'Este vehículo ya está listo'; end if;
  if h.faltantes then raise exception 'Primero marca que ya se pusieron las piezas que faltaban'; end if;

  if h.etapa = 'revision1' then
    perform logistica.inv_revisar_defectos(p);
    for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
      insert into logistica.inv_vehiculo_defectos (vehiculo_id, etapa, defecto_id, gravedad, cantidad)
      values (p_id, 'revision1', (x->>'defecto_id')::bigint, x->>'gravedad', (x->>'cantidad')::int);
      if exists (select 1 from logistica.inv_defectos d where d.id = (x->>'defecto_id')::bigint and d.nombre ilike 'faltante%') then v_falta := true; end if;
    end loop;
    if v_falta then
      update logistica.inv_vehiculos set faltantes = true where id = p_id;
      insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, h.etapa, 'faltantes');
      return jsonb_build_object('id', p_id, 'etapa', h.etapa, 'faltantes', true);
    end if;
  elsif h.etapa = 'revision_final' and coalesce((p->>'pasa')::boolean, true) = false then
    if nullif(btrim(coalesce(p->>'nota','')), '') is null then raise exception 'Escribe por qué no pasa'; end if;
    insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion, nota) values (p_id, h.etapa, 'no_paso', btrim(p->>'nota'));
    return jsonb_build_object('id', p_id, 'etapa', h.etapa, 'faltantes', false);
  end if;

  v_sig := logistica.inv_siguiente(h.etapa, h.especial);
  update logistica.inv_vehiculos set etapa = v_sig, etapa_desde = now() where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_sig, 'entro');
  return jsonb_build_object('id', p_id, 'etapa', v_sig, 'faltantes', false);
end $$;

-- Ya se pusieron las piezas que faltaban: sale de Faltantes y pasa a la siguiente etapa
create function public.inv_vehiculo_faltantes_listos(p_id bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; v_sig text;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  if not h.faltantes then raise exception 'Este vehículo no tiene faltantes'; end if;
  update logistica.inv_vehiculo_defectos set resuelto = true
    where vehiculo_id = p_id and not resuelto and defecto_id in (select id from logistica.inv_defectos where nombre ilike 'faltante%');
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, h.etapa, 'faltantes_listos');
  v_sig := logistica.inv_siguiente(h.etapa, h.especial);
  update logistica.inv_vehiculos set faltantes = false, etapa = v_sig, etapa_desde = now() where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_sig, 'entro');
  return jsonb_build_object('id', p_id, 'etapa', v_sig);
end $$;

-- ---------------------------------------------------------------- Inventario: espera de armado ya descuenta lo que entró a producción
create or replace function public.inv_inventario(p_bodega text default null) returns jsonb
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
        select jsonb_build_object('modelo_id', e.modelo_id, 'modelo', m.nombre, 'opciones', to_jsonb(e.opciones),
          'opciones_txt', (select string_agg(o.nombre, ' · ' order by ca.orden) from logistica.inv_opciones o
                           join logistica.inv_caracteristicas ca on ca.id = o.caracteristica_id where o.id = any(e.opciones)),
          'color_id', e.color_id, 'color', k.nombre, 'cantidad', sum(e.cantidad)) t
        from logistica.inv_espera(b) e
        join logistica.inv_modelos m on m.id = e.modelo_id
        join logistica.inv_colores k on k.id = e.color_id
        group by e.modelo_id, m.nombre, e.opciones, e.color_id, k.nombre
        having sum(e.cantidad) > 0) s), '[]'));
end $$;

-- ---------------------------------------------------------------- Permisos
do $$ declare f text; begin
  foreach f in array array['inv_venta_guardar(jsonb,text)','inv_ventas(text)','inv_espera_armado(text)','inv_produccion_entrar(jsonb)',
    'inv_produccion(text)','inv_vehiculo(bigint)','inv_vehiculo_avanzar(bigint,jsonb)','inv_vehiculo_faltantes_listos(bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['inv_ordenar(bigint[])','inv_siguiente(text,boolean)','inv_espera(text)','inv_vehiculo_de(logistica.usuarios,bigint)']
  loop
    execute format('revoke all on function logistica.%s from public, anon, authenticated', f);
  end loop;
end $$;
