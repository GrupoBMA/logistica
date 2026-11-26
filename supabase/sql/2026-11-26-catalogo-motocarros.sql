-- 26-nov-2026 (pedido del usuario, después de revisar sunldemexico.com y el Drive):
-- 1) Se borra todo lo capturado de prueba (contenedores, órdenes, vehículos, consumos, plan y bitácora).
--    Se quedan los catálogos y la lista de piezas del MC 150.
-- 2) Catálogo nuevo de motocarros:
--    Modelos: MC 150, MC 200, MC 300, MC 350 (doble eje, 9 llantas), Mototaxi 125, Mototaxi 200, Mototaxi eléctrico.
--    De fábrica (vienen así en el contenedor; uno por renglón, obligatorio):
--      Cabina: Sin cabina · Con cabina · Plus (150 y 200) · Cabina cerrada (300)
--      Atrás: Pick up · En chasis (150, 200, 300, 350)
--      Hidráulico: Sí · No (300)
--      Tipo: Normal · Mini · Dongyan · Angela (Mototaxi 200; Angela se va a descontinuar)
--    El rodado ya no se pregunta: el 300 de cabina cerrada no es doble rodado y el de con/sin cabina sí. El 150 siempre es
--    asiento corrido. El 350 siempre es doble eje. "Reforzado" se ignora.
--    Aditamentos (se ponen en la bodega; opcionales; si lleva alguno, el vehículo es especial y pasa por Herrería y Forrado):
--      Caja: Caja seca 2 puertas · Caja seca 3 puertas · Caja venta · Food truck (200 y 300) · Garrafonero 18/30/36/48/70 · Pipa 1000 L (300)
--      Toldo: Toldo · Toldo corto (todos)
--      Cachucha: Cachucha (150, 200, 300, 350)
-- 3) Lo que se contradice (inv_incompatibles): la cachucha no va con cabina (con cabina, plus ni cerrada);
--    el hidráulico no va en chasis ni con cabina cerrada; la pipa no va con cabina cerrada.
--    La app no deja escoger opciones que se contradicen y Supabase lo vuelve a revisar (inv_validar_vehiculo).
-- 4) Cada vehículo de una orden guarda sus aditamentos (inv_venta_unidades.aditamentos) y una nota opcional.
--    especial = lleva algún aditamento; especial_que = los aditamentos y la nota (así lo siguen mostrando las pantallas).

-- ---------------------------------------------------------------- 1. Borrar lo de prueba
delete from logistica.inv_plan;
delete from logistica.inv_consumos;
delete from logistica.inv_vehiculo_defectos;
delete from logistica.inv_vehiculo_etapas;
delete from logistica.inv_vehiculos;
delete from logistica.inv_venta_unidades;
delete from logistica.inv_ventas;
delete from logistica.inv_revision_defectos;
delete from logistica.inv_revision_piezas;
delete from logistica.inv_renglon_colores;
delete from logistica.inv_renglones;
delete from logistica.inv_anulaciones;
delete from logistica.inv_contenedores;
delete from logistica.inv_bitacora;
select setval('logistica.inv_showroom_folio', 1, false);

-- ---------------------------------------------------------------- 2. Catálogo
alter table logistica.inv_caracteristicas add column if not exists aditamento boolean not null default false;
alter table logistica.inv_caracteristicas add column if not exists solo_opcion boolean not null default false;  -- el nombre muestra solo la opción
create table if not exists logistica.inv_incompatibles (
  opcion_a bigint not null references logistica.inv_opciones(id) on delete cascade,
  opcion_b bigint not null references logistica.inv_opciones(id) on delete cascade,
  primary key (opcion_a, opcion_b), check (opcion_a < opcion_b));
alter table logistica.inv_incompatibles enable row level security;
alter table logistica.inv_venta_unidades add column if not exists aditamentos bigint[] not null default '{}';
alter table logistica.inv_venta_unidades add column if not exists nota text;

delete from logistica.inv_modelo_opciones;
delete from logistica.inv_materiales where opcion_id is not null;
delete from logistica.inv_opciones;
delete from logistica.inv_caracteristicas;

create function pg_temp.op(c bigint, n text, o int) returns bigint language sql as
$$ insert into logistica.inv_opciones (caracteristica_id, nombre, orden) values (c, n, o) returning id $$;
create function pg_temp.en(ms bigint[], o bigint) returns void language sql as
$$ insert into logistica.inv_modelo_opciones (modelo_id, opcion_id) select unnest(ms), o $$;
create function pg_temp.choca(a bigint, b bigint) returns void language sql as
$$ insert into logistica.inv_incompatibles (opcion_a, opcion_b) values (least(a, b), greatest(a, b)) on conflict do nothing $$;

