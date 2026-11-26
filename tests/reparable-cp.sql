-- Pruebas del código postal de la venta y de las piezas dañadas reparables/irreparables (26-nov-2026).
-- Se corre completa con execute_sql; todo va en una transacción que no se confirma, así que no deja nada guardado.
-- Resultado esperado (26-nov-2026): los 9 casos en ok = true.
begin;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
create function pg_temp.como(p_email text) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; end $$;
do $$
declare j jsonb; vid bigint; vid2 bigint; cid bigint; ren bigint; pz bigint; col bigint; tipo bigint;
begin
  select id into col from logistica.inv_colores where activo limit 1;
  select id into tipo from logistica.inv_defectos where nombre='Pieza dañada';
  select pieza_id into pz from logistica.inv_materiales where modelo_id=1 limit 1;
  perform pg_temp.como('bodega1@logistica.bma');
  j := public.inv_venta_guardar(jsonb_build_object('remision','T-CP1','fecha','2026-11-26','vendedor','Ana','destino','Zapopan','tipo_destino','Local',
    'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones','[]'::jsonb,'color_id',col,'cantidad',1))));
  vid := (j->>'id')::bigint;
  insert into r(caso,ok) select 'venta sin cp queda pendiente', (select bool_and(x->>'cp' is null) from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=vid);
  begin perform public.inv_venta_cp(vid, '123'); insert into r(caso,ok) values('cp de 3 numeros se rechaza', false);
  exception when others then insert into r(caso,ok,detalle) values('cp de 3 numeros se rechaza', true, sqlerrm); end;
  perform public.inv_venta_cp(vid, '45 640');
  insert into r(caso,ok) select 'agregar cp despues (con espacio)', (select bool_and(x->>'cp'='45640') from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=vid);
  j := public.inv_venta_guardar(jsonb_build_object('remision','T-CP2','fecha','2026-11-26','vendedor','Ana','destino','Zapopan','tipo_destino','Local','cp','44100',
    'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones','[]'::jsonb,'color_id',col,'cantidad',1))));
  vid2 := (j->>'id')::bigint;
  insert into r(caso,ok) select 'venta con cp', (select bool_and(x->>'cp'='44100') from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=vid2);
  perform public.inv_venta_guardar(jsonb_build_object('id',vid2,'remision','T-CP2','fecha','2026-11-26','vendedor','Ana','destino','Zapopan','tipo_destino','Local','cp',''), 'prueba');
  insert into r(caso,ok) select 'corregir y borrar cp', (select bool_and(x->>'cp' is null) from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint=vid2);
  begin perform public.inv_venta_guardar(jsonb_build_object('remision','T-CP3','fecha','2026-11-26','vendedor','Ana','destino','Zapopan','cp','abc',
    'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones','[]'::jsonb,'color_id',col,'cantidad',1))));
    insert into r(caso,ok) values('cp invalido en venta se rechaza', false);
  exception when others then insert into r(caso,ok,detalle) values('cp invalido en venta se rechaza', true, sqlerrm); end;
  j := public.inv_contenedor_guardar(jsonb_build_object('numero','T-REP1','llegada','2026-11-26','renglones',
    jsonb_build_array(jsonb_build_object('modelo_id',1,'opciones','[]'::jsonb,'colores',jsonb_build_array(col),'cantidad',1))), null);
  cid := (j->>'id')::bigint;
  select (x->>'id')::bigint into ren from jsonb_array_elements(public.inv_contenedor(cid)->'renglones') x limit 1;
  perform public.inv_revision_guardar(cid, jsonb_build_object(
    'contados', jsonb_build_array(jsonb_build_object('renglon_id',ren,'colores',jsonb_build_array(jsonb_build_object('color_id',col,'contados',1)))),
    'piezas', jsonb_build_array(jsonb_build_object('pieza_id',pz,'esperadas',5,'llegaron',4,'danadas',3)),
    'defectos', jsonb_build_array(jsonb_build_object('pieza_id',pz,'defecto_id',tipo,'reparable',true,'cantidad',1),
                                  jsonb_build_object('pieza_id',pz,'defecto_id',tipo,'reparable',false,'cantidad',2))), null);
  insert into r(caso,ok) select 'inv_contenedor regresa reparable', count(*) filter (where x->>'reparable'='true')=1 and count(*) filter (where x->>'reparable'='false')=1
    from jsonb_array_elements(public.inv_contenedor(cid)->'defectos') x;
  insert into r(caso,ok) select 'inventario regresa reparable', (select bool_or(x->>'reparable'='true') from jsonb_array_elements(public.inv_inventario(null)->'danos') x);
  perform pg_temp.como('carlos@logistica.bma');
  begin perform public.inv_venta_cp(vid, '44100'); insert into r(caso,ok) values('lectura no cambia cp', false);
  exception when others then insert into r(caso,ok,detalle) values('lectura no cambia cp', true, sqlerrm); end;
end $$;
reset role;
select caso, ok, left(detalle,160) detalle from r order by n;
rollback;
