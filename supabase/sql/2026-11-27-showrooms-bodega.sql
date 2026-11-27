-- Showrooms en 3 columnas (27-nov-2026, pedido del usuario): lo que pidió, lo que tiene la sucursal en Odoo
-- y lo que hay en las bodegas (Bodega 1 = S-BD1, Granja; Bodega 2 = S-BD2), con los mismos productos de Odoo.
-- Agrega a cada pedido: bodega (total), bodega1, bodega2 y bodega_colores (por color, las dos bodegas juntas).
-- Y lo que pidió por color (pide_colores: [{color, n}]), cuando la sucursal lo dijo; se llena a mano con los pedidos.

alter table logistica.showroom_pedidos add column if not exists pide_colores jsonb not null default '[]';

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
        'colores', case when p.m2_rollo is null then coalesce(x.colores, '[]') else '[]' end,
        'pide_colores', p.pide_colores,
        'bodega', round(coalesce(b.hay, 0) / coalesce(p.m2_rollo, 1), 1),
        'bodega1', round(coalesce(b.b1, 0) / coalesce(p.m2_rollo, 1), 1),
        'bodega2', round(coalesce(b.b2, 0) / coalesce(p.m2_rollo, 1), 1),
        'bodega_colores', case when p.m2_rollo is null then coalesce(b.colores, '[]') else '[]' end
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
        select sum(c.n) hay, sum(c.b1) b1, sum(c.b2) b2,
               jsonb_agg(jsonb_build_object('color', c.color, 'n', c.n) order by c.n desc, c.color) colores
        from (
          select coalesce(initcap(substring(pr.nombre from '\(([^()]*)\)\s*$')), pr.codigo) color, sum(e.cantidad) n,
                 sum(e.cantidad) filter (where e.almacen = 'S-BD1') b1, sum(e.cantidad) filter (where e.almacen = 'S-BD2') b2
          from bma.odoo_existencias e join bma.odoo_productos pr on pr.id = e.producto_id
          where e.hasta is null and e.almacen in ('S-BD1', 'S-BD2')
            and pr.codigo like any (p.incluye) and not (pr.codigo like any (p.excluye))
          group by 1 having sum(e.cantidad) > 0
        ) c
      ) b on true
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
