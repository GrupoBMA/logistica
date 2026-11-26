-- 26-nov-2026 (pedido del usuario, para importar el Drive):
-- 1) Sucursal de venta en las órdenes de cliente (claves de Administración: AGS, GDL, MAZ, MLM, PUE, QRO, TEP, ZAP, NAU, LPZ, TIJ).
--    La remisión se muestra "ZAP-153" y solo no se puede repetir la misma sucursal con el mismo número.
-- 2) Producción separada del inventario por ahora: entrar a producción no descuenta piezas ni pide vehículo en espera,
--    y la Reparación tampoco descuenta piezas. Cada vehículo de una orden está "Por armar" salvo que se marque
--    "Esperando piezas" (inv_venta_unidades.esperando; inv_unidad_esperando).
-- 3) Faltante (texto) y el texto original del Drive en cada vehículo de la orden; "pendiente de mecánica y activación"
--    en los vehículos importados que ya pasaron de Revisión (inv_vehiculos.mecanica_pendiente; inv_vehiculo_mecanica).

-- ---------------------------------------------------------------- Columnas
alter table logistica.inv_ventas add column if not exists sucursal text;
alter table logistica.inv_ventas drop constraint if exists inv_ventas_sucursal_check;
alter table logistica.inv_ventas add constraint inv_ventas_sucursal_check
  check (sucursal is null or sucursal in ('AGS','GDL','MAZ','MLM','PUE','QRO','TEP','ZAP','NAU','LPZ','TIJ'));
drop index if exists logistica.inv_ventas_remision;
create unique index inv_ventas_remision on logistica.inv_ventas (coalesce(sucursal, ''), upper(btrim(remision))) where estado <> 'anulada';
alter table logistica.inv_venta_unidades add column if not exists esperando boolean not null default false;
alter table logistica.inv_venta_unidades add column if not exists faltante text;
alter table logistica.inv_venta_unidades add column if not exists origen text;
alter table logistica.inv_vehiculos add column if not exists mecanica_pendiente boolean not null default false;
alter table logistica.inv_vehiculos add column if not exists importado boolean not null default false;
alter table logistica.inv_vehiculo_etapas drop constraint if exists inv_vehiculo_etapas_accion_check;
alter table logistica.inv_vehiculo_etapas add constraint inv_vehiculo_etapas_accion_check
  check (accion in ('entro','no_paso','faltantes','faltantes_listos','regreso','mecanica','importado'));

-- ---------------------------------------------------------------- Órdenes con sucursal
create or replace function public.inv_venta_guardar(p jsonb, p_motivo text default null) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p->>'id')::bigint; b text; antes jsonb; x jsonb; i int; n int := 0;
  v_rem text := btrim(coalesce(p->>'remision','')); v_ops bigint[]; v_adit bigint[]; v_nota text; v_que text; v_bod text; v_tipo text;
  v_cp text := nullif(regexp_replace(coalesce(p->>'cp',''), '\s', '', 'g'), ''); v_suc text := nullif(btrim(coalesce(p->>'sucursal','')), '');
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_id is not null then select tipo, remision into v_tipo, v_rem from logistica.inv_ventas where id = v_id and estado = 'activa'
    ; if v_tipo = 'cliente' then v_rem := btrim(coalesce(p->>'remision','')); end if;
  else v_tipo := coalesce(nullif(p->>'tipo',''), 'cliente'); end if;
  if v_tipo is null or v_tipo not in ('cliente','showroom') then raise exception 'Escoge para quién es la orden'; end if;
  if (p->>'fecha') is null then raise exception 'Escribe la fecha'; end if;
  if v_tipo = 'cliente' then
    if v_suc is null then raise exception 'Escoge la sucursal de venta'; end if;
    if v_rem = '' then raise exception 'Escribe la remisión'; end if;
    if nullif(btrim(coalesce(p->>'vendedor','')), '') is null then raise exception 'Escribe el vendedor'; end if;
    if nullif(btrim(coalesce(p->>'destino','')), '') is null then raise exception 'Escribe el destino'; end if;
    if v_cp is not null and v_cp !~ '^[0-9]{5}$' then raise exception 'El código postal lleva 5 números'; end if;
    if exists (select 1 from logistica.inv_ventas where upper(btrim(remision)) = upper(v_rem) and coalesce(sucursal, '') = v_suc
               and estado <> 'anulada' and id is distinct from v_id) then
      raise exception 'Esa remisión ya está registrada en esa sucursal';
    end if;
  else v_suc := null;
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
    insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino, cp, tipo, sucursal)
    values (b, v_rem, (p->>'fecha')::date,
      case when v_tipo = 'cliente' then btrim(p->>'vendedor') end, case when v_tipo = 'cliente' then btrim(p->>'destino') end,
      case when v_tipo = 'cliente' then nullif(p->>'tipo_destino','') end, case when v_tipo = 'cliente' then v_cp end, v_tipo, v_suc)
    returning id into v_id;
  else
    select v.bodega, to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
      into v_bod, antes from logistica.inv_ventas v where v.id = v_id and v.estado = 'activa';
    if antes is null or (u.rol = 'bodega' and v_bod <> u.bodega) then raise exception 'Esa orden no existe'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    update logistica.inv_ventas set remision = v_rem, fecha = (p->>'fecha')::date, sucursal = v_suc,
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
        insert into logistica.inv_venta_unidades (venta_id, parte, modelo_id, opciones, color_id, especial, especial_que, aditamentos, nota, esperando)
        values (v_id, n, (x->>'modelo_id')::bigint, v_ops, (x->>'color_id')::bigint, cardinality(v_adit) > 0, v_que, v_adit, v_nota,
          coalesce((x->>'esperando')::boolean, false));
      end loop;
    end loop;
  end if;

  perform logistica.inv_anotar(case when antes is null then 'alta' else 'edicion' end, 'ventas', v_id, coalesce(v_bod, b), antes,
    (select to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
     from logistica.inv_ventas v where v.id = v_id), p_motivo);
  return jsonb_build_object('id', v_id, 'remision', v_rem);
