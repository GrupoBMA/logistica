-- 26-nov-2026 (pedido del usuario): sección lateral "Reparación" para los que no pasan la Revisión, mecánica y activación.
-- En la revisión: "✓ Pasa" sigue a Detallado (o a Herrería si es especial); si se anotan faltantes o daños, o "no pasa"
-- con una nota, el vehículo pasa a Reparación. Al terminar ("✓ Ya quedó") se descuentan las piezas que faltaban,
-- lo anotado queda resuelto y sigue a Detallado y pintura, o a Herrería y Forrado si es especial.
-- Ya no se usa la marca "faltantes" para la revisión (se queda para lo viejo).

alter table logistica.inv_vehiculos drop constraint if exists inv_vehiculos_etapa_check;
alter table logistica.inv_vehiculos add constraint inv_vehiculos_etapa_check
  check (etapa in ('armado','revision','reparacion','herreria','forrado','detallado','revision_final','listo'));

create or replace function logistica.inv_siguiente(p_etapa text, p_especial boolean) returns text
 language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'armado' then 'revision'
    when 'revision' then case when p_especial then 'herreria' else 'detallado' end
    when 'reparacion' then case when p_especial then 'herreria' else 'detallado' end
    when 'herreria' then 'forrado'
    when 'forrado' then 'detallado'
    when 'detallado' then 'revision_final'
    when 'revision_final' then 'listo'
  end $$;

create or replace function logistica.inv_anterior(p_etapa text, p_especial boolean) returns text
 language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'revision' then 'armado'
    when 'reparacion' then 'revision'
    when 'herreria' then 'revision'
    when 'forrado' then 'herreria'
    when 'detallado' then case when p_especial then 'forrado' else 'revision' end
    when 'revision_final' then 'detallado'
    when 'listo' then 'revision_final'
  end $$;

create or replace function public.inv_vehiculo_avanzar(p_id bigint, p jsonb default '{}'::jsonb) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); h logistica.inv_vehiculos; x jsonb; v_sig text;
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
    if jsonb_array_length(coalesce(p->'defectos','[]')) > 0 or coalesce((p->>'pasa')::boolean, true) = false then
      -- No pasó: lo anotado se guarda y el vehículo se va a Reparación
      for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
        insert into logistica.inv_vehiculo_defectos (vehiculo_id, etapa, defecto_id, pieza_id, gravedad, cantidad)
        values (p_id, 'revision', (x->>'defecto_id')::bigint, (x->>'pieza_id')::bigint, nullif(x->>'gravedad',''), (x->>'cantidad')::int);
      end loop;
      insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion, nota) values (p_id, 'revision', 'no_paso', nullif(btrim(coalesce(p->>'nota','')), ''));
      update logistica.inv_vehiculos set etapa = 'reparacion', etapa_desde = now() where id = p_id;
      insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion) values (p_id, 'reparacion', 'entro');
      return jsonb_build_object('id', p_id, 'etapa', 'reparacion');
    end if;
  elsif h.etapa = 'reparacion' then
    -- Ya quedó: se descuentan las piezas que faltaban y lo anotado queda resuelto
    insert into logistica.inv_consumos (bodega, vehiculo_id, pieza_id, cantidad, motivo)
    select h.bodega, h.id, d.pieza_id, sum(d.cantidad), 'faltante'
    from logistica.inv_vehiculo_defectos d join logistica.inv_defectos t on t.id = d.defecto_id
    where d.vehiculo_id = p_id and not d.resuelto and t.nombre ilike 'faltante%' and d.pieza_id is not null
    group by d.pieza_id;
    update logistica.inv_vehiculo_defectos set resuelto = true where vehiculo_id = p_id and not resuelto;
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
