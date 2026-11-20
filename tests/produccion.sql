-- Pruebas de ventas y producción (actualizadas el 21-nov-2026). Se corren completas con execute_sql de Supabase.
-- Todo va en una transacción que termina en ROLLBACK: no deja nada guardado.
-- Necesita en bodega1 al menos un modelo y color con 2 o más vehículos en espera de armado, y ninguno plateado.
begin;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
create function pg_temp.anota(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as
$$ insert into r (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle) $$;
create function pg_temp.yo() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function pg_temp.como(p_email text) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; end $$;
do $$
declare j jsonb; vid bigint; u1 bigint; u2 bigint; h bigint; h2 bigint; h3 bigint; falt bigint; pz bigint; ops jsonb; col bigint; plata bigint; total int;
begin
  select to_jsonb(opciones), color_id into ops, col from logistica.inv_espera('bodega1') where cantidad > 1 limit 1;
  select id into plata from logistica.inv_colores where nombre='Plata';
  select id into falt from logistica.inv_defectos where nombre ilike 'faltante%';
  select id into pz from logistica.inv_piezas where nombre='Claxon';
  perform pg_temp.como('bodega1@logistica.bma');
  select coalesce(sum((x->>'cantidad')::int),0) into total from jsonb_array_elements(public.inv_inventario(null)->'espera') x;

  -- Venta con varios vehículos de varios colores
  j := public.inv_venta_guardar(jsonb_build_object('remision','T-9','fecha','2026-11-21','vendedor','Ana','destino','Zapopan','tipo_destino','Local',
    'vehiculos', jsonb_build_array(
      jsonb_build_object('modelo_id',1,'opciones',ops,'color_id',col,'cantidad',2,'especial',true,'especial_que','Garrafonero'),
      jsonb_build_object('modelo_id',1,'opciones',ops,'color_id',plata,'cantidad',1))));
  vid := (j->>'id')::bigint;
  j := public.inv_ventas(null);
  perform pg_temp.anota('3 vehículos en la venta, partes 1 a 3', (select count(*) from jsonb_array_elements(j) x where (x->>'id')::bigint=vid)=3
    and (select max((x->>'parte')::int) from jsonb_array_elements(j) x where (x->>'id')::bigint=vid)=3);
  perform pg_temp.anota('con vehículo: por armar; plata: esperando piezas',
    (select x->>'estado_venta' from jsonb_array_elements(j) x where (x->>'id')::bigint=vid and (x->>'parte')::int=1)='por_armar' and
    (select x->>'estado_venta' from jsonb_array_elements(j) x where (x->>'id')::bigint=vid and (x->>'parte')::int=3)='esperando');
  begin perform public.inv_venta_guardar(jsonb_build_object('remision',' t-9 ','fecha','2026-11-21','vendedor','x','destino','y',
      'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones',ops,'color_id',col,'cantidad',1))));
    perform pg_temp.anota('remisión repetida', false); exception when others then perform pg_temp.anota('remisión repetida', sqlerrm='Esa remisión ya está registrada', sqlerrm); end;
  begin perform public.inv_venta_guardar(jsonb_build_object('remision','T-10','fecha','2026-11-21','vendedor','x','destino','y','vehiculos','[]'::jsonb));
    perform pg_temp.anota('sin vehículos se rechaza', false); exception when others then perform pg_temp.anota('sin vehículos se rechaza', sqlerrm='Agrega al menos un vehículo', sqlerrm); end;

  select (x->>'unidad_id')::bigint into u1 from jsonb_array_elements(j) x where (x->>'id')::bigint=vid and (x->>'parte')::int=1;
  select (x->>'unidad_id')::bigint into u2 from jsonb_array_elements(j) x where (x->>'id')::bigint=vid and (x->>'parte')::int=2;
  h := (public.inv_produccion_entrar(jsonb_build_object('unidad_id',u1,'serie','TT-1'))->>'id')::bigint;
  begin perform public.inv_produccion_entrar(jsonb_build_object('para','showroom','modelo_id',1,'opciones',ops,'color_id',col,'serie','tt-1'));
    perform pg_temp.anota('serie repetida', false); exception when others then perform pg_temp.anota('serie repetida', sqlerrm='Ese número de serie ya está registrado', sqlerrm); end;

  -- Revisión 1 con faltante (con pieza, sin grado)
  j := public.inv_vehiculo_avanzar(h, '{}');
  j := public.inv_vehiculo_avanzar(h, jsonb_build_object('defectos', jsonb_build_array(jsonb_build_object('defecto_id',falt,'pieza_id',pz,'cantidad',1))));
  perform pg_temp.anota('faltante sin grado detiene el vehículo', (j->>'faltantes')::boolean, j::text);
  perform pg_temp.anota('venta en faltantes', (select x->>'estado_venta' from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'unidad_id')::bigint=u1)='faltantes');
  perform pg_temp.anota('inventario: faltante por pieza', exists(select 1 from jsonb_array_elements(public.inv_inventario(null)->'faltantes') x where x->>'pieza'='Claxon' and (x->>'vehiculos')::int>=1));
  begin perform public.inv_vehiculo_avanzar(h, '{}'); perform pg_temp.anota('no avanza con faltantes', false);
  exception when others then perform pg_temp.anota('no avanza con faltantes', true, sqlerrm); end;
  begin perform public.inv_vehiculo_avanzar(h, jsonb_build_object('defectos', jsonb_build_array(jsonb_build_object('defecto_id',(select id from logistica.inv_defectos where nombre ilike 'golpe%' limit 1),'cantidad',1))));
    perform pg_temp.anota('un daño sí pide grado', false); exception when others then perform pg_temp.anota('un daño sí pide grado', true, sqlerrm); end;

  -- Especial: Revisión 1 → Herrería → Forrado → Mecánica (Mecánica siempre antepenúltima)
  j := public.inv_vehiculo_faltantes_listos(h);
  perform pg_temp.anota('especial: revisión 1 → herrería', j->>'etapa'='herreria', j::text);
  j := public.inv_vehiculo_avanzar(h,'{}'); j := public.inv_vehiculo_avanzar(h,'{}');
  perform pg_temp.anota('forrado → mecánica', j->>'etapa'='mecanica', j::text);
  j := public.inv_vehiculo_regresar(h);
  perform pg_temp.anota('regresar: mecánica → forrado', j->>'etapa'='forrado', j::text);
  j := public.inv_vehiculo_avanzar(h,'{}'); j := public.inv_vehiculo_avanzar(h,'{}'); j := public.inv_vehiculo_avanzar(h,'{}');
  j := public.inv_vehiculo_avanzar(h,'{"pasa":false,"nota":"Rayón"}');
  perform pg_temp.anota('no pasó queda marcado', (select x->>'estado_venta' from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'unidad_id')::bigint=u1)='no_paso');
  j := public.inv_vehiculo_avanzar(h,'{"pasa":true}');
  perform pg_temp.anota('pasa → listo y se quita la marca', j->>'etapa'='listo' and (select x->>'estado_venta' from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'unidad_id')::bigint=u1)='lista');

  -- Normal (showroom): Revisión 1 → Mecánica
  h3 := (public.inv_produccion_entrar(jsonb_build_object('para','showroom','modelo_id',1,'opciones',ops,'color_id',col,'serie','TT-3'))->>'id')::bigint;
  j := public.inv_vehiculo_avanzar(h3,'{}'); j := public.inv_vehiculo_avanzar(h3,'{"defectos":[]}');
  perform pg_temp.anota('normal: revisión 1 → mecánica', j->>'etapa'='mecanica', j::text);

  -- Regresar desde Armado: vuelve a En espera de armado
  h2 := (public.inv_produccion_entrar(jsonb_build_object('unidad_id',u2,'serie','TT-2'))->>'id')::bigint;
  j := public.inv_vehiculo_regresar(h2);
  perform pg_temp.anota('regresar desde armado lo saca de producción', (j->>'borrado')::boolean
    and (select x->>'estado_venta' from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'unidad_id')::bigint=u2)='por_armar');
  perform pg_temp.anota('inventario descuenta lo que entró', (select coalesce(sum((x->>'cantidad')::int),0) from jsonb_array_elements(public.inv_inventario(null)->'espera') x) = total-2);

  begin perform public.inv_venta_guardar(jsonb_build_object('id',vid,'remision','T-9','fecha','2026-11-21','vendedor','Ana','destino','Zapopan',
      'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones',ops,'color_id',col,'cantidad',1))), 'x');
    perform pg_temp.anota('no cambia vehículos si ya hay en producción', false);
  exception when others then perform pg_temp.anota('no cambia vehículos si ya hay en producción', true, sqlerrm); end;

  perform pg_temp.como('bodega2@logistica.bma');
  perform pg_temp.anota('bodega2 no ve ventas de bodega1', not exists(select 1 from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=vid));
  perform pg_temp.como('carlos@logistica.bma');
  begin perform public.inv_vehiculo_regresar(h); perform pg_temp.anota('carlos no regresa pasos', false);
  exception when others then perform pg_temp.anota('carlos no regresa pasos', sqlstate='42501', sqlerrm); end;
  perform pg_temp.yo();
exception when others then perform pg_temp.yo(); perform pg_temp.anota('ERROR', false, sqlstate||' '||sqlerrm);
end $$;
select caso, ok, left(detalle,100) detalle from r order by n;
rollback;