end $function$;

-- ---------------------------------------------------------------- Estado de cada vehículo: Por armar salvo que esté marcado Esperando piezas
create or replace function public.inv_ventas(p_bodega text default null) returns jsonb
 language plpgsql stable security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(t order by t->>'fecha', (t->>'id')::bigint, (t->>'parte')::int) from (
    select to_jsonb(v) || jsonb_build_object(
      'unidad_id', un.id, 'parte', un.parte, 'partes', (select count(*) from logistica.inv_venta_unidades z where z.venta_id = v.id),
      'modelo_id', un.modelo_id, 'opciones', to_jsonb(un.opciones), 'color_id', un.color_id, 'especial', un.especial, 'especial_que', un.especial_que,
      'aditamentos', to_jsonb(un.aditamentos), 'nota', un.nota, 'esperando', un.esperando, 'faltante', un.faltante, 'origen', un.origen,
      'estado_venta', case
        when h.id is not null then case when h.faltantes then 'faltantes' when h.no_paso then 'no_paso' when h.etapa = 'listo' then 'lista' else 'produccion' end
        when un.esperando then 'esperando' else 'por_armar' end,
      'vehiculo', case when h.id is null then null else jsonb_build_object('id', h.id, 'serie', h.serie, 'etapa', h.etapa, 'faltantes', h.faltantes,
        'no_paso', h.no_paso, 'mecanica_pendiente', h.mecanica_pendiente) end) t
    from logistica.inv_ventas v
    join logistica.inv_venta_unidades un on un.venta_id = v.id
    left join logistica.inv_vehiculos h on h.unidad_id = un.id
    where v.estado = 'activa' and (b is null or v.bodega = b)) q), '[]');
end $function$;

create or replace function public.inv_unidad_esperando(p_unidad bigint, p_valor boolean) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v logistica.inv_ventas;
begin
  select v2.* into v from logistica.inv_venta_unidades un join logistica.inv_ventas v2 on v2.id = un.venta_id where un.id = p_unidad and v2.estado = 'activa';
  if v.id is null or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa orden no existe'; end if;
  perform logistica.inv_bodega_escribe(u, v.bodega);
  if exists (select 1 from logistica.inv_vehiculos where unidad_id = p_unidad) then raise exception 'Ese vehículo ya está en producción'; end if;
  update logistica.inv_venta_unidades set esperando = coalesce(p_valor, false) where id = p_unidad;
  perform logistica.inv_anotar('edicion', 'ventas', v.id, v.bodega, null, jsonb_build_object('unidad_id', p_unidad, 'esperando', p_valor),
    case when p_valor then 'Esperando piezas' else 'Ya llegaron las piezas' end);
  return jsonb_build_object('unidad_id', p_unidad, 'esperando', p_valor);
