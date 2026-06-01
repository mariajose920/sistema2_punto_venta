export type EstadoBoleta = 'pendiente' | 'emitida' | 'rechazada' | null;

export interface BoletaVenta {
  id_venta: string;
  fecha_venta: string;
  total_venta: number;
  forma_pago: string;
  subtotal?: number | null;
  recargo?: number | null;
  iva?: number | null;
  folio_boleta?: string | null;
  track_id_sii?: string | null;
  fecha_emision_boleta?: string | null;
  estado_boleta?: EstadoBoleta;
  respuesta_sii?: unknown;
  url_pdf_boleta?: string | null;
  xml_boleta?: string | null;
  cliente?: { nombre?: string | null } | null;
  usuario?: { nombre?: string | null } | null;
}

export interface BoletaDetalle {
  id_detalle_venta?: string;
  id_producto?: string | null;
  cantidad: number;
  precio_unitario_venta: number;
  subtotal: number;
  producto?: { nombre?: string | null } | null;
  nombre?: string | null;
}

export interface BoletaDocumento {
  venta: BoletaVenta;
  detalles: BoletaDetalle[];
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatMoney = (value: number | null | undefined) =>
  `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`;

export function buildBoletaHtml(documento: BoletaDocumento) {
  const { venta, detalles } = documento;
  const folio = venta.folio_boleta || venta.id_venta.slice(0, 8).toUpperCase();
  const fecha = venta.fecha_emision_boleta || venta.fecha_venta;
  const rows = detalles.map((d) => {
    const nombre = d.producto?.nombre || d.nombre || 'Producto';
    return `
      <tr>
        <td>${escapeHtml(nombre)}</td>
        <td class="num">${Number(d.cantidad || 0).toLocaleString('es-CL')}</td>
        <td class="num">${formatMoney(d.precio_unitario_venta)}</td>
        <td class="num">${formatMoney(d.subtotal)}</td>
      </tr>`;
  }).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Boleta ${escapeHtml(folio)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #fff; }
        .page { width: 80mm; margin: 0 auto; padding: 14px; }
        .center { text-align: center; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .muted { color: #6b7280; font-size: 11px; }
        .folio { border: 1px solid #111827; padding: 8px; margin: 12px 0; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
        th { text-align: left; border-bottom: 1px solid #d1d5db; padding: 6px 2px; }
        td { border-bottom: 1px solid #f3f4f6; padding: 6px 2px; vertical-align: top; }
        .num { text-align: right; white-space: nowrap; }
        .totals { margin-top: 12px; font-size: 12px; }
        .line { display: flex; justify-content: space-between; padding: 3px 0; }
        .total { font-size: 16px; font-weight: 800; border-top: 1px solid #111827; margin-top: 6px; padding-top: 8px; }
        .footer { margin-top: 16px; font-size: 10px; text-align: center; color: #6b7280; }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; }
          .page { width: 80mm; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="center">
          <h1>BOLETA ELECTRONICA</h1>
          <div class="muted">Documento tributario electronico</div>
          <div class="folio">Folio: ${escapeHtml(folio)}</div>
          <div class="muted">Fecha: ${escapeHtml(new Date(fecha).toLocaleString('es-CL'))}</div>
          ${venta.track_id_sii ? `<div class="muted">Track ID: ${escapeHtml(venta.track_id_sii)}</div>` : ''}
        </section>
        <table>
          <thead>
            <tr>
              <th>Detalle</th>
              <th class="num">Cant.</th>
              <th class="num">Unit.</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <section class="totals">
          <div class="line"><span>Subtotal</span><strong>${formatMoney(venta.subtotal ?? venta.total_venta)}</strong></div>
          ${Number(venta.recargo || 0) > 0 ? `<div class="line"><span>Recargo</span><strong>${formatMoney(venta.recargo)}</strong></div>` : ''}
          <div class="line"><span>Pago</span><strong>${escapeHtml(venta.forma_pago)}</strong></div>
          <div class="line total"><span>Total</span><span>${formatMoney(venta.total_venta)}</span></div>
        </section>
        <section class="footer">
          Venta #${escapeHtml(venta.id_venta.slice(0, 8).toUpperCase())}
        </section>
      </main>
    </body>
  </html>`;
}

export function printBoleta(documento: BoletaDocumento) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildBoletaHtml(documento));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 350);
}