do $$
declare m150 bigint; m200 bigint; m300 bigint; m350 bigint; t125 bigint; t200 bigint; tel bigint;
  cCab bigint; cAtr bigint; cHid bigint; cTip bigint; cCaja bigint; cTol bigint; cCach bigint;
  oSin bigint; oCon bigint; oPlus bigint; oCerr bigint; oPick bigint; oChas bigint; oHidSi bigint; oHidNo bigint;
  oPipa bigint; oCach bigint; x bigint; mc bigint[];
begin
  select id into m150 from logistica.inv_modelos where nombre = 'MC 150';
  select id into m200 from logistica.inv_modelos where nombre = 'MC 200';
  select id into m300 from logistica.inv_modelos where nombre = 'MC 300';
  insert into logistica.inv_modelos (nombre, orden) values ('MC 350', 4) returning id into m350;
  insert into logistica.inv_modelos (nombre, orden) values ('Mototaxi 125', 5) returning id into t125;
  insert into logistica.inv_modelos (nombre, orden) values ('Mototaxi 200', 6) returning id into t200;
  insert into logistica.inv_modelos (nombre, orden) values ('Mototaxi eléctrico', 7) returning id into tel;
  mc := array[m150, m200, m300, m350];

  -- De fábrica
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion) values ('Cabina', 1, true) returning id into cCab;
  oSin := pg_temp.op(cCab, 'Sin cabina', 1); perform pg_temp.en(mc || t200, oSin);
  oCon := pg_temp.op(cCab, 'Con cabina', 2); perform pg_temp.en(mc || t200, oCon);
  oPlus := pg_temp.op(cCab, 'Plus', 3); perform pg_temp.en(array[m150, m200], oPlus);
  oCerr := pg_temp.op(cCab, 'Cabina cerrada', 4); perform pg_temp.en(array[m300], oCerr);
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion) values ('Atrás', 2, true) returning id into cAtr;
  oPick := pg_temp.op(cAtr, 'Pick up', 1); perform pg_temp.en(mc, oPick);
  oChas := pg_temp.op(cAtr, 'En chasis', 2); perform pg_temp.en(mc, oChas);
  insert into logistica.inv_caracteristicas (nombre, orden) values ('Hidráulico', 3) returning id into cHid;
  oHidSi := pg_temp.op(cHid, 'Sí', 1); perform pg_temp.en(array[m300], oHidSi);
  oHidNo := pg_temp.op(cHid, 'No', 2); perform pg_temp.en(array[m300], oHidNo);
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion) values ('Tipo', 4, true) returning id into cTip;
  perform pg_temp.en(array[t200], pg_temp.op(cTip, 'Normal', 1));
  perform pg_temp.en(array[t200], pg_temp.op(cTip, 'Mini', 2));
  perform pg_temp.en(array[t200], pg_temp.op(cTip, 'Dongyan', 3));
  perform pg_temp.en(array[t200], pg_temp.op(cTip, 'Angela', 4));

  -- Aditamentos
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion, aditamento) values ('Caja', 5, true, true) returning id into cCaja;
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Caja seca 2 puertas', 1));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Caja seca 3 puertas', 2));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Caja venta', 3));
  perform pg_temp.en(array[m200, m300], pg_temp.op(cCaja, 'Food truck', 4));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Garrafonero 18', 5));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Garrafonero 30', 6));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Garrafonero 36', 7));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Garrafonero 48', 8));
  perform pg_temp.en(mc, pg_temp.op(cCaja, 'Garrafonero 70', 9));
  oPipa := pg_temp.op(cCaja, 'Pipa 1000 L', 10); perform pg_temp.en(array[m300], oPipa);
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion, aditamento) values ('Toldo', 6, true, true) returning id into cTol;
  perform pg_temp.en(mc || array[t125, t200, tel], pg_temp.op(cTol, 'Toldo', 1));
  perform pg_temp.en(mc || array[t125, t200, tel], pg_temp.op(cTol, 'Toldo corto', 2));
  insert into logistica.inv_caracteristicas (nombre, orden, solo_opcion, aditamento) values ('Cachucha', 7, true, true) returning id into cCach;
  oCach := pg_temp.op(cCach, 'Cachucha', 1); perform pg_temp.en(mc, oCach);

  -- Lo que se contradice
  perform pg_temp.choca(oCach, oCon); perform pg_temp.choca(oCach, oPlus); perform pg_temp.choca(oCach, oCerr);
  perform pg_temp.choca(oHidSi, oChas); perform pg_temp.choca(oHidSi, oCerr);
  perform pg_temp.choca(oPipa, oCerr);
