-- Agregamos la columna para registrar cuánto saldo a favor se usó en esta venta
-- Esto permite que "total_venta" sea el monto real de los productos, mientras 
-- conservamos el registro de con cuánto dinero "físico" o "crédito" se cubrió.
ALTER TABLE public."Venta" ADD COLUMN IF NOT EXISTS saldo_favor_usado integer DEFAULT 0;
