import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FlashList } from '@shopify/flash-list'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  RefreshControl,
  Animated,
  Keyboard,
} from 'react-native'
import {
  Search,
  Pencil,
  Hourglass,
  Trash2,
  ArrowLeft,
  CircleX,
  Users,
} from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useToast } from '../../components/ToastProvider'
import { EasnerAlertSheet } from '../../components/premium'
import { useQueryClient } from '@tanstack/react-query'
import { NavigationProps, Recipient } from '../../types'
import { useRecipientsList } from '../../hooks/queries'
import { useScope } from '../../query/scope'
import { invalidateRecipientsFeed } from '../../query/refresh-user-feeds'
import { recipientService } from '../../lib/recipientService'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { useFixedFooterPadding, useScrollPaddingAboveFooter } from '../../hooks/useScrollBottomPadding'
import { useFocusEffect } from '@react-navigation/native'
import {
  colors,
  shadows,
  surfaceChromeCircleStyle,
  surfaceFrameStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
  searchFieldWrapperStyle,
  searchFieldInputStyle,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import {
  primeEasenetPublicProfileCache,
  warmEasenetPublicProfiles,
} from '../../lib/easenetProfile'
import { EasenetRecipientHydratedPreview } from '../../components/EasenetRecipientHydratedPreview'
import { RecipientPayoutPreview } from '../../components/RecipientPayoutPreview'
import { ListRowSkeleton } from '../../components/skeletons'
import EmptyState from '../../components/EmptyState'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { haptics } from '../../lib/haptics'
import { apiFetch } from '../../query/api-client'
import { useRecipientFormState } from '../../hooks/useRecipientFormState'
import { RecipientFormFlow } from '../../components/recipients/RecipientFormFlow'
import {
  buildEasenetPersistPayload,
  buildRecipientPersistPayload,
} from '../../lib/recipientForm'
import type { RecipientFormType } from '../../lib/recipientForm'

function RecipientsContent({ navigation, route }: NavigationProps) {
  const { user, userProfile } = useAuth()
  const { showSuccess, showError } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()
  const recipientsQuery = useRecipientsList()
  const queryRecipients = recipientsQuery.data ?? []
  const recipients = queryRecipients
  const recipientsLoading = recipientsQuery.isPending && recipients.length === 0
  const listBottomPadding = useScrollPaddingAboveFooter()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const payrollInvitationId =
    typeof route.params?.payrollInvitationId === 'string' ? route.params.payrollInvitationId : null
  const payrollConnectionId =
    typeof route.params?.payrollConnectionId === 'string' ? route.params.payrollConnectionId : null
  const payrollMode =
    route.params?.payrollMode === true && Boolean(payrollInvitationId || payrollConnectionId)
  const handleEditRecipientRef = useRef<(recipient: Recipient) => void>(() => {})
  const openedEditRecipientIdRef = useRef<string | null>(null)

  const scannedWalletAddress = (route.params as { scannedWalletAddress?: string } | undefined)
    ?.scannedWalletAddress

  const recipientForm = useRecipientFormState({
    hideEasenet: payrollMode,
    autoOpenAdd: payrollMode,
    scannedWalletAddress,
    onScannedWalletAddressConsumed: () => {
      navigation.setParams({ scannedWalletAddress: undefined } as never)
    },
  })

  const [uiRecipients, setUiRecipients] = useState<Recipient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<Recipient | null>(null)

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useFocusEffect(
    useCallback(() => {
      void recipientForm.refreshCatalog()
    }, [recipientForm.refreshCatalog]),
  )

  useFocusRefresh(
    () => {
      void recipientsQuery.refetch()
    },
    5 * 60 * 1000,
    false,
  )

  useEffect(() => {
    setUiRecipients(recipients)
  }, [recipients])

  useEffect(() => {
    const easenetRows = recipients.filter((r) => isEasenetRecipientRecord(r))
    if (easenetRows.length === 0) return
    void Promise.allSettled(
      easenetRows.map((row) =>
        primeEasenetPublicProfileCache(resolveRecipientEasetagForUi(row), {
          fullName: row.full_name,
          avatarUrl: row.payee_avatar_url,
          accountKind: row.payee_account_kind,
        }),
      ),
    )
    void warmEasenetPublicProfiles(easenetRows.map((row) => resolveRecipientEasetagForUi(row)))
  }, [recipients])

  const filteredRecipients = uiRecipients.filter((recipient) => {
    const q = searchTerm.toLowerCase()
    if (!q.trim()) return true
    const hay = [
      recipient.full_name,
      recipient.bank_name,
      recipient.payee_easetag ? `@${recipient.payee_easetag}` : '',
      recipient.account_number,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
    } finally {
      setRefreshing(false)
    }
  }

  const getInitials = (name: string) => {
    const names = name.trim().split(' ').filter((part) => part.length > 0)
    if (names.length === 0) return '??'
    if (names.length === 1) return names[0][0].toUpperCase()
    return names
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }

  const attachPayrollReceivingMethod = async (
    createdRecipient: Recipient,
    selectedType: RecipientFormType | null,
  ) => {
    if (!payrollMode || selectedType === 'easenet') return false
    const type =
      selectedType === 'wallet'
        ? 'stablecoin'
        : selectedType === 'mobile'
          ? 'mobile_money'
          : 'bank'
    const path = payrollInvitationId
      ? `/api/payroll/invitations/${payrollInvitationId}/methods`
      : `/api/payroll/connections/${payrollConnectionId}/methods`
    await apiFetch(path, {
      method: 'POST',
      body: {
        type,
        providerRecipientId: createdRecipient.id,
        ...(payrollConnectionId ? { preferred: true } : {}),
      },
    })
    recipientForm.resetForm()
    recipientForm.setShowBankAccountForm(false)
    recipientForm.setShowRecipientTypeModal(false)
    showSuccess('Receiving method added')
    navigation.navigate('PayrollApproval', {
      ...(payrollInvitationId ? { invitationId: payrollInvitationId } : {}),
      ...(payrollConnectionId ? { connectionId: payrollConnectionId } : {}),
      methodUpdatedAt: Date.now(),
    })
    return true
  }

  const handleSubmitRecipient = async () => {
    if (!userProfile?.id) {
      showError('User not authenticated')
      return
    }

    if (!recipientForm.isValid) {
      showError('Please fill in all required fields')
      return
    }

    const {
      editingRecipient,
      selectedRecipientType,
      easenetProfile,
      newRecipient,
      selectedCountryCurrency,
      transferType,
      validationContext,
    } = recipientForm

    try {
      recipientForm.setIsSubmitting(true)
      recipientForm.setError('')

      const payload =
        selectedRecipientType === 'easenet'
          ? (() => {
              if (!easenetProfile) {
                showError('Enter a valid Easetag and wait for the profile to load')
                return null
              }
              return buildEasenetPersistPayload(easenetProfile)
            })()
          : selectedRecipientType
            ? buildRecipientPersistPayload({
                values: newRecipient,
                selectedRecipientType,
                selectedCountryCurrency,
                transferType,
                validationContext,
              })
            : null

      if (!payload) {
        if (selectedRecipientType === 'easenet' && !easenetProfile) return
        showError('Please fill in all required fields')
        return
      }

      if (editingRecipient) {
        if (!user?.id) {
          recipientForm.setError('Not signed in')
          return
        }
        const updatedRecipient = await recipientService.update(editingRecipient.id, user.id, payload)
        setUiRecipients((prev) =>
          prev.map((r) => (r.id === updatedRecipient.id ? updatedRecipient : r)),
        )
        if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
        recipientForm.setError('')
        recipientForm.setShowBankAccountForm(false)
        recipientForm.resetForm()
        showSuccess('Recipient updated successfully')
        return
      }

      const createdRecipient = await recipientService.create(userProfile.id, payload)
      if (await attachPayrollReceivingMethod(createdRecipient, selectedRecipientType)) return
      setUiRecipients((prev) => [createdRecipient, ...prev.filter((r) => r.id !== createdRecipient.id)])
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      recipientForm.setError('')
      recipientForm.resetForm()
      recipientForm.setShowBankAccountForm(false)
      showSuccess('Recipient added successfully')
    } catch (error) {
      console.error('Error saving recipient:', error)
      recipientForm.setError(
        editingRecipient ? 'Failed to update recipient' : 'Failed to add recipient',
      )
      showError(editingRecipient ? 'Failed to update recipient' : 'Failed to add recipient')
    } finally {
      recipientForm.setIsSubmitting(false)
    }
  }

  const handleEditRecipient = (recipient: Recipient) => {
    recipientForm.openEdit(recipient)
  }
  handleEditRecipientRef.current = handleEditRecipient

  useEffect(() => {
    const id =
      typeof route.params?.editRecipientId === 'string' ? route.params.editRecipientId.trim() : ''
    if (!id) {
      openedEditRecipientIdRef.current = null
      return
    }
    if (openedEditRecipientIdRef.current === id) return
    const match =
      recipients.find((row) => row.id === id) ?? uiRecipients.find((row) => row.id === id)
    if (!match) return
    openedEditRecipientIdRef.current = id
    handleEditRecipientRef.current(match)
    navigation.setParams({ editRecipientId: undefined })
  }, [route.params?.editRecipientId, recipients, uiRecipients, navigation])

  const handleDeleteRecipient = (recipient: Recipient) => {
    setDeleteConfirmation(recipient)
  }

  const confirmDelete = async () => {
    if (!deleteConfirmation || !user?.id) return
    try {
      setDeletingId(deleteConfirmation.id)
      await recipientService.delete(deleteConfirmation.id, user.id)
      setUiRecipients((prev) => prev.filter((r) => r.id !== deleteConfirmation.id))
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      showSuccess('Recipient deleted successfully')
    } catch (error: unknown) {
      console.error('Error deleting recipient:', error)
      const message =
        error instanceof Error && error.message?.includes('linked to a transaction')
          ? 'Failed to delete - linked to a transaction'
          : 'Failed to delete recipient'
      showError(message)
    } finally {
      setDeletingId(null)
      setDeleteConfirmation(null)
    }
  }

  const handleOpenAdd = () => {
    haptics.tap()
    recipientForm.openAdd()
  }

  const handlePayrollDismiss = () => {
    navigation.goBack()
  }

  const renderRecipient = ({ item, index }: { item: Recipient; index: number }) => {
    const isEasenet = isEasenetRecipientRecord(item)
    const isLast = index === filteredRecipients.length - 1
    return (
      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.recipientItem, !isLast && styles.recipientItemDivider]}
        onPress={() => {
          haptics.tap()
          handleEditRecipient(item)
        }}
      >
        <View style={styles.recipientRow}>
          {isEasenet ? (
            <>
              <EasenetRecipientHydratedPreview recipient={item} variant="row" getInitials={getInitials} />
              <View style={styles.recipientActions}>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={styles.actionIcon}
                  onPress={() => {
                    haptics.tap()
                    handleEditRecipient(item)
                  }}
                  disabled={recipientForm.isSubmitting}
                >
                  <Pencil size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={[styles.actionIcon, styles.actionIconDelete]}
                  onPress={() => {
                    haptics.medium()
                    handleDeleteRecipient(item)
                  }}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <Hourglass size={18} color={colors.error.main} strokeWidth={2} />
                  ) : (
                    <Trash2 size={18} color={colors.error.main} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <RecipientPayoutPreview recipient={item} variant="row" getInitials={getInitials} />
              <View style={styles.recipientActions}>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={styles.actionIcon}
                  onPress={() => {
                    haptics.tap()
                    handleEditRecipient(item)
                  }}
                  disabled={recipientForm.isSubmitting}
                >
                  <Pencil size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={[styles.actionIcon, styles.actionIconDelete]}
                  onPress={() => {
                    haptics.medium()
                    handleDeleteRecipient(item)
                  }}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <Hourglass size={18} color={colors.error.main} strokeWidth={2} />
                  ) : (
                    <Trash2 size={18} color={colors.error.main} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Pressable>
    )
  }

  return (
    <ScreenWrapper>
      <KeyboardSafeContainer>
        <View style={styles.container}>
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [
                  {
                    translateY: headerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              android_ripple={ripple.neutral}
              onPress={() => {
                haptics.tap()
                navigation.goBack()
              }}
              style={styles.backButton}
            >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{payrollMode ? 'Receiving method' : 'Recipients'}</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.searchContainer,
              {
                opacity: contentAnim,
                transform: [
                  {
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.searchWrapper}>
              <Search size={18} color={colors.primary.main} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder={payrollMode ? 'Search receiving methods...' : 'Search recipients...'}
                placeholderTextColor={colors.text.secondary}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {searchTerm.length > 0 && (
                <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
                  <CircleX size={18} color={colors.primary.main} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.recipientsTray,
              styles.listTray,
              {
                opacity: contentAnim,
                transform: [
                  {
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {recipientsLoading ? (
              <View>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <ListRowSkeleton key={i} variant="recipient" showDivider={i < 5} />
                ))}
              </View>
            ) : (
              <FlashList
                data={filteredRecipients}
                renderItem={renderRecipient}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                estimatedItemSize={112}
                drawDistance={400}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.primary.main}
                  />
                }
                contentContainerStyle={{ paddingBottom: listBottomPadding }}
                ListEmptyComponent={
                  <EmptyState
                    icon={Users}
                    title={
                      searchTerm.trim()
                        ? 'No matches'
                        : payrollMode
                          ? 'No receiving methods found'
                          : 'No recipients found'
                    }
                    message={
                      searchTerm.trim()
                        ? 'Try another search'
                        : payrollMode
                          ? 'Add a method to receive payroll'
                          : 'Add a new recipient to get started'
                    }
                    action={
                      !searchTerm.trim()
                        ? {
                            label: payrollMode ? 'Add receiving method' : 'Add recipient',
                            onPress: handleOpenAdd,
                          }
                        : undefined
                    }
                  />
                }
              />
            )}
          </Animated.View>

          <View style={[styles.bottomButtonContainer, { paddingBottom: footerPadding }]}>
            <Pressable
              android_ripple={ripple.neutral}
              style={styles.addRecipientButton}
              onPress={handleOpenAdd}
            >
              <Text style={styles.addRecipientButtonText}>
                {payrollMode ? 'Add receiving method' : 'Add new recipient'}
              </Text>
            </Pressable>
          </View>
        </View>

        <RecipientFormFlow
          form={recipientForm}
          footerPadding={footerPadding}
          editing={Boolean(recipientForm.editingRecipient)}
          payrollMode={payrollMode}
          onPayrollDismiss={handlePayrollDismiss}
          onSubmit={() => void handleSubmitRecipient()}
        />

        <EasnerAlertSheet
          visible={deleteConfirmation !== null}
          onDismiss={() => {
            if (!deletingId) setDeleteConfirmation(null)
          }}
          title="Delete Recipient"
          message={`Are you sure you want to delete ${deleteConfirmation?.full_name ?? 'this recipient'}? This action cannot be undone.`}
          primaryLabel="Delete"
          onPrimary={() => void confirmDelete()}
          secondaryLabel="Cancel"
          onSecondary={() => {
            if (!deletingId) setDeleteConfirmation(null)
          }}
          primaryDestructive
          primaryLoading={Boolean(deletingId)}
        />
      </KeyboardSafeContainer>
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
  },
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    ...searchFieldWrapperStyle,
    gap: spacing[2],
  },
  searchInput: {
    ...searchFieldInputStyle,
    color: colors.text.primary,
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.frame.border,
    ...shadows.md,
  },
  addRecipientButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRecipientButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  recipientsTray: {
    ...surfaceFrameStyle(colors),
    marginHorizontal: spacing[5],
    overflow: 'hidden',
  },
  listTray: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  list: {
    flex: 1,
  },
  recipientItem: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    minHeight: 80,
    justifyContent: 'center',
  },
  recipientItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipientActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconDelete: {
    backgroundColor: colors.error.background,
  },
})

export default function RecipientsScreen(props: NavigationProps) {
  return <RecipientsContent {...props} />
}
