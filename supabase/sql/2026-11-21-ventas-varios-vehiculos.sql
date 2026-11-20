-- Anotaciones del usuario (21-nov-2026) después de probar el recorrido:
--  3) una venta puede llevar varios vehículos y de varios colores  → inv_venta_unidades (una fila por vehículo, "parte" 1, 2, 3…)
--  4) Mecánica siempre es antepenúltima: Armado → Revisión 1 → (Herrería → Forrado, especiales) → Mecánica → Detallado y pintura → Revisión final
--  8) un faltante de pieza no tiene grado (gravedad opcional); en la Revisión 1 se dice qué pieza falta
--  9) se puede regresar un paso (por si le picaron por error)
-- 10) el que no pasa la revisión final queda marcado (inv_vehiculos.no_paso) hasta que pase

-- ---------------------------------------------------------------- 1. Vehículos de cada venta
create table logistica.inv_venta_unidades (
  id bigint generated always as identity primary key,
  venta_id bigint not null references logistica.inv_ventas(id) on delete cascade,
  parte int not null,
  modelo_id bigint not null references logistica.inv_modelos(id),
  opciones bigint[] not null default '{}',
  color_id bigint not null references logistica.inv_colores(id),
  especial boolean not null default false,
  especial_que text,
  unique (venta_id, parte));
alter table logistica.inv_venta_unidades enable row level security;
revoke all on logistica.inv_venta_unidades from anon, authenticated;

insert into logistica.inv_venta_unidades (venta_id, parte, modelo_id, opciones, color_id, especial, especial_que)
select id, 1, modelo_id, opciones, color_id, especial, especial_que from logistica.inv_ventas;

alter table logistica.inv_vehiculos add column unidad_id bigint unique references logistica.inv_venta_unidades(id);
update logistica.inv_vehiculos h set unidad_id = u.id from logistica.inv_venta_unidades u where u.venta_id = h.venta_id;
alter table logistica.inv_vehiculos drop constraint inv_vehiculos_venta_id_key;
alter table logistica.inv_vehiculos drop constraint inv_vehiculos_check;
alter table logistica.inv_vehiculos add constraint inv_vehiculos_para_unidad check ((para = 'venta') = (unidad_id is not null));
alter table logistica.inv_ventas drop column modelo_id, drop column opciones, drop column color_id, drop column especial, drop column especial_que;

-- ---------------------------------------------------------------- 2. No pasó, faltantes por pieza, gravedad opcional, regreso
alter table logistica.inv_vehiculos add column no_paso boolean not null default false;
alter table logistica.inv_vehiculo_defectos add column pieza_id bigint references logistica.inv_piezas(id);
alter table logistica.inv_vehiculo_defectos alter column gravedad drop not null;
alter table logistica.inv_revision_defectos alter column gravedad drop not null;
alter table logistica.inv_vehiculo_etapas drop constraint inv_vehiculo_etapas_accion_check;
alter table logistica.inv_vehiculo_etapas add constraint inv_vehiculo_etapas_accion_check
  check (accion in ('entro','no_paso','faltantes','faltantes_listos','regreso'));

-- Daños: tipo y cantidad siempre; gravedad solo si no es un faltante
create or replace function logistica.inv_revisar_defectos(p jsonb) returns void
language plpgsql stable set search_path to '' as $$
declare x jsonb; d logistica.inv_defectos;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
    select * into d from logistica.inv_defectos where id = (x->>'defecto_id')::bigint;
    if not found then raise exception 'Escoge el tipo de daño'; end if;
    if d.nombre not ilike 'faltante%' and coalesce(x->>'gravedad','') not in ('leve','media','grave') then raise exception 'Escoge qué tan grave es el daño'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad de cada daño debe ser 1 o más'; end if;
  end loop;
