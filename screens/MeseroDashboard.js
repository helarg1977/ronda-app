import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Vibration, Animated, Image } from 'react-native'
import { Audio } from 'expo-av'
import { supabase, cerrarSesion } from '../lib/supabase'
import { mensajeAmigable } from '../lib/erroresAmigables'
import { money, inicioDeHoy } from '../lib/formato'
import CapaFlotante from '../components/CapaFlotante'
import TarjetaParpadeante from '../components/TarjetaParpadeante'
import GuiaPantalla from '../components/GuiaPantalla'

const SONIDO_NOTIFICACION = 'https://raw.githubusercontent.com/helarg1977/ronda-app/main/assets/ronda-chime.wav'

async function reproducirSonido(insistente) {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: SONIDO_NOTIFICACION })
    await sound.playAsync()
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync()
        if (insistente) setTimeout(() => reproducirSonido(false), 350)
      }
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

const ESTADO_LABEL_MESERO = {
  pendiente: 'nuevo pedido',
  confirmado: 'preparar pedido',
  preparando: 'llevar a la mesa',
  en_camino: 'confirmar entrega',
}

const SIGUIENTE_ESTADO = {
  pendiente: { siguiente: 'confirmado', boton: '✅ Aceptar pedido' },
  confirmado: { siguiente: 'preparando', boton: '🍸 Marcar preparando' },
  preparando: { siguiente: 'en_camino', boton: '🚶 Llevar a la mesa' },
  en_camino: { siguiente: 'entregado', boton: '📬 Marcar entregado' },
}

function tiempoTranscurrido(fecha) {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return { texto: 'Hace unos segundos', color: '#3ecf8e' }
  if (min < 3) return { texto: `Hace ${min} min`, color: '#3ecf8e' }
  if (min < 6) return { texto: `Hace ${min} min`, color: '#e0b94c' }
  return { texto: `Hace ${min} min`, color: '#e05c5c' }
}

