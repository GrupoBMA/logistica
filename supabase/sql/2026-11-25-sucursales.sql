-- Consulta de remisiones para las sucursales, sin sesión (25-nov-2026)
-- Se les pasa un enlace: consulta.html#k=<clave>. La clave NO está en el repo (es público): en Supabase solo se guarda
-- su sha256. Sin la clave correcta no se ve nada. Si el enlace se filtra, se desactiva esa clave y se hace otra.
-- Regresa el estado de una remisión sin costo de flete, fletero ni ETA. Las remisiones se repiten entre vendedores y
-- con el tiempo: se regresan todas las que coinciden en Ventas y la sucursal escoge por su destino.

create table if not exists logistica.consulta_claves (
  id bigint generated always as identity primary key,
  clave_sha256 text not null unique,   -- encode(sha256(convert_to(clave,'UTF8')),'hex')
  nombre text,
  activa boolean not null default true,
  creado timestamptz not null default now()
);
alter table logistica.consulta_claves enable row level security;

-- p_remision vacío = solo revisar la clave (la página lo hace al abrir). Solo busca en Ventas (sin Entregados, 25-nov-2026).
-- "54" encuentra 54, 54/1, 54/2…; "54/2" solo esa parte. De la venta más reciente a la más antigua.
create or replace function public.consulta_buscar(p_clave text, p_remision text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_remision, ''), '\s+', '', 'g'));
begin
  if p_clave is null or length(p_clave) > 100 or not exists (
       select 1 from logistica.consulta_claves
       where activa and clave_sha256 = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex')) then
    raise exception 'Enlace no válido' using errcode = '42501';
  end if;
  if v = '' or length(v) > 20 then
    return jsonb_build_object('filas', '[]'::jsonb, 'subido', (select max(actualizado) from logistica.entregas));
  end if;
  return jsonb_build_object(
    'subido', (select max(actualizado) from logistica.entregas),
    'filas', coalesce((
      select jsonb_agg(f.j order by f.orden)
      from (
        select jsonb_strip_nulls(jsonb_build_object(
                 'hoja', e.hoja, 'vendedor', e.vendedor, 'vehiculo', e.vehiculo,
                 'armado', e.armado, 'herreria', e.herreria, 'forrado', e.forrado, 'pintura', e.pintura, 'revision', e.revision,
                 'fecha', e.fecha, 'fecha_txt', e.fecha_txt, 'remision', e.remision, 'destino', e.destino, 'zona', e.zona,
                 'activacion', e.activacion, 'faltante', e.faltante, 'color_vehiculo', e.color_vehiculo,
                 'color_destino', e.color_destino, 'tipo_destino', e.tipo_destino)) j,
               row_number() over (order by (e.hoja <> 'ventas'), e.fecha desc nulls last, e.id) orden
        from logistica.entregas e
        where e.hoja = 'ventas'   -- solo lo que está en Ventas (pedido del usuario: sin entregadas)
          and case when position('/' in v) > 0
                   then upper(regexp_replace(coalesce(e.remision, ''), '\s+', '', 'g')) = v
                   else split_part(upper(regexp_replace(coalesce(e.remision, ''), '\s+', '', 'g')), '/', 1) = v end
        order by 2 limit 60
      ) f), '[]'::jsonb)
  );
end $$;

revoke all on function public.consulta_buscar(text, text) from public;
grant execute on function public.consulta_buscar(text, text) to anon, authenticated;

-- Dar de alta una clave: se genera en la computadora y aquí solo se guarda su sha256
--   insert into logistica.consulta_claves (clave_sha256, nombre) values ('<sha256 en hex>', 'Sucursales');
-- Desactivar una clave (el enlace deja de servir al momento):
--   update logistica.consulta_claves set activa = false where nombre = 'Sucursales';
