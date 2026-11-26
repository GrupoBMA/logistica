-- 26-nov-2026 (pedido del usuario):
-- 1) Etapas: Revisión 1 y Mecánica se juntan en "Revisión, mecánica y activación" (id 'revision').
--    Línea: Armado → Revisión → (Herrería → Forrado, solo especiales) → Detallado y pintura → Revisión final → Listo.
--    El número de serie se pone al TERMINAR Armado (ya no al entrar a producción).
-- 2) "Ventas" pasa a "Órdenes": una orden es de Cliente (la venta de siempre) o de Showroom (sin remisión, vendedor ni destino;
--    folio automático SR-1, SR-2…). Todo lo que entra a producción viene de una orden. Al repartir lo que hay en espera,
--    primero van los clientes y luego showroom.
-- 3) Plan de armado por semana y por bodega (inv_plan). Un vehículo cuenta como armado cuando sale de Armado;
--    lo que no se armó pasa solo a la semana actual.

-- ---------------------------------------------------------------- 1. Etapas
alter table logistica.inv_vehiculos drop constraint if exists inv_vehiculos_etapa_check;
update logistica.inv_vehiculos set etapa = 'revision' where etapa in ('revision1', 'mecanica');
update logistica.inv_vehiculo_etapas set etapa = 'revision' where etapa in ('revision1', 'mecanica');
update logistica.inv_vehiculo_defectos set etapa = 'revision' where etapa = 'revision1';
alter table logistica.inv_vehiculos add constraint inv_vehiculos_etapa_check
  check (etapa in ('armado','revision','herreria','forrado','detallado','revision_final','listo'));
alter table logistica.inv_vehiculos alter column serie drop not null;
alter table logistica.inv_vehiculos drop constraint if exists inv_vehiculos_para_unidad;

create or replace function logistica.inv_siguiente(p_etapa text, p_especial boolean) returns text
 language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'armado' then 'revision'
    when 'revision' then case when p_especial then 'herreria' else 'detallado' end
    when 'herreria' then 'forrado'
    when 'forrado' then 'detallado'
    when 'detallado' then 'revision_final'
    when 'revision_final' then 'listo'
  end $$;

create or replace function logistica.inv_anterior(p_etapa text, p_especial boolean) returns text
 language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'revision' then 'armado'
    when 'herreria' then 'revision'
    when 'forrado' then 'herreria'
    when 'detallado' then case when p_especial then 'forrado' else 'revision' end
    when 'revision_final' then 'detallado'
    when 'listo' then 'revision_final'
  end $$;

create or replace function public.inv_vehiculo_avanzar(p_id bigint, p jsonb default '{}'::jsonb) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; x jsonb; v_sig text; v_falta boolean := false;
  v_serie text := btrim(coalesce(p->>'serie',''));
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  if h.etapa = 'listo' then raise exception 'Este vehículo ya está listo'; end if;
  if h.faltantes then raise exception 'Primero marca que ya se pusieron las piezas que faltaban'; end if;

  if h.etapa = 'armado' then
    -- Al terminar Armado se le pone su número de serie (si todavía no lo tiene)
    if h.serie is null then
      if v_serie = '' then raise exception 'Escribe el número de serie'; end if;
      if exists (select 1 from logistica.inv_vehiculos where upper(btrim(serie)) = upper(v_serie) and id <> p_id) then
        raise exception 'Ese número de serie ya está registrado';
      end if;
      update logistica.inv_vehiculos set serie = v_serie where id = p_id;
    end if;
  elsif h.etapa = 'revision' then
    perform logistica.inv_revisar_defectos(p);
    for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
      insert into logistica.inv_vehiculo_defectos (vehiculo_id, etapa, defecto_id, pieza_id, gravedad, cantidad)
      values (p_id, 'revision', (x->>'defecto_id')::bigint, (x->>'pieza_id')::bigint, nullif(x->>'gravedad',''), (x->>'cantidad')::int);
      if exists (select 1 from logistica.inv_defectos d where d.id = (x->>'defecto_id')::bigint and d.nombre ilike 'faltante%') then v_falta := true; end if;
    end loop;
    if v_falta then
      update logistica.inv_vehiculos set faltantes = true where id = p_id;
      insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, h.etapa, 'faltantes');
      return jsonb_build_object('id', p_id, 'etapa', h.etapa, 'faltantes', true);
    end if;
  elsif h.etapa = 'revision_final' and coalesce((p->>'pasa')::boolean, true) = false then
    if nullif(btrim(coalesce(p->>'nota','')), '') is null then raise exception 'Escribe por qué no pasa'; end if;
    update logistica.inv_vehiculos set no_paso = true where id = p_id;
    insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion, nota) values (p_id, h.etapa, 'no_paso', btrim(p->>'nota'));
    return jsonb_build_object('id', p_id, 'etapa', h.etapa, 'no_paso', true);
  end if;

  v_sig := logistica.inv_siguiente(h.etapa, h.especial);
  update logistica.inv_vehiculos set etapa = v_sig, etapa_desde = now(), no_paso = false where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_sig, 'entro');
  return jsonb_build_object('id', p_id, 'etapa', v_sig, 'faltantes', false);
