-- Daños por contenedor (19-nov-2026). Mientras no hay lista de piezas, la revisión anota los daños
-- de todo el contenedor en inv_revision_defectos con pieza_id nulo (la tabla ya lo permitía).
-- Aquí: la lista de contenedores regresa cuántos daños tiene cada uno, y la revisión valida tipo y cantidad.

create or replace function public.inv_contenedores(p_bodega text default null) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); b text := logistica.inv_bodega_lee(u, p_bodega);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'bodega', c.bodega, 'numero', c.numero, 'llegada', c.llegada, 'estado', c.estado, 'observaciones', c.observaciones,
      'vehiculos', (select coalesce(sum(r.cantidad),0) from logistica.inv_renglones r where r.contenedor_id = c.id),
      'danos', (select coalesce(sum(d.cantidad),0) from logistica.inv_revision_defectos d where d.contenedor_id = c.id),
      'anulacion_pendiente', exists (select 1 from logistica.inv_anulaciones a where a.contenedor_id = c.id and a.estado = 'pendiente'))
    order by c.llegada desc, c.id desc)
    from logistica.inv_contenedores c where b is null or c.bodega = b), '[]');
end $$;

-- Revisa los daños antes de guardar la revisión, para dar un aviso claro en vez de un error de la base
create or replace function logistica.inv_revisar_defectos(p jsonb) returns void
language plpgsql stable set search_path to '' as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
    if not exists (select 1 from logistica.inv_defectos d where d.id = (x->>'defecto_id')::bigint) then raise exception 'Escoge el tipo de daño'; end if;
    if coalesce(x->>'gravedad','') not in ('leve','media','grave') then raise exception 'Escoge qué tan grave es el daño'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad de cada daño debe ser 1 o más'; end if;
  end loop;
end $$;
revoke all on function logistica.inv_revisar_defectos(jsonb) from public, anon, authenticated;

-- Igual que en 2026-11-19-inventario-colores.sql, más la revisión de los daños
create or replace function public.inv_revision_guardar(p_id bigint, p jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo(); c logistica.inv_contenedores; antes jsonb; x jsonb; y jsonb; v_ren bigint;
begin
  perform logistica.inv_bodega_escribe(u, 'bodega1');   -- solo revisa que pueda escribir
  c := logistica.inv_contenedor_de(u, p_id);
  if c.estado = 'anulado' then raise exception 'Este contenedor está anulado'; end if;
  if c.estado = 'revisado' and nullif(btrim(p_motivo), '') is null then raise exception 'Escribe el motivo del cambio'; end if;
  antes := logistica.inv_foto(p_id);
  perform logistica.inv_revisar_defectos(p);

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
