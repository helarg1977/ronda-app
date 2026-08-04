import React, { useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard, TouchableWithoutFeedback, Image } from 'react-native'
import * as Updates from 'expo-updates'
import { supabase, guardarSesion } from '../lib/supabase'

export default function LoginScreen({ onLogin, onIrARegistro, onIrAUnirse, onIrARecuperar }) {
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [mostrarAyudaPin, setMostrarAyudaPin] = useState(false)
  const refPin = useRef(null)

  async function entrar() {
    if (!telefono || !pin) {
      Alert.alert('Falta información', 'Ingresa tu número de celular y tu PIN.')
      return
    }
    setCargando(true)
    const { data, error } = await supabase.functions.invoke('login-pin', {
      body: { telefono: telefono.trim(), pin: pin.trim() },
    })
    setCargando(false)

    if (error || data?.error || !data?.usuario) {
      Alert.alert('No pudimos entrar', data?.error || 'El celular o el PIN no son correctos. Verifica con el administrador.')
      return
    }
    await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    const usuario = data.usuario
    await guardarSesion(usuario)
    onLogin(usuario)
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={{ flex: 1, backgroundColor: '#14141f' }}>
      <Image source={require('../assets/login-fondo.jpg')} style={styles.imagenSuperior} resizeMode="contain" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={true}
        automaticallyAdjustKeyboardInsets={true}
        keyboardDismissMode="interactive"
      >
      <View style={{ height: 300 }} />

      <Text style={styles.label}>Número de celular</Text>
      <TextInput
        style={styles.input}
        value={telefono}
        onChangeText={(v) => setTelefono(v.replace(/\D/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        placeholder="3001234567"
        placeholderTextColor="#6a6a80"
        maxLength={10}
        returnKeyType="next"
        onSubmitEditing={() => refPin.current?.focus()}
        blurOnSubmit={false}
      />

      <Text style={styles.label}>PIN</Text>
      <View style={styles.filaPin}>
        <TextInput
          ref={refPin}
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry={!verPin}
          placeholder="••••"
          placeholderTextColor="#6a6a80"
          returnKeyType="done"
          onSubmitEditing={entrar}
        />
        <TouchableOpacity style={styles.botonOjo} onPress={() => setVerPin(!verPin)}>
          <Text style={styles.botonOjoTexto}>{verPin ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onIrARecuperar}>
        <Text style={styles.olvidoTexto}>¿Olvidaste tu PIN?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.boton} onPress={entrar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Entrar</Text>}
      </TouchableOpacity>

      <View style={styles.filaEnlaces}>
        <TouchableOpacity onPress={onIrARegistro}>
          <Text style={styles.enlaceTexto}>¿Tienes un bar? <Text style={styles.enlaceResaltado}>Regístralo gratis</Text></Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onIrAUnirse}>
          <Text style={styles.enlaceTexto}>¿Eres empleado? <Text style={styles.enlaceResaltado}>Tengo un código</Text></Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.diagnosticoTexto}>
        v: {Updates.updateId ? Updates.updateId.slice(0, 8) : 'incorporada de fábrica'} · canal: {Updates.channel || 'ninguno'}
      </Text>

      <Modal visible={mostrarAyudaPin} transparent animationType="fade" onRequestClose={() => setMostrarAyudaPin(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>¿Olvidaste tu PIN?</Text>
            <Text style={styles.modalTexto}>
              Por ahora Ronda no envía códigos por SMS. Si eres mesero o administrador, pídele al dueño del bar que te
              genere un PIN nuevo desde "⚙️ Config → Empleados". Si eres el dueño y perdiste el acceso, escríbenos y te
              ayudamos a recuperarlo.
            </Text>
            <TouchableOpacity style={styles.boton} onPress={() => setMostrarAyudaPin(false)}>
              <Text style={styles.botonTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  imagenSuperior: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%' },
  container: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 28, paddingBottom: 200 },
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
  filaPin: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  botonOjo: { backgroundColor: '#1e1e2e', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a', padding: 14 },
  botonOjoTexto: { fontSize: 20 },
  olvidoTexto: { color: '#a0a0b0', fontSize: 14, textAlign: 'right', marginTop: 10 },
  filaEnlaces: { marginTop: 24, gap: 14, alignItems: 'center' },
  diagnosticoTexto: { color: '#4a4a5a', fontSize: 10, textAlign: 'center', marginTop: 20 },
  enlaceTexto: { color: '#a0a0b0', fontSize: 14, textAlign: 'center' },
  enlaceResaltado: { color: '#d4a338', fontWeight: '700' },
  boton: {
    backgroundColor: '#d4a338',
    borderRadius: 14,
    padding: 18,
    marginTop: 36,
    alignItems: 'center',
  },
  botonTexto: { color: '#14141f', fontSize: 19, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalCaja: { backgroundColor: '#1e1e2e', borderRadius: 20, padding: 24 },
  modalTitulo: { color: '#f2f2f2', fontSize: 20, fontWeight: '800', marginBottom: 14 },
  modalTexto: { color: '#c0c0cc', fontSize: 15, lineHeight: 22 },
})
