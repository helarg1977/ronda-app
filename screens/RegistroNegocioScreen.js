import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native'
import { supabase, guardarSesion } from '../lib/supabase'
import { mensajeAmigable } from '../lib/erroresAmigables'

export default function RegistroNegocioScreen({ onLogin, onVolver, onIrARecuperar }) {
  const [nombreBar, setNombreBar] = useState('')
  const [nombreDueno, setNombreDueno] = useState('')
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirmar, setPinConfirmar] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [numeroMesas, setNumeroMesas] = useState('6')
  const [cargando, setCargando] = useState(false)

  async function registrar() {
    if (!nombreBar.trim() || !nombreDueno.trim() || !telefono || !pin) {
      Alert.alert('Falta información', 'Completa el nombre del bar, tu nombre, celular y PIN.')
      return
    }
    if (pin.length < 4) {
      Alert.alert('PIN muy corto', 'Elige un PIN de al menos 4 dígitos.')
      return
    }
    if (pin !== pinConfirmar) {
      Alert.alert('Los PIN no coinciden', 'Escribe el mismo PIN en los dos campos.')
      return
    }
    const mesas = Math.max(1, Math.min(50, Number(numeroMesas) || 1))

    setCargando(true)
    const { data, error } = await supabase.rpc('registrar_negocio', {
      p_nombre_bar: nombreBar.trim(),
      p_nombre_dueno: nombreDueno.trim(),
      p_telefono: telefono.trim(),
      p_pin: pin.trim(),
      p_numero_mesas: mesas,
    })
    setCargando(false)

    if (error || !data || data.length === 0) {
      Alert.alert('No se pudo crear tu negocio', mensajeAmigable(error, 'No pudimos crear tu negocio. Intenta de nuevo en un momento.'))
      return
    }

    const resultado = data[0]

    // Conseguir una sesión real (no solo datos locales) para que las funciones de dueño trabajen bien
    const { data: sesionData, error: errorSesion } = await supabase.functions.invoke('login-pin', {
      body: { telefono: telefono.trim(), pin: pin.trim() },
    })
    if (errorSesion || sesionData?.error || !sesionData?.usuario) {
      Alert.alert('Tu negocio se creó, pero hubo un problema iniciando tu sesión', 'Intenta entrar de nuevo con tu celular y PIN.')
      onVolver()
      return
    }
    await supabase.auth.setSession({ access_token: sesionData.access_token, refresh_token: sesionData.refresh_token })
    await guardarSesion(sesionData.usuario)

    Alert.alert(
      '¡Tu bar ya está listo! 🎉',
      `Se crearon ${mesas} mesas con su código QR. Tu código de negocio (para agregar empleados) es: ${resultado.codigo_negocio}`,
      [{ text: 'Entrar a mi panel', onPress: () => onLogin(sesionData.usuario) }]
    )
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={{ flex: 1, backgroundColor: '#14141f' }}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        keyboardDismissMode="interactive"
      >
        <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
        <Text style={styles.titulo}>Crea tu negocio</Text>
        <Text style={styles.subtitulo}>En un minuto tienes tus mesas listas con su QR para imprimir.</Text>

        <Text style={styles.label}>Nombre de tu bar</Text>
        <TextInput style={styles.input} value={nombreBar} onChangeText={setNombreBar} placeholder="Ej: Bar El Rincón" placeholderTextColor="#6a6a80" />

        <Text style={styles.label}>Tu nombre</Text>
        <TextInput style={styles.input} value={nombreDueno} onChangeText={setNombreDueno} placeholder="Tu nombre completo" placeholderTextColor="#6a6a80" />

        <Text style={styles.label}>Tu celular</Text>
        <TextInput
          style={styles.input} value={telefono}
          onChangeText={(v) => setTelefono(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad" placeholder="3001234567" placeholderTextColor="#6a6a80" maxLength={10}
        />

        <Text style={styles.label}>Elige un PIN</Text>
        <View style={styles.filaPin}>
          <TextInput style={[styles.input, { flex: 1 }]} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry={!verPin} placeholder="••••" placeholderTextColor="#6a6a80" maxLength={6} />
          <TouchableOpacity style={styles.botonOjo} onPress={() => setVerPin(!verPin)}>
            <Text style={styles.botonOjoTexto}>{verPin ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Confirma tu PIN</Text>
        <View style={styles.filaPin}>
          <TextInput style={[styles.input, { flex: 1 }]} value={pinConfirmar} onChangeText={setPinConfirmar} keyboardType="number-pad" secureTextEntry={!verPin} placeholder="••••" placeholderTextColor="#6a6a80" maxLength={6} />
          <TouchableOpacity style={styles.botonOjo} onPress={() => setVerPin(!verPin)}>
            <Text style={styles.botonOjoTexto}>{verPin ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>¿Cuántas mesas tiene tu bar?</Text>
        <TextInput
          style={styles.input} value={numeroMesas}
          onChangeText={(v) => setNumeroMesas(v.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad" placeholder="6" placeholderTextColor="#6a6a80"
        />
        <Text style={styles.ayudaChica}>No te preocupes, puedes agregar o quitar mesas después.</Text>

        <TouchableOpacity onPress={onIrARecuperar}>
          <Text style={styles.olvidoTexto}>¿Ya tienes cuenta y olvidaste tu PIN?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.boton} onPress={registrar} disabled={cargando}>
          {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Crear mi negocio</Text>}
        </TouchableOpacity>
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
  ayudaChica: { color: '#6a6a80', fontSize: 12, marginTop: 6 },
  filaPin: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  botonOjo: { backgroundColor: '#1e1e2e', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a', padding: 14 },
  botonOjoTexto: { fontSize: 20 },
  olvidoTexto: { color: '#a0a0b0', fontSize: 13, textAlign: 'center', marginTop: 26 },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 18, marginTop: 30, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 18, fontWeight: '700' },
})
