-- Pruebas de Showrooms (2026-11-27-showrooms.sql y 2026-11-27-showrooms-bodega.sql). Correr completas con execute_sql; terminan en rollback.
-- Usa un pedido inventado (no son datos reales).
begin;
insert into logistica.showroom_pedidos (almacen, texto, cantidad, odoo, incluye, excluye, m2_rollo)
values ('S-PRUEBA', 'Prueba', 3, 'Nada', '{}', '{}', null),
       ('S-PRUEBA', 'Prueba pasto', null, 'Pasto', array['P-%'], '{}', 50);

-- 1. La cuenta admin con ve_showrooms la ve; trae los dos pedidos de prueba, el primero sin producto en Odoo
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email like 'admin@logistica.bma'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r jsonb := public.inv_showrooms(); p jsonb;
begin
  if not (public.inv_sesion()->>'ve_showrooms')::boolean then raise exception 'FALLA 1: admin no ve showrooms'; end if;
  select x into p from jsonb_array_elements(r->'pedidos') x where x->>'texto' = 'Prueba';
  if (p->>'existe')::boolean or (p->>'hay')::numeric <> 0 then raise exception 'FALLA 1: pedido sin producto %', p; end if;
  select x into p from jsonb_array_elements(r->'pedidos') x where x->>'texto' = 'Prueba pasto';
  if not (p->>'rollo')::boolean or jsonb_array_length(p->'colores') <> 0 then raise exception 'FALLA 1: pasto %', p; end if;
  -- 3 columnas (27-nov-2026): cada pedido trae lo que hay en bodega y lo que pidió por color
  if not (p ? 'bodega' and p ? 'bodega1' and p ? 'bodega2' and p ? 'bodega_colores' and p ? 'pide_colores') then raise exception 'FALLA 1: faltan datos de bodega %', p; end if;
  if abs((p->>'bodega')::numeric - (p->>'bodega1')::numeric - (p->>'bodega2')::numeric) > 0.11 then raise exception 'FALLA 1: bodega no suma %', p; end if;
end $$;
reset role;

-- 2. Una cuenta admin sin ve_showrooms (grupobma) no la ve
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email like 'grupobma@logistica.bma'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if (public.inv_sesion()->>'ve_showrooms')::boolean then raise exception 'FALLA 2: grupobma ve showrooms'; end if;
  begin
    perform public.inv_showrooms();
    raise exception 'FALLA 2: grupobma pudo leer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. Nadie lee la tabla directo
set local role authenticated;
do $$
begin
  begin
    perform 1 from logistica.showroom_pedidos;
    raise exception 'FALLA 3: la tabla se lee directo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'todo bien' as resultado;
rollback;
