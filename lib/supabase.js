import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Mismos datos que en ronda-web (Project Settings → API en Supabase)
const SUPABASE_URL = 'https://yuucexxhecryveiqirsg.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pNKdqpKXm3WhA52zM8FdLQ_qcCL8ooz'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

// Claves usadas para guardar la sesión propia (login por teléfono + PIN, no Supabase Auth)
export const SESSION_KEY = 'ronda_usuario_sesion'

export async function guardarSesion(usuario) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(usuario))
}

export async function leerSesion() {
  const raw = await AsyncStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

export async function cerrarSesion() {
  await AsyncStorage.removeItem(SESSION_KEY)
}
