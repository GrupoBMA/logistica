-- Herrería y Forrado son una rama aparte para los especiales (pedido del usuario, 20-nov-2026):
-- salen después de Mecánica y vuelven en Detallado y pintura.
-- Antes: Revisión 1 → Herrería → Forrado → Mecánica. Ahora: Revisión 1 → Mecánica → (Herrería → Forrado) → Detallado y pintura.
create or replace function logistica.inv_siguiente(p_etapa text, p_especial boolean) returns text
language sql immutable set search_path to '' as $$
  select case p_etapa
    when 'armado' then 'revision1'
    when 'revision1' then 'mecanica'
    when 'mecanica' then case when p_especial then 'herreria' else 'detallado' end
    when 'herreria' then 'forrado'
    when 'forrado' then 'detallado'
    when 'detallado' then 'revision_final'
    when 'revision_final' then 'listo'
  end $$;
revoke all on function logistica.inv_siguiente(text,boolean) from public, anon, authenticated;

-- Lista de piezas del MC 150 (21-nov-2026): se cargó desde la hoja "Explosión de materiales · Motocarro 150CC SUNL
-- Asiento Corrido" que mandó el usuario: 53 piezas, 90 en total por vehículo (sin la tornillería, que no trae cantidad).
-- Se cargó directo en Supabase (inv_piezas e inv_materiales con modelo_id del MC 150); no se copia aquí.
