-- Pruebas del inventario (fase 1). Se corren completas con execute_sql de Supabase.
-- Todo va en una transacción que termina en ROLLBACK: no deja nada guardado.
-- Cada caso suplanta una cuenta real (sin contraseña) con request.jwt.claims + role authenticated.
-- Resultado: una fila por caso con ok = true/false.
begin;

create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on sequence r_n_seq to authenticated, anon;

-- Entrar como una cuenta (por correo) o regresar a postgres
create function pg_temp.como(p_email text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.yo() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function pg_temp.anota(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as
$$ insert into r (caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle) $$;

do $$
declare
  m150 bigint; azul bigint; rojo bigint; con_h bigint; sencillo bigint;
  c1 bigint; c2 bigint; c3 bigint; ren bigint; pz bigint; an bigint; df bigint;
  j jsonb; v text; n int;
begin
  select id into m150 from logistica.inv_modelos where nombre = 'MC 150';
  select id into azul from logistica.inv_colores where nombre = 'Azul';
  select id into rojo from logistica.inv_colores where nombre = 'Rojo';
  select o.id into con_h from logistica.inv_opciones o join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
    where c.nombre = 'Hidráulico' and o.nombre = 'Con';
  select o.id into sencillo from logistica.inv_opciones o join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
    where c.nombre = 'Rodado' and o.nombre = 'Sencillo';
  perform pg_temp.anota('catálogo inicial cargado', m150 is not null and azul is not null and con_h is not null and sencillo is not null);

  -- 1. La bodega no puede guardar en otra bodega
  perform pg_temp.como('bodega1@logistica.bma');
  j := public.inv_contenedor_guardar(jsonb_build_object('bodega','bodega2','numero',' prueba-x1 ','llegada','2026-11-18',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(con_h,sencillo),'colores',jsonb_build_array(azul,rojo),'cantidad',2))));
  c1 := (j->>'id')::bigint;
  perform pg_temp.yo();
  select bodega into v from logistica.inv_contenedores where id = c1;
  perform pg_temp.anota('bodega1 guarda en su bodega aunque mande otra', v = 'bodega1', v);

  -- 2. La bodega no ve lo de la otra
  perform pg_temp.como('bodega2@logistica.bma');
  j := public.inv_contenedor_guardar(jsonb_build_object('numero','prueba-x2','llegada','2026-11-18',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(),'colores',jsonb_build_array(rojo),'cantidad',1))));
  c2 := (j->>'id')::bigint;
  perform pg_temp.como('bodega1@logistica.bma');
  j := public.inv_contenedores('bodega2');
  perform pg_temp.anota('bodega1 no ve contenedores de bodega2',
    not exists (select 1 from jsonb_array_elements(j) x where (x->>'id')::bigint = c2)
    and exists (select 1 from jsonb_array_elements(j) x where (x->>'id')::bigint = c1));

  -- 3. Número repetido (sin importar espacios ni mayúsculas, aunque sea otra bodega)
  perform pg_temp.como('bodega2@logistica.bma');
  begin
    perform public.inv_contenedor_guardar(jsonb_build_object('numero','PRUEBA-X1','llegada','2026-11-18',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(),'colores',jsonb_build_array(rojo),'cantidad',1))));
    perform pg_temp.anota('número repetido se rechaza', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('número repetido se rechaza', sqlerrm = 'Ese contenedor ya está registrado', sqlerrm);
  end;

  -- 4. Carlos (lectura) no guarda pero sí consulta
  perform pg_temp.como('carlos@logistica.bma');
  begin
    perform public.inv_contenedor_guardar(jsonb_build_object('bodega','bodega1','numero','prueba-x3','llegada','2026-11-18','renglones','[]'::jsonb));
    perform pg_temp.anota('carlos no puede guardar', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('carlos no puede guardar', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
  begin
    j := public.inv_inventario();
    perform pg_temp.anota('carlos consulta el inventario', j ? 'piezas' and j ? 'espera');
  exception when others then
    perform pg_temp.anota('carlos consulta el inventario', false, sqlerrm);
  end;

  -- 5. La bodega no toca catálogos
  perform pg_temp.como('bodega1@logistica.bma');
  begin
    perform public.inv_catalogo_guardar('colores', '{"nombre":"Morado"}');
    perform pg_temp.anota('bodega no edita catálogos', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('bodega no edita catálogos', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  -- 6. Editar pide motivo y queda en la bitácora
  begin
    perform public.inv_contenedor_guardar(jsonb_build_object('id',c1,'numero','prueba-x1','llegada','2026-11-17',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(con_h,sencillo),'colores',jsonb_build_array(azul,rojo),'cantidad',3))));
    perform pg_temp.anota('editar sin motivo se rechaza', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('editar sin motivo se rechaza', sqlerrm = 'Escribe el motivo del cambio', sqlerrm);
  end;
  perform public.inv_contenedor_guardar(jsonb_build_object('id',c1,'numero','prueba-x1','llegada','2026-11-17',
      'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(con_h,sencillo),'colores',jsonb_build_array(azul,rojo),'cantidad',3))),
      'Error al contar');
  perform pg_temp.yo();
  select count(*) into n from logistica.inv_bitacora where tabla = 'contenedores' and registro = c1 and accion = 'edicion' and motivo = 'Error al contar';
  perform pg_temp.anota('la edición queda en la bitácora', n = 1, n::text);

  -- 7. Revisión: no más dañadas que las que llegaron
  insert into logistica.inv_piezas (nombre, lleva_color) values ('Pieza de prueba', false) returning id into pz;
  select id into ren from logistica.inv_renglones where contenedor_id = c1 limit 1;
  perform pg_temp.como('bodega1@logistica.bma');
  begin
    perform public.inv_revision_guardar(c1, jsonb_build_object('contados', jsonb_build_array(jsonb_build_object('renglon_id',ren,'colores',jsonb_build_array(jsonb_build_object('color_id',azul,'contados',2),jsonb_build_object('color_id',rojo,'contados',1)))),
      'piezas', jsonb_build_array(jsonb_build_object('pieza_id',pz,'color_id',null,'esperadas',6,'llegaron',2,'danadas',3)),
      'defectos', '[]'::jsonb));
    perform pg_temp.anota('dañadas > llegaron se rechaza', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('dañadas > llegaron se rechaza', true, sqlerrm);
  end;

  -- 8. Revisado cuenta en el inventario; anulado ya no
  perform public.inv_revision_guardar(c1, jsonb_build_object('contados', jsonb_build_array(jsonb_build_object('renglon_id',ren,'colores',jsonb_build_array(jsonb_build_object('color_id',azul,'contados',2),jsonb_build_object('color_id',rojo,'contados',1)))),
    'piezas', jsonb_build_array(jsonb_build_object('pieza_id',pz,'color_id',null,'esperadas',6,'llegaron',5,'danadas',1)),
    'defectos', '[]'::jsonb));
  j := public.inv_inventario();
  perform pg_temp.anota('revisado cuenta en piezas',
    exists (select 1 from jsonb_array_elements(j->'piezas') x where x->>'pieza' = 'Pieza de prueba'
            and (x->>'disponibles')::int = 4 and (x->>'danadas')::int = 1), j->>'piezas');
  perform pg_temp.anota('revisado cuenta en espera de armado',
    (select coalesce(sum((x->>'cantidad')::int),0) from jsonb_array_elements(j->'espera') x where x->>'modelo' = 'MC 150') = 3, j->>'espera');

  perform pg_temp.anota('espera de armado separa por color',
    exists (select 1 from jsonb_array_elements(j->'espera') x where x->>'color' = 'Azul' and (x->>'cantidad')::int = 2)
    and exists (select 1 from jsonb_array_elements(j->'espera') x where x->>'color' = 'Rojo' and (x->>'cantidad')::int = 1), j->>'espera');
  perform pg_temp.yo();
  select contados into n from logistica.inv_renglones where id = ren;
  perform pg_temp.anota('el renglón guarda la suma de colores', n = 3, n::text);

  -- 8b. Daños del contenedor (sin pieza): se guardan y la lista los cuenta
  select id into df from logistica.inv_defectos order by id limit 1;
  perform pg_temp.como('bodega1@logistica.bma');
  perform public.inv_revision_guardar(c1, jsonb_build_object('contados', jsonb_build_array(jsonb_build_object('renglon_id',ren,'colores',jsonb_build_array(jsonb_build_object('color_id',azul,'contados',2),jsonb_build_object('color_id',rojo,'contados',1)))),
    'piezas', '[]'::jsonb,
    'defectos', jsonb_build_array(jsonb_build_object('pieza_id',null,'color_id',null,'defecto_id',df,'gravedad','grave','cantidad',2),
                                  jsonb_build_object('pieza_id',null,'color_id',null,'defecto_id',df,'gravedad','leve','cantidad',1))), 'Daños');
  j := public.inv_contenedores();
  perform pg_temp.anota('la lista cuenta los daños del contenedor',
    (select (x->>'danos')::int from jsonb_array_elements(j) x where (x->>'id')::bigint = c1) = 3, j::text);
  begin
    perform public.inv_revision_guardar(c1, jsonb_build_object('contados', jsonb_build_array(jsonb_build_object('renglon_id',ren,'colores',jsonb_build_array(jsonb_build_object('color_id',azul,'contados',3)))),
      'defectos', jsonb_build_array(jsonb_build_object('defecto_id',df,'gravedad','grave','cantidad',0))), 'x');
    perform pg_temp.anota('daño con cantidad 0 se rechaza', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('daño con cantidad 0 se rechaza', sqlerrm = 'La cantidad de cada daño debe ser 1 o más', sqlerrm);
  end;
  perform pg_temp.como('bodega1@logistica.bma');
  begin
    perform public.inv_contenedor_guardar(jsonb_build_object('numero','prueba-x4','llegada','2026-11-18',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(),'colores','[]'::jsonb,'cantidad',1))));
    perform pg_temp.anota('sin colores se rechaza', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('sin colores se rechaza', sqlerrm = 'Escoge al menos un color', sqlerrm);
  end;

  j := public.inv_anulacion_pedir(c1, 'Contenedor de prueba');
  an := (j->>'id')::bigint;
  begin
    perform public.inv_anulacion_resolver(an, true);
    perform pg_temp.anota('bodega no autoriza anulaciones', false, 'se autorizó');
  exception when others then
    perform pg_temp.anota('bodega no autoriza anulaciones', sqlstate = '42501', sqlerrm);
  end;
  perform pg_temp.como('admin@logistica.bma');
  perform public.inv_anulacion_resolver(an, true);
  j := public.inv_inventario('bodega1');
  perform pg_temp.anota('anulado deja de contar',
    not exists (select 1 from jsonb_array_elements(j->'piezas') x where x->>'pieza' = 'Pieza de prueba' and (x->>'disponibles')::int > 0), j::text);
  perform pg_temp.como('bodega1@logistica.bma');
  begin
    perform public.inv_contenedor_guardar(jsonb_build_object('id',c1,'numero','prueba-x1','llegada','2026-11-17',
        'renglones', jsonb_build_array(jsonb_build_object('modelo_id',m150,'opciones',jsonb_build_array(),'colores',jsonb_build_array(azul),'cantidad',1))), 'otra vez');
    perform pg_temp.anota('anulado no se edita', false, 'se guardó');
  exception when others then
    perform pg_temp.anota('anulado no se edita', sqlerrm = 'Este contenedor está anulado', sqlerrm);
  end;

  -- 9. Admin ve la bitácora; bodega no
  perform pg_temp.como('admin@logistica.bma');
  j := public.inv_bitacora(true);
  perform pg_temp.anota('admin ve cambios pendientes', jsonb_array_length(j) >= 3, jsonb_array_length(j)::text);
  perform pg_temp.como('bodega1@logistica.bma');
  begin
    perform public.inv_bitacora(true);
    perform pg_temp.anota('bodega no ve la bitácora', false, 'la vio');
  exception when others then
    perform pg_temp.anota('bodega no ve la bitácora', sqlstate = '42501', sqlerrm);
  end;

  -- 10. anon no entra
  perform pg_temp.yo();
  execute 'set local role anon';
  begin
    perform public.inv_catalogo();
    perform pg_temp.anota('anon no puede llamar funciones', false, 'entró');
  exception when others then
    perform pg_temp.anota('anon no puede llamar funciones', true, sqlerrm);
  end;
  perform pg_temp.yo();
exception when others then
  perform pg_temp.yo();
  perform pg_temp.anota('ERROR inesperado', false, sqlstate || ' ' || sqlerrm);
end $$;

select caso, ok, detalle from r order by n;
rollback;
