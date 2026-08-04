import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Muestra una guía corta la primera vez que el dueño entra a una pantalla.
// Uso: <GuiaPantalla id="menu" barId={usuario.bar_id} pasos={[{icono:'🍺', titulo:'...', texto:'...'}]} />
export default function GuiaPantalla({ id, barId, pasos }) {
  const [visible, setVisible] = useState(false)
  const [paso, setPaso] = useState(0)
  const clave = `ronda_guia_${id}_${barId}`

  useEffect(() => {
    AsyncStorage.getItem(clave).then((v) => { if (!v) setVisible(true) })
  }, [clave])

  async function cerrar() {
    await AsyncStorage.setItem(clave, '1')
    setVisible(false)
    setPaso(0)
  }

  if (!pasos || pasos.length === 0) return null
  const actual = pasos[paso]
  const esUltimo = paso === pasos.length - 1

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <View style={styles.overlay}>
        <View style={styles.caja}>
          <Text style={styles.icono}>{actual.icono}</Text>
          <Text style={styles.titulo}>{actual.titulo}</Text>
          <Text style={styles.texto}>{actual.texto}</Text>

          <View style={styles.puntos}>
            {pasos.map((_, i) => (
              <View key={i} style={[styles.punto, i === paso && styles.puntoActivo]} />
            ))}
          </View>

          <TouchableOpacity style={styles.boton} onPress={() => (esUltimo ? cerrar() : setPaso(paso + 1))}>
            <Text style={styles.botonTexto}>{esUltimo ? 'Entendido' : 'Siguiente'}</Text>
          </TouchableOpacity>
          {!esUltimo && (
            <TouchableOpacity onPress={cerrar}><Text style={styles.saltar}>Saltar</Text></TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  caja: { backgroundColor: '#1e1e2e', borderRadius: 22, padding: 26, width: '100%', maxWidth: 380, alignItems: 'center' },
  icono: { fontSize: 44, marginBottom: 10 },
  titulo: { color: '#f2f2f2', fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  texto: { color: '#a0a0b0', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  puntos: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a3a4a' },
  puntoActivo: { backgroundColor: '#d4a338', width: 18 },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, alignItems: 'center' },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  saltar: { color: '#6a6a80', fontSize: 13, marginTop: 14 },
})
