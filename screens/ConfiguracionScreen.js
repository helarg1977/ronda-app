import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ConfiguracionScreen({ usuario, onVolver }) {
  const [nombre, setNombre] = useState('')
  const [llaveNequi, setLlaveNequi] = useState('')
  const [llaveDaviplata, setLlaveDaviplata] = useState('')
  const [llaveBreB, setLlaveBreB] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('bares')
      .select('nombre, llave_nequi, llave_daviplata, llave_bre_b')
      .eq('id', usuario.bar_id)
      .maybeSingle()
    if (data) {
      setNombre(data.nombre || '')
      setLlaveNequi(data.llave_nequi || '')
      setLlaveDaviplata(data.llave_daviplata || '')
      setLlaveBreB(data.llave_bre_b || '')
    }
  }, [usuario.bar_id])

  useEffect(() => { cargar() }, [cargar])

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase
      .from('bares')
      .update({
        nombre: nombre.trim(),
        llave_nequi: llaveNequi.trim() || null,
        llave_daviplata: llaveDaviplata.trim() || null,
        llave_bre_b: llaveBreB.trim() || null,
      })
      .eq('id', usuario.bar_id)
    setGuardando(false)
    if (error) { Alert.alert('Error', 'No se pudo guardar.'); return }
    Alert.alert('Listo', 'Tu configuración quedó guardada.')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50 }}>
      <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Configuración del negocio</Text>

      <Text style={styles.label}>Nombre del bar</Text>
      <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre de tu bar" placeholderTextColor="#6a6a80" />

      <Text style={styles.seccion}>Números de pago</Text>
      <Text style={styles.ayuda}>
        Estos son TUS números — el cliente transfiere directo a ti. Ronda nunca recibe ni administra ese dinero.
      </Text>

      <Text style={styles.label}>Nequi</Text>
      <TextInput style={styles.input} value={llaveNequi} onChangeText={setLlaveNequi} placeholder="Número de celular" keyboardType="phone-pad" placeholderTextColor="#6a6a80" />

      <Text style={styles.label}>Daviplata</Text>
      <TextInput style={styles.input} value={llaveDaviplata} onChangeText={setLlaveDaviplata} placeholder="Número de celular" keyboardType="phone-pad" placeholderTextColor="#6a6a80" />

      <Text style={styles.label}>Bre-B</Text>
      <TextInput style={styles.input} value={llaveBreB} onChangeText={setLlaveBreB} placeholder="Tu llave Bre-B" placeholderTextColor="#6a6a80" />

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        <Text style={styles.botonTexto}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 8 },
  seccion: { color: '#d4a338', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 6 },
  ayuda: { color: '#6a6a80', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  label: { color: '#a0a0b0', fontSize: 14, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#2a2a3a',
  },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 26 },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
})
