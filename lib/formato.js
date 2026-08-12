// Funciones compartidas de formato — antes estaban copiadas en 4-5 archivos distintos,
// lo que causó el bug de la comisión contradictoria (se corrigió en un lugar y no en otro).
// Ahora hay un solo lugar: si algo cambia, cambia para toda la app a la vez.

export function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}

// La misma tarifa que usa la base de datos (calcular_costo_ronda) — si cambia, cambiarla en los dos lados
export function costoRonda(monto) {
  if (monto <= 10000) return 100
  if (monto <= 50000) return 200
  if (monto <= 100000) return 300
  if (monto <= 200000) return 400
  return 500
}

export function inicioDeHoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