end $$;
revoke all on function logistica.inv_revisar_defectos(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. Orden de etapas (Mecánica siempre antepenúltima)
create or replace function logistica.inv_siguiente(p_etapa text, p_especial boolean) returns text
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
create or replace function logistica.inv_anterior(p_etapa text, p_especial boolean) returns text
language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'revision1' then 'armado'
    when 'herreria' then 'revision1'
    when 'forrado' then 'herreria'
    when 'mecanica' then case when p_especial then 'forrado' else 'revision1' end
    when 'detallado' then 'mecanica'
    when 'revision_final' then 'detallado'
    when 'listo' then 'revision_final'
  end $$;
revoke all on function logistica.inv_siguiente(text,boolean) from public, anon, authenticated;
revoke all on function logistica.inv_anterior(text,boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. Ventas
-- p = {id?, bodega?, remision, fecha, vendedor, destino, tipo_destino,
--      vehiculos:[{modelo_id, opciones, color_id, cantidad, especial, especial_que}]}
-- Cada vehículo queda como una "parte" (1, 2, 3…). Al corregir, los vehículos solo se pueden cambiar si ninguno entró a producción.
drop function if exists public.inv_venta_guardar(jsonb, text);
create function public.inv_venta_guardar(p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); v_id bigint := (p->>'id')::bigint; b text; antes jsonb; x jsonb; i int; n int := 0;
  v_rem text := btrim(coalesce(p->>'remision','')); v_ops bigint[]; v_esp boolean; v_que text; v_bod text;
begin
  b := logistica.inv_bodega_escribe(u, p->>'bodega');
  if v_rem = '' then raise exception 'Escribe la remisión'; end if;
  if nullif(btrim(coalesce(p->>'vendedor','')), '') is null then raise exception 'Escribe el vendedor'; end if;
  if nullif(btrim(coalesce(p->>'destino','')), '') is null then raise exception 'Escribe el destino'; end if;
  if (p->>'fecha') is null then raise exception 'Escribe la fecha de compra'; end if;
  if exists (select 1 from logistica.inv_ventas where upper(btrim(remision)) = upper(v_rem) and estado <> 'anulada' and id is distinct from v_id) then
    raise exception 'Esa remisión ya está registrada';
  end if;
  if v_id is null and jsonb_array_length(coalesce(p->'vehiculos','[]')) = 0 then raise exception 'Agrega al menos un vehículo'; end if;
  for x in select * from jsonb_array_elements(coalesce(p->'vehiculos','[]')) loop
    if not exists (select 1 from logistica.inv_modelos where id = (x->>'modelo_id')::bigint) then raise exception 'Escoge el modelo'; end if;
    if not exists (select 1 from logistica.inv_colores where id = (x->>'color_id')::bigint) then raise exception 'Escoge el color'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    if coalesce((x->>'especial')::boolean, false) and nullif(btrim(coalesce(x->>'especial_que','')), '') is null then raise exception 'Escribe qué lleva el especial'; end if;
    n := n + (x->>'cantidad')::int;
  end loop;
  if n > 60 then raise exception 'Son demasiados vehículos para una venta'; end if;

  if v_id is null then
    insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino)
    values (b, v_rem, (p->>'fecha')::date, btrim(p->>'vendedor'), btrim(p->>'destino'), nullif(p->>'tipo_destino',''))
    returning id into v_id;
  else
    select v.bodega, to_jsonb(v) || jsonb_build_object('vehiculos', (select jsonb_agg(to_jsonb(un) order by un.parte) from logistica.inv_venta_unidades un where un.venta_id = v.id))
      into v_bod, antes from logistica.inv_ventas v where v.id = v_id and v.estado = 'activa';
    if antes is null or (u.rol = 'bodega' and v_bod <> u.bodega) then raise exception 'Esa venta no existe'; end if;
    if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
    update logistica.inv_ventas set remision = v_rem, fecha = (p->>'fecha')::date, vendedor = btrim(p->>'vendedor'), destino = btrim(p->>'destino'),
      tipo_destino = nullif(p->>'tipo_destino','') where id = v_id;
  end if;

  if p ? 'vehiculos' and jsonb_array_length(p->'vehiculos') > 0 then
    if exists (select 1 from logistica.inv_vehiculos where venta_id = v_id) then
      raise exception 'Ya hay vehículos de esta venta en producción: solo se pueden corregir los datos de la venta';
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
  return jsonb_build_object('id', v_id);
end $$;

-- Un renglón por vehículo vendido, con los datos de su venta y su estado:
-- esperando (no hay vehículo para armarlo), por_armar, produccion, faltantes, no_paso, lista.
create or replace function public.inv_ventas(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(t order by t->>'fecha', (t->>'id')::bigint, (t->>'parte')::int) from (
    select to_jsonb(v) || jsonb_build_object(
      'unidad_id', un.id, 'parte', un.parte, 'partes', (select count(*) from logistica.inv_venta_unidades z where z.venta_id = v.id),
      'modelo_id', un.modelo_id, 'opciones', to_jsonb(un.opciones), 'color_id', un.color_id, 'especial', un.especial, 'especial_que', un.especial_que,
      'estado_venta', case
        when h.id is not null then case when h.faltantes then 'faltantes' when h.no_paso then 'no_paso' when h.etapa = 'listo' then 'lista' else 'produccion' end
        when s.rn <= coalesce(e.cantidad, 0) then 'por_armar'
        else 'esperando' end,
      'vehiculo', case when h.id is null then null else jsonb_build_object('id', h.id, 'serie', h.serie, 'etapa', h.etapa, 'faltantes', h.faltantes, 'no_paso', h.no_paso) end) t
    from logistica.inv_ventas v
    join logistica.inv_venta_unidades un on un.venta_id = v.id
    left join logistica.inv_vehiculos h on h.unidad_id = un.id
    left join (select z.id, row_number() over (partition by x.bodega, z.modelo_id, z.opciones, z.color_id order by x.fecha, x.id, z.parte) rn
               from logistica.inv_venta_unidades z join logistica.inv_ventas x on x.id = z.venta_id
               where x.estado = 'activa' and not exists (select 1 from logistica.inv_vehiculos y where y.unidad_id = z.id)) s on s.id = un.id
    left join logistica.inv_espera(b) e on e.bodega = v.bodega and e.modelo_id = un.modelo_id and e.opciones = un.opciones and e.color_id = un.color_id
    where v.estado = 'activa' and (b is null or v.bodega = b)) q), '[]');