end $function$;

create or replace function public.inv_vehiculo_regresar(p_id bigint) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; v_ant text;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  if h.etapa = 'armado' then
    perform logistica.inv_anotar('edicion', 'vehiculos', p_id, h.bodega, to_jsonb(h), null, 'Regresó a En espera de armado');
    delete from logistica.inv_vehiculos where id = p_id;
    return jsonb_build_object('id', p_id, 'borrado', true);
  end if;
  v_ant := logistica.inv_anterior(h.etapa, h.especial);
  if v_ant in ('armado', 'revision') then delete from logistica.inv_vehiculo_defectos where vehiculo_id = p_id and etapa = 'revision'; end if;
  update logistica.inv_vehiculos set etapa = v_ant, etapa_desde = now(), faltantes = false, no_paso = false where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_ant, 'regreso');
  return jsonb_build_object('id', p_id, 'etapa', v_ant);
end $function$;

-- Entrar a producción: siempre desde una orden (cliente o showroom); el número de serie ya no se pide aquí
create or replace function public.inv_produccion_entrar(p jsonb) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); un logistica.inv_venta_unidades; v logistica.inv_ventas; v_id bigint;
  v_serie text := nullif(btrim(coalesce(p->>'serie','')), ''); v_hay bigint; v_faltan jsonb;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  if (p->>'unidad_id') is null then raise exception 'Escoge la orden'; end if;
  select * into un from logistica.inv_venta_unidades where id = (p->>'unidad_id')::bigint;
  select * into v from logistica.inv_ventas where id = un.venta_id and estado = 'activa';
  if v.id is null or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa orden no existe'; end if;
  if exists (select 1 from logistica.inv_vehiculos where unidad_id = un.id) then raise exception 'Ese vehículo ya está en producción'; end if;
  if v_serie is not null and exists (select 1 from logistica.inv_vehiculos where upper(btrim(serie)) = upper(v_serie)) then
    raise exception 'Ese número de serie ya está registrado';
  end if;
  select e.cantidad into v_hay from logistica.inv_espera(v.bodega) e
    where e.bodega = v.bodega and e.modelo_id = un.modelo_id and e.opciones = un.opciones and e.color_id = un.color_id;
  if coalesce(v_hay, 0) < 1 then raise exception 'No hay vehículos de ese modelo y color en espera de armado'; end if;

  insert into logistica.inv_vehiculos (bodega, serie, modelo_id, opciones, color_id, para, venta_id, unidad_id, especial)
  values (v.bodega, v_serie, un.modelo_id, un.opciones, un.color_id, case when v.tipo = 'showroom' then 'showroom' else 'venta' end, v.id, un.id, un.especial)
  returning id into v_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (v_id, 'armado', 'entro');
  v_faltan := logistica.inv_consumir_lista(v_id);
  perform logistica.inv_anotar('alta', 'vehiculos', v_id, v.bodega, null, (select to_jsonb(x) from logistica.inv_vehiculos x where x.id = v_id), null);
  return jsonb_build_object('id', v_id, 'faltan_en_inventario', v_faltan);
end $function$;

-- ---------------------------------------------------------------- 2. Órdenes (cliente o showroom)
alter table logistica.inv_ventas add column if not exists tipo text not null default 'cliente';
alter table logistica.inv_ventas drop constraint if exists inv_ventas_tipo_check;
alter table logistica.inv_ventas add constraint inv_ventas_tipo_check check (tipo in ('cliente','showroom'));
alter table logistica.inv_ventas alter column vendedor drop not null;
alter table logistica.inv_ventas alter column destino drop not null;
create sequence if not exists logistica.inv_showroom_folio;