export default function MeseroDashboard({ usuario, onCerrarSesion }) {
  const respiracion = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(respiracion, { toValue: 0.55, duration: 1400, useNativeDriver: true }),
        Animated.timing(respiracion, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const [pedidos, setPedidos] = useState([])
  const [bar, setBar] = useState(null)
  const [pagoPorPedido, setPagoPorPedido] = useState({})
  const [mesas, setMesas] = useState({})
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)
  const [historialHoy, setHistorialHoy] = useState([])
  const [propinasHoy, setPropinasHoy] = useState(0)
  const [tiempoPromedio, setTiempoPromedio] = useState(null)
  const [mostrarAyuda, setMostrarAyuda] = useState(false)
  const [chatCanal, setChatCanal] = useState(null) // { canal, titulo }
  const [mensajesChat, setMensajesChat] = useState([])
  const [textoChat, setTextoChat] = useState('')
  const [canalesConNuevos, setCanalesConNuevos] = useState({})
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mesasHistorialAbiertas, setMesasHistorialAbiertas] = useState({})
  const [altoFlotante, setAltoFlotante] = useState(80)
  const mesasPermitidasRef = useRef(new Set())
  const [detallePedido, setDetallePedido] = useState(null)
  const [misMesas, setMisMesas] = useState([])
  const [mostrarMotivoApoyo, setMostrarMotivoApoyo] = useState(false)

  const cargar = useCallback(async () => {
    const { data: barData } = await supabase.from('bares').select('nombre, logo_url').eq('id', usuario.bar_id).maybeSingle()
    setBar(barData)

    const { data: mesasData } = await supabase.from('mesas').select('id, numero, mesero_asignado_id').eq('bar_id', usuario.bar_id)
    const mesasPermitidas = new Set(
      (mesasData || []).filter((m) => !m.mesero_asignado_id || m.mesero_asignado_id === usuario.id).map((m) => m.id)
    )
    mesasPermitidasRef.current = mesasPermitidas

    const { data: pedidosData } = await supabase
      .from('pedidos').select('id, mesa_id, estado, total, created_at, pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).not('estado', 'in', '(entregado,cancelado)')
      .order('created_at', { ascending: true })

    const { data: solicitudesData } = await supabase
      .from('solicitudes').select('id, mesa_id, tipo, created_at')
      .eq('bar_id', usuario.bar_id).eq('atendida', false)

    const mesasMap = {}
    ;(mesasData || []).forEach((m) => { mesasMap[m.id] = m.numero })

    setPedidos((pedidosData || []).filter((p) => mesasPermitidas.has(p.mesa_id)))
    setMesas(mesasMap)
    setSolicitudes((solicitudesData || []).filter((s) => mesasPermitidas.has(s.mesa_id)))
    setMisMesas((mesasData || []).filter((m) => mesasPermitidas.has(m.id)).sort((a, b) => Number(a.numero) - Number(b.numero)))

    const idsPedidosActivos = (pedidosData || []).map((p) => p.id)
    if (idsPedidosActivos.length > 0) {
      const { data: pagosData } = await supabase.from('pagos').select('pedido_id, metodo, confirmado').in('pedido_id', idsPedidosActivos)
      const mapaPagos = {}
      ;(pagosData || []).forEach((p) => { mapaPagos[p.pedido_id] = p })
      setPagoPorPedido(mapaPagos)
    } else {
      setPagoPorPedido({})
    }

    const { data: entregadosHoy } = await supabase
      .from('pedidos').select('id, mesa_id, total, created_at, pedido_items(cantidad, productos(nombre))')
      .eq('mesero_id', usuario.id).eq('estado', 'entregado').gte('created_at', inicioDeHoy())
      .order('created_at', { ascending: false })
    setHistorialHoy(entregadosHoy || [])

    const idsEntregadosHoy = (entregadosHoy || []).map((p) => p.id)
    if (idsEntregadosHoy.length > 0) {
      const { data: eventosHoy } = await supabase.from('pedido_eventos').select('pedido_id, estado, created_at').in('pedido_id', idsEntregadosHoy)
      const duraciones = []
      idsEntregadosHoy.forEach((id) => {
        const evs = (eventosHoy || []).filter((e) => e.pedido_id === id)
        const inicio = evs.find((e) => e.estado === 'pendiente')
        const fin = evs.find((e) => e.estado === 'entregado')
        if (inicio && fin) duraciones.push((new Date(fin.created_at) - new Date(inicio.created_at)) / 60000)
      })
      if (duraciones.length > 0) setTiempoPromedio(duraciones.reduce((s, d) => s + d, 0) / duraciones.length)
    }

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pagos' }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, (payload) => {
        if (mesasPermitidasRef.current.has(payload.new.mesa_id)) reproducirSonido()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, (payload) => {
        if (mesasPermitidasRef.current.has(payload.new.mesa_id)) {
          reproducirSonido(payload.new.tipo === 'cuenta')
          if (payload.new.tipo === 'cuenta' || payload.new.tipo === 'mesero') Vibration.vibrate([0, 250, 100, 250])
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `bar_id=eq.${usuario.bar_id}` }, (payload) => {
        if (payload.new.de === 'mesero') return
        if (chatCanal && payload.new.canal === chatCanal.canal) {
          setMensajesChat((m) => [...m, payload.new])
        } else {
          setCanalesConNuevos((c) => ({ ...c, [payload.new.canal]: true }))
          reproducirSonido()
        }
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar, usuario.bar_id, chatCanal])

  async function cancelarPedidoActivo(pedido) {
    Alert.alert('Cancelar pedido', '¿Cancelar este pedido? El cliente va a ver que se canceló.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
          const { error: errorPago } = await supabase.from('pagos').delete().eq('pedido_id', pedido.id)
          if (errorPago) { Alert.alert('No se pudo cancelar', mensajeAmigable(errorPago, 'Intenta de nuevo.')); return }
          const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedido.id)
          if (error) { Alert.alert('No se pudo cancelar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
          setDetallePedido(null)
          cargar()
        },
      },
    ])
  }

  async function avanzarEstado(pedido) {
    const paso = SIGUIENTE_ESTADO[pedido.estado]
    if (!paso) return
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: paso.siguiente, mesero_id: usuario.id, updated_at: new Date().toISOString() })
      .eq('id', pedido.id)
      .eq('estado', pedido.estado)
      .select()
    if (error) {
      Alert.alert('No se pudo actualizar', error.message)
      return
    }
    if (!data || data.length === 0) {
      Alert.alert('Este pedido ya cambió', 'Alguien más (otro mesero, o el dueño) ya lo actualizó. Refrescando...')
      cargar()
    }
  }

  async function atenderSolicitud(id) {
    const { error } = await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
    if (error) Alert.alert('No se pudo actualizar', mensajeAmigable(error, 'Intenta de nuevo.'))
  }

  async function abrirDetallePedido(pedido) {
    const { data: items } = await supabase.from('pedido_items').select('id, cantidad, precio_unitario, productos(nombre)').eq('pedido_id', pedido.id)
    const { data: pedidoCompleto } = await supabase.from('pedidos').select('cliente_nombre').eq('id', pedido.id).maybeSingle()
    const { data: pago } = await supabase.from('pagos').select('metodo, monto, comprobante_url, confirmado').eq('pedido_id', pedido.id).maybeSingle()
    setDetallePedido({ ...pedido, items: items || [], cliente_nombre: pedidoCompleto?.cliente_nombre, pago: pago || null })
  }

  async function pedirAyudaUrgente(motivo) {
    const { error } = await supabase.from('mensajes_chat').insert({
      bar_id: usuario.bar_id, canal: `dueno-${usuario.id}`, de: 'mesero', nombre: usuario.nombre,
      texto: `🚨 Necesito apoyo: ${motivo}`,
    })
    if (error) {
      Alert.alert('No se pudo avisar', 'Revisa tu conexión e intenta de nuevo — esto es urgente.')
      return
    }
    setMostrarMotivoApoyo(false)
    Alert.alert('Enviado', 'Ya le avisamos al dueño que necesitas apoyo.')
  }

  async function abrirChat(canal, titulo) {
    setChatCanal({ canal, titulo })
    setCanalesConNuevos((c) => ({ ...c, [canal]: false }))
    const { data, error } = await supabase.from('mensajes_chat').select('id, de, nombre, texto, created_at').eq('canal', canal).order('created_at', { ascending: true })
    if (error) Alert.alert('No se pudo cargar el chat', error.message)
    setMensajesChat(data || [])
  }

  async function enviarMensajeChat() {
    if (!textoChat.trim() || !chatCanal) return
    const texto = textoChat.trim()
    setTextoChat('')
    const { data, error } = await supabase.from('mensajes_chat').insert({
      bar_id: usuario.bar_id,
      canal: chatCanal.canal,
      de: 'mesero',
      nombre: usuario.nombre,
      texto,
    }).select().single()
    if (error) {
      setTextoChat(texto)
      Alert.alert('No se pudo enviar', 'Revisa tu conexión e intenta de nuevo.')
      return
    }
    setMensajesChat((m) => [...m, data])
  }

  async function borrarMensajeChat(id) {
    Alert.alert('Borrar mensaje', '¿Borrar este mensaje?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('mensajes_chat').delete().eq('id', id)
          if (error) { Alert.alert('No se pudo borrar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
          setMensajesChat((m) => m.filter((x) => x.id !== id))
        },
      },
    ])
  }

  const mesasAtendidasHoy = new Set(historialHoy.map((p) => p.mesa_id)).size

  const todasLasTareas = [
    ...pedidos.map((p) => ({ tipo: 'pedido', mesa_id: p.mesa_id, created_at: p.created_at, item: p })),
    ...solicitudes.map((s) => ({ tipo: 'solicitud', mesa_id: s.mesa_id, created_at: s.created_at, item: s })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const prioridadActual = todasLasTareas[0]

  return (
    <View style={styles.container}>
      <GuiaPantalla
        id="mesero_panel"
        barId={usuario.bar_id}
        pasos={[
          { icono: '🎯', titulo: 'Tu prioridad ahora', texto: 'Arriba de todo siempre ves qué mesa atender primero — no tienes que ir revisando una por una.' },
          { icono: '🪑', titulo: 'Mis mesas', texto: 'Agrupadas por color: 🟡 necesitan atención, 🔵 en proceso, ⚪ libres. Toca cualquiera para ver el detalle.' },
          { icono: '🚨', titulo: '¿Necesitas ayuda?', texto: 'El botón "Necesito apoyo" le avisa al dueño de inmediato, con el motivo — mucha gente, falta producto, cliente complicado, lo que sea.' },
          { icono: '💬', titulo: 'Habla con el dueño o con una mesa', texto: 'El chat está siempre a la mano — para avisar algo puntual o responder a un cliente.' },
        ]}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ paddingBottom: altoFlotante + 20 }}
      >
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {bar?.logo_url && <Image source={{ uri: bar.logo_url }} style={styles.logoHeader} />}
            <View>
              <Text style={styles.titulo}>Hola, {usuario.nombre?.split(' ')[0] || 'mesero'}</Text>
              <Text style={styles.subtituloHeader}>{bar?.nombre ? `${bar.nombre} — Panel de mesero` : 'Panel de mesero'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={async () => { await cerrarSesion(); onCerrarSesion() }}>
            <Text style={styles.salir}>Salir</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          const carga = todasLasTareas.length
          const info = carga === 0
            ? { texto: '🟢 Todo bajo control', color: '#3ecf8e' }
            : carga <= 2
            ? { texto: `🟡 Hay ${carga} mesa${carga !== 1 ? 's' : ''} esperando`, color: '#e0b94c' }
            : carga <= 4
            ? { texto: '🟠 Atención: se están acumulando pedidos', color: '#e0954c' }
            : { texto: '🔴 Necesitas apoyo', color: '#e05c5c' }
          return <Text style={[styles.indicadorTranquilidad, { color: info.color }]}>{info.texto}</Text>
        })()}

        {(() => {
          const prioridad = prioridadActual
          const pasoPrioridad = prioridad?.tipo === 'pedido' ? SIGUIENTE_ESTADO[prioridad.item.estado] : null
          return (
            <View style={styles.prioridadCard}>
              <Text style={styles.prioridadLabel}>🎯 TU PRIORIDAD AHORA</Text>
              {!prioridad ? (
                <Text style={styles.prioridadTextoOk}>🟢 Todo bajo control — sin pendientes</Text>
              ) : prioridad.tipo === 'pedido' ? (
                <>
                  <View style={styles.prioridadHeaderFila}>
                    <Text style={styles.prioridadTexto}>Mesa {mesas[prioridad.mesa_id] || '?'} — {ESTADO_LABEL_MESERO[prioridad.item.estado] || prioridad.item.estado}</Text>
                    <Text style={[styles.prioridadTiempo, { color: tiempoTranscurrido(prioridad.created_at).color }]}>
                      {tiempoTranscurrido(prioridad.created_at).texto}
                    </Text>
                  </View>
                  <Text style={styles.prioridadItems}>
                    {prioridad.item.pedido_items?.map((it) => `${it.cantidad} ${it.productos?.nombre}`).join(' · ')} — {money(prioridad.item.total)}
                  </Text>
                  {pagoPorPedido[prioridad.item.id] && (
                    <Text style={pagoPorPedido[prioridad.item.id].confirmado ? styles.pagoConfirmadoTexto : styles.pagoPendienteTextoChico}>
                      {pagoPorPedido[prioridad.item.id].confirmado
                        ? `✅ Pago confirmado (${pagoPorPedido[prioridad.item.id].metodo})`
                        : `⏳ Pago sin confirmar (${pagoPorPedido[prioridad.item.id].metodo})`}
                    </Text>
                  )}
                  {pasoPrioridad && (
                    <TouchableOpacity style={styles.boton} onPress={() => avanzarEstado(prioridad.item)}>
                      <Text style={styles.botonTexto}>{pasoPrioridad.boton}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.botonSecundarioChico} onPress={() => abrirDetallePedido(prioridad.item)}>
                    <Text style={styles.botonSecundarioChicoTexto}>Ver detalle</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.prioridadHeaderFila}>
                    <Text style={styles.prioridadTexto}>Mesa {mesas[prioridad.mesa_id] || '?'} pide: {prioridad.item.tipo}</Text>
                    <Text style={[styles.prioridadTiempo, { color: tiempoTranscurrido(prioridad.created_at).color }]}>
                      {tiempoTranscurrido(prioridad.created_at).texto}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.boton} onPress={() => atenderSolicitud(prioridad.item.id)}>
                    <Text style={styles.botonTexto}>Marcar atendido</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )
        })()}

        {solicitudes.length > 0 && (
          <View style={styles.avisos}>
            {solicitudes.map((s) => (
              <TouchableOpacity key={s.id} style={styles.avisoItem} onPress={() => atenderSolicitud(s.id)}>
                <Text style={styles.avisoTexto}>✋ Mesa {mesas[s.mesa_id] || '?'} pide: {s.tipo}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.seccionTitulo}>Pedidos activos</Text>
        {pedidos.length === 0 && <Text style={styles.vacio}>Sin pedidos pendientes por ahora 🍹</Text>}
        {pedidos.filter((item) => !(prioridadActual?.tipo === 'pedido' && prioridadActual.item.id === item.id)).map((item) => {
          const paso = SIGUIENTE_ESTADO[item.estado]
          const canalMesa = `mesa-${item.mesa_id}`
          const tiempo = tiempoTranscurrido(item.created_at)
          return (
            <TarjetaParpadeante
              key={item.id}
              activo={item.estado === 'pendiente'}
              style={styles.pedidoCard}
              onPress={() => abrirDetallePedido(item)}
            >
              <View style={styles.pedidoHeaderFila}>
                <Text style={styles.pedidoMesa}>Mesa {mesas[item.mesa_id] || '?'}</Text>
                <Text style={[styles.pedidoTiempo, { color: tiempo.color }]}>{tiempo.texto}</Text>
              </View>
              <Text style={styles.pedidoEstado}>{ESTADO_LABEL_MESERO[item.estado] || item.estado}</Text>
              <View style={styles.barraProgresoFila}>
                {['pendiente', 'confirmado', 'en_camino', 'entregado'].map((paso_, i, arr) => {
                  const pasoActualIdx = { pendiente: 0, confirmado: 1, preparando: 1, en_camino: 2, entregado: 3 }[item.estado] ?? 0
                  const activo = i <= pasoActualIdx
                  return (
                    <View key={paso_} style={styles.barraProgresoSegmento}>
                      <View style={[styles.barraProgresoBarra, activo && styles.barraProgresoBarraActiva]} />
                    </View>
                  )
                })}
              </View>
              {paso && (
                <TouchableOpacity style={styles.boton} onPress={(e) => { e.stopPropagation?.(); avanzarEstado(item) }}>
                  <Text style={styles.botonTexto}>{paso.boton}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.botonChatMesa} onPress={(e) => { e.stopPropagation?.(); abrirChat(canalMesa, `💬 Mesa ${mesas[item.mesa_id] || '?'}`) }}>
                <Text style={styles.botonChatMesaTexto}>
                  💬 Preguntarle algo a la mesa{canalesConNuevos[canalMesa] ? ' 🔴' : ''}
                </Text>
              </TouchableOpacity>
            </TarjetaParpadeante>
          )
        })}

        {(historialHoy.length + pedidos.length) > 0 && (
          <View style={styles.progresoNocheBox}>
            <Text style={styles.progresoNocheTexto}>Hoy llevas {historialHoy.length} entregado{historialHoy.length !== 1 ? 's' : ''} · {pedidos.length} pendiente{pedidos.length !== 1 ? 's' : ''}</Text>
            <View style={styles.progresoNocheBarra}>
              <View style={[styles.progresoNocheRelleno, { width: `${Math.round((historialHoy.length / (historialHoy.length + pedidos.length)) * 100)}%` }]} />
            </View>
            {tiempoPromedio != null && (
              <Text style={styles.tiempoPromedioTexto}>⏱ Tiempo promedio de atención: {Math.round(tiempoPromedio)} min</Text>
            )}
          </View>
        )}

        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statCard} onPress={() => setMostrarHistorial(true)}>
            <Text style={styles.statValor}>🍺 {mesasAtendidasHoy}</Text>
            <Text style={styles.statLabel}>Rondas servidas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setMostrarHistorial(true)}>
            <Text style={styles.statValor}>💰 {money(propinasHoy)}</Text>
            <Text style={styles.statLabel}>Propinas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => pedidos[0] && abrirDetallePedido(pedidos[0])}>
            <Text style={styles.statValor}>⚡ {pedidos.length}</Text>
            <Text style={styles.statLabel}>Esperando por ti</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filaDueno}>
          <TouchableOpacity style={[styles.botonHablarDueno, { flex: 1 }]} onPress={() => abrirChat(`dueno-${usuario.id}`, '🗨️ Chat con el dueño')}>
            <Text style={styles.botonHablarDuenoTexto}>
              📣 Avisar al dueño{canalesConNuevos[`dueno-${usuario.id}`] ? ' 🔴' : ''}
            </Text>
          </TouchableOpacity>
          <Animated.View style={[styles.botonAyudaUrgente, { opacity: respiracion }]}>
            <TouchableOpacity onPress={() => setMostrarMotivoApoyo(true)}>
              <Text style={styles.botonAyudaUrgenteTexto}>🚨 Necesito apoyo</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Text style={styles.seccionTitulo}>Mis mesas</Text>
        {misMesas.length === 0 && <Text style={styles.vacio}>No tienes mesas asignadas todavía.</Text>}
        {(() => {
          const conAtencion = [], enProceso = [], libres = []
          misMesas.forEach((m) => {
            const pedidoDeEstaMesa = pedidos.find((p) => p.mesa_id === m.id)
            const solicitudDeEstaMesa = solicitudes.find((s) => s.mesa_id === m.id)
            if (solicitudDeEstaMesa || pedidoDeEstaMesa?.estado === 'pendiente') conAtencion.push({ m, pedidoDeEstaMesa, solicitudDeEstaMesa })
            else if (pedidoDeEstaMesa) enProceso.push({ m, pedidoDeEstaMesa })
            else libres.push(m)
          })
          const filaDetalle = ({ m, pedidoDeEstaMesa, solicitudDeEstaMesa }) => {
            let texto = ''
            let sub = null
            if (solicitudDeEstaMesa) { texto = `🔵 Pide: ${solicitudDeEstaMesa.tipo}`; sub = tiempoTranscurrido(solicitudDeEstaMesa.created_at) }
            else if (pedidoDeEstaMesa) { texto = `🟡 ${pedidoDeEstaMesa.estado}`; sub = tiempoTranscurrido(pedidoDeEstaMesa.created_at) }
            return (
              <TouchableOpacity key={m.id} style={styles.misMesaFila} onPress={() => pedidoDeEstaMesa && abrirDetallePedido(pedidoDeEstaMesa)}>
                <Text style={styles.misMesaNumero}>Mesa {m.numero}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.misMesaEstado}>{texto}</Text>
                  {pedidoDeEstaMesa && <Text style={styles.misMesaMonto}>{money(pedidoDeEstaMesa.total)}</Text>}
                  {sub && <Text style={[styles.misMesaTiempo, { color: sub.color }]}>{sub.texto}</Text>}
                </View>
              </TouchableOpacity>
            )
          }
          return (
            <>
              {conAtencion.length > 0 && (
                <>
                  <Text style={styles.subgrupoTitulo}>🟡 Necesitan atención ({conAtencion.length})</Text>
                  {conAtencion.map(filaDetalle)}
                </>
              )}
              {enProceso.length > 0 && (
                <>
                  <Text style={styles.subgrupoTitulo}>🔵 En proceso ({enProceso.length})</Text>
                  {enProceso.map(filaDetalle)}
                </>
              )}
              {libres.length > 0 && (
                <View style={styles.libresBox}>
                  <Text style={styles.subgrupoTitulo}>⚪ Libres ({libres.length})</Text>
                  <Text style={styles.libresTexto}>{libres.map((m) => m.numero).join(' · ')}</Text>
                </View>
              )}
            </>
          )
        })()}

        <TouchableOpacity onPress={() => setMostrarHistorial(!mostrarHistorial)}>
          <Text style={[styles.seccionTitulo, { marginBottom: mostrarHistorial ? 10 : 20 }]}>
            {mostrarHistorial ? '▾' : '▸'} Actividad del turno ({historialHoy.length})
          </Text>
        </TouchableOpacity>
        {mostrarHistorial && (() => {
          const porMesa = {}
          historialHoy.forEach((p) => {
            if (!porMesa[p.mesa_id]) porMesa[p.mesa_id] = { numero: mesas[p.mesa_id] || '?', pedidos: [], total: 0 }
            porMesa[p.mesa_id].pedidos.push(p)
            porMesa[p.mesa_id].total += Number(p.total)
          })
          const grupos = Object.entries(porMesa)
          if (grupos.length === 0) return <Text style={styles.vacio}>Aún no has entregado pedidos hoy.</Text>
          return grupos.map(([mesaId, grupo]) => (
            <View key={mesaId} style={styles.grupoMesaHistorial}>
              <TouchableOpacity style={styles.grupoMesaHeader} onPress={() => setMesasHistorialAbiertas((h) => ({ ...h, [mesaId]: !h[mesaId] }))}>
                <Text style={styles.grupoMesaTitulo}>
                  {mesasHistorialAbiertas[mesaId] ? '▾' : '▸'} Mesa {grupo.numero} — {grupo.pedidos.length} pedido{grupo.pedidos.length !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.grupoMesaTotal}>{money(grupo.total)}</Text>
              </TouchableOpacity>
              {mesasHistorialAbiertas[mesaId] && (
                <View style={styles.grupoMesaContenido}>
                  {grupo.pedidos.map((p) => (
                    <View key={p.id} style={styles.historialCard}>
                      <View style={styles.historialHeader}>
                        <Text style={styles.pedidoHora}>{new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Text>
                        <Text style={styles.historialMonto}>{money(p.total)}</Text>
                      </View>
                      <Text style={styles.historialItems}>{p.pedido_items.map((it) => `${it.cantidad}× ${it.productos?.nombre}`).join(', ')}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        })()}
      </ScrollView>

      <CapaFlotante onAltoCambio={setAltoFlotante}>
        <TouchableOpacity style={styles.botonAyudaFlotante} onPress={() => setMostrarAyuda(true)}>
          <Text style={styles.botonAyudaFlotanteTexto}>❓ Ayuda</Text>
        </TouchableOpacity>
      </CapaFlotante>

      <Modal visible={!!detallePedido} transparent animationType="slide" onRequestClose={() => setDetallePedido(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            {detallePedido && (
              <>
                <Text style={styles.modalTitulo}>Mesa {mesas[detallePedido.mesa_id] || '?'}</Text>
                <Text style={{ color: '#d4a338', marginBottom: 10 }}>{detallePedido.estado}</Text>
                {detallePedido.cliente_nombre && <Text style={styles.ayudaItemTexto}>👤 Pidió: {detallePedido.cliente_nombre}</Text>}
                {detallePedido.items.map((it) => (
                  <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' }}>
                    <Text style={styles.ayudaItemTexto}>{it.cantidad}x {it.productos?.nombre}</Text>
                    <Text style={styles.ayudaItemTexto}>{money(it.precio_unitario * it.cantidad)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
                  <Text style={{ color: '#f2f2f2', fontWeight: '700' }}>Total</Text>
                  <Text style={{ color: '#f2f2f2', fontWeight: '700' }}>{money(detallePedido.total)}</Text>
                </View>
                {detallePedido.pago && (
                  <Text style={styles.ayudaItemTexto}>💳 Pago: {detallePedido.pago.metodo} — {detallePedido.pago.confirmado ? '✅ confirmado' : '⏳ pendiente de confirmar'}</Text>
                )}
                {SIGUIENTE_ESTADO[detallePedido.estado] && (
                  <TouchableOpacity style={[styles.boton, { marginTop: 14 }]} onPress={async () => { await avanzarEstado(detallePedido); setDetallePedido(null) }}>
                    <Text style={styles.botonTexto}>{SIGUIENTE_ESTADO[detallePedido.estado].boton}</Text>
                  </TouchableOpacity>
                )}
                {detallePedido.estado === 'pendiente' && (
                  <TouchableOpacity style={styles.botonCancelarPedido} onPress={() => cancelarPedidoActivo(detallePedido)}>
                    <Text style={styles.botonCancelarPedidoTexto}>✕ Cancelar este pedido</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setDetallePedido(null)}>
              <Text style={styles.cerrarModalTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!chatCanal} transparent animationType="slide" onRequestClose={() => setChatCanal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalDetalle}>
              <Text style={styles.modalTitulo}>{chatCanal?.titulo}</Text>
              <ScrollView style={styles.chatMensajes}>
                {mensajesChat.length === 0 && <Text style={styles.vacio}>Sin mensajes todavía.</Text>}
                {mensajesChat.map((m) => (
                  <View key={m.id} style={[styles.chatBurbuja, m.de === 'mesero' ? styles.chatPropia : styles.chatOtra]}>
                    <View style={styles.chatBurbujaFila}>
                      <Text style={[styles.chatAutor, m.de === 'mesero' ? styles.chatAutorPropia : styles.chatAutorOtra]}>{m.de === 'mesero' ? 'Tú' : (m.nombre || m.de)}</Text>
                      {m.de === 'mesero' && (
                        <TouchableOpacity onPress={() => borrarMensajeChat(m.id)}>
                          <Text style={styles.chatBorrarTexto}>🗑️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={[styles.chatTexto, m.de === 'mesero' ? styles.chatTextoPropia : styles.chatTextoOtra]}>{m.texto}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.chatEntradaFila}>
                <TextInput
                  style={styles.chatInput}
                  value={textoChat}
                  onChangeText={setTextoChat}
                  placeholder="Escribe un mensaje…"
                  placeholderTextColor="#6a6a80"
                />
                <TouchableOpacity style={styles.chatEnviarBoton} onPress={enviarMensajeChat}>
                  <Text style={styles.botonTexto}>Enviar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.cerrarModal} onPress={() => setChatCanal(null)}>
                <Text style={styles.cerrarModalTexto}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={mostrarMotivoApoyo} transparent animationType="slide" onRequestClose={() => setMostrarMotivoApoyo(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>🚨 Necesito apoyo porque...</Text>
            {['Hay mucha gente', 'No alcanzo a atender', 'Cliente complicado', 'Falta un producto', 'Necesito al administrador'].map((motivo) => (
              <TouchableOpacity key={motivo} style={styles.opcionMotivoApoyo} onPress={() => pedirAyudaUrgente(motivo)}>
                <Text style={styles.opcionMotivoApoyoTexto}>{motivo}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarMotivoApoyo(false)}>
              <Text style={styles.cerrarModalTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  logoHeader: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1e1e2e' },
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
  pedidoHeaderFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pedidoTiempo: { fontSize: 12, fontWeight: '700' },
  pedidoEstado: { color: '#a0a0b0', fontSize: 14, marginTop: 4, marginBottom: 8, textTransform: 'capitalize' },
  barraProgresoFila: { flexDirection: 'row', gap: 4, marginBottom: 12 },
  barraProgresoSegmento: { flex: 1 },
  barraProgresoBarra: { height: 5, borderRadius: 999, backgroundColor: '#2a2a3a' },
  barraProgresoBarraActiva: { backgroundColor: '#d4a338' },
  boton: { backgroundColor: '#d4a338', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  botonCancelarPedido: { borderWidth: 1, borderColor: '#e05c5c', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 10 },
  botonCancelarPedidoTexto: { color: '#e05c5c', fontSize: 14, fontWeight: '700' },

  historialCard: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginHorizontal: 8, marginBottom: 8 },
  historialHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  historialMesa: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  grupoMesaHistorial: { marginHorizontal: 14, marginBottom: 10, backgroundColor: '#1a1a26', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a3a', overflow: 'hidden' },
  grupoMesaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  grupoMesaTitulo: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  grupoMesaTotal: { color: '#d4a338', fontSize: 14, fontWeight: '800' },
  grupoMesaContenido: { paddingHorizontal: 6, paddingBottom: 10 },
  pedidoHora: { color: '#8a8a9a', fontSize: 12, fontWeight: '600' },
  historialMonto: { color: '#3ecf8e', fontSize: 15, fontWeight: '700' },
  historialItems: { color: '#a0a0b0', fontSize: 13, marginTop: 4 },

  botonAyudaFlotante: {
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

  botonHablarDueno: {
    backgroundColor: '#26263a', borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#d4a338',
  },
  botonHablarDuenoTexto: { color: '#d4a338', fontSize: 14, fontWeight: '700' },
  filaDueno: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginBottom: 16 },
  botonAyudaUrgente: { backgroundColor: '#3a2a12', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e0954c', paddingHorizontal: 16 },
  botonAyudaUrgenteTexto: { color: '#e0954c', fontSize: 13, fontWeight: '800' },
  prioridadCard: { marginHorizontal: 14, marginBottom: 16, backgroundColor: '#1e1e2e', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#3a3020' },
  prioridadLabel: { color: '#d4a338', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  prioridadHeaderFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  prioridadTiempo: { fontSize: 13, fontWeight: '800' },
  prioridadTexto: { color: '#f2f2f2', fontSize: 16, fontWeight: '700', flex: 1 },
  prioridadItems: { color: '#a0a0b0', fontSize: 13, marginBottom: 10 },
  pagoConfirmadoTexto: { color: '#3ecf8e', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  pagoPendienteTextoChico: { color: '#e0954c', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  indicadorTranquilidad: { fontSize: 14, fontWeight: '700', marginHorizontal: 14, marginTop: 4, marginBottom: 16 },
  prioridadTextoOk: { color: '#3ecf8e', fontSize: 16, fontWeight: '700' },
  botonSecundarioChico: { alignItems: 'center', padding: 10, marginTop: 8 },
  botonSecundarioChicoTexto: { color: '#a0a0b0', fontSize: 13, fontWeight: '600' },
  misMesaFila: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginHorizontal: 14, marginBottom: 8 },
  misMesaNumero: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  misMesaEstado: { color: '#a0a0b0', fontSize: 13, fontWeight: '600' },
  misMesaMonto: { color: '#d4a338', fontSize: 12, fontWeight: '700', marginTop: 2 },
  misMesaTiempo: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  subgrupoTitulo: { color: '#8a8a9a', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginHorizontal: 14, marginTop: 10, marginBottom: 6 },
  libresBox: { marginHorizontal: 14, marginBottom: 8 },
  libresTexto: { color: '#6a6a80', fontSize: 13, lineHeight: 20 },
  opcionMotivoApoyo: { backgroundColor: '#26263a', borderRadius: 12, padding: 16, marginBottom: 10 },
  opcionMotivoApoyoTexto: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  progresoNocheBox: { marginHorizontal: 14, marginBottom: 14 },
  progresoNocheTexto: { color: '#a0a0b0', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  progresoNocheBarra: { height: 8, backgroundColor: '#26263a', borderRadius: 999, overflow: 'hidden' },
  progresoNocheRelleno: { height: '100%', backgroundColor: '#d4a338', borderRadius: 999 },
  tiempoPromedioTexto: { color: '#8a8a9a', fontSize: 12, marginTop: 6, fontWeight: '600' },
  botonChatMesa: { marginTop: 10, backgroundColor: '#26263a', borderRadius: 10, padding: 10, alignItems: 'center' },
  botonChatMesaTexto: { color: '#f2f2f2', fontSize: 13, fontWeight: '600' },

  chatMensajes: { maxHeight: 300, marginVertical: 10 },
  chatBurbuja: { maxWidth: '80%', padding: 10, borderRadius: 14, marginBottom: 8 },
  chatPropia: { backgroundColor: '#d4a338', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatOtra: { backgroundColor: '#26263a', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatAutor: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 },
  chatBurbujaFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatBorrarTexto: { fontSize: 13, opacity: 0.6 },
  chatAutorPropia: { color: '#14141f' },
  chatAutorOtra: { color: '#a0a0b0' },
  chatTexto: { fontSize: 14 },
  chatTextoPropia: { color: '#14141f' },
  chatTextoOtra: { color: '#f2f2f2' },
  chatEntradaFila: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chatInput: { flex: 1, backgroundColor: '#26263a', color: '#f2f2f2', borderRadius: 12, padding: 12, fontSize: 15 },
  chatEnviarBoton: { backgroundColor: '#d4a338', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
})