end $$;

-- ---------------------------------------------------------------- 3. Revisar un vehículo (modelo, de fábrica, aditamentos)
create or replace function logistica.inv_validar_vehiculo(p_modelo bigint, p_ops bigint[], p_adit bigint[], p_con_adit boolean) returns void
 language plpgsql stable set search_path to ''
as $function$
declare v_falta text; v_a text; v_b text; v_todas bigint[];
begin
  p_ops := coalesce(p_ops, '{}'); p_adit := coalesce(p_adit, '{}'); v_todas := p_ops || p_adit;
  if not exists (select 1 from logistica.inv_modelos where id = p_modelo and activo) then raise exception 'Escoge el modelo'; end if;
  if not p_con_adit and cardinality(p_adit) > 0 then raise exception 'Los aditamentos se escogen en la orden, no en el contenedor'; end if;
  if exists (select 1 from unnest(p_ops) o where not exists (select 1 from logistica.inv_modelo_opciones mo
               join logistica.inv_opciones op on op.id = mo.opcion_id join logistica.inv_caracteristicas c on c.id = op.caracteristica_id
               where mo.modelo_id = p_modelo and mo.opcion_id = o and not c.aditamento and op.activo))
     or exists (select 1 from unnest(p_adit) o where not exists (select 1 from logistica.inv_modelo_opciones mo
               join logistica.inv_opciones op on op.id = mo.opcion_id join logistica.inv_caracteristicas c on c.id = op.caracteristica_id
               where mo.modelo_id = p_modelo and mo.opcion_id = o and c.aditamento and op.activo)) then
    raise exception 'Esa combinación no existe para este modelo';
  end if;
  if cardinality(v_todas) <> (select count(distinct op.caracteristica_id) from logistica.inv_opciones op where op.id = any(v_todas)) then
    raise exception 'Escoge solo una opción en cada renglón';
  end if;
  select string_agg(c.nombre, ', ' order by c.orden) into v_falta from logistica.inv_caracteristicas c
  where not c.aditamento and c.activo
    and exists (select 1 from logistica.inv_opciones op join logistica.inv_modelo_opciones mo on mo.opcion_id = op.id
                where op.caracteristica_id = c.id and mo.modelo_id = p_modelo and op.activo)
    and not exists (select 1 from logistica.inv_opciones op where op.caracteristica_id = c.id and op.id = any(p_ops));
  if v_falta is not null then raise exception 'Falta escoger: %', v_falta; end if;
  select a.nombre, b.nombre into v_a, v_b from logistica.inv_incompatibles i
    join logistica.inv_opciones a on a.id = i.opcion_a join logistica.inv_opciones b on b.id = i.opcion_b
    where i.opcion_a = any(v_todas) and i.opcion_b = any(v_todas) limit 1;
  if v_a is not null then raise exception '% y % no van juntos', v_a, v_b; end if;
end $function$;

-- Catálogo: también regresa lo que se contradice
create or replace function public.inv_catalogo() returns jsonb
 language plpgsql stable security definer set search_path to ''
as $function$
begin
  perform logistica.inv_yo();
  return jsonb_build_object(
    'modelos', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_modelos x), '[]'),
    'caracteristicas', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('opciones',
        coalesce((select jsonb_agg(to_jsonb(o) order by o.orden, o.nombre) from logistica.inv_opciones o where o.caracteristica_id = c.id), '[]'))
        order by c.orden, c.nombre) from logistica.inv_caracteristicas c), '[]'),
    'modelo_opciones', coalesce((select jsonb_agg(to_jsonb(x)) from logistica.inv_modelo_opciones x), '[]'),
    'incompatibles', coalesce((select jsonb_agg(jsonb_build_array(x.opcion_a, x.opcion_b)) from logistica.inv_incompatibles x), '[]'),
    'colores', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_colores x), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden, x.nombre) from logistica.inv_defectos x), '[]'),
    'gravedades', '["leve","media","grave"]'::jsonb,
    'piezas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from logistica.inv_piezas x), '[]'),
    'materiales', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from logistica.inv_materiales x), '[]'));
end $function$;

