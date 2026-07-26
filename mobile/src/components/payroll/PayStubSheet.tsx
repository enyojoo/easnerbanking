import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { X } from 'lucide-react-native'
import { apiFetch } from '../../query/api-client'
import { Button, SectionCard } from '../ui'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'

type PayrollDocumentResponse = {
  document: {
    id: string
    filename: string
    downloadUrl: string
    metadata: {
      businessName?: string
      amount?: number
      currency?: string
      payPeriodStart?: string | null
      payPeriodEnd?: string | null
      payday?: string | null
      paidAt?: string
      timezone?: string
      rail?: string
      documentReference?: string
    }
  }
}

export function PayStubSheet({
  visible,
  documentId,
  onClose,
}: {
  visible: boolean
  documentId: string
  onClose: () => void
}) {
  const [document, setDocument] = useState<PayrollDocumentResponse['document'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible || !documentId) return
    setLoading(true)
    setError('')
    void apiFetch<PayrollDocumentResponse>(`/api/payroll/documents/${documentId}`)
      .then((response) => setDocument(response.document))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load pay stub'))
      .finally(() => setLoading(false))
  }, [documentId, visible])

  async function localPdf(downloadDisposition = false): Promise<string> {
    if (!document) throw new Error('Pay stub is not ready')
    const sourceUrl = downloadDisposition
      ? (await apiFetch<PayrollDocumentResponse>(`/api/payroll/documents/${document.id}`, {
          query: { download: 1 },
        })).document.downloadUrl
      : document.downloadUrl
    if (Platform.OS === 'web') return sourceUrl
    const directory = FileSystem.documentDirectory
    if (!directory) throw new Error('Files are unavailable on this device')
    const result = await FileSystem.downloadAsync(
      sourceUrl,
      `${directory}${document.filename}`,
    )
    return result.uri
  }

  async function download() {
    try {
      const uri = await localPdf(true)
      if (Platform.OS === 'web') {
        await Linking.openURL(uri)
      } else {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `Save ${document?.filename ?? 'pay-stub.pdf'}`,
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download PDF')
    }
  }

  async function share() {
    try {
      const uri = await localPdf()
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: 'Pay stub', url: uri })
        } else {
          await Linking.openURL(uri)
        }
      } else {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Share pay stub',
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share PDF')
    }
  }

  const meta = document?.metadata
  const paidAtDisplay = (() => {
    if (!meta?.paidAt) return null
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: meta.timezone || 'UTC',
      }).format(new Date(meta.paidAt))
    } catch {
      return new Date(meta.paidAt).toLocaleString()
    }
  })()
  const rows = [
    ['Employer', meta?.businessName],
    ['Pay period', meta?.payPeriodStart && meta?.payPeriodEnd ? `${meta.payPeriodStart} – ${meta.payPeriodEnd}` : null],
    ['Payday', meta?.payday],
    ['Paid on', paidAtDisplay],
    ['Timezone', meta?.timezone],
    ['Method', meta?.rail],
    ['Reference', meta?.documentReference],
  ].filter((row): row is [string, string] => Boolean(row[1]))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Pay stub</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close pay stub">
              <X size={22} color={colors.text.primary} />
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={colors.primary.main} style={styles.loader} /> : null}
          {document ? (
            <>
              <Text style={styles.amount}>
                {meta?.amount != null ? `${meta.currency ?? ''} ${Number(meta.amount).toFixed(2)}` : ''}
              </Text>
              <SectionCard style={styles.card}>
                {rows.map(([label, value]) => (
                  <View key={label} style={styles.row}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.value}>{value}</Text>
                  </View>
                ))}
              </SectionCard>
              <Button title="Download PDF" onPress={() => void download()} fullWidth />
              <Button title="Share PDF" onPress={() => void share()} variant="outline" fullWidth />
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.background.primary, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing[5], gap: spacing[3], maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...textStyles.headingSmall, color: colors.text.primary, fontFamily: fontFamily.semibold },
  amount: { ...textStyles.headingMedium, color: colors.text.primary, fontFamily: fontFamily.semibold },
  card: { padding: spacing[4], gap: spacing[3] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[4] },
  label: { ...textStyles.bodySmall, color: colors.text.secondary },
  value: { ...textStyles.bodySmall, color: colors.text.primary, textAlign: 'right', flex: 1 },
  loader: { padding: spacing[8] },
  error: { ...textStyles.bodySmall, color: colors.error.main },
})
