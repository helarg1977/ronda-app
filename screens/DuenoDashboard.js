import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, Modal, ScrollView, Image, Alert, TextInput, KeyboardAvoidingView, Platform, Share, Switch, Vibration, AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import { supabase, cerrarSesion } from '../lib/supabase'
import { money, costoRonda, inicioDeHoy } from '../lib/formato'
import { mensajeAmigable } from '../lib/erroresAmigables'
import GuiaPantalla from '../components/GuiaPantalla'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import CapaFlotante from '../components/CapaFlotante'
import TarjetaParpadeante from '../components/TarjetaParpadeante'

const SONIDO_NOTIFICACION = 'https://raw.githubusercontent.com/helarg1977/ronda-app/main/assets/ronda-chime.wav'

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

function rangoDeAyer() {
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - 1)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setHours(23, 59, 59, 999)
  return { inicio: inicio.toISOString(), fin: fin.toISOString() }
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
  if (minutos < 60) return `+${minutos} min sin novedad`
  const horas = Math.floor(minutos / 60)
  const minRestantes = minutos % 60
  return `+${horas}h ${minRestantes}min sin novedad`
}

const URL_MINI_WEB_CLIENTE = 'https://ronda-web-orpin.vercel.app'
const URL_PANEL_DUENO_WEB = 'https://ronda-dueno-web.vercel.app' // actualiza esto cuando despliegues ronda-dueno-web a producción

async function compartirAccesoWeb() {
  try {
    await Share.share({
      message: `Hola! Este es el link para abrir Ronda desde el computador de la barra:\n\n${URL_PANEL_DUENO_WEB}\n\nEntra con tu mismo celular y PIN. Te recomiendo abrirlo en Chrome y darle "Instalar" (o el ícono de instalación en la barra de direcciones) para que quede como un ícono en el escritorio, igual que una app.`,
    })
  } catch (e) {
    // el usuario canceló el share, no pasa nada
  }
}

const ONBOARDING_PASOS = [
  {
    titulo: '¡Bienvenido a Ronda! 🍻',
    texto: 'Esto es tu panel de control. Aquí ves todas las mesas, pedidos y ventas de tu bar en tiempo real.',
  },
  {
    titulo: '¡Vamos a dejarlo listo! 🎉',
    texto: 'Justo abajo tienes una tarjeta verde con los pasos que faltan (menú, pagos, mesas) — se van marcando solos a medida que avanzas. Si te pierdes, el botón "❓ Ayuda" siempre tiene todo a la mano.',
  },
]

const AYUDA_SECCIONES = [
  { titulo: '📋 ¿Cómo subo mi menú?', texto: 'Ve a "Menú" en la parte de abajo. Primero crea categorías (ej: Cervezas), luego dentro de cada una agrega productos con nombre, precio y opcionalmente una foto (pega el link de una imagen).' },
  { titulo: '🪑 ¿Cómo agrego mesas?', texto: 'Dentro de "Menú", baja hasta la sección "Mesas" y toca "+ Agregar mesa". Cada mesa genera su propio código QR — ese código es el que debes imprimir o pegar físicamente en cada mesa del bar.' },
  { titulo: '👥 ¿Cómo agrego a mis meseros?', texto: 'Tienes dos formas: en "⚙️ Config → Empleados" le compartes tu código de negocio (6 letras/números) y tu empleado se une solo desde el login tocando "¿Eres empleado? Tengo un código" — o si prefieres, lo agregas tú mismo con su nombre, celular y un PIN.' },
  { titulo: '💳 ¿Cómo configuro mis pagos?', texto: 'En "⚙️ Config" guarda tu Nequi, Daviplata o Bre-B. Ronda nunca cobra por adelantado ni maneja tu plata — el cliente te paga directo a ti.' },
  { titulo: '✅ ¿Cómo confirmo que me llegó un pago?', texto: 'Toca la mesa correspondiente, toca el comprobante para ampliarlo y verificarlo bien, y toca "Confirmar que recibí el pago". También puedes hacerlo desde "💰 Hay dinero esperando" en el panel principal.' },
  { titulo: '🧾 ¿Cómo cierro una mesa cuando el grupo se va?', texto: 'Toca la mesa (debe estar sin pedido activo) y toca "Cerrar mesa (cuenta pagada)". Eso deja la mesa lista y limpia para el siguiente grupo, sin mezclar cuentas.' },
  { titulo: '🔗 ¿Llegó un grupo grande y unieron mesas?', texto: 'Toca cualquiera de las mesas físicas que unieron y busca la sección "🔀 Grupo grande o cambio de mesa" — toca "Unir otra mesa a esta cuenta" y elige cuál. Todo lo que pidan desde cualquiera de esas mesas se junta en una sola cuenta. Cuando se vayan, toca "Separar esta mesa" en la que uniste.' },
  { titulo: '🔀 ¿Un cliente se cambió de mesa?', texto: 'Toca la mesa donde estaba sentado y busca "Mover esta cuenta a otra mesa" — elige la mesa nueva (debe estar libre) y toda su cuenta se pasa completa, sin perder nada.' },
  { titulo: '🗑️ ¿Puedo borrar un mensaje del chat?', texto: 'Sí — dentro de cualquier chat, toca el ícono 🗑️ junto al mensaje que quieras quitar. Funciona con mensajes tuyos y de tu equipo.' },
  { titulo: '💰 ¿Cómo pago a Ronda?', texto: 'En "💳 Pagar a Ronda" ves cuánto has generado y cuánto pagar — un costo fijo pequeño por cada pedido (entre $100 y $500), nunca un porcentaje. Ahí reportas manualmente tu pago — nunca es automático.' },
]


