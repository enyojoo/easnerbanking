import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  Pressable, Platform,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { ripple } from '../../lib/androidRipple'
import { NavigationProps } from '../../types'
import { useAuth } from '../../contexts/AuthContext'
import { apiGet } from '../../lib/apiClient'
import { useThemeColors, fontFamily } from '../../theme'
import type { Colors } from '../../theme'
import { CircleCheck, Clock } from 'lucide-react-native'
import { PlainTwoColumnRowSkeleton } from '../../components/skeletons'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import { formatMoneyDisplay } from '@easner/shared'

interface ReceiveTransaction {
  id: string
  transaction_id: string
  receipt_destination_tx_hash?: string // Blockchain transaction hash (Bridge)
  crypto_amount: number
  crypto_currency: string
  fiat_amount: number
  fiat_currency: string
  exchange_rate: number
  status: string
  created_at: string
  confirmed_at?: string
  converted_at?: string
  deposited_at?: string
  crypto_wallet: {
    wallet_address: string
    crypto_currency: string
    recipient: {
      full_name: string
      account_number: string
      bank_name: string
    }
  }
}

function createReceiveTransactionDetailsStyles(palette: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.semantic.muted,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    header: {
      backgroundColor: palette.background.primary,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border.default,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: palette.text.primary,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '600',
    },
    section: {
      backgroundColor: palette.background.primary,
      marginTop: 12,
      padding: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.text.primary,
      marginBottom: 16,
    },
    infoRow: {
      marginBottom: 16,
    },
    infoLabel: {
      fontSize: 12,
      color: palette.brand.slate,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 14,
      color: palette.text.primary,
      fontFamily: fontFamily.mono,
    },
    infoSubtext: {
      fontSize: 12,
      color: palette.brand.slate,
      marginTop: 2,
    },
    amountCard: {
      backgroundColor: palette.semantic.muted,
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
    },
    fiatCard: {
      backgroundColor: palette.success.background,
    },
    amountLabel: {
      fontSize: 12,
      color: palette.brand.slate,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    amountValue: {
      fontSize: 18,
      fontWeight: '600',
      color: palette.text.primary,
    },
    fiatAmount: {
      fontSize: 24,
      fontWeight: 'bold',
      color: palette.success.main,
    },
    timelineItem: {
      flexDirection: 'row',
      marginBottom: 24,
      position: 'relative',
    },
    timelineIcon: {
      marginRight: 16,
    },
    timelineContent: {
      flex: 1,
    },
    timelineTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.text.primary,
      marginBottom: 4,
    },
    timelineTitleInactive: {
      color: palette.text.tertiary,
    },
    timelineTime: {
      fontSize: 12,
      color: palette.brand.slate,
    },
    timelineLine: {
      position: 'absolute',
      left: 11,
      top: 24,
      width: 2,
      height: 24,
      backgroundColor: palette.border.default,
    },
    timelineLineActive: {
      backgroundColor: palette.success.main,
    },
    errorText: {
      fontSize: 16,
      color: palette.error.main,
      marginBottom: 16,
    },
    backButton: {
      backgroundColor: palette.primary.main,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    backButtonText: {
      color: palette.neutral.white,
      fontSize: 16,
      fontWeight: '600',
    },
    bottomActions: {
      flexDirection: 'row',
      padding: 20,
      gap: 12,
      backgroundColor: palette.background.primary,
      marginTop: 12,
    },
    bottomButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    secondaryButton: {
      backgroundColor: palette.semantic.muted,
    },
    secondaryButtonText: {
      color: palette.text.secondary,
      fontSize: 16,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: palette.primary.main,
    },
    primaryButtonText: {
      color: palette.neutral.white,
      fontSize: 16,
      fontWeight: '600',
    },
  })
}