end $$;

-- ---------------------------------------------------------------- 5. Producción
-- p = {unidad_id, serie} o {para:'showroom', bodega, modelo_id, opciones, color_id, serie}
create or replace function public.inv_produccion_entrar(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); un logistica.inv_venta_unidades; v logistica.inv_ventas; b text; v_id bigint; v_ops bigint[];
  v_serie text := btrim(coalesce(p->>'serie','')); v_mod bigint; v_col bigint; v_hay bigint;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  if v_serie = '' then raise exception 'Escribe el número de serie'; end if;
  if exists (select 1 from logistica.inv_vehiculos where upper(btrim(serie)) = upper(v_serie)) then raise exception 'Ese número de serie ya está registrado'; end if;
  if (p->>'unidad_id') is not null then
    select * into un from logistica.inv_venta_unidades where id = (p->>'unidad_id')::bigint;
    select * into v from logistica.inv_ventas where id = un.venta_id and estado = 'activa';
    if v.id is null or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa venta no existe'; end if;
    if exists (select 1 from logistica.inv_vehiculos where unidad_id = un.id) then raise exception 'Ese vehículo ya está en producción'; end if;
    b := v.bodega; v_mod := un.modelo_id; v_ops := un.opciones; v_col := un.color_id;
  else
    b := logistica.inv_bodega_escribe(u, p->>'bodega');
    v_mod := (p->>'modelo_id')::bigint; v_col := (p->>'color_id')::bigint;
    select logistica.inv_ordenar(array_agg(x::bigint)) into v_ops from jsonb_array_elements_text(coalesce(p->'opciones','[]')) x;
  end if;
  select e.cantidad into v_hay from logistica.inv_espera(b) e
    where e.bodega = b and e.modelo_id = v_mod and e.opciones = v_ops and e.color_id = v_col;
  if coalesce(v_hay, 0) < 1 then raise exception 'No hay vehículos de ese modelo y color en espera de armado'; end if;

  insert into logistica.inv_vehiculos (bodega, serie, modelo_id, opciones, color_id, para, venta_id, unidad_id, especial)
  values (b, v_serie, v_mod, v_ops, v_col, case when un.id is null then 'showroom' else 'venta' end, v.id, un.id, coalesce(un.especial, false))
  returning id into v_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (v_id, 'armado', 'entro');
  perform logistica.inv_anotar('alta', 'vehiculos', v_id, b, null, (select to_jsonb(x) from logistica.inv_vehiculos x where x.id = v_id), null);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.inv_produccion(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(to_jsonb(h) || jsonb_build_object(
      'venta', case when v.id is null then null else jsonb_build_object('id', v.id, 'remision', v.remision, 'parte', un.parte,
        'partes', (select count(*) from logistica.inv_venta_unidades z where z.venta_id = v.id),
        'especial_que', un.especial_que, 'destino', v.destino, 'vendedor', v.vendedor, 'fecha', v.fecha) end)
      order by h.etapa_desde)
    from logistica.inv_vehiculos h
    left join logistica.inv_venta_unidades un on un.id = h.unidad_id
    left join logistica.inv_ventas v on v.id = un.venta_id
    where (b is null or h.bodega = b)), '[]');
end $$;

