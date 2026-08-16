import { Platform, Alert } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// Canal de Android configurado igual que en FilaCero: bypassDnd + lockscreenVisibility
// + importancia MÁXIMA es lo que logra que suene aunque el celular esté bloqueado
// o en modo "No molestar".
export async function configurarCanal() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('ronda-pedidos', {
    name: 'Pedidos y avisos de Ronda',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#d4a338',
    sound: 'default',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
}

export async function obtenerToken() {
  try {
    const permisoActual = await Notifications.getPermissionsAsync()
    let estado = permisoActual.status
    if (estado !== 'granted') {
      const solicitado = await Notifications.requestPermissionsAsync()
      estado = solicitado.status
    }
    if (estado !== 'granted') {
      Alert.alert('Notificaciones desactivadas', 'No le diste permiso a Ronda para mandarte avisos. Ve a Ajustes del celular → Apps → Ronda → Notificaciones, y actívalo.')
      return null
    }

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId
    if (!projectId) {
      Alert.alert('Diagnóstico', 'No se encontró el projectId de la app — no se puede pedir el token de notificaciones.')
      return null
    }
    const resultado = await Notifications.getExpoPushTokenAsync({ projectId })
    return resultado?.data || null
  } catch (e) {
    Alert.alert('No se pudo obtener el token de notificaciones', e.message)
    return null
  }
}

export async function registrarToken(usuarioBarId) {
  try {
    await configurarCanal()
    const token = await obtenerToken()
    if (!token || !usuarioBarId) return
    const { error } = await supabase.from('push_tokens').upsert({ usuario_bar_id: usuarioBarId, token }, { onConflict: 'usuario_bar_id,token' })
    if (error) Alert.alert('No se pudo guardar tu token de notificaciones', error.message)
  } catch (e) {
    Alert.alert('No se pudo registrar notificaciones', e.message)
  }
}
