// Función de login real para Ronda (dueño, mesero, administrador)
// Recibe telefono + pin, los verifica, y entrega una sesión de Supabase
// firmada de verdad — no solo una fila de la base de datos.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
  const headersCors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headersCors })

  try {
    const { telefono, pin } = await req.json()
    if (!telefono || !pin) {
      return new Response(JSON.stringify({ error: 'Falta el teléfono o el PIN' }), { status: 400, headers: headersCors })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 1. Verificar teléfono + PIN contra usuarios_bar (usa la misma función que ya existía)
    const { data: filas, error: errorLogin } = await admin.rpc('login_usuario_bar', {
      p_telefono: telefono,
      p_pin: pin,
    })
    if (errorLogin || !filas || filas.length === 0) {
      return new Response(JSON.stringify({ error: 'El celular o el PIN no son correctos.' }), { status: 401, headers: headersCors })
    }
    const usuario = filas[0]

    // 2. Buscar si ya tiene una credencial real de Supabase; si no, crearla
    const { data: fila } = await admin.from('usuarios_bar').select('auth_user_id').eq('id', usuario.id).maybeSingle()
    let authUserId = fila?.auth_user_id

    const emailInterno = `usuario-${usuario.id}@ronda.internal`

    if (!authUserId) {
      const { data: nuevoAuth, error: errorCrear } = await admin.auth.admin.createUser({
        email: emailInterno,
        email_confirm: true,
        user_metadata: { usuario_bar_id: usuario.id, bar_id: usuario.bar_id, rol: usuario.rol },
      })
      if (errorCrear) {
        return new Response(JSON.stringify({ error: 'No se pudo preparar tu acceso: ' + errorCrear.message }), { status: 500, headers: headersCors })
      }
      authUserId = nuevoAuth.user.id
      await admin.from('usuarios_bar').update({ auth_user_id: authUserId }).eq('id', usuario.id)
    }

    // 3. Generar la sesión real (sin mandar ningún correo — se verifica aquí mismo, del lado del servidor)
    const { data: enlace, error: errorEnlace } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailInterno,
    })
    if (errorEnlace) {
      return new Response(JSON.stringify({ error: 'No se pudo crear tu sesión: ' + errorEnlace.message }), { status: 500, headers: headersCors })
    }

    const tokenHash = enlace.properties.hashed_token
    const clientePublico = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'))
    const { data: sesion, error: errorSesion } = await clientePublico.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
    if (errorSesion || !sesion.session) {
      return new Response(JSON.stringify({ error: 'No se pudo activar tu sesión: ' + (errorSesion?.message || '') }), { status: 500, headers: headersCors })
    }

    return new Response(JSON.stringify({
      usuario,
      access_token: sesion.session.access_token,
      refresh_token: sesion.session.refresh_token,
    }), { status: 200, headers: { ...headersCors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado: ' + e.message }), { status: 500, headers: headersCors })
  }
})