export default function DuenoDashboard({ usuario, onCerrarSesion, onIrComision, onIrMenu, onIrConfiguracion, onIrReportes }) {
  const insets = useSafeAreaInsets()
  const [bar, setBar] = useState(null)
  const [mesas, setMesas] = useState([])
  const [meserosLista, setMeserosLista] = useState([])
  const [ultimoMensajePorCanal, setUltimoMensajePorCanal] = useState({})
  const [pedidos, setPedidos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [refrescando, setRefrescando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [ventasHoy, setVentasHoy] = useState(0)
  const [sinConexion, setSinConexion] = useState(false)
  const [tieneProductos, setTieneProductos] = useState(true)
  const [ocultarPrimerosPasos, setOcultarPrimerosPasos] = useState(true)
  const [comparativoAyer, setComparativoAyer] = useState(null)
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
  const [mostrarQr, setMostrarQr] = useState(false)
  const [mostrarLineaTiempo, setMostrarLineaTiempo] = useState(false)
  const [mostrarMoverMesa, setMostrarMoverMesa] = useState(false)
  const [mostrarUnirMesa, setMostrarUnirMesa] = useState(false)
  const [comprobanteAmpliado, setComprobanteAmpliado] = useState(null)
  const [mostrarPreguntaModo, setMostrarPreguntaModo] = useState(false)
  const necesitaPreguntaModoRef = useRef(false)
  const [altoFlotante, setAltoFlotante] = useState(80)
  const [mostrarMas, setMostrarMas] = useState(false)
  const refTarjetaQr = useRef(null)
  const [ranking, setRanking] = useState([])
  const [productoEstrella, setProductoEstrella] = useState(null)
  const [horaPico, setHoraPico] = useState(null)
  const [pedidosRecientes, setPedidosRecientes] = useState([])
  const [mostrarTodosPedidos, setMostrarTodosPedidos] = useState(false)
  const [pedidosVisible, setPedidosVisible] = useState(false)
  const [ocultarVentas, setOcultarVentas] = useState(false)
  const [mesasHistorialAbiertas, setMesasHistorialAbiertas] = useState({})

  function toggleHistorialMesa(mesaId) {
    setMesasHistorialAbiertas((h) => ({ ...h, [mesaId]: !h[mesaId] }))
  }
  const [mostrarRanking, setMostrarRanking] = useState(false)
  const [mostrarProductoEstrella, setMostrarProductoEstrella] = useState(false)
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState([])

  const cargar = useCallback(async () => {
    try {
    const { data: barData } = await supabase.from('bares').select('nombre, modo_negocio, llave_nequi, llave_daviplata, llave_bre_b, created_at, logo_url').eq('id', usuario.bar_id).maybeSingle()
    const { count: totalProductos } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq('bar_id', usuario.bar_id)
    setTieneProductos((totalProductos || 0) > 0)
    setBar(barData)
    if (usuario.rol === 'dueno' && barData && !barData.modo_negocio) {
      necesitaPreguntaModoRef.current = true
      const onboardingYaVisto = await AsyncStorage.getItem(`ronda_onboarding_${usuario.bar_id}`)
      if (onboardingYaVisto) setMostrarPreguntaModo(true)
    }

    const { data: mesasData } = await supabase.from('mesas').select('id, numero, sesion_actual, mesero_asignado_id, qr_code, cuenta_abierta, sesion_iniciada_en, mesa_union_id').eq('bar_id', usuario.bar_id).eq('activa', true).order('numero')
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

    const { inicio: inicioAyer, fin: finAyer } = rangoDeAyer()
    const { data: entregadosAyer } = await supabase
      .from('pedidos').select('total')
      .eq('bar_id', usuario.bar_id).eq('estado', 'entregado').gte('created_at', inicioAyer).lte('created_at', finAyer)
    const totalAyer = (entregadosAyer || []).reduce((s, p) => s + Number(p.total), 0)
    setComparativoAyer(totalAyer > 0 ? Math.round(((totalHoy - totalAyer) / totalAyer) * 100) : null)

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
      .select('id, metodo, monto, comprobante_url, pedido_id, created_at, monto_efectivo, monto_transferencia, pedidos!inner(bar_id, mesa_id, mesas(numero))')
      .eq('pedidos.bar_id', usuario.bar_id).eq('confirmado', false)
    setPagosPendientes(pagosData || [])

    // --- Ranking de meseros ---
    const { data: meseros } = await supabase.from('usuarios_bar').select('id, nombre').eq('bar_id', usuario.bar_id).eq('rol', 'mesero').eq('activo', true)
    setMeserosLista(meseros || [])
    if (meseros && meseros.length > 0) {
      const canales = meseros.map((m) => `dueno-${m.id}`)
      const { data: ultimosMensajes } = await supabase
        .from('mensajes_chat').select('canal, de, texto, created_at')
        .in('canal', canales).order('created_at', { ascending: false })
      const mapa = {}
      ;(ultimosMensajes || []).forEach((msg) => { if (!mapa[msg.canal]) mapa[msg.canal] = msg })
      setUltimoMensajePorCanal(mapa)
    }
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

    // --- Pedidos recientes, agrupados por mesa (solo la sesión actual de cada mesa) ---
    const { data: recientes } = await supabase
      .from('pedidos')
      .select('id, mesa_id, sesion_id, estado, total, created_at, cliente_nombre, mesas(numero), pagos(metodo), pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).order('created_at', { ascending: false }).limit(120)
    const sesionActualPorMesa = {}
    ;(mesasData || []).forEach((m) => { sesionActualPorMesa[m.id] = m.sesion_actual })
    const recientesDeSesionActual = (recientes || []).filter((p) => p.sesion_id === sesionActualPorMesa[p.mesa_id])
    setPedidosRecientes(recientesDeSesionActual)
      setSinConexion(false)
    } catch (e) {
      setSinConexion(true)
    }
  }, [usuario.bar_id])

  useEffect(() => {
    cargar()
    AsyncStorage.getItem(`ronda_onboarding_${usuario.bar_id}`).then((visto) => {
      if (!visto) setMostrarOnboarding(true)
      else if (necesitaPreguntaModoRef.current) setMostrarPreguntaModo(true)
    })
    AsyncStorage.getItem(`ronda_ocultar_ventas_${usuario.id}`).then((v) => { if (v === '1') setOcultarVentas(true) })
    AsyncStorage.getItem(`ronda_primeros_pasos_oculto_${usuario.bar_id}`).then((v) => setOcultarPrimerosPasos(v === '1'))
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
    const suscripcionEstado = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') cargar()
    })
    return () => {
      supabase.removeChannel(canalPedidos)
      supabase.removeChannel(canalSolicitudes)
      supabase.removeChannel(canalChat)
      clearInterval(intervalo)
      suscripcionEstado.remove()
    }
  }, [cargar, usuario.bar_id, chatCanal])

  async function atenderSolicitud(id) {
    const { error } = await supabase.from('solicitudes').update({ atendida: true }).eq('id', id)
    if (error) Alert.alert('No se pudo actualizar', mensajeAmigable(error, 'Intenta de nuevo.'))
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
    if (error) {
      setTextoChat(texto)
      Alert.alert('No se pudo enviar', 'Revisa tu conexión e intenta de nuevo.')
      return
    }
    setMensajesChat((m) => [...m, data])
  }

  async function borrarMensajeChat(id) {
    Alert.alert('Borrar mensaje', '¿Borrar este mensaje del chat?', [
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

  async function terminarOnboarding() {
    await AsyncStorage.setItem(`ronda_onboarding_${usuario.bar_id}`, '1')
    setMostrarOnboarding(false)
    setPasoOnboarding(0)
    if (necesitaPreguntaModoRef.current) setMostrarPreguntaModo(true)
  }

  async function agregarMesa() {
    const siguienteNumero = mesas.length > 0 ? Math.max(...mesas.map((m) => Number(m.numero) || 0)) + 1 : 1
    Alert.alert('Agregar mesa', `¿Crear la Mesa ${siguienteNumero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Crear', onPress: async () => {
          const { error } = await supabase.rpc('crear_mesa_nueva', { p_bar_id: usuario.bar_id })
          if (error) { Alert.alert('Error', mensajeAmigable(error, 'No se pudo crear la mesa.')); return }
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
          const { error } = await supabase.from('pedidos').delete().in('id', seleccionados)
          if (error) { Alert.alert('No se pudo borrar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
          setSeleccionados([])
          setModoSeleccion(false)
          cargar()
        },
      },
    ])
  }

  async function cancelarPedidoActivo() {
    if (!detalle?.pedido) return
    Alert.alert('Cancelar pedido', '¿Cancelar este pedido? El cliente va a ver que se canceló.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
          const { error: errorPago } = await supabase.from('pagos').delete().eq('pedido_id', detalle.pedido.id)
          if (errorPago) { Alert.alert('No se pudo cancelar', mensajeAmigable(errorPago, 'No se pudo cancelar el pedido.')); return }
          const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', detalle.pedido.id)
          if (error) { Alert.alert('No se pudo cancelar', mensajeAmigable(error, 'No se pudo cancelar el pedido.')); return }
          setDetalle(null)
          cargar()
        },
      },
    ])
  }

  async function abrirDetalle(mesa) {
    setCargandoDetalle(true)
    setMostrarQr(false)
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
    let eventos = []
    if (mesa.pedido) {
      const { data: itemsData } = await supabase.from('pedido_items').select('id, cantidad, precio_unitario, productos(nombre)').eq('pedido_id', mesa.pedido.id)
      items = itemsData || []
      const { data: pagoData } = await supabase.from('pagos').select('id, metodo, monto, comprobante_url, confirmado, monto_efectivo, monto_transferencia').eq('pedido_id', mesa.pedido.id).maybeSingle()
      pago = pagoData || null
      const { data: eventosData } = await supabase.from('pedido_eventos').select('estado, created_at').eq('pedido_id', mesa.pedido.id).order('created_at', { ascending: true })
      eventos = eventosData || []
    }
    setDetalle({ mesa, pedido: mesa.pedido || null, items, historial: historialConItems, pago, eventos })
    setCargandoDetalle(false)
  }

  async function confirmarPago(pagoId) {
    const { error } = await supabase.from('pagos').update({ confirmado: true }).eq('id', pagoId)
    if (error) { Alert.alert('No se pudo confirmar', mensajeAmigable(error, 'No se pudo confirmar el pago.')); return }
    if (detalle?.pago?.id === pagoId) setDetalle({ ...detalle, pago: { ...detalle.pago, confirmado: true } })
    Vibration.vibrate(40)
    cargar()
  }

  async function descargarQr(mesa) {
    try {
      const uriCapturada = await captureRef(refTarjetaQr, { format: 'png', quality: 1, result: 'tmpfile' })
      const disponible = await Sharing.isAvailableAsync()
      if (disponible) {
        await Sharing.shareAsync(uriCapturada, { mimeType: 'image/png', dialogTitle: `QR Mesa ${mesa.numero}` })
      } else {
        Alert.alert('Listo', 'El QR se generó, pero este celular no puede abrir el menú para compartir/imprimir.')
      }
    } catch (e) {
      Alert.alert('No se pudo generar el QR', e.message || 'Intenta de nuevo.')
    }
  }

  async function cerrarPrimerosPasos() {
    await AsyncStorage.setItem(`ronda_primeros_pasos_oculto_${usuario.bar_id}`, '1')
    setOcultarPrimerosPasos(true)
  }

  async function elegirModoNegocio(modo) {
    const { error } = await supabase.from('bares').update({ modo_negocio: modo }).eq('id', usuario.bar_id)
    if (error) {
      Alert.alert('No se pudo guardar', mensajeAmigable(error, 'No se pudo guardar el cambio.'))
      return
    }
    setBar((b) => (b ? { ...b, modo_negocio: modo } : b))
    setMostrarPreguntaModo(false)
    necesitaPreguntaModoRef.current = false
  }

  async function toggleCuentaAbierta(mesa) {
    const { error } = await supabase.from('mesas').update({ cuenta_abierta: !mesa.cuenta_abierta }).eq('id', mesa.id)
    if (error) { Alert.alert('No se pudo actualizar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
    setDetalle((d) => (d ? { ...d, mesa: { ...d.mesa, cuenta_abierta: !mesa.cuenta_abierta } } : d))
    cargar()
  }

  async function asignarMesero(mesaId, meseroId) {
    const { error } = await supabase.from('mesas').update({ mesero_asignado_id: meseroId }).eq('id', mesaId)
    if (error) { Alert.alert('No se pudo asignar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
    setDetalle((d) => (d ? { ...d, mesa: { ...d.mesa, mesero_asignado_id: meseroId } } : d))
    cargar()
  }

  async function moverMesaA(mesaDestino) {
    const origen = detalle.mesa
    const { error } = await supabase.rpc('mover_mesa', { p_mesa_origen_id: origen.id, p_mesa_destino_id: mesaDestino.id })
    if (error) { Alert.alert('No se pudo mover', mensajeAmigable(error, 'No se pudo mover la cuenta.')); return }
    setMostrarMoverMesa(false)
    setDetalle(null)
    Vibration.vibrate(40)
    Alert.alert('Listo', `La cuenta ya quedó en la Mesa ${mesaDestino.numero}.`)
    cargar()
  }

  async function unirMesa(mesaAUnir) {
    const anfitriona = detalle.mesa
    const { error } = await supabase.rpc('unir_mesa', { p_mesa_anfitriona_id: anfitriona.id, p_mesa_a_unir_id: mesaAUnir.id })
    if (error) { Alert.alert('No se pudo unir', mensajeAmigable(error, 'No se pudo unir la mesa.')); return }
    setMostrarUnirMesa(false)
    Vibration.vibrate(40)
    Alert.alert('Listo', `Mesa ${mesaAUnir.numero} ya quedó unida a esta cuenta.`)
    const { data: detalleActualizado } = await supabase.from('mesas').select('*').eq('id', anfitriona.id).maybeSingle()
    if (detalleActualizado) setDetalle((d) => ({ ...d, mesa: detalleActualizado }))
    cargar()
  }

  async function separarMesa(mesaId, numero) {
    Alert.alert(`¿Separar Mesa ${numero}?`, 'Vuelve a quedar independiente, con su propia cuenta desde cero.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Separar', onPress: async () => {
          const { error: errorCerrar } = await supabase.rpc('cerrar_mesa', { p_mesa_id: mesaId })
          if (errorCerrar) { Alert.alert('No se pudo separar', mensajeAmigable(errorCerrar, 'Intenta de nuevo.')); return }
          const { error } = await supabase.from('mesas').update({ mesa_union_id: null }).eq('id', mesaId)
          if (error) { Alert.alert('No se pudo separar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
          cargar()
        },
      },
    ])
  }

  async function cerrarMesa() {
    if (!detalle) return
    await supabase.rpc('cerrar_mesa', { p_mesa_id: detalle.mesa.id })
    Vibration.vibrate(40)
    setDetalle(null)
    cargar()
  }

  function cerrarMesaDesdeHistorial(mesaId, numero) {
    Alert.alert(
      `¿Cerrar Mesa ${numero}?`,
      'Esto limpia la vista para empezar una cuenta nueva (por si ya se fueron esos clientes). Tus ventas de Informes NO se borran — solo deja de mezclarse con el próximo grupo que se siente ahí.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, cerrar', style: 'destructive', onPress: async () => {
            await supabase.rpc('cerrar_mesa', { p_mesa_id: mesaId })
            cargar()
          },
        },
      ]
    )
  }

  async function avanzarDesdeDetalle() {
    if (!detalle || !detalle.pedido) return
    const paso = SIGUIENTE_ESTADO[detalle.pedido.estado]
    if (!paso) return
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: paso.siguiente, updated_at: new Date().toISOString() })
      .eq('id', detalle.pedido.id)
      .eq('estado', detalle.pedido.estado)
      .select()
    if (error) { Alert.alert('No se pudo actualizar', mensajeAmigable(error, 'No se pudo actualizar.')); return }
    if (!data || data.length === 0) {
      Alert.alert('Este pedido ya cambió', 'Alguien más (un mesero) ya lo actualizó.')
      cargar()
      return
    }
    setDetalle(paso.siguiente === 'entregado' ? { ...detalle, pedido: null } : { ...detalle, pedido: { ...detalle.pedido, estado: paso.siguiente } })
    cargar()
  }

  const mesasConCuentaSolicitada = new Set(solicitudes.filter((s) => s.tipo === 'cuenta').map((s) => s.mesa_id))
  const mesasConPagoPendiente = new Set(pagosPendientes.map((p) => p.pedidos?.mesa_id).filter(Boolean))

  function estadoMesa(item) {
    if (mesasConCuentaSolicitada.has(item.id)) return { color: '#4a90d9', texto: '🔵 Pidió la cuenta' }
    if (item.pedido) return { color: colorPorAntiguedad(item.pedido.created_at), texto: minutosTexto(item.pedido.created_at) }
    if (mesasConPagoPendiente.has(item.id)) return { color: '#9b6fd6', texto: '🟣 Pago sin confirmar' }
    if (item.mesa_union_id) {
      const anfitriona = mesas.find((m) => m.id === item.mesa_union_id)
      return { color: '#9b6fd6', texto: `🔗 Unida a Mesa ${anfitriona?.numero || '?'}` }
    }
    if (item.sesion_iniciada_en) {
      const ultimoPedidoDeEstaMesa = pedidosRecientes
        .filter((p) => p.mesa_id === item.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      const ultimaActividad = ultimoPedidoDeEstaMesa && new Date(ultimoPedidoDeEstaMesa.created_at) > new Date(item.sesion_iniciada_en)
        ? ultimoPedidoDeEstaMesa.created_at
        : item.sesion_iniciada_en
      const minSinNovedad = (Date.now() - new Date(ultimaActividad).getTime()) / 60000
      if (minSinNovedad >= 15) return { color: '#e0954c', texto: `🟠 Sin novedad hace ${Math.floor(minSinNovedad)} min` }
      return { color: '#3ecf8e', texto: `Sentados hace ${Math.floor((Date.now() - new Date(item.sesion_iniciada_en).getTime()) / 60000)} min` }
    }
    return { color: '#2a2a3a', texto: 'Libre' }
  }

  const mesasConEstado = mesas.map((m) => ({ ...m, pedido: pedidos.find((p) => p.mesa_id === m.id) }))

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false) }} />}
        contentContainerStyle={{ paddingBottom: altoFlotante + 20 }}
      >
        <GuiaPantalla
          id="panel_principal"
          barId={usuario.bar_id}
          pasos={[
            { icono: '👋', titulo: 'Este es tu panel', texto: 'Aquí ves tus ventas de hoy y todo lo urgente, apenas abres la app.' },
            { icono: '🗺️', titulo: 'El mapa de tus mesas', texto: 'Los colores te dicen todo sin tener que leer: gris libre, dorado con pedido esperando, morado pago sin confirmar.' },
            { icono: '💬', titulo: 'Mensajes de tu equipo', texto: 'Si un mesero necesita ayuda, te avisa aquí — con sonido y vibración.' },
          ]}
        />

        {sinConexion && (
          <View style={styles.sinConexionBanner}>
            <Text style={styles.sinConexionTexto}>⚠️ Sin conexión — mostrando la última información que tenemos</Text>
          </View>
        )}

        {bar?.created_at && (() => {
          const diasTranscurridos = Math.floor((Date.now() - new Date(bar.created_at).getTime()) / (1000 * 60 * 60 * 24))
          const diasRestantes = 30 - diasTranscurridos
          if (diasRestantes > 7) return null
          return (
            <View style={[styles.sinConexionBanner, { backgroundColor: diasRestantes >= 0 ? '#3a2a12' : '#3a1a1a' }]}>
              <Text style={styles.sinConexionTexto}>
                {diasRestantes >= 0
                  ? `⏳ Tu prueba gratis vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} — escríbenos si tienes dudas`
                  : `⚠️ Tu prueba gratis venció hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''} — sigues con acceso completo, escríbenos cuando puedas`}
              </Text>
            </View>
          )
        })()}

        {!ocultarPrimerosPasos && (!tieneProductos || !(bar?.llave_nequi || bar?.llave_daviplata || bar?.llave_bre_b)) && (
          <View style={styles.primerosPasosBox}>
            <View style={styles.primerosPasosHeader}>
              <Text style={styles.primerosPasosTitulo}>👋 Bienvenido a Ronda — te falta poco</Text>
              <TouchableOpacity onPress={cerrarPrimerosPasos}><Text style={styles.primerosPasosCerrar}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.primerosPasosAyuda}>Completa esto y tu bar queda listo para recibir pedidos de verdad:</Text>

            <TouchableOpacity style={styles.primerosPasosItem} onPress={onIrMenu}>
              <Text style={styles.primerosPasosItemIcono}>{tieneProductos ? '✅' : '⬜'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.primerosPasosItemTitulo}>Sube tu menú</Text>
                <Text style={styles.primerosPasosItemTexto}>Agrega tus productos con precio — toca aquí para ir</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primerosPasosItem} onPress={onIrConfiguracion}>
              <Text style={styles.primerosPasosItemIcono}>{(bar?.llave_nequi || bar?.llave_daviplata || bar?.llave_bre_b) ? '✅' : '⬜'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.primerosPasosItemTitulo}>Configura cómo te pagan</Text>
                <Text style={styles.primerosPasosItemTexto}>Guarda tu Nequi, Daviplata o Bre-B</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primerosPasosItem} onPress={onIrMenu}>
              <Text style={styles.primerosPasosItemIcono}>🖨️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.primerosPasosItemTitulo}>Imprime tus códigos QR</Text>
                <Text style={styles.primerosPasosItemTexto}>Ya se crearon automáticamente — descárgalos e imprímelos para cada mesa</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {bar?.logo_url && <Image source={{ uri: bar.logo_url }} style={styles.logoHeader} />}
            <View>
              <Text style={styles.titulo}>{bar?.nombre || 'Ronda'}</Text>
              <Text style={styles.subtituloHeader}>Panel del dueño</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => Alert.alert('¿Salir?', '¿Cerrar tu sesión?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Salir', style: 'destructive', onPress: async () => { await cerrarSesion(); onCerrarSesion() } },
              ])}
            >
              <Text style={styles.salir}>Salir</Text>
            </TouchableOpacity>
            {usuario.rol === 'dueno' && (
              <TouchableOpacity onPress={compartirAccesoWeb}>
                <Text style={styles.compartirTexto}>🔗 Compartir acceso web</Text>
              </TouchableOpacity>
            )}
          </View>
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

        <TouchableOpacity style={styles.heroVentas} onPress={() => setDetalleStat('ventas')} activeOpacity={0.85}>
          <View style={styles.heroLabelFila}>
            <Text style={styles.heroLabel}>VENTAS DE HOY</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); const nuevo = !ocultarVentas; setOcultarVentas(nuevo); AsyncStorage.setItem(`ronda_ocultar_ventas_${usuario.id}`, nuevo ? '1' : '0') }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.heroOjo}>{ocultarVentas ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.heroValor}>{ocultarVentas ? '••••••' : money(ventasHoy)}</Text>
          {comparativoAyer != null && !ocultarVentas && (
            <Text style={[styles.heroComparativo, { color: comparativoAyer >= 0 ? '#3ecf8e' : '#e05c5c' }]}>
              Hasta esta hora llevas {Math.abs(comparativoAyer)}% {comparativoAyer >= 0 ? 'más' : 'menos'} que ayer
            </Text>
          )}
          <View style={styles.heroEstadoColumna}>
            {pedidos.filter((p) => p.estado === 'pendiente').length > 0 && (
              <Text style={styles.heroEstadoTextoUrgente}>🔴 {pedidos.filter((p) => p.estado === 'pendiente').length} pedido{pedidos.filter((p) => p.estado === 'pendiente').length !== 1 ? 's' : ''} pendiente{pedidos.filter((p) => p.estado === 'pendiente').length !== 1 ? 's' : ''} — atiende primero</Text>
            )}
            {pagosPendientes.length > 0 && (
              <Text style={styles.heroEstadoTexto}>🟡 {pagosPendientes.length} pago{pagosPendientes.length !== 1 ? 's' : ''} esperando confirmación</Text>
            )}
            {mesasConEstado.filter((m) => m.pedido).length > 0 && (
              <Text style={styles.heroEstadoTexto}>🟢 {mesasConEstado.filter((m) => m.pedido).length} mesa{mesasConEstado.filter((m) => m.pedido).length !== 1 ? 's' : ''} atendiendo bien</Text>
            )}
            {mesasConEstado.filter((m) => m.pedido).length === 0 && pagosPendientes.length === 0 && pedidos.length === 0 && (
              <Text style={styles.heroEstadoTexto}>🟢 Todo tranquilo por ahora</Text>
            )}
          </View>
          {pedidos.length > 0 && (
            <Text style={styles.heroDineroMesas}>💰 {money(pedidos.reduce((s, p) => s + Number(p.total), 0))} pendiente de servir</Text>
          )}
        </TouchableOpacity>

        <View style={styles.statsGridSecundario}>
          {bar?.modo_negocio !== 'solo' && (
            <>
              <TouchableOpacity style={styles.statCardChico} onPress={() => setDetalleStat('comision')}>
                <Text style={styles.statValorChico}>{money(ventasHoyDetalle.reduce((s, p) => s + costoRonda(Number(p.total)), 0))}</Text>
                <Text style={styles.statLabelChico}>Costo por pedido</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statCardChico} onPress={() => setDetalleStat('propinas')}>
                <Text style={styles.statValorChico}>{money(propinasHoy)}</Text>
                <Text style={styles.statLabelChico}>Propinas</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.statCardChico} onPress={() => setDetalleStat('pagos')}>
            <Text style={styles.statValorChico}>{pagosPendientes.length}</Text>
            <Text style={styles.statLabelChico}>Dinero esperando</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          const mesaOlvidada = mesasConEstado.find((m) => estadoMesa(m).texto.startsWith('🟠'))
          let consejo = null
          if (mesaOlvidada) {
            consejo = `La Mesa ${mesaOlvidada.numero} lleva rato sin novedad — puede ser buen momento para acercarte.`
          } else if (comparativoAyer != null && comparativoAyer <= -20) {
            consejo = `Hoy vas ${Math.abs(comparativoAyer)}% por debajo de ayer a esta hora.`
          } else if (productoEstrella) {
            consejo = `${productoEstrella.nombre} es tu producto más vendido hoy (${productoEstrella.unidades}x) — asegúrate de no quedarte sin stock.`
          }
          if (!consejo) return null
          return (
            <View style={styles.consejoBox}>
              <Text style={styles.consejoTitulo}>💡 Consejo de hoy</Text>
              <Text style={styles.consejoTexto}>{consejo}</Text>
            </View>
          )
        })()}

        <Text style={styles.seccionTitulo}>💰 Hay dinero esperando</Text>
        <View style={styles.card}>
          {pagosPendientes.length === 0 && <Text style={styles.vacioTexto}>Todos los pagos están confirmados ✅</Text>}
          {pagosPendientes.map((p) => (
            <View key={p.id} style={styles.pagoPendienteFila}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankingNombre}>Mesa {p.pedidos?.mesas?.numero} · {p.metodo === 'mixto' ? 'Mixto' : p.metodo}</Text>
                <Text style={styles.rankingValor}>{money(p.monto)}</Text>
                {p.metodo === 'mixto' && (
                  <Text style={styles.pagoEsperandoTexto}>💵 {money(p.monto_efectivo || 0)} + 📱 {money(p.monto_transferencia || 0)}</Text>
                )}
                <Text style={styles.pagoEsperandoTexto}>Reportado {minutosTexto(p.created_at)}</Text>
                {p.comprobante_url ? (
                  <TouchableOpacity onPress={() => setComprobanteAmpliado(p.comprobante_url)}>
                    <Text style={styles.pagoRevisarTexto}>🔍 Ver comprobante para verificar</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.pagoEsperandoTexto}>Sin comprobante (efectivo)</Text>
                )}
              </View>
              <TouchableOpacity style={styles.botonConfirmarChico} onPress={() => confirmarPago(p.id)}>
                <Text style={styles.botonConfirmarChicoTexto}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {meserosLista.length > 0 && (() => {
          const hayNuevos = meserosLista.some((m) => canalesConNuevos[`dueno-${m.id}`])
          return (
            <View style={[styles.mensajesEquipoBox, hayNuevos && styles.mensajesEquipoBoxAlerta]}>
              <Text style={styles.subtitulo}>💬 Mensajes del equipo{hayNuevos ? ' 🔴' : ''}</Text>
              {meserosLista.map((m) => {
                const ultimo = ultimoMensajePorCanal[`dueno-${m.id}`]
                return (
                  <TouchableOpacity key={m.id} style={styles.mensajeEquipoFila} onPress={() => abrirChat(`dueno-${m.id}`, `💬 ${m.nombre}`)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mensajeEquipoNombre}>{m.nombre}</Text>
                      {ultimo && (
                        <Text style={styles.mensajeEquipoPreview} numberOfLines={1}>
                          {ultimo.de === 'dueno' ? 'Tú: ' : ''}{ultimo.texto}
                        </Text>
                      )}
                    </View>
                    {canalesConNuevos[`dueno-${m.id}`] && <Text style={styles.mensajeEquipoAbrir}>🔴 Nuevo</Text>}
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })()}

        <View style={styles.seccionHeaderFila}>
          <Text style={[styles.seccionTitulo, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>Mapa del bar</Text>
          <TouchableOpacity style={styles.botonAgregarMesa} onPress={agregarMesa}>
            <Text style={styles.botonAgregarMesaTexto}>+ Agregar mesa</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.mesasGrid}>
          {mesasConEstado.map((item) => {
            const estado = estadoMesa(item)
            const necesitaAtencion = item.pedido?.estado === 'pendiente' || mesasConCuentaSolicitada.has(item.id)
            return (
              <TarjetaParpadeante
                key={item.id}
                activo={necesitaAtencion}
                style={[styles.mesaCard, { borderColor: estado.color }]}
                onPress={() => abrirDetalle(item)}
                onLongPress={() => quitarMesa(item)}
              >
                {!item.pedido && (
                  <TouchableOpacity
                    style={styles.mesaOpcionesIcono}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => quitarMesa(item)}
                  >
                    <Text style={styles.mesaOpcionesIconoTexto}>⋮</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.mesaNumero}>Mesa {item.numero}</Text>
                <Text style={styles.mesaEstado}>{estado.texto}</Text>
                {item.pedido && <Text style={styles.mesaMonto}>{money(item.pedido.total)}</Text>}
              </TarjetaParpadeante>
            )
          })}
        </View>
        <Text style={styles.ayudaChica}>Toca los ⋮ de una mesa libre para quitarla del mapa</Text>

        {bar?.modo_negocio !== 'solo' && ranking.length > 0 && (
          <>
            <TouchableOpacity onPress={() => setMostrarRanking(!mostrarRanking)}>
              <Text style={styles.seccionTitulo}>{mostrarRanking ? '▾' : '▸'} 🏆 Ranking de meseros</Text>
            </TouchableOpacity>
            {mostrarRanking && (
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
            )}
          </>
        )}

        {(productoEstrella || horaPico) && (
          <>
            <TouchableOpacity onPress={() => setMostrarProductoEstrella(!mostrarProductoEstrella)}>
              <Text style={styles.seccionTitulo}>{mostrarProductoEstrella ? '▾' : '▸'} 📊 Lo más vendido y hora pico</Text>
            </TouchableOpacity>
            {mostrarProductoEstrella && (
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
            )}
          </>
        )}

        <TouchableOpacity onPress={() => setPedidosVisible(!pedidosVisible)}>
          <Text style={[styles.seccionTitulo, { marginTop: 0, marginBottom: 12, paddingHorizontal: 0 }]}>
            {pedidosVisible ? '▾' : '▸'} Historial por mesa
          </Text>
        </TouchableOpacity>
        {pedidosVisible && (() => {
          const porMesa = {}
          pedidosRecientes.forEach((p) => {
            if (!porMesa[p.mesa_id]) porMesa[p.mesa_id] = { numero: p.mesas?.numero, pedidos: [], total: 0 }
            porMesa[p.mesa_id].pedidos.push(p)
            porMesa[p.mesa_id].total += Number(p.total)
          })
          const grupos = Object.entries(porMesa).sort((a, b) => Number(a[1].numero) - Number(b[1].numero))
          if (grupos.length === 0) return <Text style={styles.vacioTexto}>Todavía no hay pedidos registrados.</Text>
          return grupos.map(([mesaId, grupo]) => (
            <View key={mesaId} style={styles.grupoMesaHistorial}>
              <TouchableOpacity style={styles.grupoMesaHeader} onPress={() => toggleHistorialMesa(mesaId)}>
                <Text style={styles.grupoMesaTitulo}>
                  {mesasHistorialAbiertas[mesaId] ? '▾' : '▸'} Mesa {grupo.numero} — {grupo.pedidos.length} pedido{grupo.pedidos.length !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.grupoMesaTotal}>{money(grupo.total)}</Text>
              </TouchableOpacity>
              {mesasHistorialAbiertas[mesaId] && (
                <View style={styles.grupoMesaContenido}>
                  {grupo.pedidos.map((p) => (
                    <View key={p.id} style={[styles.pedidoRecienteCard, { borderLeftColor: p.estado === 'entregado' ? '#3ecf8e' : '#d4a338' }]}>
                      <View style={styles.pedidoRecienteHeader}>
                        <Text style={styles.pedidoHora}>{new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Text>
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
                    </View>
                  ))}
                  <TouchableOpacity style={styles.botonCerrarMesaHistorial} onPress={() => cerrarMesaDesdeHistorial(mesaId, grupo.numero)}>
                    <Text style={styles.botonCerrarMesaHistorialTexto}>🧹 Cerrar esta mesa (empezar cuenta nueva)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        })()}
      </ScrollView>

      <Modal visible={!!detalle} transparent animationType="slide" onRequestClose={() => setDetalle(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <ScrollView showsVerticalScrollIndicator={true}>
            {detalle && (
              <>
              {!mostrarQr ? (
              <>
                <Text style={styles.modalTitulo}>Mesa {detalle.mesa.numero}</Text>
                {detalle.mesa.sesion_iniciada_en && (
                  <Text style={styles.sentadosDesdeTexto}>
                    🕒 Sentados desde las {new Date(detalle.mesa.sesion_iniciada_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}

                {bar?.modo_negocio !== 'solo' && (
                <>
                <Text style={styles.subtitulo}>Mesero asignado</Text>
                <View style={styles.filaMeseroChips}>
                  <TouchableOpacity
                    style={[styles.meseroChip, !detalle.mesa.mesero_asignado_id && styles.meseroChipActivo]}
                    onPress={() => asignarMesero(detalle.mesa.id, null)}
                  >
                    <Text style={[styles.meseroChipTexto, !detalle.mesa.mesero_asignado_id && styles.meseroChipTextoActivo]}>Cualquiera</Text>
                  </TouchableOpacity>
                  {meserosLista.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.meseroChip, detalle.mesa.mesero_asignado_id === m.id && styles.meseroChipActivo]}
                      onPress={() => asignarMesero(detalle.mesa.id, m.id)}
                    >
                      <Text style={[styles.meseroChipTexto, detalle.mesa.mesero_asignado_id === m.id && styles.meseroChipTextoActivo]}>{m.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                </>
                )}

                <TouchableOpacity style={styles.botonVerQr} onPress={() => setMostrarQr(true)}>
                  <Text style={styles.botonChatDetalleTexto}>🔳 Ver código QR de esta mesa</Text>
                </TouchableOpacity>

                <View style={styles.filaSwitchCuenta}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subtitulo}>🤝 Cuenta abierta</Text>
                    {detalle.mesa.cuenta_abierta ? (
                      <>
                        <Text style={styles.ayudaCuentaAbiertaActiva}>✔ Cliente conocido</Text>
                        <Text style={styles.ayudaCuentaAbiertaActiva}>✔ Pagará todo al final</Text>
                        <Text style={styles.ayudaCuentaAbierta}>Puedes desactivarla cuando quieras.</Text>
                      </>
                    ) : (
                      <Text style={styles.ayudaCuentaAbierta}>Actívala solo si conoces al cliente — puede pedir varias rondas sin pagar cada una, y paga todo junto al final.</Text>
                    )}
                  </View>
                  <Switch value={!!detalle.mesa.cuenta_abierta} onValueChange={() => toggleCuentaAbierta(detalle.mesa)} trackColor={{ true: '#d4a338' }} />
                </View>

                <Text style={styles.modalEstado}>
                  {detalle.pedido ? (ESTADO_LABEL[detalle.pedido.estado] || detalle.pedido.estado) : 'Sin pedido activo'}
                </Text>

                <View style={styles.seccionAccionesMesa}>
                  <Text style={styles.seccionAccionesTitulo}>🔀 Grupo grande o cambio de mesa</Text>
                  <Text style={styles.seccionAccionesAyuda}>
                    ¿Llegó un grupo y unieron mesas físicas? ¿O el cliente se cambió de puesto? Usa esto:
                  </Text>

                  {detalle.mesa.sesion_iniciada_en && (
                    <TouchableOpacity style={styles.botonMoverMesa} onPress={() => setMostrarMoverMesa(true)}>
                      <Text style={styles.botonMoverMesaTexto}>🔀 Mover esta cuenta a otra mesa</Text>
                    </TouchableOpacity>
                  )}

                  {detalle.mesa.mesa_union_id ? (
                    <View style={styles.mesaUnidaBox}>
                      <Text style={styles.mesaUnidaTexto}>🔗 Esta mesa está unida a otra cuenta</Text>
                      <TouchableOpacity onPress={() => separarMesa(detalle.mesa.id, detalle.mesa.numero)}>
                        <Text style={styles.botonSepararTexto}>Separar esta mesa</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.botonMoverMesa} onPress={() => setMostrarUnirMesa(true)}>
                      <Text style={styles.botonMoverMesaTexto}>🔗 Unir otra mesa a esta cuenta</Text>
                    </TouchableOpacity>
                  )}
                </View>

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
                    {detalle.pedido.estado === 'pendiente' && (
                      <TouchableOpacity style={styles.botonCancelarPedido} onPress={cancelarPedidoActivo}>
                        <Text style={styles.botonCancelarPedidoTexto}>✕ Cancelar este pedido</Text>
                      </TouchableOpacity>
                    )}

                    {detalle.pago && (
                      <View style={styles.pagoBox}>
                        <Text style={styles.subtitulo}>Pago — {detalle.pago.metodo === 'mixto' ? 'Mixto' : detalle.pago.metodo}</Text>
                        {detalle.pago.metodo === 'mixto' && (
                          <View style={styles.desgloseMixtoBox}>
                            <Text style={styles.desgloseMixtoTexto}>💵 Efectivo: {money(detalle.pago.monto_efectivo || 0)}</Text>
                            <Text style={styles.desgloseMixtoTexto}>📱 Transferencia: {money(detalle.pago.monto_transferencia || 0)}</Text>
                          </View>
                        )}
                        {detalle.pago.comprobante_url && (
                          <TouchableOpacity onPress={() => setComprobanteAmpliado(detalle.pago.comprobante_url)}>
                            <Image source={{ uri: detalle.pago.comprobante_url }} style={styles.comprobanteImg} resizeMode="contain" />
                            <Text style={styles.comprobanteAmpliarTexto}>🔍 Toca para ampliar</Text>
                          </TouchableOpacity>
                        )}
                        {detalle.pago.confirmado ? (
                          <Text style={styles.pagoConfirmado}>✅ Pago confirmado</Text>
                        ) : detalle.pedido && detalle.pedido.estado !== 'entregado' ? (
                          <Text style={styles.pagoEsperaEntrega}>Primero entrega el pedido — después podrás confirmar este pago.</Text>
                        ) : (
                          <TouchableOpacity style={styles.botonConfirmarPago} onPress={() => confirmarPago(detalle.pago.id)}>
                            <Text style={styles.botonTexto}>Confirmar que recibí el pago</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {detalle.eventos?.length > 0 && (
                      <>
                        <TouchableOpacity onPress={() => setMostrarLineaTiempo(!mostrarLineaTiempo)}>
                          <Text style={styles.subtitulo}>{mostrarLineaTiempo ? '▾' : '▸'} 📋 Línea de tiempo de este pedido</Text>
                        </TouchableOpacity>
                        {mostrarLineaTiempo && (
                          <View style={styles.lineaTiempoBox}>
                            {detalle.eventos.map((ev, i) => (
                              <View key={i} style={styles.lineaTiempoFila}>
                                <Text style={styles.lineaTiempoIcono}>{{ pendiente: '🍺', confirmado: '✅', preparando: '🍸', en_camino: '🚶', entregado: '📬' }[ev.estado] || '•'}</Text>
                                <Text style={styles.lineaTiempoHora}>{new Date(ev.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
                                <Text style={styles.lineaTiempoEstado}>{ESTADO_LABEL[ev.estado] || ev.estado}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
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
              ) : (
              <>
                <Text style={styles.modalTitulo}>QR — Mesa {detalle.mesa.numero}</Text>
                <Text style={styles.ayudaQr}>Imprime esto y pégalo en la mesa.</Text>

                <View ref={refTarjetaQr} collapsable={false} style={styles.tarjetaQr}>
                  <Text style={styles.tarjetaQrNombreBar}>{bar?.nombre || 'Nuestro bar'}</Text>
                  <Text style={styles.tarjetaQrMesa}>Mesa {detalle.mesa.numero}</Text>
                  <Image
                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`${URL_MINI_WEB_CLIENTE}/?m=${detalle.mesa.qr_code}`)}` }}
                    style={styles.qrImagenGrande}
                  />
                  <Text style={styles.tarjetaQrPasosTitulo}>¿Cómo pedir?</Text>
                  <Text style={styles.tarjetaQrPaso}>1. Escanea este código con la cámara de tu celular</Text>
                  <Text style={styles.tarjetaQrPaso}>2. Elige lo que quieras del menú</Text>
                  <Text style={styles.tarjetaQrPaso}>3. Toca "Enviar pedido"</Text>
                  <Text style={styles.tarjetaQrPaso}>4. Espera a que te lo traigamos a la mesa 🍻</Text>
                  <Text style={styles.tarjetaQrPaso}>5. ¿Van varios? Toca ➗ para dividir la cuenta entre todos</Text>
                </View>

                <TouchableOpacity style={styles.botonDescargarQr} onPress={() => descargarQr(detalle.mesa)}>
                  <Text style={styles.botonChatDetalleTexto}>📥 Descargar / Compartir para imprimir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarQr(false)}>
                  <Text style={styles.cerrarModalTexto}>← Volver al detalle de la mesa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cerrarModal} onPress={() => { setMostrarQr(false); setDetalle(null) }}>
                  <Text style={styles.cerrarModalTexto}>Cerrar ventana</Text>
                </TouchableOpacity>
              </>
              )}
              </>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrMenu}>
          <Text style={styles.footerBotonTexto}>📋 Menú</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBoton} onPress={onIrReportes}>
          <Text style={styles.footerBotonTexto}>📊 Informes</Text>
        </TouchableOpacity>
        {usuario.rol === 'dueno' && (
          <TouchableOpacity style={styles.footerBoton} onPress={() => setMostrarMas(true)}>
            <Text style={styles.footerBotonTexto}>⋯ Más</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={mostrarMoverMesa} transparent animationType="slide" onRequestClose={() => setMostrarMoverMesa(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>¿A cuál mesa la movemos?</Text>
            <Text style={styles.ayudaChica}>Solo se muestran las mesas libres — la cuenta completa (pedidos, sesión y cuenta abierta) se pasa entera.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {mesasConEstado.filter((m) => detalle && m.id !== detalle.mesa.id && !m.pedido && !m.sesion_iniciada_en).map((m) => (
                <TouchableOpacity key={m.id} style={styles.opcionMesaDestino} onPress={() => moverMesaA(m)}>
                  <Text style={styles.opcionMesaDestinoTexto}>Mesa {m.numero}</Text>
                </TouchableOpacity>
              ))}
              {mesasConEstado.filter((m) => detalle && m.id !== detalle.mesa.id && !m.pedido && !m.sesion_iniciada_en).length === 0 && (
                <Text style={styles.vacioTexto}>No hay mesas libres ahora mismo.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarMoverMesa(false)}>
              <Text style={styles.cerrarModalTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={mostrarUnirMesa} transparent animationType="slide" onRequestClose={() => setMostrarUnirMesa(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>¿Cuál mesa unimos aquí?</Text>
            <Text style={styles.ayudaChica}>Todo lo que pidan desde el QR de esa mesa (y lo que ya llevaba, si tenía algo) se junta en esta misma cuenta.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {mesasConEstado.filter((m) => detalle && m.id !== detalle.mesa.id && !m.mesa_union_id).map((m) => (
                <TouchableOpacity key={m.id} style={styles.opcionMesaDestino} onPress={() => unirMesa(m)}>
                  <Text style={styles.opcionMesaDestinoTexto}>Mesa {m.numero}{m.sesion_iniciada_en ? ' (ya tiene actividad)' : ''}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarUnirMesa(false)}>
              <Text style={styles.cerrarModalTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!comprobanteAmpliado} transparent animationType="fade" onRequestClose={() => setComprobanteAmpliado(null)}>
        <TouchableOpacity style={styles.comprobanteAmpliadoOverlay} activeOpacity={1} onPress={() => setComprobanteAmpliado(null)}>
          <Image source={{ uri: comprobanteAmpliado }} style={styles.comprobanteAmpliadoImg} resizeMode="contain" />
          <Text style={styles.comprobanteAmpliadoCerrar}>Toca en cualquier parte para cerrar</Text>
        </TouchableOpacity>
      </Modal>

      <Modal visible={mostrarMas} transparent animationType="slide" onRequestClose={() => setMostrarMas(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>Más opciones</Text>
            <TouchableOpacity style={styles.masOpcion} onPress={() => { setMostrarMas(false); onIrComision() }}>
              <Text style={styles.masOpcionTexto}>💳 Pagar a Ronda</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.masOpcion} onPress={() => { setMostrarMas(false); onIrConfiguracion() }}>
              <Text style={styles.masOpcionTexto}>⚙️ Configuración del negocio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cerrarModal} onPress={() => setMostrarMas(false)}>
              <Text style={styles.cerrarModalTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CapaFlotante onAltoCambio={setAltoFlotante}>
        <TouchableOpacity style={styles.botonAyudaFlotante} onPress={() => setMostrarAyuda(true)}>
          <Text style={styles.botonAyudaFlotanteTexto}>❓ Ayuda</Text>
        </TouchableOpacity>
      </CapaFlotante>

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
                <Text style={styles.modalTitulo}>Costo por pedido de hoy</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {ventasHoyDetalle.length === 0 && <Text style={styles.itemTexto}>Todavía no hay ventas entregadas hoy.</Text>}
                  {ventasHoyDetalle.map((p) => (
                    <View key={p.id} style={styles.itemFila}>
                      <Text style={styles.itemTexto}>Mesa {p.mesas?.numero} — {money(p.total)}</Text>
                      <Text style={styles.itemTextoBold}>{money(costoRonda(Number(p.total)))}</Text>
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
                <Text style={styles.modalTitulo}>💰 Hay dinero esperando</Text>
                <ScrollView style={{ maxHeight: 400, marginTop: 10 }}>
                  {pagosPendientes.length === 0 && <Text style={styles.itemTexto}>Todos los pagos están confirmados ✅</Text>}
                  {pagosPendientes.map((p) => (
                    <View key={p.id} style={styles.pagoPendienteFila}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rankingNombre}>Mesa {p.pedidos?.mesas?.numero} · {p.metodo === 'mixto' ? 'Mixto' : p.metodo}</Text>
                        <Text style={styles.rankingValor}>{money(p.monto)}</Text>
                        {p.metodo === 'mixto' && (
                          <Text style={styles.pagoEsperandoTexto}>💵 {money(p.monto_efectivo || 0)} + 📱 {money(p.monto_transferencia || 0)}</Text>
                        )}
                        <Text style={styles.pagoEsperandoTexto}>👉 Ve a la Mesa {p.pedidos?.mesas?.numero} para revisar el comprobante y confirmar</Text>
                      </View>
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
                    <View style={styles.chatBurbujaFila}>
                      <Text style={[styles.chatAutor, m.de === 'dueno' ? styles.chatAutorPropia : styles.chatAutorOtra]}>{m.de === 'dueno' ? 'Tú' : (m.nombre || m.de)}</Text>
                      <TouchableOpacity onPress={() => borrarMensajeChat(m.id)}>
                        <Text style={styles.chatBorrarTexto}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
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

      <Modal visible={mostrarPreguntaModo} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalle}>
            <Text style={styles.modalTitulo}>¿Cómo es tu negocio?</Text>
            <Text style={styles.ayudaModoNegocio}>Esto nos ayuda a mostrarte solo lo que necesitas — lo puedes cambiar después en Configuración.</Text>
            <TouchableOpacity style={styles.opcionModoNegocio} onPress={() => elegirModoNegocio('solo')}>
              <Text style={styles.opcionModoNegocioTitulo}>🙋 Atiendo yo solo</Text>
              <Text style={styles.opcionModoNegocioSub}>Sin meseros — tú recibes y entregas todos los pedidos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.opcionModoNegocio} onPress={() => elegirModoNegocio('equipo')}>
              <Text style={styles.opcionModoNegocioTitulo}>👥 Tengo empleados</Text>
              <Text style={styles.opcionModoNegocioSub}>Meseros, administrador, o ambos</Text>
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
  sinConexionBanner: { backgroundColor: '#3a2a12', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  sinConexionTexto: { color: '#e0954c', fontSize: 12, fontWeight: '700' },
  primerosPasosBox: { backgroundColor: '#1a2e26', borderRadius: 18, padding: 16, marginHorizontal: 14, marginTop: 14, borderWidth: 1, borderColor: '#3ecf8e' },
  primerosPasosHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primerosPasosTitulo: { color: '#f2f2f2', fontSize: 16, fontWeight: '800', flex: 1 },
  primerosPasosCerrar: { color: '#8a8a9a', fontSize: 18, paddingLeft: 10 },
  primerosPasosAyuda: { color: '#a0c9b8', fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  primerosPasosItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#14241e', borderRadius: 12, padding: 12, marginBottom: 8 },
  primerosPasosItemIcono: { fontSize: 20 },
  primerosPasosItemTitulo: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  primerosPasosItemTexto: { color: '#8a8a9a', fontSize: 12, marginTop: 2, lineHeight: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingTop: 50 },
  titulo: { fontSize: 22, fontWeight: '800', color: '#f2f2f2' },
  logoHeader: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1e1e2e' },
  subtituloHeader: { fontSize: 13, color: '#d4a338', marginTop: 2 },
  salir: { color: '#a0a0b0', fontSize: 15 },
  compartirTexto: { color: '#d4a338', fontSize: 12, fontWeight: '700' },
  avisos: { paddingHorizontal: 14, marginBottom: 6 },
  avisoItem: { backgroundColor: '#3a2f1a', borderRadius: 12, padding: 12, marginBottom: 8 },
  avisoTexto: { color: '#e0b94c', fontSize: 15 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8 },
  statCard: { flexBasis: '47%', backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, margin: 2 },
  statValor: { color: '#d4a338', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#a0a0b0', fontSize: 11, marginTop: 4, textTransform: 'uppercase' },

  heroVentas: {
    marginHorizontal: 14, marginBottom: 16, backgroundColor: '#1e1e2e', borderRadius: 20,
    padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#3a3020',
  },
  heroLabel: { color: '#a0a0b0', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  heroLabelFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroOjo: { fontSize: 15 },
  heroValor: { color: '#d4a338', fontSize: 44, fontWeight: '800', marginTop: 4 },
  heroEstadoFila: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  heroEstadoColumna: { marginTop: 12, gap: 4, alignItems: 'center' },
  heroComparativo: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  heroEstadoTexto: { color: '#c9c9d4', fontSize: 13, fontWeight: '600' },
  heroEstadoTextoUrgente: { color: '#e05c5c', fontSize: 13, fontWeight: '800' },
  heroDineroMesas: { color: '#e0b94c', fontSize: 13, fontWeight: '700', marginTop: 8 },
  consejoBox: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, marginHorizontal: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#d4a338' },
  consejoTitulo: { color: '#d4a338', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  consejoTexto: { color: '#c9c9d4', fontSize: 13, lineHeight: 18 },
  sentadosDesdeTexto: { color: '#8a8a9a', fontSize: 13, marginBottom: 10 },

  statsGridSecundario: { flexDirection: 'row', paddingHorizontal: 10, gap: 8, marginBottom: 4 },
  statCardChico: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 12, padding: 10, alignItems: 'center' },
  statValorChico: { color: '#d4a338', fontSize: 14, fontWeight: '800' },
  statLabelChico: { color: '#8a8a9a', fontSize: 10, marginTop: 2, textTransform: 'uppercase', textAlign: 'center' },

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
    padding: 12, alignItems: 'center', minHeight: 90, justifyContent: 'center', position: 'relative',
  },
  mesaOpcionesIcono: { position: 'absolute', top: 4, right: 6 },
  mesaOpcionesIconoTexto: { color: '#6a6a80', fontSize: 18, fontWeight: '800' },
  mesaNumero: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  mesaEstado: { color: '#c9c9d4', fontSize: 13, marginTop: 6, textAlign: 'center', fontWeight: '600' },
  mesaMonto: { color: '#d4a338', fontSize: 12, marginTop: 4, fontWeight: '700' },

  rankingFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  rankingNombre: { color: '#f2f2f2', fontSize: 14, flex: 1, paddingRight: 8 },
  rankingValor: { color: '#a0a0b0', fontSize: 13, fontWeight: '600' },
  pagoEsperandoTexto: { color: '#e0954c', fontSize: 11, fontWeight: '700', marginTop: 2 },
  pagoRevisarTexto: { color: '#4a90d9', fontSize: 12, fontWeight: '700', marginTop: 4 },
  vacioTexto: { color: '#9494a8', fontSize: 14 },
  ayudaChica: { color: '#9494a8', fontSize: 12, paddingHorizontal: 16, marginTop: -4, marginBottom: 10 },

  pagoPendienteFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  botonConfirmarChico: { backgroundColor: '#d4a338', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, minWidth: 100, alignItems: 'center' },
  botonConfirmarChicoTexto: { color: '#14141f', fontSize: 13, fontWeight: '700' },

  pedidoRecienteCard: { backgroundColor: '#1e1e2e', borderRadius: 14, borderLeftWidth: 4, padding: 14, marginHorizontal: 14, marginBottom: 10 },
  grupoMesaHistorial: { marginHorizontal: 14, marginBottom: 10, backgroundColor: '#1a1a26', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a3a', overflow: 'hidden' },
  grupoMesaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  grupoMesaTitulo: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  grupoMesaTotal: { color: '#d4a338', fontSize: 14, fontWeight: '800' },
  grupoMesaContenido: { paddingHorizontal: 6, paddingBottom: 10 },
  pedidoHora: { color: '#8a8a9a', fontSize: 12, fontWeight: '600' },
  botonCerrarMesaHistorial: { marginHorizontal: 8, marginTop: 4, backgroundColor: '#26263a', borderRadius: 12, padding: 12, alignItems: 'center' },
  botonCerrarMesaHistorialTexto: { color: '#e0b94c', fontSize: 13, fontWeight: '700' },
  pedidoRecienteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  estadoPill: { backgroundColor: '#26263a', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  estadoPillTexto: { color: '#a0a0b0', fontSize: 11, fontWeight: '700' },
  pedidoCliente: { color: '#8a8a9a', fontSize: 12, marginBottom: 4 },
  pedidoItemTexto: { color: '#d0d0d8', fontSize: 13 },
  pedidoRecienteFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pedidoMonto: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  pedidoMetodo: { color: '#d4a338', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  footer: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#2a2a3a' },
  footerBoton: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#1e1e2e', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  footerBotonTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '600' },

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
  seccionAccionesMesa: { backgroundColor: '#1a1a26', borderRadius: 16, padding: 16, marginTop: 14, marginBottom: 6, borderWidth: 2, borderColor: '#d4a338' },
  seccionAccionesTitulo: { color: '#f2f2f2', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  seccionAccionesAyuda: { color: '#a0a0b0', fontSize: 13, marginBottom: 6, lineHeight: 17 },
  seccionAccionesDiagnostico: { color: '#e0954c', fontSize: 11, marginBottom: 10, fontStyle: 'italic' },
  botonMoverMesa: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#4a90d9' },
  botonMoverMesaTexto: { color: '#4a90d9', fontSize: 14, fontWeight: '700' },
  mesaUnidaBox: { backgroundColor: '#2a1f3a', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#9b6fd6', alignItems: 'center' },
  mesaUnidaTexto: { color: '#c4a8e8', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  botonSepararTexto: { color: '#9b6fd6', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  opcionMesaDestino: { backgroundColor: '#26263a', borderRadius: 12, padding: 16, marginBottom: 8 },
  opcionMesaDestinoTexto: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  botonChatDetalle: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14, borderWidth: 1, borderColor: '#3a3a4a' },
  filaMeseroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  meseroChip: { backgroundColor: '#26263a', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#3a3a4a' },
  meseroChipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
  meseroChipTexto: { color: '#f2f2f2', fontSize: 13, fontWeight: '600' },
  meseroChipTextoActivo: { color: '#14141f', fontWeight: '800' },
  botonVerQr: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14, borderWidth: 1, borderColor: '#d4a338' },
  filaSwitchCuenta: { flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: '#26263a', borderRadius: 14, padding: 14 },
  ayudaModoNegocio: { color: '#a0a0b0', fontSize: 13, marginBottom: 18, lineHeight: 18 },
  opcionModoNegocio: { backgroundColor: '#26263a', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#3a3a4a' },
  opcionModoNegocioTitulo: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  opcionModoNegocioSub: { color: '#8a8a9a', fontSize: 13, marginTop: 4 },
  ayudaCuentaAbierta: { color: '#8a8a9a', fontSize: 12, marginTop: 4, lineHeight: 16 },
  ayudaCuentaAbiertaActiva: { color: '#3ecf8e', fontSize: 13, fontWeight: '600', marginTop: 2 },
  botonDescargarQr: { backgroundColor: '#3ecf8e', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14 },
  ayudaQr: { color: '#a0a0b0', fontSize: 13, textAlign: 'center', marginVertical: 10, paddingHorizontal: 10 },
  qrImagen: { width: 220, height: 220, backgroundColor: '#fff', borderRadius: 12, marginVertical: 10 },
  tarjetaQr: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 24, alignItems: 'center', width: '100%', marginVertical: 10,
  },
  tarjetaQrNombreBar: { color: '#14141f', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  tarjetaQrMesa: { color: '#8a6a1f', fontSize: 15, fontWeight: '700', marginTop: 2, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },
  qrImagenGrande: { width: 240, height: 240, marginBottom: 18 },
  tarjetaQrPasosTitulo: { color: '#14141f', fontSize: 16, fontWeight: '800', marginBottom: 8, alignSelf: 'flex-start' },
  tarjetaQrPaso: { color: '#2a2a2a', fontSize: 14, marginBottom: 4, alignSelf: 'flex-start', lineHeight: 20 },
  qrEnlaceTexto: { color: '#9494a8', fontSize: 11, textAlign: 'center', marginBottom: 10 },
  botonChatDetalleTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

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
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  botonCancelarPedido: { borderWidth: 1, borderColor: '#e05c5c', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 10 },
  botonCancelarPedidoTexto: { color: '#e05c5c', fontSize: 14, fontWeight: '700' },
  pagoBox: { backgroundColor: '#26263a', borderRadius: 14, padding: 14, marginTop: 14 },
  mensajesEquipoBox: { backgroundColor: '#1a1a26', borderRadius: 14, padding: 14, marginHorizontal: 14, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a3a' },
  mensajesEquipoBoxAlerta: { borderColor: '#e0954c' },
  mensajeEquipoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  mensajeEquipoNombre: { color: '#f2f2f2', fontSize: 14, fontWeight: '600' },
  mensajeEquipoPreview: { color: '#8a8a9a', fontSize: 12, marginTop: 2 },
  mensajeEquipoAbrir: { color: '#8a8a9a', fontSize: 13, fontWeight: '600' },
  lineaTiempoBox: { backgroundColor: '#26263a', borderRadius: 12, padding: 12, marginTop: 6 },
  lineaTiempoFila: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  lineaTiempoIcono: { fontSize: 14, width: 22 },
  lineaTiempoHora: { color: '#9494a8', fontSize: 12, fontWeight: '700', width: 70 },
  lineaTiempoEstado: { color: '#f2f2f2', fontSize: 13 },
  comprobanteImg: { width: '100%', height: 180, borderRadius: 10, marginBottom: 4, backgroundColor: '#14141f' },
  comprobanteAmpliarTexto: { color: '#4a90d9', fontSize: 12, textAlign: 'center', marginTop: -6, marginBottom: 10 },
  comprobanteAmpliadoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  comprobanteAmpliadoImg: { width: '100%', height: '80%' },
  comprobanteAmpliadoCerrar: { color: '#8a8a9a', fontSize: 13, marginTop: 16 },
  pagoConfirmado: { color: '#3ecf8e', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  pagoEsperaEntrega: { color: '#8a8a9a', fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
  desgloseMixtoBox: { backgroundColor: '#1a1a26', borderRadius: 10, padding: 10, marginBottom: 10 },
  desgloseMixtoTexto: { color: '#c9c9d4', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  botonConfirmarPago: { backgroundColor: '#d4a338', borderRadius: 12, padding: 14, alignItems: 'center' },
  cerrarModal: { padding: 14, alignItems: 'center', marginTop: 6 },
  masOpcion: { backgroundColor: '#26263a', borderRadius: 12, padding: 16, marginBottom: 10 },
  masOpcionTexto: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  cerrarModalTexto: { color: '#a0a0b0', fontSize: 15 },

  botonAyudaFlotante: {
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
  omitirTexto: { color: '#9494a8', fontSize: 13, textAlign: 'center', marginTop: 16 },
})
