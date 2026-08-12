// Nuestros propios RPCs ya lanzan mensajes en español, pensados para el dueño
// (ej: "Ya existe una cuenta con ese número de celular"). Esos se muestran tal cual.
// Todo lo demás (errores crudos de Postgres, de red, en inglés) se esconde detrás
// de un mensaje genérico y amigable.

function pareceMensajeTecnico(mensaje) {
  if (!mensaje) return true
  const pistasTecnicas = [
    'duplicate key', 'violates', 'null value', 'column', 'relation',
    'constraint', 'permission denied', 'row-level security', 'failed to fetch',
    'network request failed', 'JWT', 'syntax error', 'undefined', 'null is not',
  ]
  const minusculas = mensaje.toLowerCase()
  return pistasTecnicas.some((pista) => minusculas.includes(pista.toLowerCase()))
}

export function mensajeAmigable(error, mensajeGenerico = 'Algo no salió bien. Intenta de nuevo en un momento.') {
  const texto = error?.message || error
  if (!texto) return mensajeGenerico
  if (pareceMensajeTecnico(texto)) return mensajeGenerico
  return texto
}
