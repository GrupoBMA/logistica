-- Pruebas de órdenes de showroom, número de serie al terminar Armado, etapas nuevas y plan de armado (26-nov-2026).
-- Se corre completa con execute_sql; no confirma nada (rollback al final). Necesita algo en espera de armado en bodega1.
-- Ojo: el folio de showroom (secuencia) no se deshace con rollback; después de correrla:
--   select setval('logistica.inv_showroom_folio', coalesce((select max(substr(remision, 4)::int) from logistica.inv_ventas where tipo = 'showroom'), 0) + 1, false);
-- Resultado esperado (26-nov-2026): todos los casos en ok = true.
begin;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
create function pg_temp.como(p_email text) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; end $$;
do $$
declare j jsonb; e record; vid bigint; uid bigint; hid bigint; cap jsonb;
begin
  select * into e from logistica.inv_espera('bodega1') where cantidad > 0 limit 1;
  insert into r(caso,ok,detalle) values ('hay algo en espera en bodega1', e.modelo_id is not null, coalesce(e.cantidad::text,'nada'));
  perform pg_temp.como('bodega1@logistica.bma');
  j := public.inv_venta_guardar(jsonb_build_object('tipo','showroom','fecha','2026-11-26',
    'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',e.modelo_id,'opciones',to_jsonb(e.opciones),'color_id',e.color_id,'cantidad',1))));
  vid := (j->>'id')::bigint;
  insert into r(caso,ok,detalle) values ('orden de showroom con folio SR', j->>'remision' like 'SR-%', j->>'remision');
  select (x->>'unidad_id')::bigint into uid from jsonb_array_elements(public.inv_ventas(null)) x where (x->>'id')::bigint = vid;
  begin perform public.inv_venta_guardar(jsonb_build_object('tipo','cliente','fecha','2026-11-26','vendedor','A','destino','B',
      'vehiculos', jsonb_build_array(jsonb_build_object('modelo_id',e.modelo_id,'opciones',to_jsonb(e.opciones),'color_id',e.color_id,'cantidad',1))));
    insert into r(caso,ok) values ('cliente sin remisión se rechaza', false);
  exception when others then insert into r(caso,ok,detalle) values ('cliente sin remisión se rechaza', true, sqlerrm); end;
  perform public.inv_plan_poner(uid, current_date);
  j := public.inv_plan(null, null);
  insert into r(caso,ok,detalle) select 'plan de la semana lo trae', bool_or((x->>'unidad_id')::bigint = uid and (x->>'armado')::boolean = false), j->>'semana' from jsonb_array_elements(j->'items') x;
  begin perform public.inv_plan_poner(uid, current_date - 14); insert into r(caso,ok) values ('no se planea en semana pasada', false);
  exception when others then insert into r(caso,ok,detalle) values ('no se planea en semana pasada', true, sqlerrm); end;
  cap := public.inv_capacidad(null);
  insert into r(caso,ok) values ('capacidad responde', jsonb_typeof(cap)='array');
  j := public.inv_produccion_entrar(jsonb_build_object('unidad_id', uid)); hid := (j->>'id')::bigint;
  insert into r(caso,ok) values ('entra a producción sin serie', hid is not null);
  begin perform public.inv_vehiculo_avanzar(hid, '{}'::jsonb); insert into r(caso,ok) values ('terminar armado pide serie', false);
  exception when others then insert into r(caso,ok,detalle) values ('terminar armado pide serie', true, sqlerrm); end;
  j := public.inv_vehiculo_avanzar(hid, jsonb_build_object('serie','PRUEBA-ZZ-1'));
  insert into r(caso,ok,detalle) values ('con serie pasa a revision', j->>'etapa' = 'revision', j->>'etapa');
  insert into r(caso,ok) select 'plan lo marca armado', bool_or((x->>'unidad_id')::bigint = uid and (x->>'armado')::boolean) from jsonb_array_elements(public.inv_plan(null, null)->'items') x;
  j := public.inv_vehiculo_avanzar(hid, jsonb_build_object('defectos','[]'::jsonb));
  insert into r(caso,ok,detalle) values ('revision → detallado (normal)', j->>'etapa' = 'detallado', j->>'etapa');
  j := public.inv_vehiculo_regresar(hid);
  insert into r(caso,ok,detalle) values ('regresar de detallado → revision', j->>'etapa' = 'revision', j->>'etapa');
  perform public.inv_plan_quitar(uid);
  insert into r(caso,ok) select 'quitar del plan', not exists (select 1 from jsonb_array_elements(public.inv_plan(null,null)->'items') x where (x->>'unidad_id')::bigint = uid);
end $$;
reset role;
select caso, ok, left(detalle,180) detalle from r order by n;
rollback;
