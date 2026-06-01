-- ============================================================
-- INACTIVACION LOGICA DE VENTAS
-- Ejecutar en Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Campos de auditoria directa en Venta
ALTER TABLE public."Venta"
  ADD COLUMN IF NOT EXISTS saldo_favor_usado BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_inactivacion TEXT,
  ADD COLUMN IF NOT EXISTS inactivada_por UUID REFERENCES public."Usuario"(id),
  ADD COLUMN IF NOT EXISTS inactivada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estado_anterior TEXT,
  ADD COLUMN IF NOT EXISTS saldo_favor_revertido BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_fiado_revertido BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_reactivacion TEXT,
  ADD COLUMN IF NOT EXISTS reactivada_por UUID REFERENCES public."Usuario"(id),
  ADD COLUMN IF NOT EXISTS reactivada_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_venta_estado_fecha
  ON public."Venta"(estado, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS idx_venta_inactivada_por
  ON public."Venta"(inactivada_por);

-- 2. Auditoria general, si aun no existe
CREATE TABLE IF NOT EXISTS public."AuditLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID REFERENCES public."Usuario"(id),
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad_afectada TEXT NOT NULL,
  id_entidad TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditlog_usuario_fecha
  ON public."AuditLog"(id_usuario, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_auditlog_modulo_accion
  ON public."AuditLog"(modulo, accion);

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT AuditLog a autenticados" ON public."AuditLog";
CREATE POLICY "Permitir SELECT AuditLog a autenticados"
  ON public."AuditLog" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir INSERT AuditLog a autenticados" ON public."AuditLog";
CREATE POLICY "Permitir INSERT AuditLog a autenticados"
  ON public."AuditLog" FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Notificaciones al admin
CREATE TABLE IF NOT EXISTS public."NotificacionAdmin" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_leida
  ON public."NotificacionAdmin"(leida, created_at DESC);

ALTER TABLE public."NotificacionAdmin" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir SELECT NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir INSERT NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir INSERT NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir UPDATE NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir UPDATE NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR UPDATE TO authenticated USING (true);

-- Permitir tipo de notificacion de venta inactivada
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public."NotificacionAdmin"'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public."NotificacionAdmin" DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public."NotificacionAdmin"
  ADD CONSTRAINT notificacionadmin_tipo_check
  CHECK (tipo IN ('descuadre', 'solicitud_caja', 'alerta', 'venta_inactivada', 'venta_reactivada'));

-- 4. RLS minima para que admin/cajera puedan actualizar ventas por RPC/pantalla
ALTER TABLE public."Venta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir UPDATE Venta a autenticados" ON public."Venta";
CREATE POLICY "Permitir UPDATE Venta a autenticados"
  ON public."Venta" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5. Funcion transaccional de inactivacion
CREATE OR REPLACE FUNCTION public.inactivar_venta(
  p_venta_id UUID,
  p_motivo TEXT,
  p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta public."Venta"%ROWTYPE;
  v_usuario RECORD;
  v_motivo TEXT;
  v_credito RECORD;
  v_monto_fiado BIGINT := 0;
  v_saldo_favor_usado BIGINT := 0;
  v_actor_nombre TEXT;
BEGIN
  v_motivo := btrim(COALESCE(p_motivo, ''));

  IF v_motivo = '' THEN
    RAISE EXCEPTION 'Debe ingresar una justificacion para inactivar la venta.';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_usuario_id THEN
    RAISE EXCEPTION 'El usuario autenticado no coincide con el usuario informado.';
  END IF;

  SELECT *
  INTO v_usuario
  FROM public."Usuario"
  WHERE id = p_usuario_id
    AND rol IN ('admin', 'cajera')
    AND COALESCE(activo, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo admin o cajera activos pueden inactivar ventas.';
  END IF;

  SELECT *
  INTO v_venta
  FROM public."Venta"
  WHERE id_venta = p_venta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;

  IF v_venta.estado = 'anulada' THEN
    RAISE EXCEPTION 'La venta ya esta inactiva.';
  END IF;

  -- Revertir stock descontado por la venta.
  UPDATE public."Producto" p
  SET stock_actual = COALESCE(p.stock_actual, 0) + d.cantidad
  FROM public."DetalleVenta" d
  WHERE d.id_venta = p_venta_id
    AND d.id_producto IS NOT NULL
    AND p.id = d.id_producto;

  v_saldo_favor_usado := COALESCE((to_jsonb(v_venta)->>'saldo_favor_usado')::BIGINT, 0);
  v_monto_fiado := GREATEST(COALESCE(v_venta.total_venta, 0)::BIGINT - v_saldo_favor_usado, 0);

  IF v_venta.id_cliente IS NOT NULL THEN
    -- Si la venta uso saldo a favor, se devuelve al cliente.
    IF v_saldo_favor_usado > 0 THEN
      UPDATE public."Cliente"
      SET saldo_favor = COALESCE(saldo_favor, 0) + v_saldo_favor_usado
      WHERE id = v_venta.id_cliente;
    END IF;

    -- Si fue fiado, se revierte la deuda pendiente vinculada a esta venta.
    IF v_venta.forma_pago::TEXT = 'fiado' THEN
      SELECT *
      INTO v_credito
      FROM public."Credito"
      WHERE venta_id = p_venta_id
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_monto_fiado := COALESCE(v_credito.saldo_pendiente, 0);

        UPDATE public."Cliente"
        SET saldo_deudado = GREATEST(COALESCE(saldo_deudado, 0) - v_monto_fiado, 0)
        WHERE id = v_venta.id_cliente;

        UPDATE public."Credito"
        SET saldo_pendiente = 0,
            estado = 'pagado'
        WHERE id = v_credito.id;
      ELSE
        UPDATE public."Cliente"
        SET saldo_deudado = GREATEST(COALESCE(saldo_deudado, 0) - v_monto_fiado, 0)
        WHERE id = v_venta.id_cliente;
      END IF;
    END IF;
  END IF;

  UPDATE public."Venta"
  SET estado = 'anulada'::public.estado_venta,
      estado_anterior = v_venta.estado::TEXT,
      motivo_inactivacion = v_motivo,
      inactivada_por = p_usuario_id,
      inactivada_en = now(),
      saldo_favor_revertido = v_saldo_favor_usado,
      monto_fiado_revertido = CASE WHEN v_venta.forma_pago::TEXT = 'fiado' THEN v_monto_fiado ELSE 0 END,
      observacion = CONCAT_WS(' | ', NULLIF(observacion, ''), 'INACTIVA: ' || v_motivo)
  WHERE id_venta = p_venta_id;

  v_actor_nombre := COALESCE(
    NULLIF(trim(COALESCE(v_usuario.nombre, '') || ' ' || COALESCE(v_usuario.apellido, '')), ''),
    v_usuario.email,
    p_usuario_id::TEXT
  );

  INSERT INTO public."AuditLog" (
    id_usuario,
    modulo,
    accion,
    entidad_afectada,
    id_entidad,
    descripcion,
    old_values,
    new_values
  )
  VALUES (
    p_usuario_id,
    'ventas',
    'anulacion',
    'Venta',
    p_venta_id::TEXT,
    'Venta marcada como inactiva. Motivo: ' || v_motivo,
    jsonb_build_object('estado', v_venta.estado, 'total_venta', v_venta.total_venta, 'saldo_favor_revertido', v_saldo_favor_usado, 'monto_fiado_revertido', CASE WHEN v_venta.forma_pago::TEXT = 'fiado' THEN v_monto_fiado ELSE 0 END),
    jsonb_build_object('estado', 'anulada'::public.estado_venta, 'motivo_inactivacion', v_motivo, 'inactivada_por', p_usuario_id, 'inactivada_en', now())
  );

  INSERT INTO public."NotificacionAdmin" (
    tipo,
    titulo,
    mensaje,
    metadata
  )
  VALUES (
    'venta_inactivada',
    'Venta marcada como inactiva',
    'Venta #' || upper(left(p_venta_id::TEXT, 8)) || ' inactivada por ' || v_actor_nombre || '. Motivo: ' || v_motivo,
    jsonb_build_object(
      'id_venta', p_venta_id,
      'folio', upper(left(p_venta_id::TEXT, 8)),
      'usuario_id', p_usuario_id,
      'usuario_nombre', v_actor_nombre,
      'fecha_hora', now(),
      'motivo', v_motivo,
      'estado_anterior', v_venta.estado,
      'estado_nuevo', 'anulada'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_venta', p_venta_id,
    'estado_anterior', v_venta.estado,
    'estado_nuevo', 'anulada'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inactivar_venta(UUID, TEXT, UUID) TO authenticated;

-- 6. Funcion transaccional de reactivacion
-- Solo admin puede ejecutarla. Reaplica stock, saldos y creditos revertidos.
CREATE OR REPLACE FUNCTION public.reactivar_venta(
  p_venta_id UUID,
  p_motivo TEXT,
  p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta public."Venta"%ROWTYPE;
  v_usuario RECORD;
  v_credito RECORD;
  v_actor_nombre TEXT;
  v_estado_nuevo public.estado_venta;
  v_saldo_favor_revertido BIGINT := 0;
  v_monto_fiado_revertido BIGINT := 0;
  v_favor_actual BIGINT := 0;
  v_favor_a_consumir BIGINT := 0;
  v_favor_faltante BIGINT := 0;
  v_motivo TEXT;
BEGIN
  v_motivo := NULLIF(btrim(COALESCE(p_motivo, '')), '');

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_usuario_id THEN
    RAISE EXCEPTION 'El usuario autenticado no coincide con el usuario informado.';
  END IF;

  SELECT *
  INTO v_usuario
  FROM public."Usuario"
  WHERE id = p_usuario_id
    AND rol = 'admin'
    AND COALESCE(activo, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo un administrador activo puede reactivar ventas.';
  END IF;

  SELECT *
  INTO v_venta
  FROM public."Venta"
  WHERE id_venta = p_venta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;

  IF v_venta.estado <> 'anulada' THEN
    RAISE EXCEPTION 'Solo se pueden reactivar ventas inactivas.';
  END IF;

  v_estado_nuevo := COALESCE(NULLIF(v_venta.estado_anterior, ''), 'cerrada')::public.estado_venta;
  IF v_estado_nuevo = 'anulada'::public.estado_venta THEN
    v_estado_nuevo := 'cerrada'::public.estado_venta;
  END IF;

  v_saldo_favor_revertido := COALESCE((to_jsonb(v_venta)->>'saldo_favor_revertido')::BIGINT, 0);
  IF v_saldo_favor_revertido = 0 THEN
    v_saldo_favor_revertido := COALESCE((to_jsonb(v_venta)->>'saldo_favor_usado')::BIGINT, 0);
  END IF;

  v_monto_fiado_revertido := COALESCE((to_jsonb(v_venta)->>'monto_fiado_revertido')::BIGINT, 0);
  IF v_monto_fiado_revertido = 0 AND v_venta.forma_pago::TEXT = 'fiado' THEN
    v_monto_fiado_revertido := GREATEST(COALESCE(v_venta.total_venta, 0)::BIGINT - COALESCE((to_jsonb(v_venta)->>'saldo_favor_usado')::BIGINT, 0), 0);
  END IF;

  -- Reaplicar el descuento de stock original de la venta.
  UPDATE public."Producto" p
  SET stock_actual = COALESCE(p.stock_actual, 0) - d.cantidad
  FROM public."DetalleVenta" d
  WHERE d.id_venta = p_venta_id
    AND d.id_producto IS NOT NULL
    AND p.id = d.id_producto;

  IF v_venta.id_cliente IS NOT NULL THEN
    IF v_saldo_favor_revertido > 0 THEN
      SELECT COALESCE(saldo_favor, 0)
      INTO v_favor_actual
      FROM public."Cliente"
      WHERE id = v_venta.id_cliente
      FOR UPDATE;

      v_favor_a_consumir := LEAST(v_favor_actual, v_saldo_favor_revertido);
      v_favor_faltante := v_saldo_favor_revertido - v_favor_a_consumir;

      UPDATE public."Cliente"
      SET saldo_favor = GREATEST(COALESCE(saldo_favor, 0) - v_favor_a_consumir, 0),
          saldo_deudado = COALESCE(saldo_deudado, 0) + v_favor_faltante
      WHERE id = v_venta.id_cliente;
    END IF;

    IF v_venta.forma_pago::TEXT = 'fiado' AND v_monto_fiado_revertido > 0 THEN
      SELECT *
      INTO v_credito
      FROM public."Credito"
      WHERE venta_id = p_venta_id
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public."Credito"
        SET saldo_pendiente = v_monto_fiado_revertido,
            estado = 'vigente'
        WHERE id = v_credito.id;
      ELSE
        INSERT INTO public."Credito" (
          cliente_id,
          venta_id,
          monto_inicial,
          saldo_pendiente,
          estado
        )
        VALUES (
          v_venta.id_cliente,
          p_venta_id,
          v_monto_fiado_revertido,
          v_monto_fiado_revertido,
          'vigente'
        );
      END IF;

      UPDATE public."Cliente"
      SET saldo_deudado = COALESCE(saldo_deudado, 0) + v_monto_fiado_revertido
      WHERE id = v_venta.id_cliente;
    END IF;
  END IF;

  UPDATE public."Venta"
  SET estado = v_estado_nuevo,
      motivo_reactivacion = v_motivo,
      reactivada_por = p_usuario_id,
      reactivada_en = now(),
      observacion = CONCAT_WS(' | ', NULLIF(observacion, ''), 'REACTIVADA' || COALESCE(': ' || v_motivo, ''))
  WHERE id_venta = p_venta_id;

  v_actor_nombre := COALESCE(
    NULLIF(trim(COALESCE(v_usuario.nombre, '') || ' ' || COALESCE(v_usuario.apellido, '')), ''),
    v_usuario.email,
    p_usuario_id::TEXT
  );

  INSERT INTO public."AuditLog" (
    id_usuario,
    modulo,
    accion,
    entidad_afectada,
    id_entidad,
    descripcion,
    old_values,
    new_values
  )
  VALUES (
    p_usuario_id,
    'ventas',
    'activacion',
    'Venta',
    p_venta_id::TEXT,
    'Venta reactivada por administrador' || COALESCE('. Motivo: ' || v_motivo, ''),
    jsonb_build_object('estado', v_venta.estado, 'saldo_favor_revertido', v_saldo_favor_revertido, 'monto_fiado_revertido', v_monto_fiado_revertido),
    jsonb_build_object('estado', v_estado_nuevo, 'motivo_reactivacion', v_motivo, 'reactivada_por', p_usuario_id, 'reactivada_en', now())
  );

  INSERT INTO public."NotificacionAdmin" (
    tipo,
    titulo,
    mensaje,
    metadata
  )
  VALUES (
    'venta_reactivada',
    'Venta reactivada',
    'Venta #' || upper(left(p_venta_id::TEXT, 8)) || ' reactivada por ' || v_actor_nombre || COALESCE('. Motivo: ' || v_motivo, ''),
    jsonb_build_object(
      'id_venta', p_venta_id,
      'folio', upper(left(p_venta_id::TEXT, 8)),
      'usuario_id', p_usuario_id,
      'usuario_nombre', v_actor_nombre,
      'fecha_hora', now(),
      'motivo', v_motivo,
      'estado_anterior', v_venta.estado,
      'estado_nuevo', v_estado_nuevo
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_venta', p_venta_id,
    'estado_anterior', v_venta.estado,
    'estado_nuevo', v_estado_nuevo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reactivar_venta(UUID, TEXT, UUID) TO authenticated;
