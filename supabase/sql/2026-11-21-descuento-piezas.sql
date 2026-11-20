-- Descuento de piezas (pedido del usuario, 21-nov-2026):
--  * al entrar a producción se restan del inventario las piezas de la lista de su modelo (y de sus opciones);
--  * al marcar "Ya se pusieron las piezas", se resta cada pieza que faltaba (la sacaron del inventario).
-- Si no alcanzan, el vehículo entra de todos modos y se avisa cuáles faltan en el inventario.
-- Los consumos son del vehículo: si regresa a En espera de armado (se borra), sus piezas regresan solas (on delete cascade).

create table logistica.inv_consumos (
  id bigint generated always as identity primary key,
  bodega text not null check (bodega in ('bodega1','bodega2')),
  vehiculo_id bigint not null references logistica.inv_vehiculos(id) on delete cascade,
  pieza_id bigint not null references logistica.inv_piezas(id),
  cantidad int not null check (cantidad > 0),
  motivo text not null check (motivo in ('armado','faltante')),
  fecha timestamptz not null default now());
create index on logistica.inv_consumos (vehiculo_id);
alter table logistica.inv_consumos enable row level security;
revoke all on logistica.inv_consumos from anon, authenticated;

-- Piezas disponibles por bodega: llegaron − dañadas (contenedores revisados) − lo que se usó
create function logistica.inv_disponibles(b text) returns table (pieza_id bigint, disponibles bigint)
language sql stable security definer set search_path to '' as $$
  select pieza_id, sum(n)::bigint from (
    select rp.pieza_id, (rp.llegaron - rp.danadas) as n from logistica.inv_revision_piezas rp
      join logistica.inv_contenedores c on c.id = rp.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
    union all
    select k.pieza_id, -k.cantidad from logistica.inv_consumos k where (b is null or k.bodega = b)) x
  group by pieza_id $$;
revoke all on function logistica.inv_disponibles(text) from public, anon, authenticated;

-- Resta las piezas de la lista de un vehículo. Regresa las que no alcanzaron: [{pieza, faltan}]
create function logistica.inv_consumir_lista(p_vehiculo bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare h logistica.inv_vehiculos;
begin
  select * into h from logistica.inv_vehiculos where id = p_vehiculo;
  insert into logistica.inv_consumos (bodega, vehiculo_id, pieza_id, cantidad, motivo)
  select h.bodega, h.id, m.pieza_id, sum(m.cantidad), 'armado'
  from logistica.inv_materiales m
  where m.modelo_id = h.modelo_id or m.opcion_id = any(h.opciones)
  group by m.pieza_id having sum(m.cantidad) > 0;
  return coalesce((select jsonb_agg(jsonb_build_object('pieza', pz.nombre, 'faltan', -d.disponibles) order by pz.nombre)
    from logistica.inv_disponibles(h.bodega) d join logistica.inv_piezas pz on pz.id = d.pieza_id
    where d.disponibles < 0 and d.pieza_id in (select k.pieza_id from logistica.inv_consumos k where k.vehiculo_id = h.id)), '[]');
end $$;
revoke all on function logistica.inv_consumir_lista(bigint) from public, anon, authenticated;

-- Entrar a producción: además, se descuentan las piezas y se avisa si no alcanzaron
create or replace function public.inv_produccion_entrar(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); un logistica.inv_venta_unidades; v logistica.inv_ventas; b text; v_id bigint; v_ops bigint[];
  v_serie text := btrim(coalesce(p->>'serie','')); v_mod bigint; v_col bigint; v_hay bigint; v_faltan jsonb;
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
  v_faltan := logistica.inv_consumir_lista(v_id);
  perform logistica.inv_anotar('alta', 'vehiculos', v_id, b, null, (select to_jsonb(x) from logistica.inv_vehiculos x where x.id = v_id), null);
  return jsonb_build_object('id', v_id, 'faltan_en_inventario', v_faltan);
end $$;

-- Ya se pusieron las piezas que faltaban: se restan del inventario
create or replace function public.inv_vehiculo_faltantes_listos(p_id bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; v_sig text;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');
  h := logistica.inv_vehiculo_de(u, p_id);
  if not h.faltantes then raise exception 'Este vehículo no tiene faltantes'; end if;
  insert into logistica.inv_consumos (bodega, vehiculo_id, pieza_id, cantidad, motivo)
  select h.bodega, h.id, d.pieza_id, sum(d.cantidad), 'faltante'
  from logistica.inv_vehiculo_defectos d join logistica.inv_defectos t on t.id = d.defecto_id
  where d.vehiculo_id = p_id and not d.resuelto and t.nombre ilike 'faltante%' and d.pieza_id is not null
  group by d.pieza_id;
  update logistica.inv_vehiculo_defectos set resuelto = true
    where vehiculo_id = p_id and not resuelto and defecto_id in (select id from logistica.inv_defectos where nombre ilike 'faltante%');
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, h.etapa, 'faltantes_listos');
  v_sig := logistica.inv_siguiente(h.etapa, h.especial);
  update logistica.inv_vehiculos set faltantes = false, etapa = v_sig, etapa_desde = now() where id = p_id;
  insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, v_sig, 'entro');
  return jsonb_build_object('id', p_id, 'etapa', v_sig);
end $$;

-- Inventario: disponibles ya descuentan lo usado; también "usadas" (lo que se fue en vehículos)
create or replace function public.inv_inventario(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(t order by t->>'pieza') from (
        select jsonb_build_object('pieza_id', pz.id, 'pieza', pz.nombre,
          'disponibles', coalesce(d.disponibles, 0),
          'danadas', coalesce((select sum(rp.danadas) from logistica.inv_revision_piezas rp
              join logistica.inv_contenedores c on c.id = rp.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b) where rp.pieza_id = pz.id), 0),
          'usadas', coalesce((select sum(k.cantidad) from logistica.inv_consumos k where k.pieza_id = pz.id and (b is null or k.bodega = b)), 0)) t
        from logistica.inv_piezas pz
        join logistica.inv_disponibles(b) d on d.pieza_id = pz.id) s), '[]'),
    'danos', coalesce((select jsonb_agg(jsonb_build_object('pieza', pz.nombre, 'defecto_id', d.defecto_id, 'gravedad', d.gravedad, 'cantidad', d.cantidad,
          'contenedor', c.numero, 'fecha', c.llegada) order by c.llegada desc, d.id)
        from logistica.inv_revision_defectos d
        join logistica.inv_contenedores c on c.id = d.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        left join logistica.inv_piezas pz on pz.id = d.pieza_id), '[]'),
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