create or replace function public.inv_venta_guardar(p jsonb, p_motivo text default null) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p->>'id')::bigint; b text; antes jsonb; x jsonb; i int; n int := 0;
  v_rem text := btrim(coalesce(p->>'remision','')); v_ops bigint[]; v_esp boolean; v_que text; v_bod text; v_tipo text;
  v_cp text := nullif(regexp_replace(coalesce(p->>'cp',''), '\s', '', 'g'), '');
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_id is not null then select tipo, remision into v_tipo, v_rem from logistica.inv_ventas where id = v_id and estado = 'activa'
    ; if v_tipo = 'cliente' then v_rem := btrim(coalesce(p->>'remision','')); end if;
  else v_tipo := coalesce(nullif(p->>'tipo',''), 'cliente'); end if;
  if v_tipo is null or v_tipo not in ('cliente','showroom') then raise exception 'Escoge para quién es la orden'; end if;
  if (p->>'fecha') is null then raise exception 'Escribe la fecha'; end if;
  if v_tipo = 'cliente' then
    if v_rem = '' then raise exception 'Escribe la remisión'; end if;
    if nullif(btrim(coalesce(p->>'vendedor','')), '') is null then raise exception 'Escribe el vendedor'; end if;
    if nullif(btrim(coalesce(p->>'destino','')), '') is null then raise exception 'Escribe el destino'; end if;
    if v_cp is not null and v_cp !~ '^[0-9]{5}$' then raise exception 'El código postal lleva 5 números'; end if;
    if exists (select 1 from logistica.inv_ventas where upper(btrim(remision)) = upper(v_rem) and estado <> 'anulada' and id is distinct from v_id) then
      raise exception 'Esa remisión ya está registrada';
    end if;
  end if;
  if v_id is null and jsonb_array_length(coalesce(p->'vehiculos','[]')) = 0 then raise exception 'Agrega al menos un vehículo'; end if;
  for x in select * from jsonb_array_elements(coalesce(p->'vehiculos','[]')) loop
    if not exists (select 1 from logistica.inv_modelos where id = (x->>'modelo_id')::bigint) then raise exception 'Escoge el modelo'; end if;
    if not exists (select 1 from logistica.inv_colores where id = (x->>'color_id')::bigint) then raise exception 'Escoge el color'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    if coalesce((x->>'especial')::boolean, false) and nullif(btrim(coalesce(x->>'especial_que','')), '') is null then raise exception 'Escribe qué lleva el especial'; end if;
    n := n + (x->>'cantidad')::int;
  end loop;
  if n > 60 then raise exception 'Son demasiados vehículos para una orden'; end if;

  if v_id is null then
    if v_tipo = 'showroom' then v_rem := 'SR-' || nextval('logistica.inv_showroom_folio'); end if;
    insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino, cp, tipo)
    values (b, v_rem, (p->>'fecha')::date,
      case when v_tipo = 'cliente' then btrim(p->>'vendedor') end, case when v_tipo = 'cliente' then btrim(p->>'destino') end,
      case when v_tipo = 'cliente' then nullif(p->>'tipo_destino','') end, case when v_tipo = 'cliente' then v_cp end, v_tipo)
    returning id into v_id;
  else
    select v.bodega, to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
      into v_bod, antes from logistica.inv_ventas v where v.id = v_id and v.estado = 'activa';
    if antes is null or (u.rol = 'bodega' and v_bod <> u.bodega) then raise exception 'Esa orden no existe'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    update logistica.inv_ventas set remision = v_rem, fecha = (p->>'fecha')::date,
      vendedor = case when v_tipo = 'cliente' then btrim(p->>'vendedor') end, destino = case when v_tipo = 'cliente' then btrim(p->>'destino') end,
      tipo_destino = case when v_tipo = 'cliente' then nullif(p->>'tipo_destino','') end, cp = case when v_tipo = 'cliente' then v_cp end
    where id = v_id;
  end if;

  if p ? 'vehiculos' and jsonb_array_length(p->'vehiculos') > 0 then
    if exists (select 1 from logistica.inv_vehiculos where venta_id = v_id) then
      raise exception 'Ya hay vehículos de esta orden en producción: solo se pueden corregir los datos de la orden';
    end if;
    delete from logistica.inv_venta_unidades where venta_id = v_id;
    n := 0;
    for x in select * from jsonb_array_elements(p->'vehiculos') loop
      select logistica.inv_ordenar(array_agg(y::bigint)) into v_ops from jsonb_array_elements_text(coalesce(x->'opciones','[]')) y;
      v_esp := coalesce((x->>'especial')::boolean, false); v_que := nullif(btrim(coalesce(x->>'especial_que','')), '');
      for i in 1 .. (x->>'cantidad')::int loop
        n := n + 1;
        insert into logistica.inv_venta_unidades (venta_id, parte, modelo_id, opciones, color_id, especial, especial_que)
        values (v_id, n, (x->>'modelo_id')::bigint, v_ops, (x->>'color_id')::bigint, v_esp, case when v_esp then v_que end);
      end loop;
    end loop;
  end if;

  perform logistica.inv_anotar(case when antes is null then 'alta' else 'edicion' end, 'ventas', v_id, coalesce(v_bod, b), antes,
    (select to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
     from logistica.inv_ventas v where v.id = v_id), p_motivo);
  return jsonb_build_object('id', v_id, 'remision', v_rem);