create or replace function public.inv_vehiculo(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos := logistica.inv_vehiculo_de(u, p_id);
begin
  return jsonb_build_object(
    'vehiculo', to_jsonb(h),
    'venta', (select to_jsonb(v) || jsonb_build_object('parte', un.parte, 'partes', (select count(*) from logistica.inv_venta_unidades z where z.venta_id = v.id),
                'especial_que', un.especial_que)
              from logistica.inv_venta_unidades un join logistica.inv_ventas v on v.id = un.venta_id where un.id = h.unidad_id),
    'historial', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha, x.id) from logistica.inv_vehiculo_etapas x where x.vehiculo_id = p_id), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('pieza', pz.nombre) order by d.id)
                          from logistica.inv_vehiculo_defectos d left join logistica.inv_piezas pz on pz.id = d.pieza_id where d.vehiculo_id = p_id), '[]'));
end $$;

create or replace function public.inv_vehiculo_avanzar(p_id bigint, p jsonb default '{}') returns jsonb
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
      insert into logistica.inv_vehiculo_defectos (vehiculo_id, etapa, defecto_id, pieza_id, gravedad, cantidad)
      values (p_id, 'revision1', (x->>'defecto_id')::bigint, (x->>'pieza_id')::bigint, nullif(x->>'gravedad',''), (x->>'cantidad')::int);
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
end $$;

-- Regresar un paso (por si le picaron por error). Desde Armado, el vehículo regresa a En espera de armado (se borra).
-- Si se regresa a Revisión 1 o antes, lo que se había anotado en la Revisión 1 se borra (se vuelve a revisar).
create function public.inv_vehiculo_regresar(p_id bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
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
  if v_ant in ('armado', 'revision1') then delete from logistica.inv_vehiculo_defectos where vehiculo_id = p_id and etapa = 'revision1'; end if;
  update logistica.inv_vehiculos set etapa = v_ant, etapa_desde = now(), faltantes = false, no_paso = false where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_ant, 'regreso');
  return jsonb_build_object('id', p_id, 'etapa', v_ant);
end $$;

-- ---------------------------------------------------------------- 6. Inventario: también las piezas que faltan
create or replace function public.inv_inventario(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(t order by t->>'pieza', t->>'color') from (
        select jsonb_build_object('pieza_id', rp.pieza_id, 'pieza', pz.nombre, 'color_id', rp.color_id, 'color', k.nombre,
          'disponibles', sum(rp.llegaron - rp.danadas), 'danadas', sum(rp.danadas), 'faltaron', sum(greatest(rp.esperadas - rp.llegaron, 0))) t
        from logistica.inv_revision_piezas rp
        join logistica.inv_contenedores c on c.id = rp.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        join logistica.inv_piezas pz on pz.id = rp.pieza_id
        left join logistica.inv_colores k on k.id = rp.color_id
        group by rp.pieza_id, pz.nombre, rp.color_id, k.nombre) s), '[]'),
    -- Daños anotados en la revisión de cada contenedor (de qué pieza, qué tipo y qué tan grave)
    'danos', coalesce((select jsonb_agg(jsonb_build_object('pieza', pz.nombre, 'defecto_id', d.defecto_id, 'gravedad', d.gravedad, 'cantidad', d.cantidad,
          'contenedor', c.numero, 'fecha', c.llegada) order by c.llegada desc, d.id)
        from logistica.inv_revision_defectos d
        join logistica.inv_contenedores c on c.id = d.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        left join logistica.inv_piezas pz on pz.id = d.pieza_id), '[]'),
    -- Piezas que faltaron: en contenedores (llegaron menos de las que debían) y en vehículos (Revisión 1, sin resolver)
    'faltantes', coalesce((select jsonb_agg(t order by t->>'pieza') from (
        select jsonb_build_object('pieza', pz.nombre, 'pieza_id', pz.id,
          'contenedores', coalesce((select sum(rp.esperadas - rp.llegaron) from logistica.inv_revision_piezas rp
              join logistica.inv_contenedores c on c.id = rp.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
              where rp.pieza_id = pz.id and rp.llegaron < rp.esperadas), 0),
          'vehiculos', coalesce((select sum(d.cantidad) from logistica.inv_vehiculo_defectos d
              join logistica.inv_vehiculos h on h.id = d.vehiculo_id and (b is null or h.bodega = b)
              where d.pieza_id = pz.id and not d.resuelto), 0)) t
        from logistica.inv_piezas pz) s
        where (t->>'contenedores')::int + (t->>'vehiculos')::int > 0), '[]'),
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

do $$ declare f text; begin
  foreach f in array array['inv_venta_guardar(jsonb,text)','inv_vehiculo_regresar(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
