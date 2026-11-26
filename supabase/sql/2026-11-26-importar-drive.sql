-- 26-nov-2026: importar la hoja Ventas del Drive (logistica.entregas, hoja = 'ventas') como si se hubiera capturado en la app.
-- Se corre a mano (no la llama la app): select logistica.inv_importar_drive(false)  -> solo el reporte, no guarda
--                                       select logistica.inv_importar_drive(true)   -> guarda
-- Reglas acordadas con el usuario:
--  * Vehículo: se lee del texto (A/C, DR, PK, CAB, SIN/HIDR, CON/HIDR, CAB/CERRADA, PTAS, GARRAFONERO/48, BCO…) con inv_leer_vehiculo.
--  * Pasos AR, H, F, P, R (OK = hecho, X = está en ese paso): R OK = Listo; R X o P OK = Revisión final; P X o F OK = Detallado y pintura;
--    F X o H OK = Forrado; H X = Herrería; AR OK = Revisión, mecánica y activación; AR X = Armado; sin pasos = orden sin vehículo.
--    El Excel no tiene mecánica y activación: todo lo que ya pasó de Revisión queda "pendiente de mecánica y activación".
--  * Sin pasos: Por armar, salvo los que tienen color en la columna del vehículo (Esperando piezas, la misma regla de logica.js).
--  * Sucursal de venta por vendedor (logistica.inv_vendedor_sucursal, sacada de Administración; los que faltan los da el usuario).
--    La orden se junta por sucursal + remisión (sin "/1", "/2") + vendedor.
--  * Bodega por ACTIVACION (S. Cruz = Bodega 1, Bodega 2). No descuenta piezas (producción separada del inventario).

create table if not exists logistica.inv_vendedor_sucursal (
  vendedor text primary key,
  sucursal text not null check (sucursal in ('AGS','GDL','MAZ','MLM','PUE','QRO','TEP','ZAP','NAU','LPZ','TIJ')));
alter table logistica.inv_vendedor_sucursal enable row level security;
-- Los vendedores y su sucursal se cargan directo en Supabase (nombres de personas: no van en el repo, que es público).
-- Se sacaron de Administración (bma.personas); los que faltan los da el usuario.

-- Lee el texto del vehículo del Drive -> modelo, opciones de fábrica, aditamentos, color y dudas
create or replace function logistica.inv_leer_vehiculo(p_texto text) returns jsonb
 language plpgsql stable set search_path to ''
as $function$
declare t text := ' ' || upper(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) || ' ';
  mo text; cab text; atr text; hid text; tip text; caja text; tol text; cach boolean := false; col text; g text;
  dudas text[] := '{}'; ops bigint[] := '{}'; adit bigint[] := '{}'; mid bigint; cid bigint; x text;
