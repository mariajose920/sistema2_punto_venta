"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/types/database.types';

type PromocionRow = Database['public']['Tables']['Promocion']['Row'];
type PromocionInsert = Database['public']['Tables']['Promocion']['Insert'];

export default function PromocionesPage() {
  const { role } = useAuth();
  const [promociones, setPromociones] = useState<PromocionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<PromocionRow | null>(null);
  
  const [formData, setFormData] = useState<Partial<PromocionInsert>>({
    nombre: '',
    tipo: 'porcentaje',
    valor: 0,
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    activa: true
  });

  const fetchPromos = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('Promocion')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPromociones(data || []);
    } catch (err: unknown) {
      console.error('Error cargando promos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchPromos(); 
  }, [fetchPromos]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin') return;

    try {
      setLoading(true);
      if (selectedPromo?.id) {
        const { error } = await supabase
          .from('Promocion')
          .update(formData)
          .eq('id', selectedPromo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('Promocion')
          .insert([formData as PromocionInsert]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchPromos();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar promoción';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (promo: PromocionRow) => {
    if (role !== 'admin') return;
    try {
      const { error } = await supabase
        .from('Promocion')
        .update({ activa: !promo.activa })
        .eq('id', promo.id);
      if (error) throw error;
      fetchPromos();
    } catch (err: unknown) {
      console.error('Error toggling status:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Gestión de Promociones</h1>
          <p className="text-sm text-gray-400 font-bold">Configura ofertas y descuentos automáticos para la caja.</p>
        </div>
        {role === 'admin' && (
          <button 
            onClick={() => { 
              setSelectedPromo(null); 
              setFormData({ 
                nombre: '', 
                tipo: 'porcentaje', 
                valor: 0, 
                fecha_inicio: new Date().toISOString().split('T')[0], 
                fecha_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
                activa: true 
              }); 
              setIsModalOpen(true); 
            }}
            className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-none"
          >
            Nueva Promoción
          </button>
        )}
      </div>

      {/* Grid de Promociones */}
      {loading && promociones.length === 0 ? (
        <div className="text-center py-10 text-gray-400 font-bold uppercase text-xs">Cargando promociones...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {promociones.map(promo => (
            <div key={promo.id} className={`bg-white dark:bg-gray-800 p-6 rounded-3xl border-2 transition-all ${promo.activa ? 'border-purple-100 dark:border-purple-900/30' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${promo.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {promo.activa ? 'Activa' : 'Pausada'}
                </span>
                <span className="text-2xl">🎁</span>
              </div>
              
              <h2 className="text-lg font-black text-gray-900 dark:text-white mb-1">{promo.nombre}</h2>
              <p className="text-sm font-bold text-purple-600 uppercase tracking-tighter mb-4">
                {promo.tipo === 'porcentaje' ? `${promo.valor}% de descuento` : promo.tipo === 'fijo' ? `$${(promo.valor || 0).toLocaleString()} de descuento` : 'Oferta 2x1'}
              </p>

              <div className="space-y-2 border-t border-gray-50 dark:border-gray-700 pt-4 text-xs font-bold text-gray-400">
                <p>📅 Inicio: {promo.fecha_inicio ? new Date(promo.fecha_inicio).toLocaleDateString() : '---'}</p>
                <p>🏁 Fin: {promo.fecha_fin ? new Date(promo.fecha_fin).toLocaleDateString() : '---'}</p>
              </div>

              {role === 'admin' && (
                <div className="flex gap-2 mt-6">
                  <button onClick={() => { setSelectedPromo(promo); setFormData(promo); setIsModalOpen(true); }} className="flex-1 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs font-black">EDITAR</button>
                  <button onClick={() => toggleStatus(promo)} className={`flex-1 py-2 rounded-xl text-xs font-black ${promo.activa ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                    {promo.activa ? 'PAUSAR' : 'ACTIVAR'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Promoción */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-8 animate-in zoom-in-95">
            <h2 className="text-xl font-black mb-6">{selectedPromo ? 'Editar Promoción' : 'Nueva Promoción'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <input 
                placeholder="Nombre de la promoción (ej: Descuento Navideño)" 
                required 
                value={formData.nombre || ''} 
                onChange={e => setFormData({...formData, nombre: e.target.value})} 
                className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none font-bold" 
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block tracking-widest">Tipo</label>
                  <select 
                    value={formData.tipo || 'porcentaje'} 
                    onChange={e => setFormData({...formData, tipo: e.target.value as any})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none font-bold"
                  >
                    <option value="porcentaje">Porcentaje (%)</option>
                    <option value="fijo">Monto Fijo ($)</option>
                    <option value="2x1">Lleva 2 Paga 1</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block tracking-widest">Valor</label>
                  <input 
                    type="number" 
                    disabled={formData.tipo === '2x1'} 
                    value={formData.valor || 0} 
                    onChange={e => setFormData({...formData, valor: Number(e.target.value)})} 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none font-bold" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block tracking-widest">Fecha Inicio</label>
                  <input type="date" value={formData.fecha_inicio || ''} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block tracking-widest">Fecha Fin</label>
                  <input type="date" value={formData.fecha_fin || ''} onChange={e => setFormData({...formData, fecha_fin: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-none font-bold" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-gray-400">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-1 py-4 bg-purple-600 text-white font-black rounded-2xl shadow-xl shadow-purple-200">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
