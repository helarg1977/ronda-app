import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { leerSesion } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import DuenoDashboard from './screens/DuenoDashboard'
import MeseroDashboard from './screens/MeseroDashboard'
import MenuScreen from './screens/MenuScreen'
import ComisionScreen from './screens/ComisionScreen'
import ConfiguracionScreen from './screens/ConfiguracionScreen'

const ROLES_PANEL_DUENO = ['dueno', 'administrador']

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [usuario, setUsuario] = useState(null)
  const [pantalla, setPantalla] = useState('dashboard') // dashboard | menu | comision | configuracion

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

  const puedeVerPanelDueno = ROLES_PANEL_DUENO.includes(usuario.rol)

  return (
    <>
      <StatusBar style="light" />
      {puedeVerPanelDueno && pantalla === 'dashboard' && (
        <DuenoDashboard
          usuario={usuario}
          onCerrarSesion={cerrarSesionYVolver}
          onIrMenu={() => setPantalla('menu')}
          onIrComision={() => setPantalla('comision')}
          onIrConfiguracion={() => setPantalla('configuracion')}
        />
      )}
      {puedeVerPanelDueno && pantalla === 'menu' && (
        <MenuScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
      )}
      {usuario.rol === 'dueno' && pantalla === 'comision' && (
        <ComisionScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
      )}
      {usuario.rol === 'dueno' && pantalla === 'configuracion' && (
        <ConfiguracionScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
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
