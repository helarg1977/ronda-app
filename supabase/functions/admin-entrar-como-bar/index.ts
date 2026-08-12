// Modo soporte: el super-admin entra a ver un bar específico
// con una sesión real (no solo los datos), para poder ayudar de verdad.
// Se verifica por sesión real (JWT), no por telefono+pin reenviado — y queda registrado.

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
    const { bar_id } = await req.json()
    if (!bar_id) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: headersCors })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 1. Verificar que quien llama tiene una sesión real de super-admin
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
    if (errorUser || !userData?.user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: headersCors })
    }
    const { data: superAdminRow } = await admin.from('super_admins').select('id').eq('auth_user_id', userData.user.id).maybeSingle()
    if (!superAdminRow) {
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
        console.error('Error creando usuario en Auth (modo soporte):', errorCrear.message)
        return new Response(JSON.stringify({ error: 'No pudimos preparar el acceso. Intenta de nuevo en un momento.' }), { status: 500, headers: headersCors })
      }
      authUserId = nuevoAuth.user.id
      await admin.from('usuarios_bar').update({ auth_user_id: authUserId }).eq('id', dueno.id)
    }

    const { data: enlace, error: errorEnlace } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailInterno,
    })
    if (errorEnlace) {
      console.error('Error generando enlace de sesión (modo soporte):', errorEnlace.message)
      return new Response(JSON.stringify({ error: 'No pudimos crear la sesión. Intenta de nuevo en un momento.' }), { status: 500, headers: headersCors })
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

    // 3. Dejar rastro — quién entró, a qué bar, cuándo
    await admin.from('super_admin_auditoria').insert({ super_admin_id: superAdminRow.id, bar_id, accion: 'ver_como_negocio' })

    return new Response(JSON.stringify({
      usuario: { id: dueno.id, bar_id: dueno.bar_id, nombre: dueno.nombre, telefono: dueno.telefono, rol: dueno.rol, activo: dueno.activo },
      access_token: sesion.session.access_token,
      refresh_token: sesion.session.refresh_token,
    }), { status: 200, headers: { ...headersCors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado: ' + e.message }), { status: 500, headers: headersCors })
  }
})
