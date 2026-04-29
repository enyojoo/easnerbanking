import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable, Platform,
  Animated,
  Image,
  ActivityIndicator,
} from 'react-native'
import {
  ArrowLeft,
  Check,
  CircleX,
  CloudUpload,
  Copy,
  FileText,
} from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import * as DocumentPicker from 'expo-document-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'

interface MockRecipient {
  id: string
  full_name: string
  account_number: string
  currency: string
  bank_name: string
}

export default function VirtualBankAccountScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { showError } = useToast()
  const copyToClipboard = useCopyToClipboard()
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const { transactionId, sendAmount, receiveAmount, sendCurrency, receiveCurrency, recipient, paymentMethod } = route.params || {}
  
  // Get currency-specific bank details
  const getBankDetails = () => {
    const baseDetails = {
      accountName: 'Easner Payments',
      accountNumber: '',
      routingNumber: undefined as string | undefined,
      iban: undefined as string | undefined,
      swiftBic: undefined as string | undefined,
      bankName: '',
      reference: transactionId,
    }

    switch (sendCurrency) {
      case 'USD':
        return {
          ...baseDetails,
          accountNumber: '1234567890',
          routingNumber: '123456789',
          swiftBic: 'BRIDGEUS33',
          bankName: 'Bridge Bank',
        }
      case 'EUR':
        return {
          ...baseDetails,
          accountNumber: '9876543210',
          iban: 'GB82WEST12345698765432',
          swiftBic: 'BRIDGEGB33',
          bankName: 'Bridge Bank Europe',
        }
      case 'KES':
        return {
          ...baseDetails,
          accountNumber: 'KES123456789',
          bankName: 'Kenya Commercial Bank',
        }
      case 'GHS':
        return {
          ...baseDetails,
          accountNumber: 'GHS987654321',
          bankName: 'Ghana Commercial Bank',
        }
      case 'RUB':
        return {
          ...baseDetails,
          accountNumber: 'RUB456789123',
          bankName: 'Sberbank',
        }
      case 'NGN':
        return {
          ...baseDetails,
          accountNumber: 'NGN789123456',
          bankName: 'Access Bank',
        }
      default:
        return {
          ...baseDetails,
          accountNumber: '1234567890',
          bankName: 'Bridge Bank',
        }
    }
  }

  const virtualAccountDetails = getBankDetails()

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  // Auto-confirm simulation (would be replaced with actual payment detection)
  useEffect(() => {
    // Simulate auto-confirmation after 5 seconds (for demo)
    // In production, this would be triggered by webhook/polling
    const timer = setTimeout(() => {
      // Auto-confirm would happen here if payment is detected
      // For now, we'll let user manually confirm
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  const formatCurrency = (amount: number, currency: string): string => {
    const symbol = currency === 'USD' ? '$' 
      : currency === 'EUR' ? '€' 
      : currency === 'NGN' ? '₦' 
      : currency === 'KES' ? 'KSh' 
      : currency === 'GHS' ? '₵' 
      : currency === 'RUB' ? '₽' 
      : currency === 'GBP' ? '£' 
      : ''
    return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopiedStates((prev) => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }

  const handleUploadReceipt = async () => {
    try {
      setIsUploading(true)
      setUploadError(null)
      
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets[0]) {
        setUploadedFile(result.assets[0])
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
    } catch (error) {
      setUploadError('Failed to upload receipt. Please try again.')
      showError('Failed to upload receipt. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveReceipt = () => {
    setUploadedFile(null)
    setUploadError(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleConfirmPayment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setPaymentConfirmed(true)
    
    // TODO: Upload receipt file if provided
    // if (uploadedFile) {
    //   // Upload receipt to backend
    // }
    
    // Navigate to transaction tracking
    setTimeout(() => {
      navigation.navigate('SendTransactionDetails' as never, {
        transactionId: transactionId,
        sendAmount,
        sendCurrency,
        receiveCurrency,
        recipient: recipient as MockRecipient,
        paymentMethod: 'virtualBank',
        receiptFile: uploadedFile,
      } as never)
    }, 500)
  }

  const renderCopyableField = (label: string, value: string, key: string) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
       android_ripple={ripple.neutral}
        style={styles.fieldValueContainer}
        onPress={() => handleCopy(value, key)} >
        <Text style={styles.fieldValue}>{value}</Text>
        <View style={styles.copyButton}>
          {copiedStates[key] ? (
            <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
          ) : (
            <Copy size={18} color={colors.text.secondary} strokeWidth={2} />
          )}
        </View>
      </Pressable>
    </View>
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [{
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-motion.screenEnterTranslateY, 0],
                })
              }]
            }
          ]}
        >
          <Pressable
           android_ripple={ripple.neutral}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Bank Transfer</Text>
          </View>
        </Animated.View>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          <Animated.View 
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            {/* Payment Summary */}
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Send to Recipient</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>You Send:</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(sendAmount || 0, sendCurrency || 'USD')}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Recipient Gets:</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(receiveAmount || sendAmount || 0, receiveCurrency || 'EUR')}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Recipient:</Text>
                <Text style={styles.summaryValue}>
                  {(recipient as MockRecipient)?.full_name || 'N/A'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payment Method:</Text>
                <Text style={styles.summaryValue}>
                  {paymentMethod === 'bankTransfer' ? 'Bank Transfer' : 'Virtual Bank Account'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Transaction ID:</Text>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.summaryValueRow}
                  onPress={() => handleCopy(transactionId || '', 'transactionId')} >
                  <Text style={styles.summaryValue}>{transactionId || 'N/A'}</Text>
                  {copiedStates.transactionId ? (
                    <Check size={16} color={colors.success.main} strokeWidth={2.5} style={{ marginLeft: 8 }} />
                  ) : (
                    <Copy size={16} color={colors.text.secondary} strokeWidth={2} style={{ marginLeft: 8 }} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Virtual Account Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>One-time Bank Account Details</Text>
              
              {renderCopyableField('Account Name', virtualAccountDetails.accountName, 'accountName')}
              {renderCopyableField('Account Number', virtualAccountDetails.accountNumber, 'accountNumber')}
              
              {virtualAccountDetails.routingNumber && (
                renderCopyableField('Routing Number', virtualAccountDetails.routingNumber, 'routingNumber')
              )}
              
              {virtualAccountDetails.iban && (
                renderCopyableField('IBAN', virtualAccountDetails.iban, 'iban')
              )}
              
              {virtualAccountDetails.swiftBic && (
                renderCopyableField('SWIFT/BIC', virtualAccountDetails.swiftBic, 'swiftBic')
              )}
              
              {renderCopyableField('Bank Name', virtualAccountDetails.bankName, 'bankName')}
            </View>

            {/* Instructions */}
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsTitle}>Payment Instructions</Text>
              <Text style={styles.instructionsText}>
                1. Transfer {formatCurrency(sendAmount || 0, sendCurrency || 'USD')} to the account details above{'\n'}
                2. Use the transaction ID above as transfer reference.{'\n'}
                3. Recipient will receive {formatCurrency(receiveAmount || sendAmount || 0, receiveCurrency || 'EUR')}{'\n'}
                4. Payment will be automatically confirmed once received{'\n'}
                5. Upload your transfer receipt (optional){'\n'}
                6. Click "I've paid" after completing the transfer
              </Text>
            </View>

            {/* Receipt Upload Section */}
            <View style={styles.receiptSection}>
              <Text style={styles.receiptSectionTitle}>Upload Transfer Receipt (Optional)</Text>
              
              {uploadedFile ? (
                <View style={styles.receiptPreviewContainer}>
                  <View style={styles.receiptPreview}>
                    {uploadedFile.mimeType?.startsWith('image/') ? (
                      <Image 
                        source={{ uri: uploadedFile.uri }} 
                        style={styles.receiptPreviewImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.receiptPreviewIcon}>
                        <FileText size={32} color={colors.primary.main} strokeWidth={2} />
                      </View>
                    )}
                    <View style={styles.receiptPreviewInfo}>
                      <Text style={styles.receiptPreviewName} numberOfLines={1}>
                        {uploadedFile.name || 'Receipt'}
                      </Text>
                      {uploadedFile.size && (
                        <Text style={styles.receiptPreviewSize}>
                          {(uploadedFile.size / 1024).toFixed(2)} KB
                        </Text>
                      )}
                    </View>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.receiptRemoveButton}
                      onPress={handleRemoveReceipt} >
                      <CircleX size={24} color={colors.error.main} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.receiptUploadButton}
                  onPress={handleUploadReceipt}
                  disabled={isUploading} >
                  {isUploading ? (
                    <ActivityIndicator size="small" color={colors.primary.main} />
                  ) : (
                    <>
                      <CloudUpload size={24} color={colors.primary.main} strokeWidth={2} />
                      <Text style={styles.receiptUploadButtonText}>Upload Receipt</Text>
                    </>
                  )}
                </Pressable>
              )}
              
              {uploadError && (
                <Text style={styles.receiptError}>{uploadError}</Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Action Button */}
        <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.confirmButton}
            onPress={handleConfirmPayment} disabled={paymentConfirmed}
          >
            <LinearGradient
              colors={paymentConfirmed 
                ? [colors.neutral[400], colors.neutral[400]] 
                : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirmButtonGradient}
            >
              <Text style={styles.confirmButtonText}>
                {paymentConfirmed ? 'Processing...' : "I've paid"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    marginBottom: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  summaryContainer: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    padding: spacing[4],
    marginBottom: spacing[5],
  },
  summaryTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  summaryLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  summaryValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
  },
  fieldContainer: {
    marginBottom: spacing[3],
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing[0.5],
  },
  fieldValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  fieldValue: {
    flex: 1,
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
  },
  instructionsContainer: {
    backgroundColor: colors.primary.main + '10',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[5],
    borderWidth: 0.5,
    borderColor: colors.primary.main + '30',
  },
  instructionsTitle: {
    ...textStyles.titleMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
  },
  instructionsText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
    lineHeight: 22,
  },
  bottomContainer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    backgroundColor: colors.background.primary,
  },
  confirmButton: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    ...textStyles.titleLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  receiptSection: {
    marginBottom: spacing[5],
  },
  receiptSectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[3],
  },
  receiptUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderWidth: 1.5,
    borderColor: colors.primary.main,
    borderStyle: 'dashed',
    gap: spacing[2],
  },
  receiptUploadButtonText: {
    ...textStyles.bodyLarge,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  receiptPreviewContainer: {
    marginTop: spacing[2],
  },
  receiptPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    padding: spacing[3],
    gap: spacing[3],
  },
  receiptPreviewImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
  },
  receiptPreviewIcon: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary.main + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptPreviewInfo: {
    flex: 1,
  },
  receiptPreviewName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    marginBottom: spacing[0.5],
  },
  receiptPreviewSize: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  receiptRemoveButton: {
    padding: spacing[1],
  },
  receiptError: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    fontFamily: fontFamily.regular,
    marginTop: spacing[2],
  },
})
