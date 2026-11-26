-- Pruebas de la sección lateral Reparación (26-nov-2026). Se corre completa con execute_sql; termina en rollback.
-- Necesita un vehículo en la etapa 'revision' de bodega1. Resultado esperado (26-nov-2026): los 6 casos en ok = true.
begin;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
create function pg_temp.como(p_email text) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; end $$;
do $$
declare j jsonb; hid bigint; esp boolean; falt bigint; pz bigint;
begin
  select id, especial into hid, esp from logistica.inv_vehiculos where etapa='revision' and bodega='bodega1' order by id limit 1;
  select id into falt from logistica.inv_defectos where nombre ilike 'faltante%' limit 1;
  select pieza_id into pz from logistica.inv_materiales limit 1;
  perform pg_temp.como('bodega1@logistica.bma');
  j := public.inv_vehiculo_avanzar(hid, jsonb_build_object('defectos', jsonb_build_array(jsonb_build_object('defecto_id',falt,'pieza_id',pz,'cantidad',2))));
  insert into r(caso,ok,detalle) values ('con faltante va a reparación', j->>'etapa'='reparacion', j::text);
  j := public.inv_vehiculo_regresar(hid);
  insert into r(caso,ok,detalle) values ('regresar de reparación a revisión', j->>'etapa'='revision', j->>'etapa');
  j := public.inv_vehiculo_avanzar(hid, jsonb_build_object('pasa', false, 'nota', 'Ruido en el motor'));
  insert into r(caso,ok,detalle) values ('no pasa con nota va a reparación', j->>'etapa'='reparacion', j->>'etapa');
  j := public.inv_vehiculo_avanzar(hid, '{}'::jsonb);
  insert into r(caso,ok,detalle) values ('ya quedó sigue a detallado/herrería', j->>'etapa' = case when esp then 'herreria' else 'detallado' end, j->>'etapa');
  j := public.inv_vehiculo_regresar(hid);
  insert into r(caso,ok,detalle) values ('regresar de detallado va a revisión', j->>'etapa' = case when esp then 'herreria' else 'revision' end, j->>'etapa');
  j := public.inv_vehiculo_avanzar(hid, jsonb_build_object('defectos','[]'::jsonb));
  insert into r(caso,ok,detalle) values ('pasa la revisión directo', j->>'etapa' in ('detallado','herreria'), j->>'etapa');
end $$;
reset role;
select caso, ok, left(detalle,160) detalle from r order by n;
rollback;
