import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ConfiguracionScreen({ usuario, onVolver }) {
  const [nombre, setNombre] = useState('')
  const [llaveNequi, setLlaveNequi] = useState('')
  const [llaveDaviplata, setLlaveDaviplata] = useState('')
  const [llaveBreB, setLlaveBreB] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [empleados, setEmpleados] = useState([])
  const [nombreEmpleado, setNombreEmpleado] = useState('')
  const [telefonoEmpleado, setTelefonoEmpleado] = useState('')
  const [pinEmpleado, setPinEmpleado] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('bares').select('nombre, llave_nequi, llave_daviplata, llave_bre_b').eq('id', usuario.bar_id).maybeSingle()
    if (data) {
      setNombre(data.nombre || '')
      setLlaveNequi(data.llave_nequi || '')
      setLlaveDaviplata(data.llave_daviplata || '')
      setLlaveBreB(data.llave_bre_b || '')
    }
    const { data: emp } = await supabase.from('usuarios_bar').select('id, nombre, telefono, rol, activo').eq('bar_id', usuario.bar_id).order('nombre')
    setEmpleados(emp || [])
  }, [usuario.bar_id])

  useEffect(() => { cargar() }, [cargar])

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.from('bares').update({
      nombre: nombre.trim(),
      llave_nequi: llaveNequi.trim() || null,
      llave_daviplata: llaveDaviplata.trim() || null,
      llave_bre_b: llaveBreB.trim() || null,
    }).eq('id', usuario.bar_id)
    setGuardando(false)
    if (error) { Alert.alert('Error', 'No se pudo guardar.'); return }
    Alert.alert('Listo', 'Tu configuración quedó guardada.')
  }

  async function agregarEmpleado() {
    if (!nombreEmpleado.trim() || !telefonoEmpleado.trim() || pinEmpleado.trim().length < 4) {
      Alert.alert('Falta información', 'Escribe nombre, celular y un PIN de al menos 4 dígitos.')
      return
    }
    const { error } = await supabase.from('usuarios_bar').insert({
      bar_id: usuario.bar_id,
      nombre: nombreEmpleado.trim(),
      telefono: telefonoEmpleado.trim(),
      pin: pinEmpleado.trim(),
      rol: 'mesero',
      activo: true,
    })
    if (error) { Alert.alert('Error', 'No se pudo crear el empleado: ' + error.message); return }
    setNombreEmpleado('')
    setTelefonoEmpleado('')
    setPinEmpleado('')
    Alert.alert('Listo', `${nombreEmpleado.trim()} ya puede entrar a la app con su celular y ese PIN.`)
    cargar()
  }

  async function toggleActivo(empleado) {
    await supabase.from('usuarios_bar').update({ activo: !empleado.activo }).eq('id', empleado.id)
    cargar()
  }

  async function borrarEmpleado(empleado) {
    Alert.alert('Quitar empleado', `¿Quitar a ${empleado.nombre} del sistema?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => { await supabase.from('usuarios_bar').delete().eq('id', empleado.id); cargar() } },
    ])
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={40}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
        <Text style={styles.titulo}>Configuración del negocio</Text>

        <Text style={styles.label}>Nombre del bar</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre de tu bar" placeholderTextColor="#6a6a80" />

        <Text style={styles.seccion}>Números de pago</Text>
        <Text style={styles.ayuda}>Estos son TUS números — el cliente transfiere directo a ti. Ronda nunca recibe ni administra ese dinero.</Text>

        <Text style={styles.label}>Nequi</Text>
        <TextInput style={styles.input} value={llaveNequi} onChangeText={setLlaveNequi} placeholder="Número de celular" keyboardType="phone-pad" placeholderTextColor="#6a6a80" />

        <Text style={styles.label}>Daviplata</Text>
        <TextInput style={styles.input} value={llaveDaviplata} onChangeText={setLlaveDaviplata} placeholder="Número de celular" keyboardType="phone-pad" placeholderTextColor="#6a6a80" />

        <Text style={styles.label}>Bre-B</Text>
        <TextInput style={styles.input} value={llaveBreB} onChangeText={setLlaveBreB} placeholder="Tu llave Bre-B" placeholderTextColor="#6a6a80" />

        <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
          <Text style={styles.botonTexto}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Text>
        </TouchableOpacity>

        <Text style={styles.seccion}>Empleados (meseros)</Text>
        <Text style={styles.ayuda}>Crea el acceso de cada mesero: elige su nombre, celular y un PIN — con eso entra directo a la app, sin correos ni contraseñas complicadas.</Text>

        <Text style={styles.label}>Nombre del mesero</Text>
        <TextInput style={styles.input} value={nombreEmpleado} onChangeText={setNombreEmpleado} placeholder="Ej: Camilo" placeholderTextColor="#6a6a80" />
        <Text style={styles.label}>Celular</Text>
        <TextInput style={styles.input} value={telefonoEmpleado} onChangeText={setTelefonoEmpleado} placeholder="3001234567" keyboardType="phone-pad" placeholderTextColor="#6a6a80" />
        <Text style={styles.label}>PIN de acceso</Text>
        <TextInput style={styles.input} value={pinEmpleado} onChangeText={setPinEmpleado} placeholder="Ej: 1234" keyboardType="number-pad" placeholderTextColor="#6a6a80" />
        <TouchableOpacity style={styles.botonSecundario} onPress={agregarEmpleado}>
          <Text style={styles.botonSecundarioTexto}>+ Agregar empleado</Text>
        </TouchableOpacity>

        <Text style={styles.subseccion}>Empleados actuales</Text>
        {empleados.length === 0 && <Text style={styles.ayuda}>Todavía no has agregado a nadie.</Text>}
        {empleados.map((e) => (
          <View key={e.id} style={styles.empleadoItem}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleActivo(e)}>
              <Text style={[styles.empleadoNombre, !e.activo && styles.empleadoInactivo]}>{e.nombre} · {e.rol}</Text>
              <Text style={styles.empleadoEstado}>{e.telefono} — {e.activo ? 'Activo (toca para desactivar)' : 'Desactivado (toca para reactivar)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => borrarEmpleado(e)}><Text style={styles.borrarTexto}>🗑️</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 8 },
  seccion: { color: '#d4a338', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 6 },
  subseccion: { color: '#a0a0b0', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
  ayuda: { color: '#6a6a80', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  label: { color: '#a0a0b0', fontSize: 14, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#2a2a3a',
  },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 26 },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  botonSecundario: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginTop: 10 },
  botonSecundarioTexto: { color: '#f2f2f2', fontSize: 15 },
  empleadoItem: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  empleadoNombre: { color: '#f2f2f2', fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  empleadoInactivo: { color: '#6a6a80', textDecorationLine: 'line-through' },
  empleadoEstado: { color: '#6a6a80', fontSize: 13, marginTop: 4 },
  borrarTexto: { fontSize: 20, paddingLeft: 10 },
})