-- Contenedor: solo lo de fábrica, sin contradicciones
create or replace function public.inv_contenedor_guardar(p jsonb, p_motivo text default null) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare
  u logistica.usuarios := logistica.inv_yo();
  b text; v_id bigint := (p->>'id')::bigint; c logistica.inv_contenedores;
  v_numero text := nullif(btrim(p->>'numero'), ''); v_llegada date := nullif(p->>'llegada','')::date;
  x jsonb; v_ops bigint[]; v_cols bigint[]; antes jsonb; nuevos jsonb; viejos jsonb;
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_numero is null then raise exception 'Escribe el número de contenedor'; end if;
  if v_llegada is null then raise exception 'Escribe la fecha de llegada'; end if;
  if jsonb_typeof(p->'renglones') is distinct from 'array' or jsonb_array_length(p->'renglones') = 0 then raise exception 'Agrega al menos un vehículo'; end if;
  if exists (select 1 from logistica.inv_contenedores o where upper(btrim(o.numero)) = upper(v_numero)
             and o.estado <> 'anulado' and o.id is distinct from v_id) then
    raise exception 'Ese contenedor ya está registrado';
  end if;
  for x in select * from jsonb_array_elements(p->'renglones') loop
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    v_cols := array(select (e)::bigint from jsonb_array_elements_text(coalesce(x->'colores','[]')) e);
    if cardinality(v_cols) = 0 then raise exception 'Escoge al menos un color'; end if;
    if (select count(distinct k.id) from logistica.inv_colores k where k.id = any(v_cols) and k.activo) <> cardinality(v_cols) then
      raise exception 'Escoge los colores otra vez';
    end if;
    v_ops := array(select (e)::bigint from jsonb_array_elements_text(coalesce(x->'opciones','[]')) e);
    perform logistica.inv_validar_vehiculo((x->>'modelo_id')::bigint, v_ops, '{}', false);
  end loop;
  nuevos := (select jsonb_agg(jsonb_build_object('modelo_id', (x2->>'modelo_id')::bigint,
              'opciones', (select coalesce(jsonb_agg(e::bigint order by e::bigint), '[]') from jsonb_array_elements_text(coalesce(x2->'opciones','[]')) e),
              'colores', (select coalesce(jsonb_agg(e::bigint order by e::bigint), '[]') from jsonb_array_elements_text(coalesce(x2->'colores','[]')) e),
              'cantidad', (x2->>'cantidad')::int))
             from jsonb_array_elements(p->'renglones') x2);

  if v_id is null then
    insert into logistica.inv_contenedores (bodega, numero, llegada, observaciones, creado_por)
    values (b, v_numero, v_llegada, nullif(btrim(p->>'observaciones'),''), (select auth.uid())) returning id into v_id;
    insert into logistica.inv_renglones (contenedor_id, modelo_id, opciones, colores, cantidad)
    select v_id, (n->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(n->'opciones') e),
      array(select e::bigint from jsonb_array_elements_text(n->'colores') e), (n->>'cantidad')::int
    from jsonb_array_elements(nuevos) n;
    perform logistica.inv_anotar('alta', 'contenedores', v_id, b, null, logistica.inv_foto(v_id), null);
  else
    c := logistica.inv_contenedor_de(u, v_id);
    if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    antes := logistica.inv_foto(v_id);
    viejos := (select jsonb_agg(jsonb_build_object('modelo_id', r.modelo_id, 'opciones', to_jsonb(r.opciones), 'colores', to_jsonb(r.colores), 'cantidad', r.cantidad))
               from logistica.inv_renglones r where r.contenedor_id = v_id);
    update logistica.inv_contenedores set numero = v_numero, llegada = v_llegada, observaciones = nullif(btrim(p->>'observaciones'),'')
      where id = v_id;
    if (select jsonb_agg(e order by e::text) from jsonb_array_elements(coalesce(viejos,'[]')) e)
       is distinct from (select jsonb_agg(e order by e::text) from jsonb_array_elements(nuevos) e) then
      delete from logistica.inv_renglones where contenedor_id = v_id;
      insert into logistica.inv_renglones (contenedor_id, modelo_id, opciones, colores, cantidad)
      select v_id, (n->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(n->'opciones') e),
        array(select e::bigint from jsonb_array_elements_text(n->'colores') e), (n->>'cantidad')::int
      from jsonb_array_elements(nuevos) n;
      update logistica.inv_contenedores set estado = 'recibido', revisado = null, revisado_por = null where id = v_id;
    end if;
    perform logistica.inv_anotar('edicion', 'contenedores', v_id, c.bodega, antes, logistica.inv_foto(v_id), p_motivo);
  end if;
  return jsonb_build_object('id', v_id);
