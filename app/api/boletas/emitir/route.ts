import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type BoletaProviderResponse = {
  ok?: boolean;
  folio?: string | number | null;
  folio_boleta?: string | number | null;
  track_id?: string | number | null;
  track_id_sii?: string | number | null;
  pdf_url?: string | null;
  url_pdf_boleta?: string | null;
  xml?: string | null;
  xml_boleta?: string | null;
  sii_response?: unknown;
  respuesta_sii?: unknown;
  error?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let ventaId = '';
  try {
    const body = await request.json();
    ventaId = String(body?.ventaId || body?.id_venta || '').trim();
  } catch {
    return NextResponse.json({ ok: false, message: 'Solicitud invalida.' }, { status: 400 });
  }

  if (!ventaId) {
    return NextResponse.json({ ok: false, message: 'Debe indicar la venta a emitir.' }, { status: 400 });
  }

  const { data: venta, error: ventaError } = await (supabase as any)
    .from('Venta')
    .select(`
      *,
      cliente:Cliente(nombre, rut),
      usuario:Usuario!Venta_id_usuario_cajera_fkey(nombre, email),
      DetalleVenta:DetalleVenta!detalleventa_id_venta_fkey(
        *,
        producto:Producto!detalleventa_id_producto_fkey(nombre, codigo_barra)
      )
    `)
    .eq('id_venta', ventaId)
    .single();

  if (ventaError || !venta) {
    return NextResponse.json(
      { ok: false, message: ventaError?.message || 'Venta no encontrada.' },
      { status: 404 }
    );
  }

  if (venta.estado === 'anulada') {
    return NextResponse.json(
      { ok: false, message: 'No se puede emitir boleta para una venta inactiva.' },
      { status: 409 }
    );
  }

  if (venta.estado_boleta === 'emitida') {
    return NextResponse.json({
      ok: true,
      boleta: venta,
      detalles: venta.DetalleVenta || [],
      message: 'La boleta ya estaba emitida.'
    });
  }

  await (supabase as any)
    .from('Venta')
    .update({
      requiere_boleta: true,
      estado_boleta: 'pendiente',
      respuesta_sii: null
    })
    .eq('id_venta', ventaId);

  const endpoint = process.env.BOLETA_EMISION_ENDPOINT;
  const token = process.env.BOLETA_EMISION_TOKEN;

  if (!endpoint) {
    const respuesta = {
      ok: false,
      error: 'BOLETA_EMISION_ENDPOINT no esta configurado. La venta se conserva sin boleta emitida.',
      at: new Date().toISOString()
    };

    await (supabase as any)
      .from('Venta')
      .update({
        estado_boleta: 'rechazada',
        respuesta_sii: respuesta
      })
      .eq('id_venta', ventaId);

    return NextResponse.json(
      { ok: false, message: respuesta.error, respuesta_sii: respuesta },
      { status: 503 }
    );
  }

  try {
    const providerRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        venta,
        detalles: venta.DetalleVenta || []
      })
    });

    const providerBody = (await providerRes.json().catch(() => ({}))) as BoletaProviderResponse;
    const folio = providerBody.folio_boleta ?? providerBody.folio ?? null;
    const trackId = providerBody.track_id_sii ?? providerBody.track_id ?? null;
    const providerOk = providerRes.ok && providerBody.ok !== false && Boolean(folio);

    if (!providerOk) {
      const respuesta = {
        ok: false,
        status: providerRes.status,
        error: providerBody.error || providerBody.message || 'El proveedor de boleta rechazo la emision.',
        raw: providerBody,
        at: new Date().toISOString()
      };

      await (supabase as any)
        .from('Venta')
        .update({
          estado_boleta: 'rechazada',
          respuesta_sii: respuesta
        })
        .eq('id_venta', ventaId);

      return NextResponse.json(
        { ok: false, message: respuesta.error, respuesta_sii: respuesta },
        { status: 502 }
      );
    }

    const updatePayload = {
      requiere_boleta: true,
      estado_boleta: 'emitida',
      folio_boleta: String(folio),
      track_id_sii: trackId ? String(trackId) : null,
      respuesta_sii: providerBody.respuesta_sii ?? providerBody.sii_response ?? providerBody,
      fecha_emision_boleta: new Date().toISOString(),
      url_pdf_boleta: providerBody.url_pdf_boleta ?? providerBody.pdf_url ?? null,
      xml_boleta: providerBody.xml_boleta ?? providerBody.xml ?? null
    };

    const { data: updatedVenta, error: updateError } = await (supabase as any)
      .from('Venta')
      .update(updatePayload)
      .eq('id_venta', ventaId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      boleta: updatedVenta,
      detalles: venta.DetalleVenta || []
    });
  } catch (err: any) {
    const respuesta = {
      ok: false,
      error: err?.message || 'Error desconocido al emitir boleta.',
      at: new Date().toISOString()
    };

    await (supabase as any)
      .from('Venta')
      .update({
        estado_boleta: 'rechazada',
        respuesta_sii: respuesta
      })
      .eq('id_venta', ventaId);

    return NextResponse.json(
      { ok: false, message: respuesta.error, respuesta_sii: respuesta },
      { status: 500 }
    );
  }
}
