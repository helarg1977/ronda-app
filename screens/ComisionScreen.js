import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { supabase } from '../lib/supabase'

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}

export default function ComisionScreen({ usuario, onVolver }) {
  const [totalVendido, setTotalVendido] = useState(0)
  const [comisionPct, setComisionPct] = useState(0.03)
  const [historial, setHistorial] = useState([])
  const [monto, setMonto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const { data: bar } = await supabase.from('bares').select('comision_pct').eq('id', usuario.bar_id).maybeSingle()
    if (bar) setComisionPct(Number(bar.comision_pct))

    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('total')
      .eq('bar_id', usuario.bar_id)
      .eq('estado', 'entregado')

    const total = (pedidos || []).reduce((sum, p) => sum + Number(p.total), 0)
    setTotalVendido(total)

    const { data: pagos } = await supabase
      .from('pagos_comision')
      .select('id, monto, estado, created_at')
      .eq('bar_id', usuario.bar_id)
      .order('created_at', { ascending: false })
    setHistorial(pagos || [])
  }, [usuario.bar_id])

  useEffect(() => { cargar() }, [cargar])

  const comisionGenerada = totalVendido * comisionPct
  const yaPagado = historial.filter((h) => h.estado === 'aprobado').reduce((s, h) => s + Number(h.monto), 0)
  const pendiente = comisionGenerada - yaPagado

  async function reportarPago() {
    const valor = Number(monto)
    if (!valor || valor <= 0) {
      Alert.alert('Falta el monto', 'Ingresa cuánto vas a pagar.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.from('pagos_comision').insert({ bar_id: usuario.bar_id, monto: valor, estado: 'pendiente' })
    setEnviando(false)
    if (error) {
      Alert.alert('No se pudo registrar', 'Intenta de nuevo en un momento.')
      return
    }
    setMonto('')
    Alert.alert('Reportado', 'Registramos tu pago. Ronda lo va a confirmar pronto.')
    cargar()
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50 }}>
      <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Comisión con Ronda</Text>
      <Text style={styles.explicacion}>
        Ronda nunca cobra por adelantado ni maneja tu dinero. Tú recibes el pago de tus clientes directo (Nequi, Daviplata, Bre-B o efectivo). Aquí solo reportas el pago del {(comisionPct * 100).toFixed(0)}% que le corresponde a Ronda por tus ventas entregadas.
      </Text>

      <View style={styles.resumenCard}>
        <View style={styles.filaResumen}>
          <Text style={styles.filaLabel}>Total vendido (entregado)</Text>
          <Text style={styles.filaValor}>{money(totalVendido)}</Text>
        </View>
        <View style={styles.filaResumen}>
          <Text style={styles.filaLabel}>Comisión generada ({(comisionPct * 100).toFixed(0)}%)</Text>
          <Text style={styles.filaValor}>{money(comisionGenerada)}</Text>
        </View>
        <View style={styles.filaResumen}>
          <Text style={styles.filaLabel}>Ya pagado</Text>
          <Text style={styles.filaValor}>{money(yaPagado)}</Text>
        </View>
        <View style={[styles.filaResumen, styles.filaPendiente]}>
          <Text style={styles.filaLabelPendiente}>Pendiente por pagar</Text>
          <Text style={styles.filaValorPendiente}>{money(Math.max(pendiente, 0))}</Text>
        </View>
      </View>

      <Text style={styles.label}>Reportar un pago</Text>
      <TextInput
        style={styles.input}
        value={monto}
        onChangeText={setMonto}
        keyboardType="numeric"
        placeholder="Monto pagado, ej: 50000"
        placeholderTextColor="#6a6a80"
      />
      <TouchableOpacity style={styles.boton} onPress={reportarPago} disabled={enviando}>
        <Text style={styles.botonTexto}>{enviando ? 'Enviando…' : 'Reportar pago a Ronda'}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Historial</Text>
      {historial.map((h) => (
        <View key={h.id} style={styles.historialItem}>
          <Text style={styles.historialMonto}>{money(h.monto)}</Text>
          <Text style={styles.historialEstado}>{h.estado}</Text>
        </View>
      ))}
      {historial.length === 0 && <Text style={styles.vacio}>Todavía no has reportado pagos.</Text>}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 8 },
  explicacion: { color: '#a0a0b0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  resumenCard: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, marginBottom: 24 },
  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  filaLabel: { color: '#a0a0b0', fontSize: 14 },
  filaValor: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  filaPendiente: { borderTopWidth: 1, borderTopColor: '#2a2a3a', marginTop: 6, paddingTop: 12 },
  filaLabelPendiente: { color: '#d4a338', fontSize: 15, fontWeight: '700' },
  filaValorPendiente: { color: '#d4a338', fontSize: 18, fontWeight: '800' },
  label: { color: '#a0a0b0', fontSize: 15, marginTop: 10, marginBottom: 8 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 16,
    fontSize: 18, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 14,
  },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 26 },
  botonTexto: { color: '#14141f', fontSize: 17, fontWeight: '700' },
  historialItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  historialMonto: { color: '#f2f2f2', fontSize: 15 },
  historialEstado: { color: '#a0a0b0', fontSize: 14, textTransform: 'capitalize' },
  vacio: { color: '#6a6a80', fontSize: 14 },
})
