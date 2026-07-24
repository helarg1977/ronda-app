import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, ScrollView, Modal } from 'react-native'
import { Audio } from 'expo-av'
import { supabase, cerrarSesion } from '../lib/supabase'

const SONIDO_NOTIFICACION = 'https://raw.githubusercontent.com/helarg1977/ronda-app/main/assets/notificacion.wav'

async function reproducirSonido() {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: SONIDO_NOTIFICACION })
    await sound.playAsync()
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) sound.unloadAsync()
    })
  } catch (e) {
    // si falla el sonido, no interrumpe el resto de la app
  }
}

const AYUDA_MESERO = [
  { titulo: '🔔 ¿Cómo sé si hay un pedido nuevo?', texto: 'Aparece en "Pedidos activos" arriba. Toca "✅ Confirmar pedido" cuando lo veas, y ve avanzando el botón según lo vayas preparando y llevando a la mesa.' },
  { titulo: '✋ ¿Qué son los avisos naranjas?', texto: 'Son solicitudes de la mesa (hielo, servilletas, la cuenta, etc). Tócalas para marcarlas como atendidas una vez las resuelvas.' },
  { titulo: '💰 ¿Cómo veo mis propinas?', texto: 'Arriba en las tarjetas ves el total de propinas del día. Se registran solas cuando el cliente deja propina después de que entregas su pedido.' },
]

const SIGUIENTE_ESTADO = {
  pendiente: { siguiente: 'confirmado', boton: '✅ Confirmar pedido' },
  confirmado: { siguiente: 'preparando', boton: '🍸 Marcar preparando' },
  preparando: { siguiente: 'en_camino', boton: '🚶 Llevar a la mesa' },
  en_camino: { siguiente: 'entregado', boton: '📬 Marcar entregado' },
}

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}

function inicioDeHoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function MeseroDashboard({ usuario, onCerrarSesion }) {
  const [pedidos, setPedidos] = useState([])
  const [mesas, setMesas] = useState({})
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)
  const [historialHoy, setHistorialHoy] = useState([])
  const [propinasHoy, setPropinasHoy] = useState(0)
  const [mostrarAyuda, setMostrarAyuda] = useState(false)

  const cargar = useCallback(async () => {
    const { data: pedidosData } = await supabase
      .from('pedidos').select('id, mesa_id, estado, total, created_at')
      .eq('bar_id', usuario.bar_id).not('estado', 'in', '(entregado,cancelado)')
      .order('created_at', { ascending: true })

    const { data: mesasData } = await supabase.from('mesas').select('id, numero').eq('bar_id', usuario.bar_id)
    const { data: solicitudesData } = await supabase
      .from('solicitudes').select('id, mesa_id, tipo, created_at')
      .eq('bar_id', usuario.bar_id).eq('atendida', false)

    const mesasMap = {}
    ;(mesasData || []).forEach((m) => { mesasMap[m.id] = m.numero })

    setPedidos(pedidosData || [])
    setMesas(mesasMap)
    setSolicitudes(solicitudesData || [])

    const { data: entregadosHoy } = await supabase
      .from('pedidos').select('id, mesa_id, total, created_at, pedido_items(cantidad, productos(nombre))')
      .eq('mesero_id', usuario.id).eq('estado', 'entregado').gte('created_at', inicioDeHoy())
      .order('created_at', { ascending: false })
    setHistorialHoy(entregadosHoy || [])

    const { data: propinasData } = await supabase.from('propinas').select('monto, pedido_id, pedidos!inner(created_at)').eq('mesero_id', usuario.id)
    const hoyMs = new Date(inicioDeHoy()).getTime()
    setPropinasHoy((propinasData || []).filter((p) => new Date(p.pedidos.created_at).getTime() >= hoyMs).reduce((s, p) => s + Number(p.monto), 0))
  }, [usuario.bar_id, usuario.id])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`mesero-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, reproducirSonido)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, reproducirSonido)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar, usuario.bar_id])

  async function avanzarEstado(pedido) {
    const paso = SIGUIENTE_ESTADO[pedido.estado]
    if (!paso) return
    await supabase.from('pedidos').update({ estado: paso.siguiente, mesero_id: usuario.id, updated_at: new Date().toISOString() }).eq('id', pedido.id)
  }

  async function atenderSolicitud(id) {
    await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
  }

  const mesasAtendidasHoy = new Set(historialHoy.map((p) => p.mesa_id)).size

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.titulo}>Hola, {usuario.nombre?.split(' ')[0] || 'mesero'}</Text>
            <Text style={styles.subtituloHeader}>Panel de mesero</Text>
          </View>
          <TouchableOpacity onPress={async () => { await cerrarSesion(); onCerrarSesion() }}>
            <Text style={styles.salir}>Salir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{mesasAtendidasHoy}</Text>
            <Text style={styles.statLabel}>Mesas atendidas hoy</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{money(propinasHoy)}</Text>
            <Text style={styles.statLabel}>Propinas recibidas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValor}>{pedidos.length}</Text>
            <Text style={styles.statLabel}>Pedidos activos</Text>
          </View>
        </View>

        {solicitudes.length > 0 && (
          <View style={styles.avisos}>
            {solicitudes.map((s) => (
              <TouchableOpacity key={s.id} style={styles.avisoItem} onPress={() => atenderSolicitud(s.id)}>
                <Text style={styles.avisoTexto}>✋ Mesa {mesas[s.mesa_id] || '?'} pide: {s.tipo} — toca para marcar atendido</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.seccionTitulo}>Pedidos activos</Text>
        {pedidos.length === 0 && <Text style={styles.vacio}>Sin pedidos pendientes por ahora 🍹</Text>}
        {pedidos.map((item) => {
          const paso = SIGUIENTE_ESTADO[item.estado]
          return (
            <View key={item.id} style={styles.pedidoCard}>
              <Text style={styles.pedidoMesa}>Mesa {mesas[item.mesa_id] || '?'}</Text>
              <Text style={styles.pedidoEstado}>{item.estado}</Text>
              {paso && (
                <TouchableOpacity style={styles.boton} onPress={() => avanzarEstado(item)}>
                  <Text style={styles.botonTexto}>{paso.boton}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        })}

        <Text style={styles.seccionTitulo}>Historial de la noche</Text>
        {historialHoy.length === 0 && <Text style={styles.vacio}>Aún no has entregado pedidos hoy.</Text>}
        {historialHoy.map((p) => (
          <View key={p.id} style={styles.historialCard}>
            <View style={styles.historialHeader}>
              <Text style={styles.historialMesa}>Mesa {mesas[p.mesa_id] || '?'}</Text>
              <Text style={styles.historialMonto}>{money(p.total)}</Text>
            </View>
            <Text style={styles.historialItems}>{p.pedido_items.map((it) => `${it.cantidad}× ${it.productos?.nombre}`).join(', ')}</Text>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.botonAyudaFlotante} onPress={() => setMostrarAyuda(true)}>
        <Text style={styles.botonAyudaFlotanteTexto}>❓ Ayuda</Text>
      </TouchableOpacity>

      <Modal visible={mostrarAyuda} transparent animationType="slide" onRequestClose={() => setMostrarAyuda(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>❓ Ayuda</Text>
            <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
              {AYUDA_MESERO.map((s, i) => (
                <View key={i} style={styles.ayudaItem}>
                  <Text style={styles.ayudaItemTitulo}>{s.titulo}</Text>
                  <Text style={styles.ayudaItemTexto}>{s.texto}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarAyuda(false)}>
              <Text style={styles.cerrarModalTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingTop: 50 },
  titulo: { fontSize: 22, fontWeight: '800', color: '#f2f2f2' },
  subtituloHeader: { fontSize: 13, color: '#d4a338', marginTop: 2 },
  salir: { color: '#a0a0b0', fontSize: 15 },

  statsGrid: { flexDirection: 'row', paddingHorizontal: 10, gap: 8 },
  statCard: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, margin: 2, alignItems: 'center' },
  statValor: { color: '#d4a338', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#a0a0b0', fontSize: 11, marginTop: 4, textAlign: 'center', textTransform: 'uppercase' },

  avisos: { paddingHorizontal: 14, marginTop: 16 },
  avisoItem: { backgroundColor: '#3a2f1a', borderRadius: 12, padding: 12, marginBottom: 8 },
  avisoTexto: { color: '#e0b94c', fontSize: 15 },

  seccionTitulo: { color: '#d4a338', fontSize: 15, fontWeight: '800', marginTop: 24, marginBottom: 10, paddingHorizontal: 16 },
  vacio: { color: '#a0a0b0', textAlign: 'center', marginTop: 10, fontSize: 15, paddingHorizontal: 16 },

  pedidoCard: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, marginHorizontal: 14, marginBottom: 12 },
  pedidoMesa: { color: '#f2f2f2', fontSize: 19, fontWeight: '700' },
  pedidoEstado: { color: '#a0a0b0', fontSize: 14, marginTop: 4, marginBottom: 12, textTransform: 'capitalize' },
  boton: { backgroundColor: '#d4a338', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },

  historialCard: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginHorizontal: 14, marginBottom: 8 },
  historialHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  historialMesa: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  historialMonto: { color: '#3ecf8e', fontSize: 15, fontWeight: '700' },
  historialItems: { color: '#a0a0b0', fontSize: 13, marginTop: 4 },

  botonAyudaFlotante: {
    position: 'absolute', bottom: 20, right: 16,
    backgroundColor: '#1e1e2e', borderWidth: 1, borderColor: '#d4a338',
    borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  botonAyudaFlotanteTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalDetalle: { backgroundColor: '#1e1e2e', borderRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '80%' },
  modalTitulo: { color: '#f2f2f2', fontSize: 22, fontWeight: '800' },
  ayudaItem: { marginBottom: 18 },
  ayudaItemTitulo: { color: '#d4a338', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  ayudaItemTexto: { color: '#c0c0cc', fontSize: 14, lineHeight: 20 },
  cerrarModal: { padding: 14, alignItems: 'center', marginTop: 6 },
  cerrarModalTexto: { color: '#a0a0b0', fontSize: 15 },
})
