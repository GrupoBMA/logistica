-- Daños por pieza sin tipo ni gravedad (pedido del usuario, 24-nov-2026).
-- Como ya se dice qué pieza es, basta con "falta" o "dañada" y cuántas.
-- Se agrega el tipo "Pieza dañada" para guardar las dañadas, y la gravedad solo se pide
-- en los daños de todo el contenedor (sin pieza) que no son faltantes.

insert into logistica.inv_defectos (nombre)
select 'Pieza dañada' where not exists (select 1 from logistica.inv_defectos where nombre = 'Pieza dañada');

create or replace function logistica.inv_revisar_defectos(p jsonb)
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
declare x jsonb; d logistica.inv_defectos;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'defectos','[]')) loop
    select * into d from logistica.inv_defectos where id = (x->>'defecto_id')::bigint;
    if not found then raise exception 'Escoge el tipo de daño'; end if;
    if nullif(x->>'gravedad','') is not null and x->>'gravedad' not in ('leve','media','grave') then raise exception 'Escoge qué tan grave es el daño'; end if;
    if x->>'pieza_id' is null and d.nombre not ilike 'faltante%' and nullif(x->>'gravedad','') is null then raise exception 'Escoge qué tan grave es el daño'; end if;
    if coalesce((x->>'cantidad')::int, 0) < 1 then raise exception 'La cantidad de cada daño debe ser 1 o más'; end if;
  end loop;
end $function$;
