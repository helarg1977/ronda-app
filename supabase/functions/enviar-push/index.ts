// Recibe una lista de usuario_bar_id + titulo + cuerpo, busca sus tokens guardados,
// y les manda una notificación push real a través del servicio de Expo.

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
    const { usuario_bar_ids, titulo, cuerpo, datos } = await req.json()
    if (!usuario_bar_ids || !Array.isArray(usuario_bar_ids) || usuario_bar_ids.length === 0 || !titulo) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: headersCors })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: tokens, error } = await admin
      .from('push_tokens')
      .select('token')
      .in('usuario_bar_id', usuario_bar_ids)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: headersCors })
    }
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ enviados: 0, motivo: 'Sin tokens registrados para estos usuarios' }), { status: 200, headers: headersCors })
    }

    const mensajes = tokens.map((t) => ({
      to: t.token,
      title: titulo,
      body: cuerpo || '',
      sound: 'default',
      data: datos || {},
    }))

    const respuestaExpo = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mensajes),
    })
    const resultado = await respuestaExpo.json()

    return new Response(JSON.stringify({ enviados: mensajes.length, resultado }), { status: 200, headers: { ...headersCors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado: ' + e.message }), { status: 500, headers: headersCors })
  }
})
