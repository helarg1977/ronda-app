import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Contenedor único para TODO lo flotante de una pantalla (botón de ayuda,
 * chat, CTA principal, etc). Regla de oro: ningún elemento flotante nuevo
 * se crea aparte con su propia posición absoluta — todos entran aquí como
 * "children", uno debajo del otro con espacio automático entre ellos.
 *
 * Este componente mide su propia altura real (con onLayout) y se la avisa
 * a la pantalla que lo usa a través de onAltoCambio — esa pantalla usa ese
 * número como paddingBottom de su ScrollView, así el contenido nunca queda
 * tapado, sin importar cuántos botones haya hoy o se agreguen mañana.
 *
 * Uso:
 *   const [altoFlotante, setAltoFlotante] = useState(0)
 *   <ScrollView contentContainerStyle={{ paddingBottom: altoFlotante + 20 }}>...</ScrollView>
 *   <CapaFlotante onAltoCambio={setAltoFlotante}>
 *     <BotonAyudaFlotante ... />
 *     <BotonChatFlotante ... />
 *   </CapaFlotante>
 */
export default function CapaFlotante({ children, style, onAltoCambio }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[styles.capa, { paddingBottom: 20 + insets.bottom }, style]}
      pointerEvents="box-none"
      onLayout={(e) => onAltoCambio && onAltoCambio(e.nativeEvent.layout.height)}
    >
      {children}
    </View>
  )
}

export function useAltoFlotante() {
  const [alto, setAlto] = React.useState(0)
  return [alto, setAlto]
}

const styles = StyleSheet.create({
  capa: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
})
