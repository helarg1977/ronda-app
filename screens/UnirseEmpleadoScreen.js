import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native'
import { supabase, guardarSesion } from '../lib/supabase'

export default function UnirseEmpleadoScreen({ onLogin, onVolver, onIrARecuperar }) {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirmar, setPinConfirmar] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [rol, setRol] = useState('mesero')
  const [cargando, setCargando] = useState(false)

  async function unirse() {
    if (!codigo.trim() || !nombre.trim() || !telefono || !pin) {
      Alert.alert('Falta información', 'Completa el código, tu nombre, celular y PIN.')
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

    setCargando(true)
    const { data, error } = await supabase.rpc('unirse_como_empleado', {
      p_codigo: codigo.trim(),
      p_nombre: nombre.trim(),
      p_telefono: telefono.trim(),
      p_pin: pin.trim(),
      p_rol: rol,
    })
    setCargando(false)

    if (error || !data || data.length === 0) {
      Alert.alert('No se pudo unir', error?.message || 'Revisa el código e intenta de nuevo.')
      return
    }

    const { data: sesionData, error: errorSesion } = await supabase.functions.invoke('login-pin', {
      body: { telefono: telefono.trim(), pin: pin.trim() },
    })
    if (errorSesion || sesionData?.error || !sesionData?.usuario) {
      Alert.alert('Tu cuenta se creó, pero hubo un problema iniciando tu sesión', 'Intenta entrar de nuevo con tu celular y PIN.')
      onVolver()
      return
    }
    await supabase.auth.setSession({ access_token: sesionData.access_token, refresh_token: sesionData.refresh_token })
    await guardarSesion(sesionData.usuario)
    Alert.alert('¡Listo!', `Ya quedaste conectado como ${rol === 'mesero' ? 'mesero' : 'administrador'}.`, [
      { text: 'Entrar', onPress: () => onLogin(sesionData.usuario) },
    ])
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
        <Text style={styles.titulo}>Únete a tu negocio</Text>
        <Text style={styles.subtitulo}>Pídele a tu jefe el código de 6 letras/números del negocio.</Text>

        <Text style={styles.label}>Código del negocio</Text>
        <TextInput
          style={[styles.input, styles.inputCodigo]} value={codigo}
          onChangeText={(v) => setCodigo(v.toUpperCase().slice(0, 6))}
          placeholder="AB12CD" placeholderTextColor="#6a6a80" autoCapitalize="characters" maxLength={6}
        />

        <Text style={styles.label}>¿Cuál es tu rol?</Text>
        <View style={styles.filaRoles}>
          <TouchableOpacity style={[styles.rolChip, rol === 'mesero' && styles.rolChipActivo]} onPress={() => setRol('mesero')}>
            <Text style={[styles.rolChipTexto, rol === 'mesero' && styles.rolChipTextoActivo]}>Mesero</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.rolChip, rol === 'administrador' && styles.rolChipActivo]} onPress={() => setRol('administrador')}>
            <Text style={[styles.rolChipTexto, rol === 'administrador' && styles.rolChipTextoActivo]}>Administrador</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Tu nombre</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Tu nombre completo" placeholderTextColor="#6a6a80" />

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

        <TouchableOpacity onPress={onIrARecuperar}>
          <Text style={styles.olvidoTexto}>¿Ya tienes cuenta y olvidaste tu PIN?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.boton} onPress={unirse} disabled={cargando}>
          {cargando ? <ActivityIndicator color="#14141f" /> : <Text style={styles.botonTexto}>Unirme</Text>}
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
  inputCodigo: { fontSize: 22, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  filaRoles: { flexDirection: 'row', gap: 10 },
  rolChip: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  rolChipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
  rolChipTexto: { color: '#a0a0b0', fontWeight: '700' },
  rolChipTextoActivo: { color: '#14141f' },
  olvidoTexto: { color: '#a0a0b0', fontSize: 13, textAlign: 'center', marginTop: 26 },
  filaPin: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  botonOjo: { backgroundColor: '#1e1e2e', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a3a', padding: 14 },
  botonOjoTexto: { fontSize: 20 },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 18, marginTop: 30, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 18, fontWeight: '700' },
})
