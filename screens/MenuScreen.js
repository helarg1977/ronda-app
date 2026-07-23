import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { supabase } from '../lib/supabase'

export default function MenuScreen({ usuario, onVolver }) {
  const [categorias, setCategorias] = useState([])
  const [productos, setProductos] = useState([])
  const [nombreCategoria, setNombreCategoria] = useState('')
  const [iconoCategoria, setIconoCategoria] = useState('')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)
  const [nombreProducto, setNombreProducto] = useState('')
  const [precioProducto, setPrecioProducto] = useState('')
  const [fotoProducto, setFotoProducto] = useState('')

  const cargar = useCallback(async () => {
    const { data: cats } = await supabase
      .from('categorias')
      .select('id, nombre, icono')
      .eq('bar_id', usuario.bar_id)
      .order('orden')
    const { data: prods } = await supabase
      .from('productos')
      .select('id, categoria_id, nombre, precio, disponible')
      .eq('bar_id', usuario.bar_id)
      .order('orden')
    setCategorias(cats || [])
    setProductos(prods || [])
    if (cats && cats.length && !categoriaSeleccionada) setCategoriaSeleccionada(cats[0].id)
  }, [usuario.bar_id, categoriaSeleccionada])

  useEffect(() => { cargar() }, [cargar])

  async function agregarCategoria() {
    if (!nombreCategoria.trim()) return
    const { error } = await supabase
      .from('categorias')
      .insert({ bar_id: usuario.bar_id, nombre: nombreCategoria.trim(), icono: iconoCategoria.trim(), orden: categorias.length })
    if (error) { Alert.alert('Error', 'No se pudo crear la categoría.'); return }
    setNombreCategoria('')
    setIconoCategoria('')
    cargar()
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
    if (error) { Alert.alert('Error', 'No se pudo crear el producto.'); return }
    setNombreProducto('')
    setPrecioProducto('')
    setFotoProducto('')
    cargar()
  }

  async function toggleDisponible(producto) {
    await supabase.from('productos').update({ disponible: !producto.disponible }).eq('id', producto.id)
    cargar()
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingTop: 50 }}>
      <TouchableOpacity onPress={onVolver}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Tu menú</Text>

      <Text style={styles.seccion}>Categorías</Text>
      <View style={styles.filaCategorias}>
        {categorias.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, categoriaSeleccionada === c.id && styles.chipActivo]}
            onPress={() => setCategoriaSeleccionada(c.id)}
          >
            <Text style={[styles.chipTexto, categoriaSeleccionada === c.id && styles.chipTextoActivo]}>
              {c.icono} {c.nombre}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.filaInput}>
        <TextInput style={[styles.input, { flex: 1 }]} value={iconoCategoria} onChangeText={setIconoCategoria} placeholder="🍺" placeholderTextColor="#6a6a80" />
        <TextInput style={[styles.input, { flex: 3, marginLeft: 8 }]} value={nombreCategoria} onChangeText={setNombreCategoria} placeholder="Nombre de la categoría" placeholderTextColor="#6a6a80" />
      </View>
      <TouchableOpacity style={styles.botonSecundario} onPress={agregarCategoria}>
        <Text style={styles.botonSecundarioTexto}>+ Agregar categoría</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Agregar producto</Text>
      <Text style={styles.ayuda}>
        {categoriaSeleccionada ? 'Se agregará a la categoría seleccionada arriba' : 'Primero crea una categoría'}
      </Text>
      <TextInput style={styles.input} value={nombreProducto} onChangeText={setNombreProducto} placeholder="Nombre del producto" placeholderTextColor="#6a6a80" />
      <TextInput style={styles.input} value={precioProducto} onChangeText={setPrecioProducto} placeholder="Precio, ej: 12000" keyboardType="numeric" placeholderTextColor="#6a6a80" />
      <TextInput style={styles.input} value={fotoProducto} onChangeText={setFotoProducto} placeholder="Link de una foto (opcional)" placeholderTextColor="#6a6a80" autoCapitalize="none" />
      <Text style={styles.ayuda}>Tip: busca la foto en Google Imágenes, ábrela, click derecho → "Copiar dirección de la imagen", y pégala aquí</Text>
      <TouchableOpacity style={styles.boton} onPress={agregarProducto}>
        <Text style={styles.botonTexto}>+ Agregar producto</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Productos de esta categoría</Text>
      {productos.filter((p) => p.categoria_id === categoriaSeleccionada).map((p) => (
        <TouchableOpacity key={p.id} style={styles.productoItem} onPress={() => toggleDisponible(p)}>
          <Text style={[styles.productoNombre, !p.disponible && styles.productoOculto]}>{p.nombre}</Text>
          <Text style={styles.productoEstado}>{p.disponible ? 'Disponible' : 'Oculto (toca para activar)'}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#14141f' },
  volver: { color: '#a0a0b0', fontSize: 15, marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#f2f2f2', marginBottom: 16 },
  seccion: { color: '#d4a338', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  ayuda: { color: '#6a6a80', fontSize: 13, marginBottom: 10 },
  filaCategorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: '#1e1e2e', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#2a2a3a' },
  chipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
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
  productoItem: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8 },
  productoNombre: { color: '#f2f2f2', fontSize: 16, fontWeight: '600' },
  productoOculto: { color: '#6a6a80', textDecorationLine: 'line-through' },
  productoEstado: { color: '#6a6a80', fontSize: 13, marginTop: 4 },
})
