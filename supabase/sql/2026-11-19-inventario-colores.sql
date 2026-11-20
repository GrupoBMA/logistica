-- Inventario: al recibir un contenedor la hoja solo dice QUÉ colores trae (se escogen varios);
-- cuántos de cada color se captura en la revisión. Aplicado en Supabase como migración
-- "inventario_colores_varios" (19-nov-2026). No había contenedores guardados.

alter table logistica.inv_renglones drop column color_id;
alter table logistica.inv_renglones add column colores bigint[] not null default '{}';   -- los colores que dice la hoja

-- Lo que se contó de cada color en la revisión (inv_renglones.contados es la suma)
create table logistica.inv_renglon_colores (
  renglon_id bigint not null references logistica.inv_renglones(id) on delete cascade,
  color_id bigint not null references logistica.inv_colores(id),
  contados int not null check (contados >= 0),
  primary key (renglon_id, color_id));
alter table logistica.inv_renglon_colores enable row level security;
revoke all on logistica.inv_renglon_colores from anon, authenticated;

-- Foto de un contenedor: cada renglón lleva "conteo" [{color_id, contados}]
create or replace function logistica.inv_foto(p_id bigint) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'contenedor', (select to_jsonb(c) from logistica.inv_contenedores c where c.id = p_id),
    'renglones', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('conteo',
        coalesce((select jsonb_agg(jsonb_build_object('color_id', rc.color_id, 'contados', rc.contados) order by k.orden, k.nombre)
                  from logistica.inv_renglon_colores rc join logistica.inv_colores k on k.id = rc.color_id where rc.renglon_id = r.id), '[]'))
        order by r.id) from logistica.inv_renglones r where r.contenedor_id = p_id), '[]'),
    'piezas', coalesce((select jsonb_agg(to_jsonb(p) order by p.pieza_id, p.color_id) from logistica.inv_revision_piezas p where p.contenedor_id = p_id), '[]'),
    'defectos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from logistica.inv_revision_defectos d where d.contenedor_id = p_id), '[]'),
    'anulacion', (select to_jsonb(a) from logistica.inv_anulaciones a where a.contenedor_id = p_id order by a.pedida desc limit 1)) $$;

-- p = {id?, bodega?, numero, llegada, observaciones, renglones:[{modelo_id, opciones:[ids], colores:[ids], cantidad}]}
-- Al corregir lo que trae un contenedor ya revisado, vuelve a "por revisar" (los conteos ya no corresponden).
create or replace function public.inv_contenedor_guardar(p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
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
  -- Revisar cada renglón contra el catálogo
  for x in select * from jsonb_array_elements(p->'renglones') loop
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
    if not exists (select 1 from logistica.inv_modelos m where m.id = (x->>'modelo_id')::bigint and m.activo) then raise exception 'Escoge el modelo'; end if;
    v_cols := array(select (e)::bigint from jsonb_array_elements_text(coalesce(x->'colores','[]')) e);
    if cardinality(v_cols) = 0 then raise exception 'Escoge al menos un color'; end if;
    if (select count(distinct k.id) from logistica.inv_colores k where k.id = any(v_cols) and k.activo) <> cardinality(v_cols) then
      raise exception 'Escoge los colores otra vez';
    end if;
    v_ops := array(select (e)::bigint from jsonb_array_elements_text(coalesce(x->'opciones','[]')) e);
    if exists (select 1 from unnest(v_ops) o where not exists (select 1 from logistica.inv_modelo_opciones mo
               where mo.modelo_id = (x->>'modelo_id')::bigint and mo.opcion_id = o))
       or (select count(*) from logistica.inv_opciones o where o.id = any(v_ops))
          <> (select count(distinct o.caracteristica_id) from logistica.inv_opciones o where o.id = any(v_ops))
       or (select count(*) from logistica.inv_opciones o where o.id = any(v_ops)) <> cardinality(v_ops) then
      raise exception 'Esa combinación no existe para este modelo';
    end if;
  end loop;
  -- Renglones normalizados (opciones y colores ordenados) para guardar y comparar
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
    -- ¿Cambió lo que trae? (se comparan como conjuntos, sin importar el orden)
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
end $$;

-- p = {contados:[{renglon_id, colores:[{color_id, contados}]}], piezas:[{pieza_id, color_id, esperadas, llegaron, danadas}],
--      defectos:[{pieza_id, color_id, defecto_id, gravedad, cantidad}]}
-- Se puede contar un color que no venía en la hoja (si llegó uno distinto).
create or replace function public.inv_revision_guardar(p_id bigint, p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); c logistica.inv_contenedores; antes jsonb; x jsonb; y jsonb; v_ren bigint;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');   -- solo revisa que pueda escribir
  c := logistica.inv_contenedor_de(u, p_id);
  if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
  if c.estado = 'revisado' and nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
  antes := logistica.inv_foto(p_id);

  for x in select * from jsonb_array_elements(coalesce(p->'contados','[]')) loop
    v_ren := null;
    select r.id into v_ren from logistica.inv_renglones r where r.id = (x->>'renglon_id')::bigint and r.contenedor_id = p_id;
    if v_ren is null then raise exception 'Revisa los vehículos contados'; end if;
    if jsonb_typeof(x->'colores') is distinct from 'array' or jsonb_array_length(x->'colores') = 0 then raise exception 'Falta contar los vehículos'; end if;
    delete from logistica.inv_renglon_colores where renglon_id = v_ren;
    for y in select * from jsonb_array_elements(x->'colores') loop
      if coalesce((y->>'contados')::int, -1) < 0 then raise exception 'Revisa los vehículos contados'; end if;
      if not exists (select 1 from logistica.inv_colores k where k.id = (y->>'color_id')::bigint) then raise exception 'Escoge el color'; end if;
      insert into logistica.inv_renglon_colores (renglon_id, color_id, contados)
      values (v_ren, (y->>'color_id')::bigint, (y->>'contados')::int)
      on conflict (renglon_id, color_id) do update set contados = excluded.contados;
    end loop;
    update logistica.inv_renglones set contados = (select sum(contados) from logistica.inv_renglon_colores where renglon_id = v_ren) where id = v_ren;
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

-- Vehículos en espera de armado: por modelo, opciones y color (lo contado de cada color)
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
        select jsonb_build_object('modelo_id', r.modelo_id, 'modelo', m.nombre, 'opciones', to_jsonb(r.opciones),
          'opciones_txt', (select string_agg(o.nombre, ' · ' order by ca.orden) from logistica.inv_opciones o
                           join logistica.inv_caracteristicas ca on ca.id = o.caracteristica_id where o.id = any(r.opciones)),
          'color_id', rc.color_id, 'color', k.nombre, 'cantidad', sum(rc.contados)) t
        from logistica.inv_renglones r
        join logistica.inv_contenedores c on c.id = r.contenedor_id and c.estado = 'revisado' and (b is null or c.bodega = b)
        join logistica.inv_renglon_colores rc on rc.renglon_id = r.id
        join logistica.inv_modelos m on m.id = r.modelo_id
        join logistica.inv_colores k on k.id = rc.color_id
        group by r.modelo_id, m.nombre, r.opciones, rc.color_id, k.nombre
        having sum(rc.contados) > 0) s), '[]'));
end $$;
