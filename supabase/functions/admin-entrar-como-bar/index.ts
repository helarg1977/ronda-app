// Modo soporte: el super-admin entra a ver un bar específico
// con una sesión real (no solo los datos), para poder ayudar de verdad.

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
    const { telefono, pin, bar_id } = await req.json()
    if (!telefono || !pin || !bar_id) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: headersCors })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 1. Verificar que quien pide esto es de verdad un super-admin
    const { data: adminValido, error: errorAdmin } = await admin
      .from('super_admins').select('id').eq('telefono', telefono)
      .then(async (r) => {
        if (r.error || !r.data || r.data.length === 0) return { data: null, error: 'No autorizado' }
        const { data: chequeo } = await admin.rpc('login_super_admin', { p_telefono: telefono, p_pin: pin })
        return { data: chequeo && chequeo.length > 0 ? chequeo[0] : null, error: null }
      })
    if (!adminValido) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: headersCors })
    }

    // 2. Buscar al dueño de ese bar
    const { data: dueno, error: errorDueno } = await admin
      .from('usuarios_bar').select('*').eq('bar_id', bar_id).eq('rol', 'dueno').eq('activo', true).limit(1).maybeSingle()
    if (errorDueno || !dueno) {
      return new Response(JSON.stringify({ error: 'Este negocio no tiene un dueño activo' }), { status: 404, headers: headersCors })
    }

    const emailInterno = `usuario-${dueno.id}@ronda.internal`
    let authUserId = dueno.auth_user_id

    if (!authUserId) {
      const { data: nuevoAuth, error: errorCrear } = await admin.auth.admin.createUser({
        email: emailInterno,
        email_confirm: true,
        user_metadata: { usuario_bar_id: dueno.id, bar_id: dueno.bar_id, rol: dueno.rol },
      })
      if (errorCrear) {
        return new Response(JSON.stringify({ error: 'No se pudo preparar el acceso: ' + errorCrear.message }), { status: 500, headers: headersCors })
      }
      authUserId = nuevoAuth.user.id
      await admin.from('usuarios_bar').update({ auth_user_id: authUserId }).eq('id', dueno.id)
    }

    const { data: enlace, error: errorEnlace } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailInterno,
    })
    if (errorEnlace) {
      return new Response(JSON.stringify({ error: 'No se pudo crear la sesión: ' + errorEnlace.message }), { status: 500, headers: headersCors })
    }

    const tokenHash = enlace.properties.hashed_token
    const clientePublico = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'))
    const { data: sesion, error: errorSesion } = await clientePublico.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
    if (errorSesion || !sesion.session) {
      return new Response(JSON.stringify({ error: 'No se pudo activar la sesión: ' + (errorSesion?.message || '') }), { status: 500, headers: headersCors })
    }

    return new Response(JSON.stringify({
      usuario: { id: dueno.id, bar_id: dueno.bar_id, nombre: dueno.nombre, telefono: dueno.telefono, rol: dueno.rol, activo: dueno.activo },
      access_token: sesion.session.access_token,
      refresh_token: sesion.session.refresh_token,
    }), { status: 200, headers: { ...headersCors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado: ' + e.message }), { status: 500, headers: headersCors })
  }
})
