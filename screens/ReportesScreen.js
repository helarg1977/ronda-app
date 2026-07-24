import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}

function inicioDe(periodo) {
  const d = new Date()
  if (periodo === 'hoy') {
    d.setHours(0, 0, 0, 0)
  } else if (periodo === 'semana') {
    const diaSemana = d.getDay() === 0 ? 7 : d.getDay() // lunes = 1 ... domingo = 7
    d.setDate(d.getDate() - (diaSemana - 1))
    d.setHours(0, 0, 0, 0)
  } else if (periodo === 'mes') {
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
  }
  return d
}

function fechaCorta(fecha) {
  return fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}

const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
]

export default function ReportesScreen({ usuario, onVolver }) {
  const [periodo, setPeriodo] = useState('hoy')
  const [comisionPct, setComisionPct] = useState(0.03)
  const [ventasTotal, setVentasTotal] = useState(0)
  const [numPedidos, setNumPedidos] = useState(0)
  const [propinasTotal, setPropinasTotal] = useState(0)
  const [porDia, setPorDia] = useState([])
  const [productoTop, setProductoTop] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data: bar } = await supabase.from('bares').select('comision_pct').eq('id', usuario.bar_id).maybeSingle()
    if (bar) setComisionPct(Number(bar.comision_pct))

    const desde = inicioDe(periodo).toISOString()

    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, total, created_at, pedido_items(cantidad, productos(nombre))')
      .eq('bar_id', usuario.bar_id).eq('estado', 'entregado').gte('created_at', desde)
      .order('created_at', { ascending: true })

    const lista = pedidos || []
    setVentasTotal(lista.reduce((s, p) => s + Number(p.total), 0))
    setNumPedidos(lista.length)

    const { data: propinas } = await supabase
      .from('propinas').select('monto, pedidos!inner(bar_id, created_at)').eq('pedidos.bar_id', usuario.bar_id)
    const desdeMs = new Date(desde).getTime()
    setPropinasTotal((propinas || []).filter((p) => new Date(p.pedidos.created_at).getTime() >= desdeMs).reduce((s, p) => s + Number(p.monto), 0))

    const porDiaMap = {}
    lista.forEach((p) => {
      const clave = new Date(p.created_at).toDateString()
      if (!porDiaMap[clave]) porDiaMap[clave] = { fecha: new Date(p.created_at), total: 0, pedidos: 0 }
      porDiaMap[clave].total += Number(p.total)
      porDiaMap[clave].pedidos += 1
    })
    setPorDia(Object.values(porDiaMap).sort((a, b) => b.fecha - a.fecha))

    const conteoProductos = {}
    lista.forEach((p) => p.pedido_items.forEach((it) => {
      const nombre = it.productos?.nombre || '—'
      conteoProductos[nombre] = (conteoProductos[nombre] || 0) + it.cantidad
    }))
    const top = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1])[0]
    setProductoTop(top ? { nombre: top[0], unidades: top[1] } : null)

    setCargando(false)
  }, [usuario.bar_id, periodo])

  useEffect(() => { cargar() }, [cargar])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Informes</Text>
      <Text style={styles.ayuda}>El reemplazo del cuaderno — todas tus ventas, siempre a la mano.</Text>

      <View style={styles.filaPeriodos}>
        {PERIODOS.map((p) => (
          <TouchableOpacity key={p.id} style={[styles.periodoChip, periodo === p.id && styles.periodoChipActivo]} onPress={() => setPeriodo(p.id)}>
            <Text style={[styles.periodoChipTexto, periodo === p.id && styles.periodoChipTextoActivo]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {cargando ? (
        <Text style={styles.ayuda}>Cargando…</Text>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValor}>{money(ventasTotal)}</Text>
              <Text style={styles.statLabel}>Ventas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValor}>{numPedidos}</Text>
              <Text style={styles.statLabel}>Pedidos entregados</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValor}>{money(ventasTotal * comisionPct)}</Text>
              <Text style={styles.statLabel}>Comisión Ronda ({Math.round(comisionPct * 100)}%)</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValor}>{money(propinasTotal)}</Text>
              <Text style={styles.statLabel}>Propinas</Text>
            </View>
          </View>

          {productoTop && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>🍺 Producto estrella del periodo</Text>
              <Text style={styles.cardValor}>{productoTop.nombre} — {productoTop.unidades} unidades</Text>
            </View>
          )}

          <Text style={styles.seccion}>Desglose por día</Text>
          {porDia.length === 0 && <Text style={styles.ayuda}>Sin ventas entregadas en este periodo todavía.</Text>}
          {porDia.map((d, i) => (
            <View key={i} style={styles.diaFila}>
              <Text style={styles.diaFecha}>{fechaCorta(d.fecha)}</Text>
              <Text style={styles.diaPedidos}>{d.pedidos} pedido{d.pedidos !== 1 ? 's' : ''}</Text>
              <Text style={styles.diaTotal}>{money(d.total)}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 4 },
  ayuda: { color: '#6a6a80', fontSize: 13, marginBottom: 16 },
  filaPeriodos: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  periodoChip: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  periodoChipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
  periodoChipTexto: { color: '#f2f2f2', fontSize: 13, fontWeight: '600' },
  periodoChipTextoActivo: { color: '#14141f', fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flexBasis: '47%', backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14 },
  statValor: { color: '#d4a338', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#a0a0b0', fontSize: 11, marginTop: 4, textTransform: 'uppercase' },
  card: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, marginBottom: 16 },
  cardLabel: { color: '#a0a0b0', fontSize: 12, textTransform: 'uppercase', marginBottom: 4 },
  cardValor: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  seccion: { color: '#d4a338', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  diaFila: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8 },
  diaFecha: { color: '#f2f2f2', fontSize: 14, fontWeight: '600', flex: 1.4, textTransform: 'capitalize' },
  diaPedidos: { color: '#a0a0b0', fontSize: 13, flex: 1 },
  diaTotal: { color: '#3ecf8e', fontSize: 14, fontWeight: '700' },
})
