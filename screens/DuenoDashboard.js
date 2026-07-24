import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, Modal, ScrollView, Image, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
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

const ESTADO_LABEL = {
  pendiente: 'Nuevo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
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

function inicioDeHoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function colorPorAntiguedad(createdAt) {
  const minutos = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (minutos < 5) return '#3ecf8e'
  if (minutos < 10) return '#e0b94c'
  return '#e05c5c'
}
function minutosTexto(createdAt) {
  const minutos = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (minutos < 1) return 'recién pedido'
  if (minutos < 20) return `hace ${minutos} min`
  return `+${minutos} min sin novedad`
}

const ONBOARDING_PASOS = [
  {
    titulo: '¡Bienvenido a Ronda! 🍻',
    texto: 'Esto es tu panel de control. Aquí ves todas las mesas, pedidos y ventas de tu bar en tiempo real. Te mostramos rapidito cómo dejarlo listo para tu primera noche.',
  },
  {
    titulo: '1. Configura tus pagos',
    texto: 'Ve a "⚙️ Config" y guarda tu Nequi, Daviplata o Bre-B. Así, cuando un cliente pague digital, sabe exactamente a qué número transferir. Tú recibes el dinero directo — Ronda nunca lo toca.',
  },
  {
    titulo: '2. Sube tu menú',
    texto: 'Ve a "📋 Menú" y crea tus categorías (Cervezas, Tragos, Cócteles...) y luego agrega los productos con precio y, si quieres, una foto. Puedes tocar las sugerencias para ir más rápido.',
  },
  {
    titulo: '3. Agrega tus mesas',
    texto: 'Ahí mismo en "📋 Menú" baja hasta "Mesas" y toca "+ Agregar mesa" por cada mesa física de tu bar. Cada una genera un código QR único — ese es el que va impreso o pegado en la mesa.',
  },
  {
    titulo: '4. Agrega a tus meseros',
    texto: 'En "⚙️ Config" agrega a cada mesero con su celular y un PIN de 4 dígitos. Con eso entran a su propio panel y reciben los pedidos de las mesas que atienden.',
  },
  {
    titulo: '¡Listo para tu primera noche! 🎉',
    texto: 'El tablero de mesas se pinta de verde/amarillo/rojo según cuánto llevan esperando. Toca cualquier mesa para ver el pedido y avanzarlo. Si te pierdes, el botón "❓ Ayuda" (abajo a la derecha) siempre tiene esta guía a la mano.',
  },
]

const AYUDA_SECCIONES = [
  { titulo: '📋 ¿Cómo subo mi menú?', texto: 'Ve a "Menú" en la parte de abajo. Primero crea categorías (ej: Cervezas), luego dentro de cada una agrega productos con nombre, precio y opcionalmente una foto (pega el link de una imagen).' },
  { titulo: '🪑 ¿Cómo agrego mesas?', texto: 'Dentro de "Menú", baja hasta la sección "Mesas" y toca "+ Agregar mesa". Cada mesa genera su propio código QR — ese código es el que debes imprimir o pegar físicamente en cada mesa del bar.' },
  { titulo: '👥 ¿Cómo agrego a mis meseros?', texto: 'Ve a "⚙️ Config" → "Agregar empleado". Escribe su nombre, celular y un PIN de 4 dígitos. Con esos datos, el mesero entra a su propio panel desde su celular.' },
  { titulo: '💳 ¿Cómo configuro mis pagos?', texto: 'En "⚙️ Config" guarda tu Nequi, Daviplata o Bre-B. Ronda nunca cobra por adelantado ni maneja tu plata — el cliente te paga directo a ti.' },
  { titulo: '✅ ¿Cómo confirmo que me llegó un pago?', texto: 'Toca la mesa correspondiente, revisa el comprobante que subió el cliente, y toca "Confirmar que recibí el pago". También puedes hacerlo desde "Pagos por confirmar" en el panel principal.' },
  { titulo: '🧾 ¿Cómo cierro una mesa cuando el grupo se va?', texto: 'Toca la mesa (debe estar sin pedido activo) y toca "Cerrar mesa (cuenta pagada)". Eso deja la mesa lista y limpia para el siguiente grupo, sin mezclar cuentas.' },
  { titulo: '💰 ¿Cómo pago la comisión a Ronda?', texto: 'En "💳 Pagar a Ronda" ves cuánto has generado y cuánto le corresponde a Ronda (3%). Ahí reportas manualmente tu pago — nunca es automático.' },
]


export default function DuenoDashboard({ usuario, onCerrarSesion, onIrComision, onIrMenu, onIrConfiguracion }) {
  const [bar, setBar] = useState(null)
  const [mesas, setMesas] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [ventasHoy, setVentasHoy] = useState(0)
  const [ventasHoyDetalle, setVentasHoyDetalle] = useState([])
  const [propinasHoy, setPropinasHoy] = useState(0)
  const [propinasHoyDetalle, setPropinasHoyDetalle] = useState([])
  const [pagosPendientes, setPagosPendientes] = useState([])
  const [detalleStat, setDetalleStat] = useState(null) // 'ventas' | 'comision' | 'propinas' | 'pagos'
  const [mostrarAyuda, setMostrarAyuda] = useState(false)
  const [chatCanal, setChatCanal] = useState(null)
  const [mensajesChat, setMensajesChat] = useState([])
  const [textoChat, setTextoChat] = useState('')
  const [canalesConNuevos, setCanalesConNuevos] = useState({})
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false)
  const [pasoOnboarding, setPasoOnboarding] = useState(0)
  const [ranking, setRanking] = useState([])
  const [productoEstrella, setProductoEstrella] = useState(null)
  const [horaPico, setHoraPico] = useState(null)
  const [pedidosRecientes, setPedidosRecientes] = useState([])
  const [mostrarTodosPedidos, setMostrarTodosPedidos] = useState(false)
  const [pedidosVisible, setPedidosVisible] = useState(true)
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState([])

  const cargar = useCallback(async () => {
    const { data: barData } = await supabase.from('bares').select('nombre, comision_pct').eq('id', usuario.bar_id).maybeSingle()
    setBar(barData)

    const { data: mesasData } = await supabase.from('mesas').select('id, numero, sesion_actual').eq('bar_id', usuario.bar_id).eq('activa', true).order('numero')
    const { data: pedidosData } = await supabase
      .from('pedidos').select('id, mesa_id, estado, total, created_at')
      .eq('bar_id', usuario.bar_id).not('estado', 'in', '(entregado,cancelado)')
    const { data: solicitudesData } = await supabase
      .from('solicitudes').select('id, mesa_id, tipo, created_at')
      .eq('bar_id', usuario.bar_id).eq('atendida', false).order('created_at', { ascending: true })

    setMesas(mesasData || [])
    setPedidos(pedidosData || [])
    setSolicitudes(solicitudesData || [])

    // --- Ventas y comisión de hoy ---
    const { data: entregadosHoy } = await supabase
      .from('pedidos')
      .select('id, total, created_at, mesas(numero), pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).eq('estado', 'entregado').gte('created_at', inicioDeHoy())
      .order('created_at', { ascending: false })
    const totalHoy = (entregadosHoy || []).reduce((s, p) => s + Number(p.total), 0)
    setVentasHoy(totalHoy)
    setVentasHoyDetalle(entregadosHoy || [])

    // --- Propinas de hoy ---
    const { data: meserosParaPropinas } = await supabase.from('usuarios_bar').select('id, nombre').eq('bar_id', usuario.bar_id).eq('rol', 'mesero')
    const nombreMeseroPorId = {}
    ;(meserosParaPropinas || []).forEach((m) => { nombreMeseroPorId[m.id] = m.nombre })
    const { data: propinasData } = await supabase
      .from('propinas').select('monto, calificacion, mesero_id, pedidos!inner(bar_id, created_at, mesas(numero))').eq('pedidos.bar_id', usuario.bar_id)
    const hoyMs = new Date(inicioDeHoy()).getTime()
    const propinasHoyLista = (propinasData || []).filter((p) => new Date(p.pedidos.created_at).getTime() >= hoyMs)
    setPropinasHoy(propinasHoyLista.reduce((s, p) => s + Number(p.monto), 0))
    setPropinasHoyDetalle(propinasHoyLista.map((p) => ({ ...p, meseroNombre: nombreMeseroPorId[p.mesero_id] || 'Sin asignar' })))

    // --- Pagos por confirmar ---
    const { data: pagosData } = await supabase
      .from('pagos')
      .select('id, metodo, monto, comprobante_url, pedido_id, pedidos!inner(bar_id, mesa_id, mesas(numero))')
      .eq('pedidos.bar_id', usuario.bar_id).eq('confirmado', false)
    setPagosPendientes(pagosData || [])

    // --- Ranking de meseros ---
    const { data: meseros } = await supabase.from('usuarios_bar').select('id, nombre').eq('bar_id', usuario.bar_id).eq('rol', 'mesero').eq('activo', true)
    const rankingCalculado = await Promise.all(
      (meseros || []).map(async (m) => {
        const { data: suyos } = await supabase.from('pedidos').select('total, estado').eq('mesero_id', m.id)
        const { data: props } = await supabase.from('propinas').select('monto').eq('mesero_id', m.id)
        const entregados = (suyos || []).filter((p) => p.estado === 'entregado')
        return {
          id: m.id,
          nombre: m.nombre,
          ventas: entregados.reduce((s, p) => s + Number(p.total), 0),
          entregados: entregados.length,
          propinas: (props || []).reduce((s, p) => s + Number(p.monto), 0),
        }
      })
    )
    rankingCalculado.sort((a, b) => b.ventas - a.ventas)
    setRanking(rankingCalculado)

    // --- Producto estrella y hora pico ---
    const { data: itemsVendidos } = await supabase
      .from('pedido_items').select('cantidad, productos(nombre), pedidos!inner(bar_id, total, created_at)').eq('pedidos.bar_id', usuario.bar_id)
    if (itemsVendidos && itemsVendidos.length > 0) {
      const conteo = {}
      itemsVendidos.forEach((it) => {
        const nombre = it.productos?.nombre || '—'
        conteo[nombre] = (conteo[nombre] || 0) + it.cantidad
      })
      const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]
      setProductoEstrella(top ? { nombre: top[0], unidades: top[1] } : null)
    }
    const { data: pedidosParaHora } = await supabase.from('pedidos').select('total, created_at').eq('bar_id', usuario.bar_id).eq('estado', 'entregado')
    if (pedidosParaHora && pedidosParaHora.length > 0) {
      const porHora = {}
      pedidosParaHora.forEach((p) => {
        const hora = new Date(p.created_at).getHours()
        porHora[hora] = (porHora[hora] || 0) + Number(p.total)
      })
      const top = Object.entries(porHora).sort((a, b) => b[1] - a[1])[0]
      if (top) setHoraPico({ hora: top[0], total: top[1] })
    }

    // --- Pedidos recientes ---
    const { data: recientes } = await supabase
      .from('pedidos')
      .select('id, estado, total, created_at, cliente_nombre, mesas(numero), pagos(metodo), pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).order('created_at', { ascending: false }).limit(10)
    setPedidosRecientes(recientes || [])
  }, [usuario.bar_id])

  useEffect(() => {
    cargar()
    AsyncStorage.getItem(`ronda_onboarding_${usuario.bar_id}`).then((visto) => {
      if (!visto) setMostrarOnboarding(true)
    })
    const canalPedidos = supabase
      .channel(`dueno-pedidos-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `bar_id=eq.${usuario.bar_id}` }, reproducirSonido)
      .subscribe()
    const canalSolicitudes = supabase
      .channel(`dueno-solicitudes-${usuario.bar_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `bar_id=eq.${usuario.bar_id}` }, reproducirSonido)
      .subscribe()
    const canalChat = supabase
      .channel(`dueno-chat-${usuario.bar_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `bar_id=eq.${usuario.bar_id}` }, (payload) => {
        if (payload.new.de === 'dueno') return
        if (chatCanal && payload.new.canal === chatCanal.canal) {
          setMensajesChat((m) => [...m, payload.new])
        } else {
          setCanalesConNuevos((c) => ({ ...c, [payload.new.canal]: true }))
          reproducirSonido()
        }
      })
      .subscribe()
    const intervalo = setInterval(cargar, 30000)
    return () => {
      supabase.removeChannel(canalPedidos)
      supabase.removeChannel(canalSolicitudes)
      supabase.removeChannel(canalChat)
      clearInterval(intervalo)
    }
  }, [cargar, usuario.bar_id, chatCanal])

  async function atenderSolicitud(id) {
    await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
  }

  async function abrirChat(canal, titulo) {
    setChatCanal({ canal, titulo })
    setCanalesConNuevos((c) => ({ ...c, [canal]: false }))
    const { data } = await supabase.from('mensajes_chat').select('id, de, nombre, texto, created_at').eq('canal', canal).order('created_at', { ascending: true })
    setMensajesChat(data || [])
  }

  async function enviarMensajeChat() {
    if (!textoChat.trim() || !chatCanal) return
    const texto = textoChat.trim()
    setTextoChat('')
    const { data, error } = await supabase.from('mensajes_chat').insert({ bar_id: usuario.bar_id, canal: chatCanal.canal, de: 'dueno', nombre: 'Dueño', texto }).select().single()
    if (error) { console.log('Error enviando mensaje:', error.message); return }
    setMensajesChat((m) => [...m, data])
  }

  async function terminarOnboarding() {
    await AsyncStorage.setItem(`ronda_onboarding_${usuario.bar_id}`, '1')
    setMostrarOnboarding(false)
    setPasoOnboarding(0)
  }

  async function agregarMesa() {
    const siguienteNumero = mesas.length > 0 ? Math.max(...mesas.map((m) => Number(m.numero) || 0)) + 1 : 1
    Alert.alert('Agregar mesa', `¿Crear la Mesa ${siguienteNumero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Crear', onPress: async () => {
          const { error } = await supabase.from('mesas').insert({ bar_id: usuario.bar_id, numero: String(siguienteNumero) })
          if (error) { Alert.alert('Error', 'No se pudo crear la mesa: ' + error.message); return }
          cargar()
        },
      },
    ])
  }

  async function quitarMesa(item) {
    if (item.pedido) {
      Alert.alert('No se puede quitar', 'Esta mesa tiene un pedido activo. Espera a que se entregue antes de quitarla.')
      return
    }
    Alert.alert('Quitar mesa', `¿Quitar la Mesa ${item.numero}? Su historial se conserva, pero dejará de aparecer en el mapa.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => { await supabase.from('mesas').update({ activa: false }).eq('id', item.id); cargar() } },
    ])
  }

  function toggleSeleccion(id) {
    setSeleccionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function borrarSeleccionados() {
    if (seleccionados.length === 0) return
    Alert.alert('Borrar pedidos', `¿Borrar ${seleccionados.length} pedido(s) del historial? Esto no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          await supabase.from('pedidos').delete().in('id', seleccionados)
          setSeleccionados([])
          setModoSeleccion(false)
          cargar()
        },
      },
    ])
  }

  async function abrirDetalle(mesa) {
    setCargandoDetalle(true)
    const { data: historial } = await supabase
      .from('pedidos').select('id, estado, total, created_at')
      .eq('mesa_id', mesa.id).eq('sesion_id', mesa.sesion_actual).neq('estado', 'cancelado')
      .order('created_at', { ascending: true })

    const historialIds = (historial || []).map((h) => h.id)
    let itemsPorRonda = {}
    if (historialIds.length > 0) {
      const { data: itemsHistorial } = await supabase
        .from('pedido_items').select('pedido_id, cantidad, precio_unitario, productos(nombre)').in('pedido_id', historialIds)
      itemsPorRonda = (itemsHistorial || []).reduce((acc, it) => {
        if (!acc[it.pedido_id]) acc[it.pedido_id] = []
        acc[it.pedido_id].push(it)
        return acc
      }, {})
    }
    const historialConItems = (historial || []).map((h) => ({ ...h, items: itemsPorRonda[h.id] || [] }))

    let items = []
    let pago = null
    if (mesa.pedido) {
      const { data: itemsData } = await supabase.from('pedido_items').select('id, cantidad, precio_unitario, productos(nombre)').eq('pedido_id', mesa.pedido.id)
      items = itemsData || []
      const { data: pagoData } = await supabase.from('pagos').select('id, metodo, monto, comprobante_url, confirmado').eq('pedido_id', mesa.pedido.id).maybeSingle()
      pago = pagoData || null
    }
    setDetalle({ mesa, pedido: mesa.pedido || null, items, historial: historialConItems, pago })
    setCargandoDetalle(false)
  }

  async function confirmarPago(pagoId) {
    await supabase.from('pagos').update({ confirmado: true }).eq('id', pagoId)
    if (detalle?.pago?.id === pagoId) setDetalle({ ...detalle, pago: { ...detalle.pago, confirmado: true } })
    cargar()
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
    setDetalle(paso.siguiente === 'entregado' ? { ...detalle, pedido: null } : { ...detalle, pedido: { ...detalle.pedido, estado: paso.siguiente } })
    cargar()
  }

  const mesasConEstado = mesas.map((m) => ({ ...m, pedido: pedidos.find((p) => p.mesa_id === m.id) }))

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.titulo}>{bar?.nombre || 'Ronda'}</Text>
            <Text style={styles.subtituloHeader}>Panel del dueño</Text>
          </View>
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

        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statCard} onPress={() => setDetalleStat('ventas')}>
            <Text style={styles.statValor}>{money(ventasHoy)}</Text>
            <Text style={styles.statLabel}>Ventas de hoy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setDetalleStat('comision')}>
            <Text style={styles.statValor}>{money(ventasHoy * (bar?.comision_pct || 0.03))}</Text>
            <Text style={styles.statLabel}>Comisión Ronda ({Math.round((bar?.comision_pct || 0.03) * 100)}%)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setDetalleStat('propinas')}>
            <Text style={styles.statValor}>{money(propinasHoy)}</Text>
            <Text style={styles.statLabel}>Propinas registradas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setDetalleStat('pagos')}>
            <Text style={styles.statValor}>{pagosPendientes.length}</Text>
            <Text style={styles.statLabel}>Pagos por confirmar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.seccionHeaderFila}>
          <Text style={[styles.seccionTitulo, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>Mapa del bar</Text>
          <TouchableOpacity style={styles.botonAgregarMesa} onPress={agregarMesa}>
            <Text style={styles.botonAgregarMesaTexto}>+ Agregar mesa</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.mesasGrid}>
          {mesasConEstado.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.mesaCard, { borderColor: item.pedido ? colorPorAntiguedad(item.pedido.created_at) : '#2a2a3a' }]}
              onPress={() => abrirDetalle(item)}
              onLongPress={() => quitarMesa(item)}
              activeOpacity={0.6}
            >
              <Text style={styles.mesaNumero}>Mesa {item.numero}</Text>
              <Text style={styles.mesaEstado}>
                {item.pedido ? minutosTexto(item.pedido.created_at) : 'Libre'}
              </Text>
              {item.pedido && <Text style={styles.mesaMonto}>{money(item.pedido.total)}</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ayudaChica}>Mantén presionada una mesa libre para quitarla del mapa</Text>

        {ranking.length > 0 && (
          <>
            <Text style={styles.seccionTitulo}>🏆 Ranking de meseros</Text>
            <View style={styles.card}>
              {ranking.map((r, i) => (
                <View key={i} style={styles.rankingFila}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankingNombre}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {r.nombre} · {r.entregados} entregados</Text>
                    <Text style={styles.rankingValor}>{money(r.ventas)} · 💰{money(r.propinas)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => abrirChat(`dueno-${r.id}`, `💬 ${r.nombre}`)}>
                    <Text style={{ fontSize: 20 }}>💬{canalesConNuevos[`dueno-${r.id}`] ? ' 🔴' : ''}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {(productoEstrella || horaPico) && (
          <>
            <Text style={styles.seccionTitulo}>📊 Lo más vendido y hora pico</Text>
            <View style={styles.card}>
              {productoEstrella && (
                <View style={styles.rankingFila}>
                  <Text style={styles.rankingNombre}>🍺 Producto estrella</Text>
                  <Text style={styles.rankingValor}>{productoEstrella.nombre} ({productoEstrella.unidades}x)</Text>
                </View>
              )}
              {horaPico && (
                <View style={[styles.rankingFila, { borderBottomWidth: 0 }]}>
                  <Text style={styles.rankingNombre}>🕒 Hora pico de ventas</Text>
                  <Text style={styles.rankingValor}>{horaPico.hora}:00 — {money(horaPico.total)}</Text>
                </View>
              )}
            </View>
          </>
        )}

        <Text style={styles.seccionTitulo}>💳 Pagos por confirmar</Text>
        <View style={styles.card}>
          {pagosPendientes.length === 0 && <Text style={styles.vacioTexto}>Todos los pagos están confirmados ✅</Text>}
          {pagosPendientes.map((p) => (
            <View key={p.id} style={styles.pagoPendienteFila}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankingNombre}>Mesa {p.pedidos?.mesas?.numero} · {p.metodo}</Text>
                <Text style={styles.rankingValor}>{money(p.monto)}</Text>
              </View>
              <TouchableOpacity style={styles.botonConfirmarChico} onPress={() => confirmarPago(p.id)}>
                <Text style={styles.botonConfirmarChicoTexto}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.seccionHeaderFila}>
          <TouchableOpacity onPress={() => setPedidosVisible(!pedidosVisible)} style={{ flex: 1 }}>
            <Text style={[styles.seccionTitulo, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>
              {pedidosVisible ? '▾' : '▸'} Pedidos recientes ({pedidosRecientes.length})
            </Text>
          </TouchableOpacity>
          {pedidosVisible && (
            <TouchableOpacity onPress={() => { setModoSeleccion(!modoSeleccion); setSeleccionados([]) }}>
              <Text style={styles.botonSeleccionarTexto}>{modoSeleccion ? 'Cancelar' : 'Seleccionar'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {pedidosVisible && (
        <>
        {(mostrarTodosPedidos ? pedidosRecientes : pedidosRecientes.slice(0, 5)).map((p) => (
          <TouchableOpacity
            key={p.id}
            activeOpacity={modoSeleccion ? 0.6 : 1}
            onPress={() => modoSeleccion && toggleSeleccion(p.id)}
            style={[
              styles.pedidoRecienteCard,
              { borderLeftColor: p.estado === 'entregado' ? '#3ecf8e' : '#d4a338' },
              modoSeleccion && seleccionados.includes(p.id) && styles.pedidoRecienteSeleccionado,
            ]}
          >
            <View style={styles.pedidoRecienteHeader}>
              <Text style={styles.mesaNumero}>{modoSeleccion ? (seleccionados.includes(p.id) ? '☑️ ' : '⬜ ') : ''}Mesa {p.mesas?.numero}</Text>
              <View style={styles.estadoPill}><Text style={styles.estadoPillTexto}>{ESTADO_LABEL[p.estado] || p.estado}</Text></View>
            </View>
            {p.cliente_nombre && <Text style={styles.pedidoCliente}>👤 {p.cliente_nombre}</Text>}
            {p.pedido_items.map((it, i) => (
              <Text key={i} style={styles.pedidoItemTexto}>{it.cantidad}x {it.productos?.nombre}</Text>
            ))}
            <View style={styles.pedidoRecienteFooter}>
              <Text style={styles.pedidoMonto}>{money(p.total)}</Text>
              {p.pagos?.[0]?.metodo && <Text style={styles.pedidoMetodo}>{p.pagos[0].metodo}</Text>}
            </View>
          </TouchableOpacity>
        ))}
        {pedidosRecientes.length > 5 && !mostrarTodosPedidos && (
          <TouchableOpacity style={styles.botonVerMas} onPress={() => setMostrarTodosPedidos(true)}>
            <Text style={styles.botonVerMasTexto}>Ver los {pedidosRecientes.length} pedidos ↓</Text>
          </TouchableOpacity>
        )}
        {mostrarTodosPedidos && (
          <TouchableOpacity style={styles.botonVerMas} onPress={() => setMostrarTodosPedidos(false)}>
            <Text style={styles.botonVerMasTexto}>Ver menos ↑</Text>
          </TouchableOpacity>
        )}
        {modoSeleccion && seleccionados.length > 0 && (
          <TouchableOpacity style={styles.botonBorrarSeleccion} onPress={borrarSeleccionados}>
            <Text style={styles.botonTexto}>🗑️ Borrar {seleccionados.length} seleccionado(s)</Text>
          </TouchableOpacity>
        )}
        </>
        )}
      </ScrollView>

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
                          <TouchableOpacity style={styles.botonConfirmarPago} onPress={() => confirmarPago(detalle.pago.id)}>
                            <Text style={styles.botonTexto}>Confirmar que recibí el pago</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}

                <Text style={styles.subtitulo}>Cuenta de esta visita</Text>
                <ScrollView style={{ maxHeight: 220 }}>
                  {detalle.historial.map((h, i) => (
                    <View key={h.id} style={styles.rondaHistorial}>
                      <View style={styles.itemFila}>
                        <Text style={styles.itemTextoBold}>Ronda {i + 1} — {ESTADO_LABEL[h.estado] || h.estado}</Text>
                        <Text style={styles.itemTextoBold}>{money(h.total)}</Text>
                      </View>
                      {h.items.map((it, j) => (
                        <View key={j} style={styles.itemFilaChica}>
                          <Text style={styles.itemTextoChico}>{it.cantidad}x {it.productos?.nombre}</Text>
                          <Text style={styles.itemTextoChico}>{money(it.precio_unitario * it.cantidad)}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  {detalle.historial.length === 0 && <Text style={styles.itemTexto}>Sin pedidos todavía.</Text>}
                </ScrollView>
                <View style={styles.itemFila}>
                  <Text style={styles.totalTexto}>Total de la visita</Text>
                  <Text style={styles.totalTexto}>{money(detalle.historial.reduce((s, h) => s + Number(h.total), 0))}</Text>
                </View>

                <TouchableOpacity
                  style={styles.botonChatDetalle}
                  onPress={() => abrirChat(`mesa-${detalle.mesa.id}`, `💬 Mesa ${detalle.mesa.numero}`)}
                >
                  <Text style={styles.botonChatDetalleTexto}>💬 Chat con esta mesa</Text>
                </TouchableOpacity>

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
        {usuario.rol === 'dueno' && (
          <TouchableOpacity style={styles.footerBoton} onPress={onIrComision}>
            <Text style={styles.footerBotonTexto}>💳 Pagar a Ronda</Text>
          </TouchableOpacity>
        )}
        {usuario.rol === 'dueno' && (
          <TouchableOpacity style={styles.footerBoton} onPress={onIrConfiguracion}>
            <Text style={styles.footerBotonTexto}>⚙️ Config</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.botonAyudaFlotante} onPress={() => setMostrarAyuda(true)}>
        <Text style={styles.botonAyudaFlotanteTexto}>❓ Ayuda</Text>
      </TouchableOpacity>

      <Modal visible={!!detalleStat} transparent animationType="slide" onRequestClose={() => setDetalleStat(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            {detalleStat === 'ventas' && (
              <>
                <Text style={styles.modalTitulo}>Ventas de hoy</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {ventasHoyDetalle.length === 0 && <Text style={styles.itemTexto}>Todavía no hay ventas entregadas hoy.</Text>}
                  {ventasHoyDetalle.map((p) => (
                    <View key={p.id} style={styles.rondaHistorial}>
                      <View style={styles.itemFila}>
                        <Text style={styles.itemTextoBold}>Mesa {p.mesas?.numero} · {new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Text>
                        <Text style={styles.itemTextoBold}>{money(p.total)}</Text>
                      </View>
                      {p.pedido_items.map((it, j) => (
                        <Text key={j} style={styles.itemTextoChico}>{it.cantidad}x {it.productos?.nombre}</Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            {detalleStat === 'comision' && (
              <>
                <Text style={styles.modalTitulo}>Comisión Ronda ({Math.round((bar?.comision_pct || 0.03) * 100)}%)</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {ventasHoyDetalle.length === 0 && <Text style={styles.itemTexto}>Todavía no hay ventas entregadas hoy.</Text>}
                  {ventasHoyDetalle.map((p) => (
                    <View key={p.id} style={styles.itemFila}>
                      <Text style={styles.itemTexto}>Mesa {p.mesas?.numero} — {money(p.total)}</Text>
                      <Text style={styles.itemTextoBold}>{money(p.total * (bar?.comision_pct || 0.03))}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            {detalleStat === 'propinas' && (
              <>
                <Text style={styles.modalTitulo}>Propinas de hoy</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {propinasHoyDetalle.length === 0 && <Text style={styles.itemTexto}>Todavía no hay propinas hoy.</Text>}
                  {propinasHoyDetalle.map((p, i) => (
                    <View key={i} style={styles.itemFila}>
                      <Text style={styles.itemTexto}>{p.meseroNombre}{p.calificacion ? ` · ${'★'.repeat(p.calificacion)}` : ''}</Text>
                      <Text style={styles.itemTextoBold}>{money(p.monto)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            {detalleStat === 'pagos' && (
              <>
                <Text style={styles.modalTitulo}>Pagos por confirmar</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {pagosPendientes.length === 0 && <Text style={styles.itemTexto}>Todos los pagos están confirmados ✅</Text>}
                  {pagosPendientes.map((p) => (
                    <View key={p.id} style={styles.itemFila}>
                      <Text style={styles.itemTexto}>Mesa {p.pedidos?.mesas?.numero} · {p.metodo}</Text>
                      <Text style={styles.itemTextoBold}>{money(p.monto)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setDetalleStat(null)}>
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
                {mensajesChat.length === 0 && <Text style={styles.vacioTexto}>Sin mensajes todavía.</Text>}
                {mensajesChat.map((m) => (
                  <View key={m.id} style={[styles.chatBurbuja, m.de === 'dueno' ? styles.chatPropia : styles.chatOtra]}>
                    <Text style={[styles.chatAutor, m.de === 'dueno' ? styles.chatAutorPropia : styles.chatAutorOtra]}>{m.de === 'dueno' ? 'Tú' : (m.nombre || m.de)}</Text>
                    <Text style={[styles.chatTexto, m.de === 'dueno' ? styles.chatTextoPropia : styles.chatTextoOtra]}>{m.texto}</Text>
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

      <Modal visible={mostrarAyuda} transparent animationType="slide" onRequestClose={() => setMostrarAyuda(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>❓ Ayuda</Text>
            <ScrollView style={{ maxHeight: 460, marginTop: 10 }}>
              {AYUDA_SECCIONES.map((s, i) => (
                <View key={i} style={styles.ayudaItem}>
                  <Text style={styles.ayudaItemTitulo}>{s.titulo}</Text>
                  <Text style={styles.ayudaItemTexto}>{s.texto}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => { setMostrarAyuda(false); setPasoOnboarding(0); setMostrarOnboarding(true) }}>
                <Text style={styles.verGuiaTexto}>▶️ Ver la guía de bienvenida otra vez</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarAyuda(false)}>
              <Text style={styles.cerrarModalTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={mostrarOnboarding} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>{ONBOARDING_PASOS[pasoOnboarding].titulo}</Text>
            <Text style={styles.onboardingTexto}>{ONBOARDING_PASOS[pasoOnboarding].texto}</Text>
            <View style={styles.onboardingPuntos}>
              {ONBOARDING_PASOS.map((_, i) => (
                <View key={i} style={[styles.onboardingPunto, i === pasoOnboarding && styles.onboardingPuntoActivo]} />
              ))}
            </View>
            <View style={styles.onboardingBotones}>
              {pasoOnboarding > 0 && (
                <TouchableOpacity style={styles.botonSecundarioOnboarding} onPress={() => setPasoOnboarding((p) => p - 1)}>
                  <Text style={styles.botonSecundarioOnboardingTexto}>← Atrás</Text>
                </TouchableOpacity>
              )}
              {pasoOnboarding < ONBOARDING_PASOS.length - 1 ? (
                <TouchableOpacity style={[styles.boton, { flex: 1, marginTop: 0 }]} onPress={() => setPasoOnboarding((p) => p + 1)}>
                  <Text style={styles.botonTexto}>Siguiente →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.boton, { flex: 1, marginTop: 0 }]} onPress={terminarOnboarding}>
                  <Text style={styles.botonTexto}>Empezar a usar Ronda 🍻</Text>
                </TouchableOpacity>
              )}
            </View>
            {pasoOnboarding < ONBOARDING_PASOS.length - 1 && (
              <TouchableOpacity onPress={terminarOnboarding}>
                <Text style={styles.omitirTexto}>Saltar la guía</Text>
              </TouchableOpacity>
            )}
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
  avisos: { paddingHorizontal: 14, marginBottom: 6 },
  avisoItem: { backgroundColor: '#3a2f1a', borderRadius: 12, padding: 12, marginBottom: 8 },
  avisoTexto: { color: '#e0b94c', fontSize: 15 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8 },
  statCard: { flexBasis: '47%', backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, margin: 2 },
  statValor: { color: '#d4a338', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#a0a0b0', fontSize: 11, marginTop: 4, textTransform: 'uppercase' },

  seccionTitulo: { color: '#d4a338', fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 10, paddingHorizontal: 16 },
  seccionHeaderFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  botonAgregarMesa: { backgroundColor: '#26263a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  botonAgregarMesaTexto: { color: '#d4a338', fontSize: 13, fontWeight: '700' },
  botonSeleccionarTexto: { color: '#a0a0b0', fontSize: 13, fontWeight: '700' },
  botonVerMas: { alignItems: 'center', paddingVertical: 12 },
  botonVerMasTexto: { color: '#d4a338', fontSize: 14, fontWeight: '700' },
  botonBorrarSeleccion: { backgroundColor: '#e05c5c', borderRadius: 14, padding: 16, alignItems: 'center', marginHorizontal: 14, marginTop: 6 },
  pedidoRecienteSeleccionado: { borderWidth: 1, borderColor: '#d4a338' },
  card: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, marginHorizontal: 14 },

  mesasGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  mesaCard: {
    width: '30%', margin: '1.66%', backgroundColor: '#1e1e2e', borderRadius: 14, borderWidth: 2,
    padding: 12, alignItems: 'center', minHeight: 90, justifyContent: 'center',
  },
  mesaNumero: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  mesaEstado: { color: '#a0a0b0', fontSize: 11, marginTop: 6, textAlign: 'center' },
  mesaMonto: { color: '#d4a338', fontSize: 12, marginTop: 4, fontWeight: '700' },

  rankingFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  rankingNombre: { color: '#f2f2f2', fontSize: 14, flex: 1, paddingRight: 8 },
  rankingValor: { color: '#a0a0b0', fontSize: 13, fontWeight: '600' },
  vacioTexto: { color: '#6a6a80', fontSize: 14 },
  ayudaChica: { color: '#6a6a80', fontSize: 12, paddingHorizontal: 16, marginTop: -4, marginBottom: 10 },

  pagoPendienteFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  botonConfirmarChico: { backgroundColor: '#3ecf8e', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  botonConfirmarChicoTexto: { color: '#14141f', fontSize: 13, fontWeight: '700' },

  pedidoRecienteCard: { backgroundColor: '#1e1e2e', borderRadius: 14, borderLeftWidth: 4, padding: 14, marginHorizontal: 14, marginBottom: 10 },
  pedidoRecienteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  estadoPill: { backgroundColor: '#26263a', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  estadoPillTexto: { color: '#a0a0b0', fontSize: 11, fontWeight: '700' },
  pedidoCliente: { color: '#8a8a9a', fontSize: 12, marginBottom: 4 },
  pedidoItemTexto: { color: '#d0d0d8', fontSize: 13 },
  pedidoRecienteFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pedidoMonto: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  pedidoMetodo: { color: '#d4a338', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  footer: { flexDirection: 'row', padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: '#2a2a3a' },
  footerBoton: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, alignItems: 'center' },
  footerBotonTexto: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalDetalle: { backgroundColor: '#1e1e2e', borderRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '85%' },
  modalTitulo: { color: '#f2f2f2', fontSize: 22, fontWeight: '800' },
  modalEstado: { color: '#d4a338', fontSize: 15, marginTop: 4 },
  subtitulo: { color: '#a0a0b0', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
  itemFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  itemTexto: { color: '#f2f2f2', fontSize: 15 },
  rondaHistorial: { marginBottom: 8 },
  itemFilaChica: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 12 },
  itemTextoBold: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  itemTextoChico: { color: '#8a8a9a', fontSize: 13 },
  totalTexto: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  botonCerrarMesa: { backgroundColor: '#3ecf8e', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  botonChatDetalle: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14, borderWidth: 1, borderColor: '#3a3a4a' },
  botonChatDetalleTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

  chatMensajes: { maxHeight: 300, marginVertical: 10 },
  chatBurbuja: { maxWidth: '80%', padding: 10, borderRadius: 14, marginBottom: 8 },
  chatPropia: { backgroundColor: '#d4a338', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatOtra: { backgroundColor: '#26263a', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatAutor: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 },
  chatAutorPropia: { color: '#14141f' },
  chatAutorOtra: { color: '#a0a0b0' },
  chatTexto: { fontSize: 14 },
  chatTextoPropia: { color: '#14141f' },
  chatTextoOtra: { color: '#f2f2f2' },
  chatEntradaFila: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chatInput: { flex: 1, backgroundColor: '#26263a', color: '#f2f2f2', borderRadius: 12, padding: 12, fontSize: 15 },
  chatEnviarBoton: { backgroundColor: '#d4a338', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  pagoBox: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, marginTop: 14 },
  comprobanteImg: { width: '100%', height: 180, borderRadius: 10, marginBottom: 10, backgroundColor: '#14141f' },
  pagoConfirmado: { color: '#3ecf8e', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  botonConfirmarPago: { backgroundColor: '#3ecf8e', borderRadius: 12, padding: 14, alignItems: 'center' },
  cerrarModal: { padding: 14, alignItems: 'center', marginTop: 6 },
  cerrarModalTexto: { color: '#a0a0b0', fontSize: 15 },

  botonAyudaFlotante: {
    position: 'absolute', bottom: 90, right: 16,
    backgroundColor: '#1e1e2e', borderWidth: 1, borderColor: '#d4a338',
    borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  botonAyudaFlotanteTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

  ayudaItem: { marginBottom: 18 },
  ayudaItemTitulo: { color: '#d4a338', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  ayudaItemTexto: { color: '#c0c0cc', fontSize: 14, lineHeight: 20 },
  verGuiaTexto: { color: '#d4a338', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 6, marginBottom: 10 },

  onboardingTexto: { color: '#c0c0cc', fontSize: 15, lineHeight: 22, marginTop: 14 },
  onboardingPuntos: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 22 },
  onboardingPunto: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3a3a4a' },
  onboardingPuntoActivo: { backgroundColor: '#d4a338', width: 18 },
  onboardingBotones: { flexDirection: 'row', gap: 10, marginTop: 22 },
  botonSecundarioOnboarding: { flex: 1, backgroundColor: '#26263a', borderRadius: 14, padding: 16, alignItems: 'center' },
  botonSecundarioOnboardingTexto: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  omitirTexto: { color: '#6a6a80', fontSize: 13, textAlign: 'center', marginTop: 16 },
})