function ReceiveTransactionDetailsContent({ navigation, route }: NavigationProps) {
  const palette = useThemeColors()
  const styles = useMemo(() => createReceiveTransactionDetailsStyles(palette), [palette])
  const { userProfile } = useAuth()
  const transactionId = route?.params?.transactionId as string
  const initialTransaction = (route?.params as any)?.initialTransaction as ReceiveTransaction | null | undefined
  const [transaction, setTransaction] = useState<ReceiveTransaction | null>(initialTransaction ?? null)
  const [loading, setLoading] = useState(initialTransaction ? false : true)
  const showLoadingSpinner = useDeferredLoading(loading)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (transactionId) {
      loadTransaction()
    }
  }, [transactionId])

  useEffect(() => {
    setTransaction(initialTransaction ?? null)
    setLoading(initialTransaction ? false : true)
    setError(null)
  }, [transactionId, initialTransaction])

  const loadTransaction = async () => {
    try {
      setLoading(!transaction)
      setError(null)
      const response = await apiGet(`/api/crypto/receive/${transactionId}`)
      if (response.ok) {
        const data = await response.json()
        if (data?.transaction) {
          setTransaction(data.transaction)
        } else {
          setError('Transaction not found')
        }
      } else {
        setError('Transaction not found')
      }
    } catch (error) {
      console.error('Error loading transaction:', error)
      setError('Failed to load transaction')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = useCallback(
    (status: string) => {
      switch (status) {
        case 'deposited':
          return palette.success.main
        case 'converted':
        case 'converting':
          return palette.warning.main
        case 'confirmed':
          return palette.success.main
        case 'pending':
          return palette.brand.slate
        case 'failed':
          return palette.error.main
        default:
          return palette.brand.slate
      }
    },
    [palette],
  )

  const getStages = () => {
    if (!transaction) return []

    return [
      {
        id: 'pending',
        title: 'Waiting for Deposit',
        completed: true,
        timestamp: transaction.created_at,
      },
      {
        id: 'confirmed',
        title: 'Confirmed',
        completed: transaction.status !== 'pending',
        timestamp: transaction.confirmed_at,
      },
      {
        id: 'converting',
        title: 'Converting',
        completed: ['converting', 'converted', 'deposited'].includes(transaction.status),
        timestamp: transaction.converted_at,
      },
      {
        id: 'deposited',
        title: 'Deposited',
        completed: transaction.status === 'deposited',
        timestamp: transaction.deposited_at,
      },
    ]
  }

  if (showLoadingSpinner) {
    return (
      <ScreenWrapper>
        <View style={[styles.centerContainer, { paddingHorizontal: 20, width: '100%' }]}>
          <PlainTwoColumnRowSkeleton variant="plain" showDivider={false} />
          <PlainTwoColumnRowSkeleton variant="plain" showDivider={false} />
          <PlainTwoColumnRowSkeleton variant="plain" showDivider={false} />
        </View>
      </ScreenWrapper>
    )
  }

  if (!transaction && error) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable android_ripple={ripple.neutral} style={styles.backButton} onPress={loadTransaction}>
            <Text style={styles.backButtonText}>Try again</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  if (!transaction) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Transaction unavailable</Text>
          <Pressable android_ripple={ripple.neutral} style={styles.backButton} onPress={loadTransaction}>
            <Text style={styles.backButtonText}>Try again</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  const stages = getStages()
  const statusColor = getStatusColor(transaction.status)

  return (
    <ScreenWrapper>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {transaction.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Transaction ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {transaction.transaction_id}
            </Text>
          </View>
          {transaction.receipt_destination_tx_hash && (
          <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Blockchain Hash</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
                {transaction.receipt_destination_tx_hash.slice(0, 20)}...
            </Text>
          </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amounts</Text>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Stablecoin Received</Text>
            <Text style={styles.amountValue}>
              {transaction.crypto_amount} {transaction.crypto_currency}
            </Text>
          </View>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Exchange Rate</Text>
            <Text style={styles.amountValue}>
              1 {transaction.crypto_currency} = {transaction.exchange_rate.toFixed(4)}{' '}
              {transaction.fiat_currency}
            </Text>
          </View>
          <View style={[styles.amountCard, styles.fiatCard]}>
            <Text style={styles.amountLabel}>Fiat Amount</Text>
            <Text style={styles.fiatAmount}>
              {formatMoneyDisplay(transaction.fiat_amount, transaction.fiat_currency)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status Timeline</Text>
          {stages.map((stage, index) => (
            <View key={stage.id} style={styles.timelineItem}>
              <View style={styles.timelineIcon}>
                {stage.completed ? (
                  <CircleCheck size={24} color={palette.success.main} strokeWidth={2} />
                ) : (
                  <Clock size={24} color={palette.text.tertiary} strokeWidth={2} />
                )}
              </View>
              <View style={styles.timelineContent}>
                <Text
                  style={[styles.timelineTitle, !stage.completed && styles.timelineTitleInactive]}
                >
                  {stage.title}
                </Text>
                {stage.timestamp && (
                  <Text style={styles.timelineTime}>
                    {new Date(stage.timestamp).toLocaleString()}
                  </Text>
                )}
              </View>
              {index < stages.length - 1 && (
                <View
                  style={[
                    styles.timelineLine,
                    stage.completed && styles.timelineLineActive,
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet & Recipient</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Wallet Address</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {transaction.crypto_wallet?.wallet_address}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Deposit Account</Text>
            <Text style={styles.infoValue}>{transaction.crypto_wallet?.recipient?.full_name}</Text>
            <Text style={styles.infoSubtext}>
              {transaction.crypto_wallet?.recipient?.account_number}
            </Text>
            <Text style={styles.infoSubtext}>
              {transaction.crypto_wallet?.recipient?.bank_name}
            </Text>
          </View>
        </View>

        {/* Bottom Action Buttons */}
        <View style={styles.bottomActions}>
          <Pressable 
           android_ripple={ripple.neutral} 
            style={[styles.bottomButton, styles.secondaryButton]} 
            onPress={() => navigation.navigate('MainTabs', { screen: 'Dashboard' })}
          >
            <Text style={styles.secondaryButtonText}>Dashboard</Text>
          </Pressable>
          <Pressable 
           android_ripple={ripple.neutral} 
            style={[styles.bottomButton, styles.primaryButton]} 
            onPress={() => navigation.navigate('ReceiveMoney')}
          >
            <Text style={styles.primaryButtonText}>Receive More</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenWrapper>
  )
}

export default function ReceiveTransactionDetailsScreen({ navigation, route }: NavigationProps) {
  return <ReceiveTransactionDetailsContent navigation={navigation} route={route} />
}

