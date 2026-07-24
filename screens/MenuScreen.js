import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../lib/supabase'

const CATEGORIAS_SUGERIDAS = [
  { nombre: 'Cervezas', icono: '🍺' },
  { nombre: 'Tragos', icono: '🥃' },
  { nombre: 'Cócteles', icono: '🍸' },
  { nombre: 'Sin alcohol', icono: '💧' },
  { nombre: 'Comida', icono: '🍟' },
]

const PRODUCTOS_SUGERIDOS = {
  cerveza: ['Águila', 'Poker', 'Corona', 'Club Colombia', 'Costeña'],
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
  const [editandoCategoria, setEditandoCategoria] = useState(null)
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)
  const [nombreProducto, setNombreProducto] = useState('')
  const [precioProducto, setPrecioProducto] = useState('')
  const [fotoProducto, setFotoProducto] = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const cargar = useCallback(async () => {
    const { data: cats } = await supabase.from('categorias').select('id, nombre, icono').eq('bar_id', usuario.bar_id).order('orden')
    const { data: prods } = await supabase.from('productos').select('id, categoria_id, nombre, precio, disponible, foto_url').eq('bar_id', usuario.bar_id).order('orden')
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

  function abrirEdicionCategoria(cat) {
    setEditandoCategoria(cat.id)
    setNombreCategoria(cat.nombre)
    setIconoCategoria(cat.icono || '')
    setMostrarCategoriaCustom(true)
  }

  async function guardarEdicionCategoria() {
    if (!nombreCategoria.trim()) return
    const { error } = await supabase.from('categorias').update({ nombre: nombreCategoria.trim(), icono: iconoCategoria.trim() || '🍹' }).eq('id', editandoCategoria)
    if (error) { Alert.alert('Error', 'No se pudo guardar el cambio.'); return }
    setEditandoCategoria(null)
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

  async function elegirFoto(desdeCamara) {
    const permiso = desdeCamara
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) {
      Alert.alert('Falta permiso', desdeCamara ? 'Necesitamos permiso de la cámara.' : 'Necesitamos permiso para ver tus fotos.')
      return
    }
    const resultado = desdeCamara
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1] })

    if (resultado.canceled || !resultado.assets?.[0]) return
    const foto = resultado.assets[0]
    setSubiendoFoto(true)
    try {
      const nombreArchivo = `${usuario.bar_id}_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('productos').upload(nombreArchivo, decode(foto.base64), { contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('productos').getPublicUrl(nombreArchivo)
      setFotoProducto(data.publicUrl)
    } catch (e) {
      Alert.alert('Error', 'No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setSubiendoFoto(false)
    }
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
        {categorias.map((c) => (
          <View key={c.id} style={styles.categoriaFila}>
            <TouchableOpacity style={[styles.chip, categoriaSeleccionada === c.id && styles.chipActivo, { flex: 1 }]} onPress={() => setCategoriaSeleccionada(c.id)}>
              <Text style={[styles.chipTexto, categoriaSeleccionada === c.id && styles.chipTextoActivo]}>{c.icono} {c.nombre}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonIconoChico} onPress={() => abrirEdicionCategoria(c)}><Text style={styles.botonIconoChicoTexto}>✏️</Text></TouchableOpacity>
            <TouchableOpacity style={styles.botonIconoChico} onPress={() => borrarCategoria(c)}><Text style={styles.botonIconoChicoTexto}>🗑️</Text></TouchableOpacity>
          </View>
        ))}

        <Text style={styles.subseccion}>{editandoCategoria ? 'Editar categoría' : 'Agregar categoría — elige una sugerencia'}</Text>
        {!editandoCategoria && (
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
        )}

        {mostrarCategoriaCustom && (
          <>
            <View style={styles.filaInput}>
              <TextInput style={[styles.input, { flex: 1 }]} value={iconoCategoria} onChangeText={setIconoCategoria} placeholder="🍺" placeholderTextColor="#6a6a80" />
              <TextInput style={[styles.input, { flex: 3, marginLeft: 8 }]} value={nombreCategoria} onChangeText={setNombreCategoria} placeholder="Nombre de la categoría" placeholderTextColor="#6a6a80" />
            </View>
            <TouchableOpacity
              style={styles.botonSecundario}
              onPress={() => {
                if (editandoCategoria) { guardarEdicionCategoria() }
                else if (nombreCategoria.trim()) { crearCategoria(nombreCategoria.trim(), iconoCategoria.trim() || '🍹') }
              }}
            >
              <Text style={styles.botonSecundarioTexto}>{editandoCategoria ? '💾 Guardar cambios' : '+ Crear esta categoría'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMostrarCategoriaCustom(false); setEditandoCategoria(null); setNombreCategoria(''); setIconoCategoria('') }}>
              <Text style={styles.cancelarTexto}>Cancelar</Text>
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

        <Text style={styles.label}>Foto del producto (opcional)</Text>
        {fotoProducto ? (
          <View style={styles.previewFotoBox}>
            <Image source={{ uri: fotoProducto }} style={styles.previewFoto} />
            <TouchableOpacity onPress={() => setFotoProducto('')}><Text style={styles.quitarFotoTexto}>Quitar foto</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.filaFotoBotones}>
            <TouchableOpacity style={styles.botonFoto} onPress={() => elegirFoto(true)} disabled={subiendoFoto}>
              <Text style={styles.botonFotoTexto}>📷 Tomar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonFoto} onPress={() => elegirFoto(false)} disabled={subiendoFoto}>
              <Text style={styles.botonFotoTexto}>🖼️ Elegir de galería</Text>
            </TouchableOpacity>
          </View>
        )}
        {subiendoFoto && <ActivityIndicator color="#d4a338" style={{ marginVertical: 10 }} />}

        <TouchableOpacity style={styles.boton} onPress={agregarProducto}>
          <Text style={styles.botonTexto}>+ Agregar producto</Text>
        </TouchableOpacity>

        <Text style={styles.seccion}>Productos de esta categoría</Text>
        {productos.filter((p) => p.categoria_id === categoriaSeleccionada).map((p) => (
          <View key={p.id} style={styles.productoItem}>
            {p.foto_url && <Image source={{ uri: p.foto_url }} style={styles.productoFotoChica} />}
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
  label: { color: '#a0a0b0', fontSize: 14, marginBottom: 8, marginTop: 4 },
  categoriaFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  botonIconoChico: { backgroundColor: '#1e1e2e', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#2a2a3a' },
  botonIconoChicoTexto: { fontSize: 16 },
  filaCategorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: '#1e1e2e', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#2a2a3a' },
  chipActivo: { backgroundColor: '#d4a338', borderColor: '#d4a338' },
  chipSugerida: { backgroundColor: '#26263a', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#3a3a4a', borderStyle: 'dashed' },
  chipTexto: { color: '#f2f2f2' },
  chipTextoActivo: { color: '#14141f', fontWeight: '700' },
  filaInput: { flexDirection: 'row', marginBottom: 10 },
  cancelarTexto: { color: '#6a6a80', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  input: {
    backgroundColor: '#1e1e2e', color: '#f2f2f2', borderRadius: 14, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10,
  },
  filaFotoBotones: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  botonFoto: { flex: 1, backgroundColor: '#26263a', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#3a3a4a' },
  botonFotoTexto: { color: '#f2f2f2', fontSize: 14, fontWeight: '600' },
  previewFotoBox: { alignItems: 'center', marginBottom: 10 },
  previewFoto: { width: 100, height: 100, borderRadius: 14, marginBottom: 8 },
  quitarFotoTexto: { color: '#e05c5c', fontSize: 13 },
  boton: { backgroundColor: '#d4a338', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  botonTexto: { color: '#14141f', fontSize: 16, fontWeight: '700' },
  botonSecundario: { backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  botonSecundarioTexto: { color: '#f2f2f2', fontSize: 15 },
  productoItem: { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  productoFotoChica: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
  productoNombre: { color: '#f2f2f2', fontSize: 16, fontWeight: '600' },
  productoOculto: { color: '#6a6a80', textDecorationLine: 'line-through' },
  productoEstado: { color: '#6a6a80', fontSize: 13, marginTop: 4 },
  borrarTexto: { fontSize: 20, paddingLeft: 10 },
})
