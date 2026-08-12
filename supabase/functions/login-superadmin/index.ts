// Login del super-admin con sesión real (no telefono+pin reenviado en cada accion)

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
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: headersCors })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: bloqueado } = await admin.rpc('verificar_bloqueo_login', { p_telefono: telefono })
    if (bloqueado) {
      return new Response(JSON.stringify({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' }), { status: 429, headers: headersCors })
    }

    const { data: chequeo, error: errorChequeo } = await admin.rpc('login_super_admin', { p_telefono: telefono, p_pin: pin })
    if (errorChequeo || !chequeo || chequeo.length === 0) {
      await admin.rpc('registrar_intento_fallido', { p_telefono: telefono })
      return new Response(JSON.stringify({ error: 'El celular o el PIN no son correctos' }), { status: 401, headers: headersCors })
    }
    await admin.rpc('limpiar_intentos_login', { p_telefono: telefono })
    const superAdminId = chequeo[0].id

    const { data: superAdminRow } = await admin.from('super_admins').select('id, auth_user_id').eq('id', superAdminId).maybeSingle()
    if (!superAdminRow) {
      return new Response(JSON.stringify({ error: 'No se encontró la cuenta de administrador' }), { status: 404, headers: headersCors })
    }

    const emailInterno = `superadmin-${superAdminRow.id}@ronda.internal`
    let authUserId = superAdminRow.auth_user_id

    if (!authUserId) {
      const { data: nuevoAuth, error: errorCrear } = await admin.auth.admin.createUser({
        email: emailInterno,
        email_confirm: true,
        user_metadata: { super_admin_id: superAdminRow.id },
      })
      if (errorCrear) {
        return new Response(JSON.stringify({ error: 'No se pudo preparar el acceso: ' + errorCrear.message }), { status: 500, headers: headersCors })
      }
      authUserId = nuevoAuth.user.id
      await admin.from('super_admins').update({ auth_user_id: authUserId }).eq('id', superAdminRow.id)
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
      admin: { id: superAdmin.id, telefono, esSuperAdmin: true },
      access_token: sesion.session.access_token,
      refresh_token: sesion.session.refresh_token,
    }), { status: 200, headers: { ...headersCors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado: ' + e.message }), { status: 500, headers: headersCors })
  }
})