end $function$;

-- ---------------------------------------------------------------- Producción sin inventario
create or replace function public.inv_produccion_entrar(p jsonb) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); un logistica.inv_venta_unidades; v logistica.inv_ventas; v_id bigint;
  v_serie text := nullif(btrim(coalesce(p->>'serie','')), '');
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  if (p->>'unidad_id') is null then raise exception 'Escoge la orden'; end if;
  select * into un from logistica.inv_venta_unidades where id = (p->>'unidad_id')::bigint;
  select * into v from logistica.inv_ventas where id = un.venta_id and estado = 'activa';
  if v.id is null or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa orden no existe'; end if;
  if exists (select 1 from logistica.inv_vehiculos where unidad_id = un.id) then raise exception 'Ese vehículo ya está en producción'; end if;
  if un.esperando then raise exception 'Ese vehículo está esperando piezas: cuando lleguen, quítale la marca'; end if;
  if v_serie is not null and exists (select 1 from logistica.inv_vehiculos where upper(btrim(serie)) = upper(v_serie)) then
    raise exception 'Ese número de serie ya está registrado';
  end if;
  -- Por ahora la producción va separada del inventario (pedido del usuario, 26-nov-2026): no se descuentan piezas
  insert into logistica.inv_vehiculos (bodega, serie, modelo_id, opciones, color_id, para, venta_id, unidad_id, especial)
  values (v.bodega, v_serie, un.modelo_id, un.opciones, un.color_id, case when v.tipo = 'showroom' then 'showroom' else 'venta' end, v.id, un.id, un.especial)
  returning id into v_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (v_id, 'armado', 'entro');
  perform logistica.inv_anotar('alta', 'vehiculos', v_id, v.bodega, null, (select to_jsonb(x) from logistica.inv_vehiculos x where x.id = v_id), null);
  return jsonb_build_object('id', v_id, 'faltan_en_inventario', '[]'::jsonb);
end $function$;

do $$
declare f text := pg_get_functiondef('public.inv_vehiculo_avanzar(bigint,jsonb)'::regprocedure);
begin
  f := replace(f, '    insert into logistica.inv_consumos (bodega, vehiculo_id, pieza_id, cantidad, motivo)
    select h.bodega, h.id, d.pieza_id, sum(d.cantidad), ''faltante''
    from logistica.inv_vehiculo_defectos d join logistica.inv_defectos t on t.id = d.defecto_id
    where d.vehiculo_id = p_id and not d.resuelto and t.nombre ilike ''faltante%'' and d.pieza_id is not null
    group by d.pieza_id;
', '');
  if position('inv_consumos' in f) > 0 then raise exception 'No se pudo quitar el descuento de piezas de la reparación'; end if;
  execute f;
end $$;

create or replace function public.inv_vehiculo_mecanica(p_id bigint) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  update logistica.inv_vehiculos set mecanica_pendiente = false where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, h.etapa, 'mecanica');
  return jsonb_build_object('id', p_id);
end $function$;

-- La sucursal también en la línea y en el plan
do $$
declare f text;
begin
  f := pg_get_functiondef('public.inv_produccion(text)'::regprocedure);
  if position('''sucursal''' in f) = 0 then
    f := replace(f, '''tipo'', v.tipo,', '''tipo'', v.tipo, ''sucursal'', v.sucursal,'); execute f;
  end if;
  f := pg_get_functiondef('public.inv_plan(text,date)'::regprocedure);
  if position('''sucursal''' in f) = 0 then
    f := replace(f, '''tipo'', v.tipo, ''remision'', v.remision,', '''tipo'', v.tipo, ''sucursal'', v.sucursal, ''remision'', v.remision,'); execute f;
  end if;
end $$;

revoke all on function public.inv_unidad_esperando(bigint, boolean), public.inv_vehiculo_mecanica(bigint) from public, anon;
grant execute on function public.inv_unidad_esperando(bigint, boolean), public.inv_vehiculo_mecanica(bigint) to authenticated;
