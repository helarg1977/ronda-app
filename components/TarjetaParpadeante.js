import React, { useEffect, useRef } from 'react'
import { TouchableOpacity, Animated, StyleSheet } from 'react-native'

/**
 * Envuelve cualquier tarjeta (mesa, pedido) y le agrega un halo que
 * parpadea suavemente cuando `activo` es true — para que un pedido nuevo
 * se note a simple vista en medio del ruido de un bar, sin tener que leer
 * el texto de cada tarjeta una por una.
 */
export default function TarjetaParpadeante({ activo, style, onPress, onLongPress, children, colorHalo = '#ffcf5c' }) {
  const opacidad = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let loop
    if (activo) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacidad, { toValue: 1, duration: 550, useNativeDriver: true }),
          Animated.timing(opacidad, { toValue: 0.15, duration: 550, useNativeDriver: true }),
        ])
      )
      loop.start()
    } else {
      opacidad.setValue(0)
    }
    return () => { if (loop) loop.stop() }
  }, [activo])

  return (
    <TouchableOpacity style={style} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {children}
      {activo && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius: 14, borderWidth: 3, borderColor: colorHalo, opacity: opacidad },
          ]}
        />
      )}
    </TouchableOpacity>
  )
}