begin
  t := regexp_replace(t, '^\s*\d+\s+', ' ');
  if t ~ 'MOTO ?TAXI' then mo := case when t ~ 'ELECTRIC' then 'Mototaxi eléctrico' when t ~ '125' then 'Mototaxi 125' else 'Mototaxi 200' end;
  elsif t ~ '350' then mo := 'MC 350';
  elsif t ~ 'M ?C ?-?\s*200|\m200 ?CC' then mo := 'MC 200';
  elsif t ~ 'M ?C ?-?\s*150|\m150 ?CC|\m15O' then mo := 'MC 150';
  elsif t ~ 'M ?C ?-?\s*300|\m300 ?CC|\mDR\M' then mo := 'MC 300';
  else dudas := dudas || 'No se reconoce el modelo'::text; end if;

  if mo like 'MC%' or mo = 'Mototaxi 200' then
    if t ~ 'CERRADA|CERADA' and mo = 'MC 300' then cab := 'Cabina cerrada';
    elsif t ~ 'SIN[ /]*CAB' then cab := 'Sin cabina';
    elsif t ~ '\mPLUS\M' and mo in ('MC 150','MC 200') then cab := 'Plus';
    elsif t ~ '\mCAB(INA)?\M|\mCAB\.|\mCBA\M|C/CAB' then cab := 'Con cabina';
    else cab := 'Sin cabina'; end if;
  end if;
  if mo like 'MC%' then atr := case when t ~ 'CHASIS' then 'En chasis' else 'Pick up' end; end if;
  if mo = 'MC 300' then hid := case when t ~ 'CON[ /]*HID' then 'Sí' else 'No' end; end if;
  if mo = 'Mototaxi 200' then
    tip := case when t ~ 'ANGELA' then 'Angela' when t ~ 'DONG ?YAN' then 'Dongyan' when t ~ '\mMINI\M' then 'Mini' else 'Normal' end;
  end if;

  if mo like 'MC%' then
    if t ~ 'CAJA SECA|C/SECA' then caja := case when t ~ '3 ?PTA|3 ?PUERTA|3ER ?PTA' then 'Caja seca 3 puertas' else 'Caja seca 2 puertas' end;
    elsif t ~ 'CAJA VENTA|C/VENTA' then caja := 'Caja venta';
    elsif t ~ 'FOOD' then caja := 'Food truck';
    elsif t ~ 'PIPA' then caja := 'Pipa 1000 L';
    elsif t ~ 'GARRAFON' then
      g := substring(t from 'GARRAFONER[OA]S?\D{0,14}(18|30|36|48|70)');
      if g is null then g := substring(t from '(18|30|36|48|70)\s*(PZ|PIEZ)'); end if;
      caja := 'Garrafonero ' || coalesce(g, case mo when 'MC 150' then '18' when 'MC 200' then '30' when 'MC 350' then '70'
                                                else case when cab = 'Cabina cerrada' then '36' else '48' end end);
    end if;
    if t ~ '(C/|CON |Y )CACHUCHA' then cach := true; end if;
  end if;
  if t ~ 'TOLDO' then tol := case when t ~ 'TOLDO CORTO' then 'Toldo corto' else 'Toldo' end; end if;

  if cach and cab in ('Con cabina', 'Plus', 'Cabina cerrada') then
    dudas := dudas || ('Dice cachucha y ' || lower(cab) || ': se quitó la cachucha'); cach := false;
  end if;
  if hid = 'Sí' and (atr = 'En chasis' or cab = 'Cabina cerrada') then
    dudas := dudas || 'Dice hidráulico con algo que no lo lleva: se dejó sin hidráulico'::text; hid := 'No';
  end if;
  if caja = 'Pipa 1000 L' and cab = 'Cabina cerrada' then dudas := dudas || 'Pipa con cabina cerrada: se quitó la pipa'::text; caja := null; end if;
  if caja = 'Food truck' and mo not in ('MC 200', 'MC 300') then dudas := dudas || ('Food truck en ' || mo || ': se quitó'); caja := null; end if;

  col := case when t ~ 'BLANC|\mBCO\M|\mBCO\.|\mBCA\M|BLNCO' then 'Blanco' when t ~ 'AZUL' then 'Azul' when t ~ 'TINTO' then 'Tinto'
              when t ~ '\mROJ' then 'Rojo' when t ~ 'NEGR' then 'Negro' when t ~ 'PLATA' then 'Plata' when t ~ 'VERDE' then 'Verde'
              when t ~ 'NARANJ' then 'Naranja' when t ~ 'AMARILL|\mAMAR\M' then 'Amarillo' when t ~ '\mROSA' then 'Rosa' end;
  if col is null then dudas := dudas || 'No dice el color'::text; end if;

  select id into mid from logistica.inv_modelos where nombre = mo;
  select id into cid from logistica.inv_colores where nombre = col;
  foreach x in array array['Cabina|' || coalesce(cab, ''), 'Atrás|' || coalesce(atr, ''), 'Hidráulico|' || coalesce(hid, ''), 'Tipo|' || coalesce(tip, '')] loop
    if split_part(x, '|', 2) <> '' then
      ops := ops || (select o.id from logistica.inv_opciones o join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
                     where c.nombre = split_part(x, '|', 1) and o.nombre = split_part(x, '|', 2));
    end if;
  end loop;
  foreach x in array array['Caja|' || coalesce(caja, ''), 'Toldo|' || coalesce(tol, ''), 'Cachucha|' || case when cach then 'Cachucha' else '' end] loop
    if split_part(x, '|', 2) <> '' then
      adit := adit || (select o.id from logistica.inv_opciones o join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
                       where c.nombre = split_part(x, '|', 1) and o.nombre = split_part(x, '|', 2));
    end if;
  end loop;
  return jsonb_build_object('modelo', mo, 'cabina', cab, 'atras', atr, 'hidraulico', hid, 'tipo', tip, 'caja', caja, 'toldo', tol, 'cachucha', cach,
    'color', col, 'modelo_id', mid, 'color_id', cid, 'opciones', to_jsonb(logistica.inv_ordenar(ops)), 'aditamentos', to_jsonb(adit), 'dudas', to_jsonb(dudas));
end $function$;

create or replace function logistica.inv_importar_drive(p_guardar boolean default false) returns jsonb
 language plpgsql set search_path to ''
as $function$
declare g record; r record; v_id bigint; v_un bigint; v_n int; v_rep jsonb; v_ok boolean; v_err text; v_et text; v_esp boolean; v_que text;
  v_dudas jsonb := '[]'; v_salta jsonb := '[]'; v_ordenes int := 0; v_veh int := 0;
