# Ronda — App de dueño y mesero

"La siguiente ronda está a un toque"

App Expo para el dueño del bar y sus meseros. Login simple por teléfono + PIN
(sin contraseñas complicadas). El rol (`dueno` / `mesero`) determina qué panel se ve.

## Roles

- **Dueño:** tablero de mesas en tiempo real (verde/amarillo/rojo según antigüedad
  del pedido), gestión del menú, y pantalla de comisión con Ronda (nunca automática).
- **Mesero:** lista de pedidos activos con botón para avanzar el estado
  (confirmar → preparando → en camino → entregado), y solicitudes de mesa
  ("necesito hielo", "la cuenta", etc.)

## Importante: el dinero nunca pasa por Ronda

El cliente le paga directo al dueño (Nequi/Daviplata/Bre-B propios del bar, o
efectivo). Ronda solo registra el pedido. La comisión (3%) el dueño la reporta
y paga aparte, manualmente, desde la pantalla "Pagar a Ronda" — nunca hay
cobro automático ni dinero retenido por la plataforma.

## Cómo crear un usuario dueño/mesero (por ahora, manual en Supabase)

En la tabla `usuarios_bar`, inserta una fila con:
- `bar_id`: el id de tu bar en la tabla `bares`
- `nombre`, `telefono`, `pin` (ej: un PIN de 4 dígitos)
- `rol`: `'dueno'` o `'mesero'`
- `activo`: true

Con ese teléfono + PIN ya se puede entrar a la app.

## Desarrollo local

```
npm install
npx expo start
```
