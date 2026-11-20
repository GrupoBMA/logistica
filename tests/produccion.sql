-- Pruebas de producción y ventas (20-nov-2026). Se corren completas con execute_sql de Supabase.
-- Todo va en una transacción que termina en ROLLBACK: no deja nada guardado.
-- Necesita al menos un contenedor revisado de MC 150 en bodega2 con vehículos blancos y ninguno negro.
begin;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
create function pg_temp.como(p_email text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.anota(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as
$$ insert into r (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle) $$;
do $$
declare ren record; blanco bigint; negro bigint; falt bigint; j jsonb; v1 bigint; v2 bigint; h1 bigint; h2 bigint; esp int; total int;
begin
  select r.modelo_id, r.opciones into ren from logistica.inv_renglones r join logistica.inv_contenedores c on c.id=r.contenedor_id
    join logistica.inv_modelos m on m.id = r.modelo_id where c.bodega='bodega2' and c.estado='revisado' and m.nombre='MC 150' limit 1;
  select id into blanco from logistica.inv_colores where nombre='Blanco';
  select id into negro from logistica.inv_colores where nombre='Negro';
  select id into falt from logistica.inv_defectos where nombre ilike 'faltante%';
  perform pg_temp.como('bodega2@logistica.bma');
  select coalesce(sum((x->>'cantidad')::int),0) into total from jsonb_array_elements(public.inv_inventario(null)->'espera') x;
  j := public.inv_venta_guardar(jsonb_build_object('remision','T-1','fecha','2026-11-01','vendedor','Ana','destino','Zapopan','tipo_destino','Local',
     'modelo_id',ren.modelo_id,'opciones',to_jsonb(ren.opciones),'color_id',blanco,'especial',true,'especial_que','Garrafonero'));
  v1 := (j->>'id')::bigint;
  j := public.inv_venta_guardar(jsonb_build_object('remision','T-2','fecha','2026-11-02','vendedor','Ana','destino','León',
     'modelo_id',ren.modelo_id,'opciones',to_jsonb(ren.opciones),'color_id',negro,'especial',false));
  v2 := (j->>'id')::bigint;
  j := public.inv_ventas(null);
  perform pg_temp.anota('blanco por armar, negro esperando',
    (select x->>'estado_venta' from jsonb_array_elements(j) x where (x->>'id')::bigint=v1)='por_armar' and
    (select x->>'estado_venta' from jsonb_array_elements(j) x where (x->>'id')::bigint=v2)='esperando', j::text);
  begin perform public.inv_venta_guardar(jsonb_build_object('remision',' t-1 ','fecha','2026-11-01','vendedor','x','destino','y','modelo_id',ren.modelo_id,'color_id',blanco));
    perform pg_temp.anota('remisión repetida', false); exception when others then perform pg_temp.anota('remisión repetida', sqlerrm='Esa remisión ya está registrada', sqlerrm); end;
  select (x->>'cantidad')::int into esp from jsonb_array_elements(public.inv_espera_armado(null)) x where (x->>'color_id')::bigint=blanco and (x->>'modelo_id')::bigint=ren.modelo_id;
  j := public.inv_produccion_entrar(jsonb_build_object('venta_id',v1,'serie','SER-001'));
  h1 := (j->>'id')::bigint;
  perform pg_temp.anota('espera baja 1', (select (x->>'cantidad')::int from jsonb_array_elements(public.inv_espera_armado(null)) x where (x->>'color_id')::bigint=blanco and (x->>'modelo_id')::bigint=ren.modelo_id) = esp-1);
  begin perform public.inv_produccion_entrar(jsonb_build_object('para','showroom','modelo_id',ren.modelo_id,'opciones',to_jsonb(ren.opciones),'color_id',blanco,'serie','ser-001'));
    perform pg_temp.anota('serie repetida', false); exception when others then perform pg_temp.anota('serie repetida', sqlerrm='Ese número de serie ya está registrado', sqlerrm); end;
  j := public.inv_produccion_entrar(jsonb_build_object('para','showroom','modelo_id',ren.modelo_id,'opciones',to_jsonb(ren.opciones),'color_id',blanco,'serie','SER-002'));
  h2 := (j->>'id')::bigint;
  j := public.inv_vehiculo_avanzar(h1, '{}');
  perform pg_temp.anota('armado → revisión 1', j->>'etapa'='revision1', j::text);
  j := public.inv_vehiculo_avanzar(h1, jsonb_build_object('defectos', jsonb_build_array(jsonb_build_object('defecto_id',falt,'gravedad','media','cantidad',1))));
  perform pg_temp.anota('faltante → faltantes', (j->>'faltantes')::boolean and j->>'etapa'='revision1', j::text);
  perform pg_temp.anota('venta en faltantes', (select x->>'estado_venta' from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=v1)='faltantes');
  begin perform public.inv_vehiculo_avanzar(h1, '{}'); perform pg_temp.anota('no avanza con faltantes', false);
  exception when others then perform pg_temp.anota('no avanza con faltantes', true, sqlerrm); end;
  j := public.inv_vehiculo_faltantes_listos(h1);
  perform pg_temp.anota('faltantes listos → mecánica', j->>'etapa'='mecanica', j::text);
  j := public.inv_vehiculo_avanzar(h1, '{}');
  perform pg_temp.anota('especial: de mecánica a herrería (rama)', j->>'etapa'='herreria', j::text);
  j := public.inv_vehiculo_avanzar(h1, '{}'); j := public.inv_vehiculo_avanzar(h1, '{}');
  perform pg_temp.anota('la rama vuelve en detallado', j->>'etapa'='detallado', j::text);
  j := public.inv_vehiculo_avanzar(h2, '{}'); j := public.inv_vehiculo_avanzar(h2, '{"defectos":[]}');
  perform pg_temp.anota('revisión 1 → mecánica', j->>'etapa'='mecanica', j::text);
  j := public.inv_vehiculo_avanzar(h2, '{}');
  perform pg_temp.anota('normal: de mecánica a detallado', j->>'etapa'='detallado', j::text);
  j := public.inv_vehiculo_avanzar(h2, '{}');
  j := public.inv_vehiculo_avanzar(h2, '{"pasa":false,"nota":"Rayón"}');
  perform pg_temp.anota('no pasa se queda', j->>'etapa'='revision_final', j::text);
  j := public.inv_vehiculo_avanzar(h2, '{"pasa":true}');
  perform pg_temp.anota('pasa → listo', j->>'etapa'='listo', j::text);
  perform pg_temp.anota('producción lista 2', jsonb_array_length(public.inv_produccion(null))=2);
  j := public.inv_vehiculo(h1);
  perform pg_temp.anota('ficha', jsonb_array_length(j->'historial')>=4 and jsonb_array_length(j->'defectos')=1, (j->'historial')::text);
  perform pg_temp.anota('inventario descuenta', (select sum((x->>'cantidad')::int) from jsonb_array_elements(public.inv_inventario(null)->'espera') x) = total-2);
  perform pg_temp.como('bodega1@logistica.bma');
  perform pg_temp.anota('bodega1 no ve ventas de bodega2', jsonb_array_length(public.inv_ventas(null))=0);
  perform pg_temp.como('carlos@logistica.bma');
  begin perform public.inv_vehiculo_avanzar(h1, '{}'); perform pg_temp.anota('carlos no mueve', false);
  exception when others then perform pg_temp.anota('carlos no mueve', sqlstate='42501', sqlerrm); end;
  execute 'reset role';
exception when others then execute 'reset role'; perform pg_temp.anota('ERROR', false, sqlstate||' '||sqlerrm);
end $$;
select caso, ok, left(detalle,100) detalle from r order by n;
rollback;
