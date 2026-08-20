import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, TextInput, Alert, Linking, Share } from 'react-native'
import { supabase, cerrarSesion } from '../lib/supabase'
import { mensajeAmigable } from '../lib/erroresAmigables'
import { money } from '../lib/formato'

const PESTANAS = [
  { id: 'resumen', titulo: '📊 Resumen' },
  { id: 'bares', titulo: '🏪 Bares' },
  { id: 'clientes', titulo: '👥 Clientes' },
  { id: 'pagos', titulo: '💰 Pagos' },
]

function nivelFidelidad(visitas) {
  if (visitas >= 15) return { texto: '🥇 Oro', color: '#e0b94c' }
  if (visitas >= 8) return { texto: '🥈 Plata', color: '#b0b0c0' }
  if (visitas >= 3) return { texto: '🥉 Bronce', color: '#c97a4a' }
  return { texto: 'Nuevo', color: '#8a8a9a' }
}

export default function SuperAdminScreen({ admin, onCerrarSesion }) {
  const [pestana, setPestana] = useState('resumen')
  const [bares, setBares] = useState([])
  const [clientes, setClientes] = useState([])
  const [anuncios, setAnuncios] = useState([])
  const [nuevoAnuncio, setNuevoAnuncio] = useState('')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nombreEdit, setNombreEdit] = useState('')

  const cargar = useCallback(async () => {
    const { data: baresData, error } = await supabase.rpc('admin_listar_bares')
    if (error) Alert.alert('No se pudo cargar', mensajeAmigable(error, 'Intenta de nuevo.'))
    setBares(baresData || [])
    const { data: clientesData } = await supabase.rpc('admin_listar_clientes')
    setClientes(clientesData || [])
    const { data: anunciosData } = await supabase.from('anuncios_plataforma').select('id, mensaje, created_at').order('created_at', { ascending: false }).limit(10)
    setAnuncios(anunciosData || [])
    setCargando(false)
    setRefrescando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function onRefrescar() {
    setRefrescando(true)
    await cargar()
  }

  async function togglePausa(bar) {
    const { error } = await supabase.rpc('admin_actualizar_bar', { p_bar_id: bar.id, p_activo: !bar.activo, p_nombre: null, p_comision_pct: null })
    if (error) { Alert.alert('No se pudo actualizar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
    cargar()
  }

  async function guardarNombre(bar) {
    if (!nombreEdit.trim()) return
    const { error } = await supabase.rpc('admin_actualizar_bar', { p_bar_id: bar.id, p_activo: bar.activo, p_nombre: nombreEdit.trim(), p_comision_pct: null })
    if (error) { Alert.alert('No se pudo guardar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
    setEditandoId(null)
    cargar()
  }

  function eliminarBar(bar) {
    Alert.prompt
      ? Alert.prompt('Eliminar negocio', `Escribe exactamente "${bar.nombre}" para confirmar que quieres borrarlo para siempre.`, async (texto) => {
          if (texto?.trim() !== bar.nombre) { Alert.alert('No coincide', 'El nombre no coincidió — no se borró nada.'); return }
          const { error } = await supabase.rpc('admin_eliminar_bar', { p_bar_id: bar.id })
          if (error) { Alert.alert('No se pudo eliminar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
          cargar()
        })
      : Alert.alert('Eliminar negocio', `¿Eliminar "${bar.nombre}" para siempre? Esto borra todos sus datos y no se puede deshacer.`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: async () => {
            const { error } = await supabase.rpc('admin_eliminar_bar', { p_bar_id: bar.id })
            if (error) { Alert.alert('No se pudo eliminar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
            cargar()
          } },
        ])
  }

  function abrirWhatsAppBar(bar, mensaje) {
    Linking.openURL(`https://wa.me/57${bar.telefono_dueno}?text=${encodeURIComponent(mensaje)}`)
  }

  function verComoBar(bar) {
    Alert.alert(
      'Ver como este negocio',
      `Esto abre el panel de "${bar.nombre}" en el navegador, en modo soporte.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir', onPress: () => Linking.openURL('https://ronda-dueno-web.vercel.app') },
      ]
    )
  }

  async function publicarAnuncio() {
    if (!nuevoAnuncio.trim()) return
    const { error } = await supabase.from('anuncios_plataforma').insert({ mensaje: nuevoAnuncio.trim() })
    if (error) { Alert.alert('No se pudo publicar', mensajeAmigable(error, 'Intenta de nuevo.')); return }
    setNuevoAnuncio('')
    cargar()
  }

  function borrarAnuncio(id) {
    Alert.alert('Borrar anuncio', '¿Borrar este anuncio?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        await supabase.from('anuncios_plataforma').delete().eq('id', id)
        cargar()
      } },
    ])
  }

  function compartirCSV(filas, columnas, titulo) {
    const encabezado = columnas.map((c) => c.titulo).join(',')
    const cuerpo = filas.map((f) => columnas.map((c) => `"${String(c.valor(f) ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    Share.share({ title: titulo, message: encabezado + '\n' + cuerpo })
  }

  if (cargando) {
    return <View style={styles.cargandoBox}><Text style={styles.cargandoTexto}>Cargando…</Text></View>
  }

  const totalNegocios = bares.length
  const totalVentas = bares.reduce((s, b) => s + Number(b.ventas_totales), 0)
  const totalComisionGenerada = bares.reduce((s, b) => s + Number(b.comision_generada), 0)
  const totalComisionPagada = bares.reduce((s, b) => s + Number(b.comision_pagada), 0)
  const baresSinPago = bares.filter((b) => b.activo && !b.tiene_metodo_pago)
  const baresPruebaPorVencer = bares.filter((b) => b.activo && b.dias_restantes_prueba <= 7 && b.dias_restantes_prueba >= 0)
  const baresPruebaVencida = bares.filter((b) => b.activo && b.dias_restantes_prueba < 0)
  const baresOrdenPorVentas = [...bares].sort((a, b) => b.ventas_totales - a.ventas_totales)
  const barMasProduce = [...bares].sort((a, b) => b.comision_generada - a.comision_generada)[0]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitulo}>Ronda — Super Admin</Text>
          <Text style={styles.headerSub}>Hola, {admin.nombre}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('¿Salir?', '¿Cerrar tu sesión?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Salir', style: 'destructive', onPress: async () => { await cerrarSesion(); onCerrarSesion() } },
        ])}>
          <Text style={styles.salirTexto}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}><Text style={styles.statValor}>{totalNegocios}</Text><Text style={styles.statLabel}>Bares</Text></View>
        <View style={styles.statCard}><Text style={styles.statValor}>{money(totalVentas)}</Text><Text style={styles.statLabel}>Ventas totales</Text></View>
        <View style={styles.statCard}><Text style={styles.statValor}>{money(totalComisionGenerada)}</Text><Text style={styles.statLabel}>Costo generado</Text></View>
        <View style={styles.statCard}><Text style={styles.statValor}>{money(totalComisionPagada)}</Text><Text style={styles.statLabel}>Ya pagado</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pestanasScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {PESTANAS.map((p) => (
          <TouchableOpacity key={p.id} style={[styles.pestana, pestana === p.id && styles.pestanaActiva]} onPress={() => setPestana(p.id)}>
            <Text style={[styles.pestanaTexto, pestana === p.id && styles.pestanaTextoActivo]}>{p.titulo}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.contenido} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefrescar} tintColor="#d4a338" />}>
        {pestana === 'resumen' && (
          <>
            {(baresPruebaPorVencer.length > 0 || baresPruebaVencida.length > 0) && (
              <View style={[styles.card, { borderColor: '#e05c5c' }]}>
                <Text style={[styles.subtitulo, { color: '#e05c5c' }]}>⏳ Pruebas gratis por vencer o vencidas</Text>
                {baresPruebaVencida.map((b) => (
                  <View key={b.id} style={styles.filaEntreDos}>
                    <Text style={styles.textoNormal}>{b.nombre}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: '#e05c5c', fontWeight: '700' }}>Vencida {Math.abs(b.dias_restantes_prueba)}d</Text>
                      {b.telefono_dueno && (
                        <TouchableOpacity onPress={() => abrirWhatsAppBar(b, `Hola ${b.nombre_dueno || ''}! 👋 Vi que tu prueba de Ronda en "${b.nombre}" ya venció. ¿Hablamos de cómo seguir?`)}>
                          <Text>💬</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                {baresPruebaPorVencer.map((b) => (
                  <View key={b.id} style={styles.filaEntreDos}>
                    <Text style={styles.textoNormal}>{b.nombre}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: '#e0954c', fontWeight: '700' }}>Vence {b.dias_restantes_prueba}d</Text>
                      {b.telefono_dueno && (
                        <TouchableOpacity onPress={() => abrirWhatsAppBar(b, `Hola ${b.nombre_dueno || ''}! 👋 Tu prueba de Ronda en "${b.nombre}" está por vencer en ${b.dias_restantes_prueba} días. ¿Hablamos?`)}>
                          <Text>💬</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {baresSinPago.length > 0 && (
              <View style={[styles.card, { borderColor: '#e0954c' }]}>
                <Text style={[styles.subtitulo, { color: '#e0954c' }]}>⚠️ Bares activos sin método de pago</Text>
                {baresSinPago.map((b) => <Text key={b.id} style={styles.textoNormal}>{b.nombre}</Text>)}
              </View>
            )}
            {barMasProduce && (
              <View style={styles.card}>
                <Text style={styles.subtitulo}>🏆 El que más te produce</Text>
                <Text style={styles.textoNormal}>{barMasProduce.nombre} — {money(barMasProduce.comision_generada)}</Text>
              </View>
            )}
            <Text style={styles.seccionTitulo}>🏅 Top bares por ventas</Text>
            {baresOrdenPorVentas.slice(0, 10).map((b, i) => (
              <View key={b.id} style={styles.filaRanking}>
                <Text style={styles.textoNormal}><Text style={{ color: '#d4a338', fontWeight: '800' }}>#{i + 1}</Text>  {b.nombre}</Text>
                <Text style={styles.textoNormalBold}>{money(b.ventas_totales)}</Text>
              </View>
            ))}
            <Text style={styles.seccionTitulo}>🛠️ Herramientas rápidas</Text>
            <TouchableOpacity style={styles.card} onPress={() => Linking.openURL('https://wa.me/573133661600')}>
              <View style={styles.filaEntreDos}><Text style={styles.textoNormal}>💬 WhatsApp de soporte</Text><Text style={styles.textoNormal}>→</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.card} onPress={() => Linking.openURL('https://supabase.com/dashboard/project/yuucexxhecryveiqirsg')}>
              <View style={styles.filaEntreDos}><Text style={styles.textoNormal}>🗄️ Abrir Supabase Dashboard</Text><Text style={styles.textoNormal}>→</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.card} onPress={() => Linking.openURL('https://ronda-dueno-web.vercel.app')}>
              <View style={styles.filaEntreDos}><Text style={styles.textoNormal}>💻 Abrir panel completo en el navegador</Text><Text style={styles.textoNormal}>→</Text></View>
            </TouchableOpacity>
          </>
        )}

        {pestana === 'bares' && (
          <>
            <TouchableOpacity
              style={styles.botonSecundario}
              onPress={() => compartirCSV(bares, [
                { titulo: 'Nombre', valor: (b) => b.nombre },
                { titulo: 'Dueño', valor: (b) => b.nombre_dueno },
                { titulo: 'Celular', valor: (b) => b.telefono_dueno },
                { titulo: 'Ventas', valor: (b) => b.ventas_totales },
                { titulo: 'Costo generado', valor: (b) => b.comision_generada },
                { titulo: 'Pagado', valor: (b) => b.comision_pagada },
              ], 'Bares de Ronda')}
            >
              <Text style={styles.botonSecundarioTexto}>⬇️ Compartir lista de bares</Text>
            </TouchableOpacity>
            {bares.length === 0 && <Text style={styles.vacioTexto}>Todavía no hay bares registrados.</Text>}
            {bares.map((bar) => {
              const pendiente = bar.comision_generada - bar.comision_pagada
              return (
                <View key={bar.id} style={styles.card}>
                  {editandoId === bar.id ? (
                    <>
                      <TextInput style={styles.input} value={nombreEdit} onChangeText={setNombreEdit} />
                      <View style={styles.filaBotones}>
                        <TouchableOpacity style={styles.botonPrimario} onPress={() => guardarNombre(bar)}><Text style={styles.botonPrimarioTexto}>Guardar</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.botonSecundario} onPress={() => setEditandoId(null)}><Text style={styles.botonSecundarioTexto}>Cancelar</Text></TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.filaEntreDos}>
                        <Text style={styles.nombreBarTexto}>{bar.nombre}</Text>
                        <View style={[styles.pill, { backgroundColor: bar.activo ? '#1a3a2a' : '#3a1a1a' }]}>
                          <Text style={{ color: bar.activo ? '#3ecf8e' : '#e05c5c', fontSize: 12, fontWeight: '700' }}>{bar.activo ? 'Activo' : 'Pausado'}</Text>
                        </View>
                      </View>
                      {!bar.tiene_metodo_pago && <Text style={{ color: '#e0954c', marginTop: 4 }}>⚠️ Sin método de pago configurado</Text>}
                      {bar.dias_restantes_prueba <= 7 && (
                        <Text style={{ color: bar.dias_restantes_prueba >= 0 ? '#e0954c' : '#e05c5c', marginTop: 4 }}>
                          ⏳ Prueba: {bar.dias_restantes_prueba >= 0 ? `Vence en ${bar.dias_restantes_prueba}d` : `Vencida hace ${Math.abs(bar.dias_restantes_prueba)}d`}
                        </Text>
                      )}
                      <Text style={styles.filaDato}>Dueño: <Text style={styles.filaDatoValor}>{bar.nombre_dueno || '—'}</Text></Text>
                      <Text style={styles.filaDato}>Celular: <Text style={styles.filaDatoValor}>{bar.telefono_dueno || '—'}</Text></Text>
                      <Text style={styles.filaDato}>Mesas activas: <Text style={styles.filaDatoValor}>{bar.total_mesas}</Text></Text>
                      <Text style={styles.filaDato}>Ventas totales: <Text style={styles.filaDatoValor}>{money(bar.ventas_totales)}</Text></Text>
                      <Text style={styles.filaDato}>Costo generado: <Text style={styles.filaDatoValor}>{money(bar.comision_generada)}</Text></Text>
                      <Text style={styles.filaDato}>Pendiente: <Text style={[styles.filaDatoValor, { color: pendiente > 0 ? '#e0b94c' : '#3ecf8e' }]}>{money(pendiente)}</Text></Text>
                      <View style={styles.filaBotonesWrap}>
                        <TouchableOpacity style={styles.botonChico} onPress={() => verComoBar(bar)}><Text style={styles.botonChicoTexto}>👁️ Ver como</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.botonChico} onPress={() => { setEditandoId(bar.id); setNombreEdit(bar.nombre) }}><Text style={styles.botonChicoTexto}>✏️ Editar</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.botonChico} onPress={() => togglePausa(bar)}><Text style={styles.botonChicoTexto}>{bar.activo ? '⏸️ Pausar' : '▶️ Activar'}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.botonChico, { borderColor: '#e05c5c' }]} onPress={() => eliminarBar(bar)}><Text style={[styles.botonChicoTexto, { color: '#e05c5c' }]}>🗑️ Eliminar</Text></TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )
            })}
          </>
        )}

        {pestana === 'clientes' && (
          <>
            <Text style={styles.vacioTexto}>{clientes.length} cliente(s) en total, de todos los bares</Text>
            {clientes.map((c) => {
              const nivel = nivelFidelidad(c.visitas)
              return (
                <View key={c.id} style={styles.card}>
                  <View style={styles.filaEntreDos}>
                    <Text style={styles.nombreBarTexto}>{c.nombre || 'Sin nombre'}</Text>
                    <Text style={{ color: nivel.color, fontWeight: '700' }}>{nivel.texto}</Text>
                  </View>
                  <Text style={styles.filaDato}>Celular: <Text style={styles.filaDatoValor}>{c.telefono}</Text></Text>
                  <Text style={styles.filaDato}>Visitas: <Text style={styles.filaDatoValor}>{c.visitas}</Text></Text>
                  <Text style={styles.filaDato}>Bar: <Text style={styles.filaDatoValor}>{c.bar_nombre}</Text></Text>
                </View>
              )
            })}
            {clientes.length === 0 && <Text style={styles.vacioTexto}>Todavía no hay clientes fidelizados en ningún bar.</Text>}
          </>
        )}

        {pestana === 'pagos' && (
          <>
            <TouchableOpacity
              style={styles.botonSecundario}
              onPress={() => compartirCSV(bares, [
                { titulo: 'Bar', valor: (b) => b.nombre },
                { titulo: 'Costo generado', valor: (b) => b.comision_generada },
                { titulo: 'Pagado', valor: (b) => b.comision_pagada },
                { titulo: 'Pendiente', valor: (b) => b.comision_generada - b.comision_pagada },
              ], 'Pagos de Ronda')}
            >
              <Text style={styles.botonSecundarioTexto}>⬇️ Compartir pagos</Text>
            </TouchableOpacity>

            <Text style={styles.seccionTitulo}>📢 Anuncios a todos los dueños</Text>
            <View style={styles.card}>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                value={nuevoAnuncio} onChangeText={setNuevoAnuncio} multiline
                placeholder="Ej: Este viernes actualizamos la app con mejoras nuevas 🎉"
                placeholderTextColor="#6a6a80"
              />
              <TouchableOpacity style={styles.botonPrimario} onPress={publicarAnuncio}><Text style={styles.botonPrimarioTexto}>Publicar anuncio</Text></TouchableOpacity>
            </View>
            {anuncios.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.filaEntreDos}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.textoNormal}>{a.mensaje}</Text>
                    <Text style={{ color: '#9494a8', fontSize: 12, marginTop: 4 }}>{new Date(a.created_at).toLocaleString('es-CO')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => borrarAnuncio(a.id)}><Text style={{ fontSize: 18 }}>🗑️</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  cargandoBox: { flex: 1, backgroundColor: '#14141f', alignItems: 'center', justifyContent: 'center' },
  cargandoTexto: { color: '#9494a8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingTop: 50 },
  headerTitulo: { color: '#f2f2f2', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#9494a8', fontSize: 13, marginTop: 2 },
  salirTexto: { color: '#e05c5c', fontSize: 14, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  statCard: { flexGrow: 1, minWidth: '45%', backgroundColor: '#1e1e2e', borderRadius: 12, padding: 12 },
  statValor: { color: '#f2f2f2', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#9494a8', fontSize: 12, marginTop: 2 },
  pestanasScroll: { marginTop: 16, marginBottom: 4, flexGrow: 0 },
  pestana: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#1e1e2e', marginRight: 8 },
  pestanaActiva: { backgroundColor: '#d4a338' },
  pestanaTexto: { color: '#c9c9d4', fontSize: 13, fontWeight: '700' },
  pestanaTextoActivo: { color: '#14141f' },
  contenido: { flex: 1, padding: 16 },
  card: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a3a' },
  subtitulo: { color: '#f2f2f2', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  seccionTitulo: { color: '#f2f2f2', fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  textoNormal: { color: '#c9c9d4', fontSize: 14 },
  textoNormalBold: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  filaRanking: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e1e2e', borderRadius: 10, padding: 12, marginBottom: 6 },
  filaEntreDos: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nombreBarTexto: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  filaDato: { color: '#9494a8', fontSize: 13, marginTop: 4 },
  filaDatoValor: { color: '#f2f2f2', fontWeight: '700' },
  filaBotones: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filaBotonesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  botonChico: { borderWidth: 1, borderColor: '#3a3a4a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  botonChicoTexto: { color: '#c9c9d4', fontSize: 12, fontWeight: '700' },
  botonPrimario: { backgroundColor: '#d4a338', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  botonPrimarioTexto: { color: '#14141f', fontSize: 15, fontWeight: '800' },
  botonSecundario: { borderWidth: 1, borderColor: '#3a3a4a', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  botonSecundarioTexto: { color: '#c9c9d4', fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: '#14141f', color: '#f2f2f2', borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#2a2a3a' },
  vacioTexto: { color: '#9494a8', fontSize: 14, marginBottom: 10 },
})
