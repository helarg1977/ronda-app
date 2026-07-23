import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { supabase, cerrarSesion } from '../lib/supabase'

const SIGUIENTE_ESTADO = {
  pendiente: { siguiente: 'confirmado', boton: '✅ Confirmar pedido' },
  confirmado: { siguiente: 'preparando', boton: '🍸 Marcar preparando' },
  preparando: { siguiente: 'en_camino', boton: '🚶 Llevar a la mesa' },
  en_camino: { siguiente: 'entregado', boton: '📬 Marcar entregado' },
}

export default function MeseroDashboard({ usuario, onCerrarSesion }) {
  const [pedidos, setPedidos] = useState([])
  const [mesas, setMesas] = useState({})
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select('id, mesa_id, estado, total, created_at')
      .eq('bar_id', usuario.bar_id)
      .not('estado', 'in', '(entregado,cancelado)')
      .order('created_at', { ascending: true })

    const { data: mesasData } = await supabase.from('mesas').select('id, numero').eq('bar_id', usuario.bar_id)
    const { data: solicitudesData } = await supabase
      .from('solicitudes')
      .select('id, mesa_id, tipo, created_at')
      .eq('bar_id', usuario.bar_id)
      .eq('atendida', false)

    const mesasMap = {}
    ;(mesasData || []).forEach((m) => { mesasMap[m.id] = m.numero })

    setPedidos(pedidosData || [])
    setMesas(mesasMap)
    setSolicitudes(solicitudesData || [])
  }, [usuario.bar_id])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`mesero-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar, usuario.bar_id])

  async function avanzarEstado(pedido) {
    const paso = SIGUIENTE_ESTADO[pedido.estado]
    if (!paso) return
    await supabase
      .from('pedidos')
      .update({ estado: paso.siguiente, mesero_id: usuario.id, updated_at: new Date().toISOString() })
      .eq('id', pedido.id)
  }

  async function atenderSolicitud(id) {
    await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Pedidos activos</Text>
        <TouchableOpacity onPress={async () => { await cerrarSesion(); onCerrarSesion() }}>
          <Text style={styles.salir}>Salir</Text>
        </TouchableOpacity>
      </View>

      {solicitudes.length > 0 && (
        <View style={styles.avisos}>
          {solicitudes.map((s) => (
            <TouchableOpacity key={s.id} style={styles.avisoItem} onPress={() => atenderSolicitud(s.id)}>
              <Text style={styles.avisoTexto}>
                ✋ Mesa {mesas[s.mesa_id] || '?'} pide: {s.tipo} — toca para marcar atendido
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={pedidos}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={<Text style={styles.vacio}>No hay pedidos activos por ahora 🎉</Text>}
        renderItem={({ item }) => {
          const paso = SIGUIENTE_ESTADO[item.estado]
          return (
            <View style={styles.pedidoCard}>
              <Text style={styles.pedidoMesa}>Mesa {mesas[item.mesa_id] || '?'}</Text>
              <Text style={styles.pedidoEstado}>{item.estado}</Text>
              {paso && (
                <TouchableOpacity style={styles.boton} onPress={() => avanzarEstado(item)}>
                  <Text style={styles.botonTexto}>{paso.boton}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingTop: 50 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2' },
  salir: { color: '#a0a0b0', fontSize: 15 },
  avisos: { paddingHorizontal: 14, marginBottom: 6 },
  avisoItem: { backgroundColor: '#3a2f1a', borderRadius: 12, padding: 12, marginBottom: 8 },
  avisoTexto: { color: '#e0b94c', fontSize: 15 },
  vacio: { color: '#a0a0b0', textAlign: 'center', marginTop: 60, fontSize: 16 },
  pedidoCard: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, marginBottom: 12 },
  pedidoMesa: { color: '#f2f2f2', fontSize: 19, fontWeight: '700' },
  pedidoEstado: { color: '#a0a0b0', fontSize: 14, marginTop: 4, marginBottom: 12, textTransform: 'capitalize' },
  boton: { backgroundColor: '#d4a338', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
})