end $function$;

-- Lo que hay en espera se reparte primero a clientes y luego a showroom (cada grupo por fecha)
do $$
declare f text := pg_get_functiondef('public.inv_ventas(text)'::regprocedure);
begin
  if position('x.tipo' in f) = 0 then
    f := replace(f, 'order by x.fecha, x.id, z.parte', 'order by (x.tipo = ''showroom''), x.fecha, x.id, z.parte');
    if position('x.tipo' in f) = 0 then raise exception 'No se pudo parchar inv_ventas'; end if;
    execute f;
  end if;
end $$;
-- La línea sabe si el vehículo es de cliente o de showroom
do $$
declare f text := pg_get_functiondef('public.inv_produccion(text)'::regprocedure);
begin
  if position('''tipo''' in f) = 0 then
    f := replace(f, '''remision'', v.remision,', '''remision'', v.remision, ''tipo'', v.tipo,');
    if position('''tipo''' in f) = 0 then raise exception 'No se pudo parchar inv_produccion'; end if;
    execute f;
  end if;
end $$;

-- ---------------------------------------------------------------- 3. Plan de armado por semana
create table if not exists logistica.inv_plan (
  id bigint generated always as identity primary key,
  bodega text not null check (bodega in ('bodega1','bodega2')),
  semana date not null,                        -- el lunes de la semana
  unidad_id bigint not null unique references logistica.inv_venta_unidades(id) on delete cascade,
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid());
alter table logistica.inv_plan enable row level security;
create index if not exists inv_plan_bodega_semana on logistica.inv_plan (bodega, semana);

-- Qué se puede armar con lo que hay: por modelo, características y color en espera, cuántos alcanzan con las piezas
-- (null si el modelo no tiene lista de piezas) y qué pieza limita
create or replace function public.inv_capacidad(p_bodega text default null) returns jsonb
 language plpgsql stable security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((
    with g as (select * from logistica.inv_espera(b) where cantidad > 0),
    nec as (select g.bodega, g.modelo_id, g.opciones, g.color_id, m.pieza_id, sum(m.cantidad) as n
            from g join logistica.inv_materiales m on m.modelo_id = g.modelo_id or m.opcion_id = any(g.opciones)
            group by 1, 2, 3, 4, 5 having sum(m.cantidad) > 0),
    disp as (select 'bodega1'::text as bodega, d.* from logistica.inv_disponibles('bodega1') d
             union all select 'bodega2', d.* from logistica.inv_disponibles('bodega2') d),
    alc as (select nec.*, floor(greatest(coalesce(disp.disponibles, 0), 0) / nec.n)::int as puede, pz.nombre,
              row_number() over (partition by nec.bodega, nec.modelo_id, nec.opciones, nec.color_id
                                 order by floor(greatest(coalesce(disp.disponibles, 0), 0) / nec.n), pz.nombre) as rn
            from nec left join disp on disp.bodega = nec.bodega and disp.pieza_id = nec.pieza_id
            join logistica.inv_piezas pz on pz.id = nec.pieza_id)
    select jsonb_agg(jsonb_build_object('bodega', g.bodega, 'modelo_id', g.modelo_id, 'opciones', to_jsonb(g.opciones), 'color_id', g.color_id,
      'en_espera', g.cantidad, 'alcanzan', a.puede, 'limita', a.nombre) order by g.bodega, g.modelo_id, g.color_id)
    from g left join alc a on a.bodega = g.bodega and a.modelo_id = g.modelo_id and a.opciones = g.opciones and a.color_id = g.color_id and a.rn = 1), '[]');
end $function$;

-- El plan de una semana: lo planeado para esa semana y, si es la semana actual, lo de semanas pasadas que no se armó
create or replace function public.inv_plan(p_bodega text default null, p_semana date default null) returns jsonb
 language plpgsql stable security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
  s date := date_trunc('week', coalesce(p_semana, current_date))::date; hoy date := date_trunc('week', current_date)::date;
begin
  return jsonb_build_object('semana', s, 'actual', hoy, 'items', coalesce((
    select jsonb_agg(t order by (t->>'armado')::boolean, t->>'semana', t->>'fecha', (t->>'id')::bigint, (t->>'parte')::int) from (
      select jsonb_build_object('plan_id', pl.id, 'semana', pl.semana, 'unidad_id', un.id, 'id', v.id, 'tipo', v.tipo, 'remision', v.remision,
        'fecha', v.fecha, 'vendedor', v.vendedor, 'destino', v.destino, 'bodega', pl.bodega,
        'parte', un.parte, 'partes', (select count(*) from logistica.inv_venta_unidades z where z.venta_id = v.id),
        'modelo_id', un.modelo_id, 'opciones', to_jsonb(un.opciones), 'color_id', un.color_id, 'especial', un.especial, 'especial_que', un.especial_que,
        'vehiculo', case when h.id is null then null else jsonb_build_object('id', h.id, 'serie', h.serie, 'etapa', h.etapa) end,
        'armado', h.id is not null and h.etapa <> 'armado') as t
      from logistica.inv_plan pl
      join logistica.inv_venta_unidades un on un.id = pl.unidad_id
      join logistica.inv_ventas v on v.id = un.venta_id and v.estado = 'activa'
      left join logistica.inv_vehiculos h on h.unidad_id = un.id
      where (b is null or pl.bodega = b)
        and (pl.semana = s or (s = hoy and pl.semana < s and (h.id is null or h.etapa = 'armado')))) q), '[]'));
end $function$;

create or replace function public.inv_plan_poner(p_unidad bigint, p_semana date) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v logistica.inv_ventas; s date := date_trunc('week', p_semana)::date;
begin
  select v2.* into v from logistica.inv_venta_unidades un join logistica.inv_ventas v2 on v2.id = un.venta_id where un.id = p_unidad and v2.estado = 'activa';
  if v.id is null or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa orden no existe'; end if;
  perform logistica.inv_bodega_escribe(u, v.bodega);
  if s < date_trunc('week', current_date)::date then raise exception 'No se puede planear en una semana que ya pasó'; end if;
  if exists (select 1 from logistica.inv_vehiculos h where h.unidad_id = p_unidad and h.etapa <> 'armado') then raise exception 'Ese vehículo ya se armó'; end if;
  insert into logistica.inv_plan (bodega, semana, unidad_id) values (v.bodega, s, p_unidad)
  on conflict (unidad_id) do update set semana = excluded.semana;
  return jsonb_build_object('unidad_id', p_unidad, 'semana', s);
end $function$;

create or replace function public.inv_plan_quitar(p_unidad bigint) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); pl logistica.inv_plan;
begin
  select * into pl from logistica.inv_plan where unidad_id = p_unidad;
  if pl.id is null or (u.rol = 'bodega' and pl.bodega <> u.bodega) then raise exception 'Ese vehículo no está en el plan'; end if;
  perform logistica.inv_bodega_escribe(u, pl.bodega);
  delete from logistica.inv_plan where id = pl.id;
  return jsonb_build_object('unidad_id', p_unidad);
end $function$;

revoke all on function public.inv_capacidad(text), public.inv_plan(text, date), public.inv_plan_poner(bigint, date), public.inv_plan_quitar(bigint) from public, anon;
grant execute on function public.inv_capacidad(text), public.inv_plan(text, date), public.inv_plan_poner(bigint, date), public.inv_plan_quitar(bigint) to authenticated;
