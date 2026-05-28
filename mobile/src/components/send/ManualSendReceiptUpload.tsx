import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { uploadManualSendReceipt } from '../../lib/manual-send-receipt-upload'
import { colors } from '../../theme'
import { haptics } from '../../lib/haptics'

type PickedFile = {
  uri: string
  name?: string | null
  mimeType?: string | null
  size?: number | null
}

type Props = {
  referenceCode: string
  onPathChange: (path: string | null) => void
  disabled?: boolean
}

export function ManualSendReceiptUpload({ referenceCode, onPathChange, disabled }: Props) {
  const [file, setFile] = useState<PickedFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePick = async () => {
    try {
      setError(null)
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      const picked: PickedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      }
      setFile(picked)
      setUploading(true)
      onPathChange(null)

      const uploaded = await uploadManualSendReceipt({
        referenceCode,
        uri: picked.uri,
        mimeType: picked.mimeType,
        name: picked.name,
      })
      setUploading(false)

      if ('error' in uploaded) {
        setError(uploaded.error)
        setFile(null)
        return
      }

      haptics.success()
      onPathChange(uploaded.path)
    } catch {
      setUploading(false)
      setError('Failed to upload receipt. Please try again.')
      setFile(null)
      onPathChange(null)
    }
  }

  const handleRemove = () => {
    setFile(null)
    setError(null)
    onPathChange(null)
    haptics.tap()
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Upload transfer receipt (optional)</Text>

      {file ? (
        <View style={styles.preview}>
          {file.mimeType?.startsWith('image/') ? (
            <Image source={{ uri: file.uri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewIcon}>
              <Ionicons name="document-text-outline" size={28} color={colors.text.secondary} />
            </View>
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewName} numberOfLines={1}>
              {file.name || 'Receipt'}
            </Text>
            {uploading && <ActivityIndicator size="small" color={colors.primary.main} />}
          </View>
          <TouchableOpacity
            onPress={handleRemove}
            disabled={disabled || uploading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => void handlePick()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary.main} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary.main} />
              <Text style={styles.uploadText}>Upload receipt</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: colors.text.primary },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: 12,
    paddingVertical: 14,
    borderStyle: 'dashed',
  },
  uploadText: { fontSize: 14, color: colors.primary.main, fontWeight: '500' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: 12,
    padding: 12,
  },
  previewImage: { width: 48, height: 48, borderRadius: 8 },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: { flex: 1 },
  previewName: { fontSize: 14, color: colors.text.primary },
  error: { marginTop: 8, fontSize: 13, color: colors.error.main },
})
