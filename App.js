import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { leerSesion } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import DuenoDashboard from './screens/DuenoDashboard'
import MeseroDashboard from './screens/MeseroDashboard'
import MenuScreen from './screens/MenuScreen'
import ComisionScreen from './screens/ComisionScreen'

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [usuario, setUsuario] = useState(null)
  const [pantalla, setPantalla] = useState('dashboard') // dashboard | menu | comision

  useEffect(() => {
    leerSesion().then((u) => {
      setUsuario(u)
      setCargando(false)
    })
  }, [])

  if (cargando) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator color="#d4a338" size="large" />
      </View>
    )
  }

  if (!usuario) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onLogin={setUsuario} />
      </>
    )
  }

  function cerrarSesionYVolver() {
    setUsuario(null)
    setPantalla('dashboard')
  }

  return (
    <>
      <StatusBar style="light" />
      {usuario.rol === 'dueno' && pantalla === 'dashboard' && (
        <DuenoDashboard
          usuario={usuario}
          onCerrarSesion={cerrarSesionYVolver}
          onIrMenu={() => setPantalla('menu')}
          onIrComision={() => setPantalla('comision')}
        />
      )}
      {usuario.rol === 'dueno' && pantalla === 'menu' && (
        <MenuScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
      )}
      {usuario.rol === 'dueno' && pantalla === 'comision' && (
        <ComisionScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
      )}
      {usuario.rol === 'mesero' && (
        <MeseroDashboard usuario={usuario} onCerrarSesion={cerrarSesionYVolver} />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  cargando: { flex: 1, backgroundColor: '#14141f', justifyContent: 'center', alignItems: 'center' },
})
