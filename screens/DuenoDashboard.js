import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Modal, ScrollView, Image } from 'react-native'
import { supabase, cerrarSesion } from '../lib/supabase'

const ESTADO_LABEL = {
  pendiente: 'Nuevo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  en_camino: 'En camino',
}

const SIGUIENTE_ESTADO = {
  pendiente: { siguiente: 'confirmado', boton: '✅ Confirmar pedido' },
  confirmado: { siguiente: 'preparando', boton: '🍸 Marcar preparando' },
  preparando: { siguiente: 'en_camino', boton: '🚶 Llevar a la mesa' },
  en_camino: { siguiente: 'entregado', boton: '📬 Marcar entregado' },
}

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}

function colorPorAntiguedad(createdAt) {
  const minutos = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (minutos < 5) return '#3ecf8e' // verde
  if (minutos < 10) return '#e0b94c' // amarillo
  return '#e05c5c' // rojo
}

export default function DuenoDashboard({ usuario, onCerrarSesion, onIrComision, onIrMenu, onIrConfiguracion }) {
  const [mesas, setMesas] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)
  const [detalle, setDetalle] = useState(null) // { mesa, pedido, items }
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const cargar = useCallback(async () => {
    const { data: mesasData } = await supabase
      .from('mesas')
      .select('id, numero, sesion_actual')
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

  async function abrirDetalle(mesa) {
    setCargandoDetalle(true)
    const { data: historial } = await supabase
      .from('pedidos')
      .select('id, estado, total, created_at')
      .eq('mesa_id', mesa.id)
      .eq('sesion_id', mesa.sesion_actual)
      .neq('estado', 'cancelado')
      .order('created_at', { ascending: true })

    let items = []
    let pago = null
    if (mesa.pedido) {
      const { data: itemsData } = await supabase
        .from('pedido_items')
        .select('id, cantidad, precio_unitario, productos(nombre)')
        .eq('pedido_id', mesa.pedido.id)
      items = itemsData || []

      const { data: pagoData } = await supabase
        .from('pagos')
        .select('id, metodo, monto, comprobante_url, confirmado')
        .eq('pedido_id', mesa.pedido.id)
        .maybeSingle()
      pago = pagoData || null
    }
    setDetalle({ mesa, pedido: mesa.pedido || null, items, historial: historial || [], pago })
    setCargandoDetalle(false)
  }

  async function confirmarPago() {
    if (!detalle?.pago) return
    await supabase.from('pagos').update({ confirmado: true }).eq('id', detalle.pago.id)
    setDetalle({ ...detalle, pago: { ...detalle.pago, confirmado: true } })
  }

  async function cerrarMesa() {
    if (!detalle) return
    await supabase.rpc('cerrar_mesa', { p_mesa_id: detalle.mesa.id })
    setDetalle(null)
    cargar()
  }

  async function avanzarDesdeDetalle() {
    if (!detalle || !detalle.pedido) return
    const paso = SIGUIENTE_ESTADO[detalle.pedido.estado]
    if (!paso) return
    await supabase.from('pedidos').update({ estado: paso.siguiente, updated_at: new Date().toISOString() }).eq('id', detalle.pedido.id)
    if (paso.siguiente === 'entregado') {
      setDetalle({ ...detalle, pedido: null })
    } else {
      setDetalle({ ...detalle, pedido: { ...detalle.pedido, estado: paso.siguiente } })
    }
    cargar()
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
          <TouchableOpacity
            style={[
              styles.mesaCard,
              { borderColor: item.pedido ? colorPorAntiguedad(item.pedido.created_at) : '#2a2a3a' },
            ]}
            onPress={() => abrirDetalle(item)}
            activeOpacity={0.6}
          >
            <Text style={styles.mesaNumero}>Mesa {item.numero}</Text>
            <Text style={styles.mesaEstado}>
              {item.pedido ? ESTADO_LABEL[item.pedido.estado] || item.pedido.estado : 'Libre'}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!detalle} transparent animationType="slide" onRequestClose={() => setDetalle(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            {detalle && (
              <>
                <Text style={styles.modalTitulo}>Mesa {detalle.mesa.numero}</Text>
                <Text style={styles.modalEstado}>
                  {detalle.pedido ? (ESTADO_LABEL[detalle.pedido.estado] || detalle.pedido.estado) : 'Sin pedido activo'}
                </Text>

                {detalle.pedido && (
                  <>
                    <Text style={styles.subtitulo}>Pedido actual</Text>
                    {detalle.items.map((it) => (
                      <View key={it.id} style={styles.itemFila}>
                        <Text style={styles.itemTexto}>{it.cantidad}x {it.productos?.nombre}</Text>
                        <Text style={styles.itemTexto}>{money(it.precio_unitario * it.cantidad)}</Text>
                      </View>
                    ))}
                    {SIGUIENTE_ESTADO[detalle.pedido.estado] && (
                      <TouchableOpacity style={styles.boton} onPress={avanzarDesdeDetalle}>
                        <Text style={styles.botonTexto}>{SIGUIENTE_ESTADO[detalle.pedido.estado].boton}</Text>
                      </TouchableOpacity>
                    )}

                    {detalle.pago && (
                      <View style={styles.pagoBox}>
                        <Text style={styles.subtitulo}>Pago — {detalle.pago.metodo}</Text>
                        {detalle.pago.comprobante_url && (
                          <Image source={{ uri: detalle.pago.comprobante_url }} style={styles.comprobanteImg} resizeMode="contain" />
                        )}
                        {detalle.pago.confirmado ? (
                          <Text style={styles.pagoConfirmado}>✅ Pago confirmado</Text>
                        ) : (
                          <TouchableOpacity style={styles.botonConfirmarPago} onPress={confirmarPago}>
                            <Text style={styles.botonTexto}>Confirmar que recibí el pago</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}

                <Text style={styles.subtitulo}>Cuenta de esta visita</Text>
                <ScrollView style={{ maxHeight: 180 }}>
                  {detalle.historial.map((h, i) => (
                    <View key={h.id} style={styles.itemFila}>
                      <Text style={styles.itemTexto}>Ronda {i + 1} — {ESTADO_LABEL[h.estado] || h.estado}</Text>
                      <Text style={styles.itemTexto}>{money(h.total)}</Text>
                    </View>
                  ))}
                  {detalle.historial.length === 0 && <Text style={styles.itemTexto}>Sin pedidos todavía.</Text>}
                </ScrollView>
                <View style={styles.itemFila}>
                  <Text style={styles.totalTexto}>Total de la visita</Text>
                  <Text style={styles.totalTexto}>{money(detalle.historial.reduce((s, h) => s + Number(h.total), 0))}</Text>
                </View>

                {!detalle.pedido && (
                  <TouchableOpacity style={styles.botonCerrarMesa} onPress={cerrarMesa}>
                    <Text style={styles.botonTexto}>🧾 Cerrar mesa (cuenta pagada)</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cerrarModal} onPress={() => setDetalle(null)}>
                  <Text style={styles.cerrarModalTexto}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrMenu}>
          <Text style={styles.footerBotonTexto}>📋 Menú</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrComision}>
          <Text style={styles.footerBotonTexto}>💳 Pagar a Ronda</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrConfiguracion}>
          <Text style={styles.footerBotonTexto}>⚙️ Config</Text>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalDetalle: { backgroundColor: '#1e1e2e', borderRadius: 20, padding: 20, paddingBottom: 34 },
  modalTitulo: { color: '#f2f2f2', fontSize: 22, fontWeight: '800' },
  modalEstado: { color: '#d4a338', fontSize: 15, marginTop: 4 },
  subtitulo: { color: '#a0a0b0', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
  itemFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  itemTexto: { color: '#f2f2f2', fontSize: 15 },
  totalTexto: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  botonCerrarMesa: { backgroundColor: '#3ecf8e', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  pagoBox: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, marginTop: 14 },
  comprobanteImg: { width: '100%', height: 180, borderRadius: 10, marginBottom: 10, backgroundColor: '#14141f' },
  pagoConfirmado: { color: '#3ecf8e', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  botonConfirmarPago: { backgroundColor: '#3ecf8e', borderRadius: 12, padding: 14, alignItems: 'center' },
  cerrarModal: { padding: 14, alignItems: 'center', marginTop: 6 },
  cerrarModalTexto: { color: '#a0a0b0', fontSize: 15 },
})
