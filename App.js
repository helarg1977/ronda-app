import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { leerSesion, cerrarSesion } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import RegistroNegocioScreen from './screens/RegistroNegocioScreen'
import UnirseEmpleadoScreen from './screens/UnirseEmpleadoScreen'
import RecuperarPinScreen from './screens/RecuperarPinScreen'
import DuenoDashboard from './screens/DuenoDashboard'
import MeseroDashboard from './screens/MeseroDashboard'
import MenuScreen from './screens/MenuScreen'
import ComisionScreen from './screens/ComisionScreen'
import ConfiguracionScreen from './screens/ConfiguracionScreen'
import ReportesScreen from './screens/ReportesScreen'
import { registrarToken } from './lib/notificaciones'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const ROLES_PANEL_DUENO = ['dueno', 'administrador']

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [usuario, setUsuario] = useState(null)
  const [pantallaLogin, setPantallaLogin] = useState('login') // login | registro | unirse
  const [pantalla, setPantalla] = useState('dashboard') // dashboard | menu | comision | configuracion

  useEffect(() => {
    leerSesion().then((u) => {
      setUsuario(u)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    if (usuario?.id) registrarToken(usuario.id)
  }, [usuario?.id])

  if (cargando) {
    return (
      <SafeAreaProvider>
        <View style={styles.cargando}>
          <ActivityIndicator color="#d4a338" size="large" />
        </View>
      </SafeAreaProvider>
    )
  }

  if (!usuario) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        {pantallaLogin === 'registro' && (
          <RegistroNegocioScreen onLogin={setUsuario} onVolver={() => setPantallaLogin('login')} onIrARecuperar={() => setPantallaLogin('recuperar')} />
        )}
        {pantallaLogin === 'unirse' && (
          <UnirseEmpleadoScreen onLogin={setUsuario} onVolver={() => setPantallaLogin('login')} onIrARecuperar={() => setPantallaLogin('recuperar')} />
        )}
        {pantallaLogin === 'recuperar' && (
          <RecuperarPinScreen onVolver={() => setPantallaLogin('login')} />
        )}
        {pantallaLogin === 'login' && (
          <LoginScreen
            onLogin={setUsuario}
            onIrARegistro={() => setPantallaLogin('registro')}
            onIrAUnirse={() => setPantallaLogin('unirse')}
            onIrARecuperar={() => setPantallaLogin('recuperar')}
          />
        )}
      </SafeAreaProvider>
    )
  }

  function cerrarSesionYVolver() {
    cerrarSesion()
    setUsuario(null)
    setPantalla('dashboard')
  }

  const puedeVerPanelDueno = ROLES_PANEL_DUENO.includes(usuario.rol)

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {puedeVerPanelDueno && pantalla === 'dashboard' && (
        <DuenoDashboard
          usuario={usuario}
          onCerrarSesion={cerrarSesionYVolver}
          onIrMenu={() => setPantalla('menu')}
          onIrComision={() => setPantalla('comision')}
          onIrConfiguracion={() => setPantalla('configuracion')}
          onIrReportes={() => setPantalla('reportes')}
        />
      )}
      {puedeVerPanelDueno && pantalla === 'menu' && (
        <MenuScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
      )}
      {puedeVerPanelDueno && pantalla === 'reportes' && (
        <ReportesScreen usuario={usuario} onVolver={() => setPantalla('dashboard')} />
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
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  cargando: { flex: 1, backgroundColor: '#14141f', justifyContent: 'center', alignItems: 'center' },
})
