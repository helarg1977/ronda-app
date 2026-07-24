import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '../lib/supabase'

const CATEGORIAS_SUGERIDAS = [
  { nombre: 'Cervezas', icono: '🍺' },
  { nombre: 'Tragos', icono: '🥃' },
  { nombre: 'Cócteles', icono: '🍸' },
  { nombre: 'Sin alcohol', icono: '💧' },
  { nombre: 'Comida', icono: '🍟' },
]

const PRODUCTOS_SUGERIDOS = {
  cerveza: ['Águila', 'Poker', 'Corona', 'Club Colombia', 'Costeña', 'Corona'],
  trago: ['Ron Medellín', 'Aguardiente Antioqueño', 'Whisky', 'Vodka', 'Tequila'],
  cóctel: ['Mojito', 'Margarita', 'Piña Colada', 'Daiquiri', 'Michelada'],
  coctel: ['Mojito', 'Margarita', 'Piña Colada', 'Daiquiri', 'Michelada'],
  'sin alcohol': ['Agua', 'Gaseosa', 'Jugo natural', 'Limonada'],
  comida: ['Papas a la francesa', 'Alitas', 'Picada mixta', 'Nachos'],
}

function sugerenciasProducto(nombreCategoria) {
  if (!nombreCategoria) return []
  const clave = Object.keys(PRODUCTOS_SUGERIDOS).find((k) => nombreCategoria.toLowerCase().includes(k))
  return clave ? PRODUCTOS_SUGERIDOS[clave] : []
}

function formatearPrecio(digitos) {
  if (!digitos) return ''
  return '$ ' + Number(digitos).toLocaleString('es-CO')
}

