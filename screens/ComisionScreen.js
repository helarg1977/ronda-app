import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { money, costoRonda } from '../lib/formato'
const NUMERO_PAGO_RONDA = '3133661600' // Nequi / Daviplata / Bre-B de Ronda

export default function ComisionScreen({ usuario, onVolver }) {
  const [totalVendido, setTotalVendido] = useState(0)
  const [costoGenerado, setCostoGenerado] = useState(0)
  const [totalPedidos, setTotalPedidos] = useState(0)
  const [historial, setHistorial] = useState([])
  const [monto, setMonto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('total')
      .eq('bar_id', usuario.bar_id)
      .eq('estado', 'entregado')

    const lista = pedidos || []
    const total = lista.reduce((sum, p) => sum + Number(p.total), 0)
    const costo = lista.reduce((sum, p) => sum + costoRonda(Number(p.total)), 0)
    setTotalVendido(total)
    setCostoGenerado(costo)
    setTotalPedidos(lista.length)

    const { data: pagos } = await supabase
      .from('pagos_comision')
      .select('id, monto, estado, created_at')
      .eq('bar_id', usuario.bar_id)
      .order('created_at', { ascending: false })
    setHistorial(pagos || [])
  }, [usuario.bar_id])

  useEffect(() => { cargar() }, [cargar])

  const yaPagado = historial.filter((h) => h.estado === 'aprobado').reduce((s, h) => s + Number(h.monto), 0)
  const pendiente = costoGenerado - yaPagado
  const porcentajeEquivalente = totalVendido > 0 ? (costoGenerado / totalVendido) * 100 : 0

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={40}>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50 }} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Costo por pedido</Text>
      <Text style={styles.explicacion}>
        Ronda nunca cobra por adelantado ni maneja tu dinero. Tú recibes el pago de tus clientes directo (Nequi, Daviplata, Bre-B o efectivo). Solo pagas cuando vendes: cada pedido entregado tiene un costo fijo pequeño, entre $100 y $500 — nunca un porcentaje que crezca con tus ventas.
      </Text>

      <View style={styles.resumenHumanoBox}>
        <Text style={styles.resumenHumanoTitulo}>Hoy Ronda representó el {porcentajeEquivalente.toFixed(2)}% de tus ventas</Text>
        <Text style={styles.resumenHumanoTexto}>Vendiste {money(totalVendido)} en {totalPedidos} pedido{totalPedidos !== 1 ? 's' : ''}, y el costo total fue de solo {money(costoGenerado)}.</Text>
      </View>

      <View style={styles.resumenCard}>
        <View style={styles.filaResumen}>
          <Text style={styles.filaLabel}>Total vendido (entregado)</Text>
          <Text style={styles.filaValor}>{money(totalVendido)}</Text>
        </View>
        <View style={styles.filaResumen}>
          <Text style={styles.filaLabel}>Costo por pedido generado</Text>
          <Text style={styles.filaValor}>{money(costoGenerado)}</Text>
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

      <Text style={styles.label}>¿Cuánto cuesta cada pedido?</Text>
      <View style={styles.tablaTarifas}>
        <View style={styles.tarifaFila}><Text style={styles.tarifaRango}>Hasta $10.000</Text><Text style={styles.tarifaValor}>$100</Text></View>
        <View style={styles.tarifaFila}><Text style={styles.tarifaRango}>$10.001 – $50.000</Text><Text style={styles.tarifaValor}>$200</Text></View>
        <View style={styles.tarifaFila}><Text style={styles.tarifaRango}>$50.001 – $100.000</Text><Text style={styles.tarifaValor}>$300</Text></View>
        <View style={styles.tarifaFila}><Text style={styles.tarifaRango}>$100.001 – $200.000</Text><Text style={styles.tarifaValor}>$400</Text></View>
        <View style={styles.tarifaFila}><Text style={styles.tarifaRango}>Más de $200.000</Text><Text style={styles.tarifaValor}>$500</Text></View>
      </View>

      <Text style={styles.label}>Reportar un pago</Text>
      <View style={styles.numeroPagoBox}>
        <Text style={styles.numeroPagoTexto}>Envía tu pago a Nequi / Daviplata / Bre-B:</Text>
        <Text style={styles.numeroPagoNumero}>{NUMERO_PAGO_RONDA}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={monto ? Number(monto).toLocaleString('es-CO') : ''}
        onChangeText={(v) => setMonto(v.replace(/\D/g, ''))}
        keyboardType="numeric"
        placeholder="Monto pagado, ej: 50.000"
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 8 },
  explicacion: { color: '#a0a0b0', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  resumenHumanoBox: { backgroundColor: '#1a2e26', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#3ecf8e' },
  resumenHumanoTitulo: { color: '#3ecf8e', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  resumenHumanoTexto: { color: '#a0c9b8', fontSize: 13, lineHeight: 18 },
  resumenCard: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 16, marginBottom: 24 },
  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  filaLabel: { color: '#a0a0b0', fontSize: 14 },
  filaValor: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  filaPendiente: { borderTopWidth: 1, borderTopColor: '#2a2a3a', marginTop: 6, paddingTop: 12 },
  filaLabelPendiente: { color: '#d4a338', fontSize: 15, fontWeight: '700' },
  filaValorPendiente: { color: '#d4a338', fontSize: 18, fontWeight: '800' },
  label: { color: '#a0a0b0', fontSize: 15, marginTop: 10, marginBottom: 8 },
  tablaTarifas: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 6, marginBottom: 20 },
  tarifaFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  tarifaRango: { color: '#a0a0b0', fontSize: 13 },
  tarifaValor: { color: '#d4a338', fontSize: 14, fontWeight: '700' },
  numeroPagoBox: { backgroundColor: '#26263a', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#d4a338' },
  numeroPagoTexto: { color: '#a0a0b0', fontSize: 13 },
  numeroPagoNumero: { color: '#d4a338', fontSize: 20, fontWeight: '800', marginTop: 4 },
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
  vacio: { color: '#9494a8', fontSize: 14 },
})
