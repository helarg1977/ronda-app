import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { supabase, guardarSesion } from '../lib/supabase'

export default function LoginScreen({ onLogin }) {
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    if (!telefono || !pin) {
      Alert.alert('Falta información', 'Ingresa tu número de celular y tu PIN.')
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc('login_usuario_bar', {
      p_telefono: telefono.trim(),
      p_pin: pin.trim(),
    })
    setCargando(false)

    if (error || !data || data.length === 0) {
      Alert.alert('No pudimos entrar', 'El celular o el PIN no son correctos. Verifica con el administrador.')
      return
    }
    const usuario = data[0]
    await guardarSesion(usuario)
    onLogin(usuario)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Ronda</Text>
      <Text style={styles.subtitulo}>La siguiente ronda está a un toque</Text>

      <Text style={styles.label}>Número de celular</Text>
      <TextInput
        style={styles.input}
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        placeholder="3001234567"
        placeholderTextColor="#6a6a80"
      />

      <Text style={styles.label}>PIN</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        placeholder="••••"
        placeholderTextColor="#6a6a80"
      />

      <TouchableOpacity style={styles.boton} onPress={entrar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Entrar</Text>}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f', justifyContent: 'center', padding: 28 },
  titulo: { fontSize: 40, fontWeight: '800', color: '#f2f2f2', textAlign: 'center' },
  subtitulo: { fontSize: 16, color: '#d4a338', textAlign: 'center', marginBottom: 40 },
  label: { color: '#a0a0b0', fontSize: 15, marginBottom: 8, marginTop: 18 },
  input: {
    backgroundColor: '#1e1e2e',
    color: '#f2f2f2',
    borderRadius: 14,
    padding: 16,
    fontSize: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  boton: {
    backgroundColor: '#d4a338',
    borderRadius: 14,
    padding: 18,
    marginTop: 36,
    alignItems: 'center',
  },
  botonTexto: { color: '#14141f', fontSize: 19, fontWeight: '700' },
})