end $function$;

-- Orden: cada vehículo con lo de fábrica, sus aditamentos y una nota; especial = lleva algún aditamento
create or replace function public.inv_venta_guardar(p jsonb, p_motivo text default null) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p->>'id')::bigint; b text; antes jsonb; x jsonb; i int; n int := 0;
  v_rem text := btrim(coalesce(p->>'remision','')); v_ops bigint[]; v_adit bigint[]; v_nota text; v_que text; v_bod text; v_tipo text;
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
    if not exists (select 1 from logistica.inv_colores where id = (x->>'color_id')::bigint) then raise exception 'Escoge el color'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    perform logistica.inv_validar_vehiculo((x->>'modelo_id')::bigint,
      array(select e::bigint from jsonb_array_elements_text(coalesce(x->'opciones','[]')) e),
      array(select e::bigint from jsonb_array_elements_text(coalesce(x->'aditamentos','[]')) e), true);
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
      v_ops := coalesce(v_ops, '{}');
      select coalesce(array_agg(y::bigint order by y::bigint), '{}') into v_adit from jsonb_array_elements_text(coalesce(x->'aditamentos','[]')) y;
      v_nota := nullif(btrim(coalesce(x->>'nota','')), '');
      select nullif(concat_ws(' · ', string_agg(o.nombre, ' · ' order by c.orden), v_nota), '') into v_que
        from logistica.inv_opciones o join logistica.inv_caracteristicas c on c.id = o.caracteristica_id where o.id = any(v_adit);
      for i in 1 .. (x->>'cantidad')::int loop
        n := n + 1;
        insert into logistica.inv_venta_unidades (venta_id, parte, modelo_id, opciones, color_id, especial, especial_que, aditamentos, nota)
        values (v_id, n, (x->>'modelo_id')::bigint, v_ops, (x->>'color_id')::bigint, cardinality(v_adit) > 0, v_que, v_adit, v_nota);
      end loop;
    end loop;
  end if;

  perform logistica.inv_anotar(case when antes is null then 'alta' else 'edicion' end, 'ventas', v_id, coalesce(v_bod, b), antes,
    (select to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
     from logistica.inv_ventas v where v.id = v_id), p_motivo);
  return jsonb_build_object('id', v_id, 'remision', v_rem);
end $function$;

-- Las órdenes regresan los aditamentos y la nota de cada vehículo
do $$
declare f text := pg_get_functiondef('public.inv_ventas(text)'::regprocedure);
begin
  if position('''aditamentos''' in f) = 0 then
    f := replace(f, '''especial_que'', un.especial_que,', '''especial_que'', un.especial_que, ''aditamentos'', to_jsonb(un.aditamentos), ''nota'', un.nota,');
    if position('''aditamentos''' in f) = 0 then raise exception 'No se pudo parchar inv_ventas'; end if;
    execute f;
  end if;
end $$;

-- El aviso de lo que se contradice dice "Hidráulico" en vez de "Sí" (aplicado aparte como inv_validar_vehiculo_nombres)
do $$
declare f text := pg_get_functiondef('logistica.inv_validar_vehiculo(bigint,bigint[],bigint[],boolean)'::regprocedure);
begin
  f := replace(f, 'select a.nombre, b.nombre into v_a, v_b from logistica.inv_incompatibles i
    join logistica.inv_opciones a on a.id = i.opcion_a join logistica.inv_opciones b on b.id = i.opcion_b',
  'select case when a.nombre = ''Sí'' then ca.nombre when a.nombre = ''No'' then ''Sin '' || lower(ca.nombre) else a.nombre end,
         case when b.nombre = ''Sí'' then cb.nombre when b.nombre = ''No'' then ''Sin '' || lower(cb.nombre) else b.nombre end
    into v_a, v_b from logistica.inv_incompatibles i
    join logistica.inv_opciones a on a.id = i.opcion_a join logistica.inv_opciones b on b.id = i.opcion_b
    join logistica.inv_caracteristicas ca on ca.id = a.caracteristica_id join logistica.inv_caracteristicas cb on cb.id = b.caracteristica_id');
  if position('ca.nombre' in f) = 0 then raise exception 'No se pudo parchar inv_validar_vehiculo'; end if;
  execute f;
end $$;