export default function MenuScreen({ usuario, onVolver }) {
  const [categorias, setCategorias] = useState([])
  const [productos, setProductos] = useState([])
  const [nombreCategoria, setNombreCategoria] = useState('')
  const [iconoCategoria, setIconoCategoria] = useState('')
  const [mostrarCategoriaCustom, setMostrarCategoriaCustom] = useState(false)
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)
  const [nombreProducto, setNombreProducto] = useState('')
  const [precioProducto, setPrecioProducto] = useState('')
  const [fotoProducto, setFotoProducto] = useState('')

  const cargar = useCallback(async () => {
    const { data: cats } = await supabase.from('categorias').select('id, nombre, icono').eq('bar_id', usuario.bar_id).order('orden')
    const { data: prods } = await supabase.from('productos').select('id, categoria_id, nombre, precio, disponible').eq('bar_id', usuario.bar_id).order('orden')
    setCategorias(cats || [])
    setProductos(prods || [])
    if (cats && cats.length && !categoriaSeleccionada) setCategoriaSeleccionada(cats[0].id)
  }, [usuario.bar_id, categoriaSeleccionada])

  useEffect(() => { cargar() }, [cargar])

  async function crearCategoria(nombre, icono) {
    const { error } = await supabase.from('categorias').insert({ bar_id: usuario.bar_id, nombre, icono, orden: categorias.length })
    if (error) { Alert.alert('Error', 'No se pudo crear la categoría: ' + error.message); return }
    setNombreCategoria('')
    setIconoCategoria('')
    setMostrarCategoriaCustom(false)
    cargar()
  }

  async function borrarCategoria(cat) {
    Alert.alert('Borrar categoría', `¿Borrar "${cat.nombre}"? También se borran sus productos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          await supabase.from('productos').delete().eq('categoria_id', cat.id)
          await supabase.from('categorias').delete().eq('id', cat.id)
          if (categoriaSeleccionada === cat.id) setCategoriaSeleccionada(null)
          cargar()
        },
      },
    ])
  }

  async function agregarProducto() {
    if (!nombreProducto.trim() || !precioProducto || !categoriaSeleccionada) {
      Alert.alert('Falta información', 'Elige una categoría, escribe el nombre y el precio.')
      return
    }
    const { error } = await supabase.from('productos').insert({
      bar_id: usuario.bar_id,
      categoria_id: categoriaSeleccionada,
      nombre: nombreProducto.trim(),
      precio: Number(precioProducto),
      foto_url: fotoProducto.trim() || null,
      disponible: true,
      orden: productos.length,
    })
    if (error) { Alert.alert('Error', 'No se pudo crear el producto: ' + error.message); return }
    setNombreProducto('')
    setPrecioProducto('')
    setFotoProducto('')
    cargar()
  }

  async function borrarProducto(producto) {
    Alert.alert('Borrar producto', `¿Borrar "${producto.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await supabase.from('productos').delete().eq('id', producto.id); cargar() } },
    ])
  }

  async function toggleDisponible(producto) {
    await supabase.from('productos').update({ disponible: !producto.disponible }).eq('id', producto.id)
    cargar()
  }

  const categoriaActivaNombre = categorias.find((c) => c.id === categoriaSeleccionada)?.nombre || ''
  const sugerencias = sugerenciasProducto(categoriaActivaNombre)

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={40}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
        <Text style={styles.titulo}>Tu menú</Text>

        <Text style={styles.seccion}>Categorías</Text>
        <View style={styles.filaCategorias}>
          {categorias.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.chip, categoriaSeleccionada === c.id && styles.chipActivo]} onPress={() => setCategoriaSeleccionada(c.id)} onLongPress={() => borrarCategoria(c)}>
              <Text style={[styles.chipTexto, categoriaSeleccionada === c.id && styles.chipTextoActivo]}>{c.icono} {c.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ayuda}>Mantén presionada una categoría para borrarla</Text>

        <Text style={styles.subseccion}>Agregar categoría — elige una sugerencia</Text>
        <View style={styles.filaCategorias}>
          {CATEGORIAS_SUGERIDAS.filter((s) => !categorias.some((c) => c.nombre.toLowerCase() === s.nombre.toLowerCase())).map((s) => (
            <TouchableOpacity key={s.nombre} style={styles.chipSugerida} onPress={() => crearCategoria(s.nombre, s.icono)}>
              <Text style={styles.chipTexto}>{s.icono} {s.nombre}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.chipSugerida} onPress={() => setMostrarCategoriaCustom(true)}>
            <Text style={styles.chipTexto}>✏️ Otra</Text>
          </TouchableOpacity>
        </View>

        {mostrarCategoriaCustom && (
          <>
            <View style={styles.filaInput}>
              <TextInput style={[styles.input, { flex: 1 }]} value={iconoCategoria} onChangeText={setIconoCategoria} placeholder="🍺" placeholderTextColor="#6a6a80" />
              <TextInput style={[styles.input, { flex: 3, marginLeft: 8 }]} value={nombreCategoria} onChangeText={setNombreCategoria} placeholder="Nombre de la categoría" placeholderTextColor="#6a6a80" />
            </View>
            <TouchableOpacity style={styles.botonSecundario} onPress={() => nombreCategoria.trim() && crearCategoria(nombreCategoria.trim(), iconoCategoria.trim() || '🍹')}>
              <Text style={styles.botonSecundarioTexto}>+ Crear esta categoría</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.seccion}>Agregar producto</Text>
        <Text style={styles.ayuda}>{categoriaSeleccionada ? `Se agregará a "${categoriaActivaNombre}"` : 'Primero elige o crea una categoría arriba'}</Text>

        {sugerencias.length > 0 && (
          <>
            <Text style={styles.subseccion}>Sugerencias para {categoriaActivaNombre}</Text>
            <View style={styles.filaCategorias}>
              {sugerencias.map((s) => (
                <TouchableOpacity key={s} style={styles.chipSugerida} onPress={() => setNombreProducto(s)}>
                  <Text style={styles.chipTexto}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TextInput style={styles.input} value={nombreProducto} onChangeText={setNombreProducto} placeholder="Nombre del producto (o toca una sugerencia arriba)" placeholderTextColor="#6a6a80" />
        <TextInput
          style={styles.input}
          value={formatearPrecio(precioProducto)}
          onChangeText={(txt) => setPrecioProducto(txt.replace(/[^0-9]/g, ''))}
          placeholder="$ Precio"
          keyboardType="numeric"
          placeholderTextColor="#6a6a80"
        />
        <TextInput style={styles.input} value={fotoProducto} onChangeText={setFotoProducto} placeholder="Link de una foto (opcional)" placeholderTextColor="#6a6a80" autoCapitalize="none" />
        <Text style={styles.ayuda}>Tip: busca la foto en Google Imágenes, ábrela, click derecho → "Copiar dirección de la imagen", y pégala aquí</Text>
        <TouchableOpacity style={styles.boton} onPress={agregarProducto}>
          <Text style={styles.botonTexto}>+ Agregar producto</Text>
        </TouchableOpacity>

        <Text style={styles.seccion}>Productos de esta categoría</Text>
        {productos.filter((p) => p.categoria_id === categoriaSeleccionada).map((p) => (
          <View key={p.id} style={styles.productoItem}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleDisponible(p)}>
              <Text style={[styles.productoNombre, !p.disponible && styles.productoOculto]}>{p.nombre} — {formatearPrecio(String(p.precio))}</Text>
              <Text style={styles.productoEstado}>{p.disponible ? 'Disponible (toca para ocultar)' : 'Oculto (toca para activar)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => borrarProducto(p)}><Text style={styles.borrarTexto}>🗑️</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 16 },
  seccion: { color: '#d4a338', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  subseccion: { color: '#a0a0b0', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8, textTransform: 'uppercase' },
  ayuda: { color: '#6a6a80', fontSize: 13, marginBottom: 10 },
  filaCategorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: '#1e1e2e', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#2a2a3a' },
  chipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
  chipSugerida: { backgroundColor: '#26263a', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#3a3a4a', borderStyle: 'dashed' },
  chipTexto: { color: '#f2f2f2' },
  chipTextoActivo: { color: '#14141f', fontWeight: '700' },
  filaInput: { flexDirection: 'row', marginBottom: 10 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10,
  },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  botonSecundario: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  botonSecundarioTexto: { color: '#f2f2f2', fontSize: 15 },
  productoItem: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  productoNombre: { color: '#f2f2f2', fontSize: 16, fontWeight: '600' },
  productoOculto: { color: '#6a6a80', textDecorationLine: 'line-through' },
  productoEstado: { color: '#6a6a80', fontSize: 13, marginTop: 4 },
  borrarTexto: { fontSize: 20, paddingLeft: 10 },
})
