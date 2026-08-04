import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Keyboard, TouchableWithoutFeedback, Linking } from 'react-native'
import { supabase } from '../lib/supabase'

export default function RecuperarPinScreen({ onVolver }) {
  const [paso, setPaso] = useState(1) // 1: pedir codigo | 2: cambiar pin
  const [telefono, setTelefono] = useState('')
  const [codigo, setCodigo] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinConfirmar, setPinConfirmar] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function pedirCodigo() {
    if (!telefono || telefono.length < 10) {
      Alert.alert('Falta tu celular', 'Escribe el número completo de tu cuenta.')
      return
    }
    setCargando(true)
    const { data: codigoGenerado, error } = await supabase.rpc('generar_codigo_recuperacion', { p_telefono: telefono })
    setCargando(false)
    if (error) {
      Alert.alert('No pudimos generar el código', error.message)
      return
    }
    Linking.openURL(`https://wa.me/57${telefono}?text=${encodeURIComponent(`Tu código de Ronda para recuperar tu PIN es: ${codigoGenerado}`)}`)
    setPaso(2)
  }

  async function cambiarPin() {
    if (!codigo || codigo.length !== 4) {
      Alert.alert('Falta el código', 'Escribe el código de 4 dígitos que te llegó por WhatsApp.')
      return
    }
    if (pinNuevo.length < 4) {
      Alert.alert('PIN muy corto', 'Elige un PIN de al menos 4 dígitos.')
      return
    }
    if (pinNuevo !== pinConfirmar) {
      Alert.alert('Los PIN no coinciden', 'Escribe el mismo PIN en los dos campos.')
      return
    }
    setCargando(true)
    const { error } = await supabase.rpc('resetear_pin_por_codigo', {
      p_telefono: telefono, p_codigo: codigo, p_pin_nuevo: pinNuevo,
    })
    setCargando(false)
    if (error) {
      Alert.alert('No se pudo cambiar tu PIN', error.message)
      return
    }
    Alert.alert('¡Listo! 🎉', 'Tu PIN ya quedó actualizado. Ya puedes entrar con el nuevo.', [
      { text: 'Entrar', onPress: onVolver },
    ])
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={{ flex: 1, backgroundColor: '#14141f' }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
        <Text style={styles.titulo}>Recuperar mi PIN</Text>

        {paso === 1 ? (
          <>
            <Text style={styles.subtitulo}>Escribe el celular de tu cuenta — te vamos a abrir WhatsApp con un código para confirmar que eres tú.</Text>
            <Text style={styles.label}>Tu celular</Text>
            <TextInput
              style={styles.input} value={telefono}
              onChangeText={(v) => setTelefono(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="phone-pad" placeholder="3001234567" placeholderTextColor="#6a6a80" maxLength={10}
            />
            <TouchableOpacity style={styles.boton} onPress={pedirCodigo} disabled={cargando}>
              {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Enviarme el código por WhatsApp</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitulo}>Escribe el código de 4 dígitos que te llegó por WhatsApp, y tu PIN nuevo.</Text>

            <Text style={styles.label}>Código de WhatsApp</Text>
            <TextInput
              style={[styles.input, styles.inputCodigo]} value={codigo}
              onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad" placeholder="0000" placeholderTextColor="#6a6a80" maxLength={4}
            />

            <Text style={styles.label}>Tu PIN nuevo</Text>
            <View style={styles.filaPin}>
              <TextInput style={[styles.input, { flex: 1 }]} value={pinNuevo} onChangeText={setPinNuevo} keyboardType="number-pad" secureTextEntry={!verPin} placeholder="••••" placeholderTextColor="#6a6a80" maxLength={6} />
              <TouchableOpacity style={styles.botonOjo} onPress={() => setVerPin(!verPin)}>
                <Text style={styles.botonOjoTexto}>{verPin ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirma tu PIN nuevo</Text>
            <TextInput style={styles.input} value={pinConfirmar} onChangeText={setPinConfirmar} keyboardType="number-pad" secureTextEntry={!verPin} placeholder="••••" placeholderTextColor="#6a6a80" maxLength={6} />

            <TouchableOpacity style={styles.boton} onPress={cambiarPin} disabled={cargando}>
              {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Cambiar mi PIN</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPaso(1)}>
              <Text style={styles.olvidoTexto}>¿No te llegó el código? Volver a intentar</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#14141f', paddingTop: 60, paddingHorizontal: 28, paddingBottom: 250 },
  volver: { color: '#d4a338', fontSize: 15, marginBottom: 20 },
  titulo: { fontSize: 28, fontWeight: '800', color: '#f2f2f2' },
  subtitulo: { fontSize: 14, color: '#a0a0b0', marginBottom: 20, lineHeight: 20 },
  label: { color: '#a0a0b0', fontSize: 14, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 15, fontSize: 17,
    borderWidth: 1, borderColor: '#2a2a3a',
  },
  inputCodigo: { fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  filaPin: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  botonOjo: { backgroundColor: '#1e1e2e', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a', padding: 14 },
  botonOjoTexto: { fontSize: 20 },
  olvidoTexto: { color: '#a0a0b0', fontSize: 13, textAlign: 'center', marginTop: 20 },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 18, marginTop: 30, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 18, fontWeight: '700' },
})
