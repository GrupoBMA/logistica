-- Showrooms contra Odoo (27-nov-2026, pedido del usuario).
-- Lo que pidió cada sucursal para su showroom, comparado con lo que tiene hoy en Odoo y lo que vendió en 30 días.
-- Odoo vive en el esquema bma (copia nocturna de la app de administración); aquí solo se lee.
-- Los pedidos reales NO van en este repo (es público): se cargan directo en la base.

alter table logistica.usuarios add column if not exists ve_showrooms boolean not null default false;

create table if not exists logistica.showroom_pedidos (
  id bigint generated always as identity primary key,
  almacen text not null,               -- almacén de Odoo de la sucursal (S-QRO, S-WAS = Guadalajara…)
  orden int not null default 0,
  texto text not null,                 -- lo que pidió la sucursal, en sus palabras
  cantidad int,                        -- null: no dijo cuántas
  odoo text not null,                  -- cómo se llama en Odoo lo que se compara ("ATV 125 Spider (sin reversa)")
  incluye text[] not null default '{}',-- patrones LIKE sobre la clave del producto en Odoo; vacío = no existe en Odoo
  excluye text[] not null default '{}',
  m2_rollo numeric,                    -- pasto: m² de un rollo (2 m × 25 = 50; 4 m × 25 = 100); null = piezas
  nota text,
  creado timestamptz not null default now()
);
alter table logistica.showroom_pedidos enable row level security;
revoke all on logistica.showroom_pedidos from anon, authenticated;

-- inv_sesion dice si la cuenta ve Showrooms
create or replace function public.inv_sesion() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  return jsonb_build_object('rol', u.rol, 'bodega', u.bodega, 've_showrooms', u.rol = 'admin' and u.ve_showrooms);
end $$;

create or replace function public.inv_showrooms() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare u logistica.usuarios := logistica.inv_yo();
begin
  if not (u.rol = 'admin' and u.ve_showrooms) then
    raise exception 'Esta cuenta no tiene acceso a Showrooms' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'copia', (select max(c.fin) from bma.odoo_copias c),
    'almacenes', coalesce((select jsonb_object_agg(a.codigo, a.nombre) from bma.odoo_almacenes a), '{}'),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'almacen', p.almacen, 'texto', p.texto, 'cantidad', p.cantidad, 'odoo', p.odoo, 'nota', p.nota,
        'existe', cardinality(p.incluye) > 0, 'rollo', p.m2_rollo is not null,
        'hay', round(coalesce(x.hay, 0) / coalesce(p.m2_rollo, 1), 1),
        'vendio', round(coalesce(v.vendio, 0) / coalesce(p.m2_rollo, 1), 1),
        'colores', case when p.m2_rollo is null then coalesce(x.colores, '[]') else '[]' end
      ) order by p.almacen, p.orden, p.id)
      from logistica.showroom_pedidos p
      left join lateral (
        select sum(c.n) hay, jsonb_agg(jsonb_build_object('color', c.color, 'n', c.n) order by c.n desc, c.color) colores
        from (
          select coalesce(initcap(substring(pr.nombre from '\(([^()]*)\)\s*$')), pr.codigo) color, sum(e.cantidad) n
          from bma.odoo_existencias e join bma.odoo_productos pr on pr.id = e.producto_id
          where e.hasta is null and e.almacen = p.almacen
            and pr.codigo like any (p.incluye) and not (pr.codigo like any (p.excluye))
          group by 1 having sum(e.cantidad) > 0
        ) c
      ) x on true
      left join lateral (
        select sum(m.cantidad) vendio
        from bma.odoo_movimientos m join bma.odoo_productos pr on pr.id = m.producto_id
        where m.de_almacen = p.almacen and m.a_uso = 'customer' and m.fecha >= now() - interval '30 days'
          and pr.codigo like any (p.incluye) and not (pr.codigo like any (p.excluye))
      ) v on true
    ), '[]'));
end $$;

revoke all on function public.inv_showrooms() from public, anon;
grant execute on function public.inv_showrooms() to authenticated;

-- Solo la cuenta admin (no grupobma) la ve por ahora. Se hizo a mano en la base:
--   update logistica.usuarios set ve_showrooms = true where user_id = (select id from auth.users where email = 'admin@logistica.bma');
-- Para que también la vea grupobma: lo mismo con 'grupobma@logistica.bma'.
