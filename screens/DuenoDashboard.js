import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { supabase, cerrarSesion } from '../lib/supabase'

const ESTADO_LABEL = {
  pendiente: 'Nuevo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  en_camino: 'En camino',
}

function colorPorAntiguedad(createdAt) {
  const minutos = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (minutos < 5) return '#3ecf8e' // verde
  if (minutos < 10) return '#e0b94c' // amarillo
  return '#e05c5c' // rojo
}

export default function DuenoDashboard({ usuario, onCerrarSesion, onIrComision, onIrMenu }) {
  const [mesas, setMesas] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    const { data: mesasData } = await supabase
      .from('mesas')
      .select('id, numero')
      .eq('bar_id', usuario.bar_id)
      .order('numero')

    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select('id, mesa_id, estado, total, created_at')
      .eq('bar_id', usuario.bar_id)
      .not('estado', 'in', '(entregado,cancelado)')

    const { data: solicitudesData } = await supabase
      .from('solicitudes')
      .select('id, mesa_id, tipo, created_at')
      .eq('bar_id', usuario.bar_id)
      .eq('atendida', false)
      .order('created_at', { ascending: true })

    setMesas(mesasData || [])
    setPedidos(pedidosData || [])
    setSolicitudes(solicitudesData || [])
  }, [usuario.bar_id])

  useEffect(() => {
    cargar()
    const canalPedidos = supabase
      .channel(`dueno-pedidos-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .subscribe()
    const canalSolicitudes = supabase
      .channel(`dueno-solicitudes-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .subscribe()
    const intervalo = setInterval(cargar, 30000)
    return () => {
      supabase.removeChannel(canalPedidos)
      supabase.removeChannel(canalSolicitudes)
      clearInterval(intervalo)
    }
  }, [cargar, usuario.bar_id])

  async function atenderSolicitud(id) {
    await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
  }

  const mesasConEstado = mesas.map((m) => {
    const pedido = pedidos.find((p) => p.mesa_id === m.id)
    return { ...m, pedido }
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Mesas</Text>
        <TouchableOpacity onPress={async () => { await cerrarSesion(); onCerrarSesion() }}>
          <Text style={styles.salir}>Salir</Text>
        </TouchableOpacity>
      </View>

      {solicitudes.length > 0 && (
        <View style={styles.avisos}>
          {solicitudes.map((s) => (
            <TouchableOpacity key={s.id} style={styles.avisoItem} onPress={() => atenderSolicitud(s.id)}>
              <Text style={styles.avisoTexto}>✋ Mesa pide: {s.tipo} — toca para marcar atendido</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={mesasConEstado}
        keyExtractor={(m) => m.id}
        numColumns={3}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.mesaCard,
              { borderColor: item.pedido ? colorPorAntiguedad(item.pedido.created_at) : '#2a2a3a' },
            ]}
          >
            <Text style={styles.mesaNumero}>Mesa {item.numero}</Text>
            <Text style={styles.mesaEstado}>
              {item.pedido ? ESTADO_LABEL[item.pedido.estado] || item.pedido.estado : 'Libre'}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrMenu}>
          <Text style={styles.footerBotonTexto}>📋 Menú</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrComision}>
          <Text style={styles.footerBotonTexto}>💳 Pagar a Ronda</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingTop: 50 },
  titulo: { fontSize: 26, fontWeight: '800', color: '#f2f2f2' },
  salir: { color: '#a0a0b0', fontSize: 15 },
  avisos: { paddingHorizontal: 14, marginBottom: 6 },
  avisoItem: { backgroundColor: '#3a2f1a', borderRadius: 12, padding: 12, marginBottom: 8 },
  avisoTexto: { color: '#e0b94c', fontSize: 15 },
  mesaCard: {
    flex: 1, margin: 6, backgroundColor: '#1e1e2e', borderRadius: 14, borderWidth: 2,
    padding: 14, alignItems: 'center', minHeight: 90, justifyContent: 'center',
  },
  mesaNumero: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  mesaEstado: { color: '#a0a0b0', fontSize: 13, marginTop: 6, textAlign: 'center' },
  footer: { flexDirection: 'row', padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: '#2a2a3a' },
  footerBoton: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, alignItems: 'center' },
  footerBotonTexto: { color: '#f2f2f2', fontSize: 16, fontWeight: '600' },
})