begin
  drop table if exists pg_temp.imp;
  create temp table imp on commit drop as
  select e.id, btrim(coalesce(e.vendedor, '')) as vendedor, btrim(coalesce(e.remision, '')) as remision,
    btrim(split_part(btrim(coalesce(e.remision, '')), '/', 1)) as base,
    coalesce(nullif(regexp_replace(split_part(btrim(coalesce(e.remision, '')), '/', 2), '\D', '', 'g'), '')::int, 1) as parte_drive,
    e.fecha, e.destino, e.tipo_destino, e.activacion, e.costo_envio, e.color_costo, e.fletero, e.eta, e.faltante, e.vehiculo,
    lower(btrim(coalesce(e.armado, ''))) ar, lower(btrim(coalesce(e.herreria, ''))) he, lower(btrim(coalesce(e.forrado, ''))) fo,
    lower(btrim(coalesce(e.pintura, ''))) pi, lower(btrim(coalesce(e.revision, ''))) re,
    (e.color_vehiculo is not null and e.color_vehiculo <> '' and e.color_vehiculo <> 'theme0') as esperando,
    logistica.inv_leer_vehiculo(e.vehiculo) as v,
    (select vs.sucursal from logistica.inv_vendedor_sucursal vs where upper(vs.vendedor) = upper(btrim(e.vendedor))) as sucursal,
    case when e.activacion ilike '%2%' then 'bodega2' else 'bodega1' end as bodega,
    null::text as etapa, '{}'::text[] as problemas
  from logistica.entregas e
  where e.hoja = 'ventas' and coalesce(btrim(e.vehiculo), '') <> '';

  update imp set etapa = case
    when re = 'ok' then 'listo' when re = 'x' then 'revision_final'
    when pi = 'ok' then 'revision_final' when pi = 'x' then 'detallado'
    when fo = 'ok' then 'detallado' when fo = 'x' then 'forrado'
    when he = 'ok' then 'forrado' when he = 'x' then 'herreria'
    when ar = 'ok' then 'revision' when ar = 'x' then 'armado' end;

  -- Lo que no se puede importar tal cual
  for r in select * from imp loop
    v_err := null;
    if r.v->>'modelo_id' is null then v_err := 'No se reconoce el modelo';
    elsif r.v->>'color_id' is null then v_err := 'No dice el color';
    else
      begin
        perform logistica.inv_validar_vehiculo((r.v->>'modelo_id')::bigint,
          array(select e::bigint from jsonb_array_elements_text(r.v->'opciones') e),
          array(select e::bigint from jsonb_array_elements_text(r.v->'aditamentos') e), true);
      exception when others then v_err := sqlerrm; end;
    end if;
    if r.sucursal is null then v_err := concat_ws(' · ', v_err, 'El vendedor no tiene sucursal'); end if;
    if r.fecha is null then update imp set problemas = problemas || 'Sin fecha: se puso la de hoy'::text where id = r.id; end if;
    if v_err is not null then
      v_salta := v_salta || jsonb_build_object('remision', r.remision, 'vendedor', r.vendedor, 'texto', r.vehiculo, 'por_que', v_err);
    elsif jsonb_array_length(r.v->'dudas') > 0 or r.fecha is null then
      v_dudas := v_dudas || jsonb_build_object('remision', r.remision, 'vendedor', r.vendedor, 'texto', r.vehiculo,
        'dudas', (r.v->'dudas') || to_jsonb(array(select unnest(p) from (select problemas p from imp where id = r.id) z)));
    end if;
    if v_err is not null then delete from imp where id = r.id; end if;
  end loop;

  -- Dos vendedores con la misma remisión en la misma sucursal
  for g in select sucursal, upper(base) b, count(distinct upper(vendedor)) nv from imp group by 1, 2 having count(distinct upper(vendedor)) > 1 loop
    v_salta := v_salta || (select jsonb_agg(jsonb_build_object('remision', i.remision, 'vendedor', i.vendedor, 'texto', i.vehiculo,
      'por_que', 'Misma remisión en ' || g.sucursal || ' con otro vendedor')) from imp i where i.sucursal = g.sucursal and upper(i.base) = g.b);
    delete from imp where sucursal = g.sucursal and upper(base) = g.b;
  end loop;

  v_rep := jsonb_build_object(
    'renglones_drive', (select count(*) from logistica.entregas where hoja = 'ventas' and coalesce(btrim(vehiculo), '') <> ''),
    'se_importan', (select count(*) from imp),
    'ordenes', (select count(distinct (sucursal, upper(base), upper(vendedor))) from imp),
    'por_armar', (select count(*) from imp where etapa is null and not esperando),
    'esperando_piezas', (select count(*) from imp where etapa is null and esperando),
    'en_produccion', (select coalesce(jsonb_object_agg(etapa, n), '{}') from (select etapa, count(*) n from imp where etapa is not null group by 1) z),
    'pendiente_mecanica', (select count(*) from imp where etapa is not null and etapa not in ('armado', 'revision')),
    'especiales', (select count(*) from imp where jsonb_array_length(v->'aditamentos') > 0 or etapa in ('herreria', 'forrado')),
    'con_faltante', (select count(*) from imp where coalesce(btrim(faltante), '') <> ''),
    'por_bodega', (select jsonb_object_agg(bodega, n) from (select bodega, count(*) n from imp group by 1) z),
    'no_se_importan', v_salta, 'dudas', v_dudas);
  v_rep := v_rep || jsonb_build_object('por_modelo', (select jsonb_object_agg(m, n) from (select v->>'modelo' m, count(*) n from imp group by 1) z));

  if not p_guardar then return v_rep; end if;

  for g in select sucursal, upper(base) b, upper(vendedor) vend, min(base) base, min(vendedor) vendedor, min(bodega) bodega,
             coalesce(min(fecha), current_date) fecha, min(destino) destino, min(tipo_destino) tipo_destino, sum(costo_envio) costo,
             min(color_costo) color_costo, min(fletero) fletero, min(eta) eta
           from imp group by 1, 2, 3 loop
    insert into logistica.inv_ventas (bodega, remision, fecha, vendedor, destino, tipo_destino, tipo, sucursal, costo_envio, pago, fletero, eta)
    values (g.bodega, g.base, g.fecha, g.vendedor, coalesce(nullif(btrim(g.destino), ''), '?'),
      case when g.tipo_destino ilike 'for%' then 'Foráneo' when g.tipo_destino ilike 'semi%' then 'Semi Local' when g.tipo_destino ilike 'local%' then 'Local'
           when g.tipo_destino ilike 'sucursal%' then 'Sucursal' end,
      'cliente', g.sucursal, g.costo,
      case when upper(g.color_costo) like '%00FF00%' then 'liquidado' when upper(g.color_costo) like '%FF0000%' then 'anticipo' end,
      nullif(btrim(g.fletero), ''), nullif(btrim(g.eta), ''))
    returning id into v_id;
    v_ordenes := v_ordenes + 1; v_n := 0;
    for r in select * from imp where sucursal is not distinct from g.sucursal and upper(base) = g.b and upper(vendedor) = g.vend order by parte_drive, id loop
      v_n := v_n + 1;
      v_esp := jsonb_array_length(r.v->'aditamentos') > 0;
      select nullif(string_agg(o.nombre, ' · ' order by c.orden), '') into v_que from logistica.inv_opciones o
        join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
        where o.id in (select e::bigint from jsonb_array_elements_text(r.v->'aditamentos') e);
      insert into logistica.inv_venta_unidades (venta_id, parte, modelo_id, opciones, color_id, especial, especial_que, aditamentos, esperando, faltante, origen)
      values (v_id, v_n, (r.v->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(r.v->'opciones') e), (r.v->>'color_id')::bigint,
        v_esp, v_que, array(select e::bigint from jsonb_array_elements_text(r.v->'aditamentos') e),
        r.etapa is null and r.esperando, nullif(btrim(coalesce(r.faltante, '')), ''), r.vehiculo)
      returning id into v_un;
      if r.etapa is not null then
        insert into logistica.inv_vehiculos (bodega, serie, modelo_id, opciones, color_id, para, venta_id, unidad_id, especial, etapa,
          mecanica_pendiente, importado)
        values (r.bodega, null, (r.v->>'modelo_id')::bigint, array(select e::bigint from jsonb_array_elements_text(r.v->'opciones') e),
          (r.v->>'color_id')::bigint, 'venta', v_id, v_un, v_esp or r.etapa in ('herreria', 'forrado'), r.etapa,
          r.etapa not in ('armado', 'revision'), true)
        returning id into v_et;
        insert into logistica.inv_vehiculo_etapas (vehiculo_id, etapa, accion, nota) values (v_et::bigint, r.etapa, 'importado', 'Importado del Drive');
        v_veh := v_veh + 1;
      end if;
    end loop;
  end loop;
  return v_rep || jsonb_build_object('guardado', true, 'ordenes_guardadas', v_ordenes, 'vehiculos_en_linea', v_veh);
end $function$;
revoke all on function logistica.inv_importar_drive(boolean), logistica.inv_leer_vehiculo(text) from public, anon, authenticated;
