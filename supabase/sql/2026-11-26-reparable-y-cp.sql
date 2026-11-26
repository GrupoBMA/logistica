-- 26-nov-2026 (pedido del usuario):
-- 1) En la revisión de piezas del contenedor, una pieza dañada se marca Reparable o Irreparable
--    (sin tipo de daño ni gravedad). Se guarda en inv_revision_defectos.reparable.
-- 2) La venta lleva código postal, opcional: si no lo tienen a la mano queda pendiente y se agrega después
--    con inv_venta_cp (sin motivo; queda en la bitácora).

alter table logistica.inv_revision_defectos add column if not exists reparable boolean;
alter table logistica.inv_ventas add column if not exists cp text;
alter table logistica.inv_ventas drop constraint if exists inv_ventas_cp_ok;
alter table logistica.inv_ventas add constraint inv_ventas_cp_ok check (cp is null or cp ~ '^[0-9]{5}$');

-- Revisión: guarda "reparable" de cada daño
do $$
declare f text := pg_get_functiondef('public.inv_revision_guardar(bigint,jsonb,text)'::regprocedure);
begin
  if position('reparable' in f) = 0 then
    f := replace(f, 'insert into logistica.inv_revision_defectos (contenedor_id, pieza_id, color_id, defecto_id, gravedad, cantidad)',
                    'insert into logistica.inv_revision_defectos (contenedor_id, pieza_id, color_id, defecto_id, gravedad, cantidad, reparable)');
    f := replace(f, 'x->>''gravedad'', (x->>''cantidad'')::int);',
                    'x->>''gravedad'', (x->>''cantidad'')::int, (x->>''reparable'')::boolean);');
    if position('(x->>''reparable'')::boolean' in f) = 0 then raise exception 'No se pudo parchar inv_revision_guardar'; end if;
    execute f;
  end if;
end $$;

-- Inventario › Piezas › Dañadas: regresa si es reparable
do $$
declare f text := pg_get_functiondef('public.inv_inventario(text)'::regprocedure);
begin
  if position('''reparable''' in f) = 0 then
    f := replace(f, '''gravedad'', d.gravedad, ''cantidad'', d.cantidad,', '''gravedad'', d.gravedad, ''reparable'', d.reparable, ''cantidad'', d.cantidad,');
    if position('''reparable''' in f) = 0 then raise exception 'No se pudo parchar inv_inventario'; end if;
    execute f;
  end if;
end $$;

-- Venta: código postal opcional
do $$
declare f text := pg_get_functiondef('public.inv_venta_guardar(jsonb,text)'::regprocedure);
begin
  if position('v_cp' in f) = 0 then
    f := replace(f, 'v_bod text;', 'v_bod text; v_cp text := nullif(regexp_replace(coalesce(p->>''cp'',''''), ''\s'', '''', ''g''), '''');');
    f := replace(f, 'if (p->>''fecha'') is null then raise exception ''Escribe la fecha de compra''; end if;',
                    'if (p->>''fecha'') is null then raise exception ''Escribe la fecha de compra''; end if;
  if v_cp is not null and v_cp !~ ''^[0-9]{5}$'' then raise exception ''El código postal lleva 5 números''; end if;');
    f := replace(f, 'insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino)
    values (b, v_rem, (p->>''fecha'')::date, btrim(p->>''vendedor''), btrim(p->>''destino''), nullif(p->>''tipo_destino'',''''))',
                    'insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino, cp)
    values (b, v_rem, (p->>''fecha'')::date, btrim(p->>''vendedor''), btrim(p->>''destino''), nullif(p->>''tipo_destino'',''''), v_cp)');
    f := replace(f, 'tipo_destino = nullif(p->>''tipo_destino'','''') where id = v_id;',
                    'tipo_destino = nullif(p->>''tipo_destino'',''''), cp = v_cp where id = v_id;');
    if position('v_cp)' in f) = 0 or position('cp = v_cp' in f) = 0 then raise exception 'No se pudo parchar inv_venta_guardar'; end if;
    execute f;
  end if;
end $$;

-- Agregar o cambiar solo el código postal (sin motivo), para cuando llega después
create or replace function public.inv_venta_cp(p_id bigint, p_cp text) returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare u logistica.usuarios := logistica.inv_yo(); v logistica.inv_ventas; v_cp text := nullif(regexp_replace(coalesce(p_cp,''), '\s', '', 'g'), '');
begin
  select * into v from logistica.inv_ventas where id = p_id and estado = 'activa';
  if not found or (u.rol = 'bodega' and v.bodega <> u.bodega) then raise exception 'Esa venta no existe'; end if;
  perform logistica.inv_bodega_escribe(u, v.bodega);
  if v_cp is null or v_cp !~ '^[0-9]{5}$' then raise exception 'El código postal lleva 5 números'; end if;
  update logistica.inv_ventas set cp = v_cp where id = p_id;
  perform logistica.inv_anotar('edicion', 'ventas', p_id, v.bodega, jsonb_build_object('cp', v.cp), jsonb_build_object('cp', v_cp), 'Código postal');
  return jsonb_build_object('id', p_id, 'cp', v_cp);
end $function$;
revoke all on function public.inv_venta_cp(bigint, text) from public, anon;
grant execute on function public.inv_venta_cp(bigint, text) to authenticated;
