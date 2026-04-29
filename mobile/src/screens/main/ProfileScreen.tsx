import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  Keyboard,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { ChevronDown, CircleCheck, CircleX, Mail, Pencil, X } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { ripple } from '../../lib/androidRipple'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { useCurrenciesCatalog, useExchangeRatesList, useTransactionsList, mapLedgerRowToTransaction } from '../../hooks/queries'
import {
  userService,
  UserProfileData,
  UserStats,
  personalFromUpdateProfileResult,
  fetchPersonalSettings,
} from '../../lib/userService'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { analytics } from '../../lib/analytics'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import { userAvatarStyles } from '../../theme'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { avatarImageSource, normalizeAvatarUrl, warmAvatarCache } from '../../lib/avatarCache'
import { useThemeColors, fontFamily } from '../../theme'
import type { Colors } from '../../theme'
import { EasnerAlertSheet } from '../../components/premium'

function createProfileStyles(palette: Colors) {
  return StyleSheet.create({
    scrollContainer: {
      flex: 1,
      backgroundColor: palette.semantic.muted,
    },
    header: {
      padding: 24,
      backgroundColor: palette.background.primary,
    },
    headerTopRow: {
      flexDirection: 'row',
      marginBottom: 12,
    },
    headerAvatar: {
      ...userAvatarStyles.circle,
    },
    pageTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: palette.text.primary,
      marginBottom: 4,
    },
    pageSubtitle: {
      fontSize: 16,
      color: palette.brand.slate,
    },
    contentContainer: {
      padding: 24,
      gap: 24,
    },
    section: {
      backgroundColor: palette.background.primary,
      borderRadius: 8,
      padding: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: palette.text.primary,
    },
    editButtonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 20,
      backgroundColor: palette.primary.main,
      shadowColor: palette.neutral.black,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    editButton: {
      fontSize: 14,
      color: palette.neutral.white,
      fontWeight: '600',
      fontFamily: fontFamily.semibold,
    },
    editActions: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'flex-end',
    },
    cancelButton: {
      fontSize: 14,
      color: palette.brand.slate,
      fontWeight: '500',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: palette.semantic.muted,
      borderWidth: 1,
      borderColor: palette.border.default,
      textAlign: 'center',
    },
    saveButton: {
      fontSize: 14,
      color: palette.neutral.white,
      fontWeight: '600',
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: palette.primary.main,
      borderRadius: 8,
      textAlign: 'center',
    },
    disabledButton: {
      color: palette.text.tertiary,
      backgroundColor: palette.semantic.muted,
    },
    profileContent: {
      gap: 8,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: 16,
    },
    fieldContainer: {
      marginBottom: 3,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '400',
      color: palette.brand.slate,
      marginBottom: 0,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldLabelEdit: {
      fontSize: 12,
      fontWeight: '400',
      color: palette.brand.slate,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldInput: {
      borderWidth: 1,
      borderColor: palette.border.default,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 48,
      fontSize: 16,
      backgroundColor: palette.background.primary,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
        ios: { paddingVertical: 12 },
      }),
    },
    fieldValue: {
      fontSize: 16,
      color: palette.text.primary,
      paddingVertical: 8,
      fontWeight: '500',
    },
    currencySelector: {
      borderWidth: 1,
      borderColor: palette.border.default,
      borderRadius: 6,
      padding: 12,
      backgroundColor: palette.background.primary,
    },
    currencySelectorContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    currencyFlag: {
      fontSize: 16,
    },
    currencySelectorText: {
      flex: 1,
      fontSize: 16,
      color: palette.text.primary,
    },
    currencyDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    currencyText: {
      fontSize: 16,
      color: palette.text.primary,
      fontWeight: '600',
    },
    currencyDescription: {
      fontSize: 12,
      color: palette.brand.slate,
      marginTop: 2,
    },
    easetagLabelContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 4,
      gap: 8,
    },
    easetagStatusSlot: {
      width: 132,
      minHeight: 36,
      alignItems: 'flex-end',
    },
    easetagStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      maxWidth: '100%',
    },
    easetagStatusTextInline: {
      fontSize: 11,
      fontWeight: '500',
    },
    easetagInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border.default,
      borderRadius: 6,
      backgroundColor: palette.background.primary,
      overflow: 'hidden',
    },
    easetagPrefix: {
      fontSize: 16,
      color: palette.brand.slate,
      paddingLeft: 12,
      paddingRight: 4,
      fontWeight: '500',
    },
    easetagInput: {
      flex: 1,
      paddingVertical: 12,
      paddingRight: 12,
      minHeight: 48,
      fontSize: 16,
      color: palette.text.primary,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
        ios: { paddingVertical: 12 },
      }),
    },
    easetagSpinnerSlot: {
      width: 36,
      justifyContent: 'center',
      alignItems: 'center',
      paddingRight: 12,
    },
    easetagAvailableText: {
      color: palette.success.main,
    },
    easetagUnavailableText: {
      color: palette.error.main,
    },
    fieldDescription: {
      fontSize: 12,
      color: palette.brand.slate,
      marginTop: 2,
    },
    statusContent: {
      gap: 12,
    },
    statusItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 2,
    },
    statusLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusLabel: {
      fontSize: 14,
      color: palette.text.secondary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    verifiedBadge: {
      backgroundColor: palette.success.background,
    },
    pendingBadge: {
      backgroundColor: palette.warning.background,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '500',
    },
    verifiedText: {
      color: palette.success.dark,
    },
    pendingText: {
      color: palette.warning.dark,
    },
    statusDivider: {
      height: 1,
      backgroundColor: palette.border.default,
    },
    statusStats: {
      gap: 12,
    },
    statusStatItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statusStatLabel: {
      fontSize: 14,
      color: palette.brand.slate,
    },
    statusStatValue: {
      fontSize: 14,
      color: palette.text.primary,
      fontWeight: '500',
    },
    menuButton: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border.default,
    },
    menuButtonText: {
      fontSize: 16,
      color: palette.text.primary,
    },
    destructiveText: {
      color: palette.error.main,
    },
    menuButtonArrow: {
      fontSize: 20,
      color: palette.text.tertiary,
    },
    versionContainer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    versionText: {
      fontSize: 14,
      color: palette.text.tertiary,
    },
    currencyModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    currencyModalContent: {
      backgroundColor: palette.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
    },
    currencyModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: palette.border.default,
    },
    currencyModalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: palette.text.primary,
    },
    currencyCloseButton: {
      padding: 4,
    },
    currencyItem: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border.default,
    },
    currencyInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    currencyDetails: {
      flex: 1,
    },
    currencyCode: {
      fontSize: 16,
      fontWeight: '500',
      color: palette.text.primary,
    },
    currencyName: {
      fontSize: 14,
      color: palette.brand.slate,
      marginTop: 2,
    },
    currencySymbol: {
      fontSize: 16,
      color: palette.brand.slate,
    },
    disabledHint: {
      fontSize: 12,
      color: palette.brand.slate,
      fontStyle: 'italic',
    },
    fieldValueDisabled: {
      color: palette.text.tertiary,
    },
  })
}

function ProfileContent({ navigation }: NavigationProps) {
  const palette = useThemeColors()
  const styles = useMemo(() => createProfileStyles(palette), [palette])
  const { user, userProfile, signOut, refreshUserProfile, applyPersonalSettingsFromServer } = useAuth()
  const txQuery = useTransactionsList({}, 20)
  const { data: currencies = [] } = useCurrenciesCatalog()
  const { data: exchangeRates = [] } = useExchangeRatesList()
  const transactions = useMemo(() => {
    if (!user?.id) return []
    const rows = txQuery.data?.pages?.[0]?.transactions ?? []
    return (rows as Record<string, unknown>[]).map((r) => mapLedgerRowToTransaction(user.id, r))
  }, [txQuery.data, user?.id])
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [profileNotice, setProfileNotice] = useState<{ title: string; message: string } | null>(null)
  const [userStats, setUserStats] = useState<UserStats>({
    totalTransactions: 0,
    totalSent: 0,
    memberSince: '',
  })
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    baseCurrency: 'NGN',
    easetag: '',
  })
  const [editProfileData, setEditProfileData] = useState(profileData)
  const [checkingEasetag, setCheckingEasetag] = useState(false)
  const [easetagAvailable, setEasetagAvailable] = useState<boolean | null>(null)
  const [easetagValidationError, setEasetagValidationError] = useState<string | null>(null)
  const easetagCheckSeqRef = useRef(0)
  const privacyLink = useExternalLink()
  const termsLink = useExternalLink()
  const profileAvatarUrl = normalizeAvatarUrl(userProfile?.profile?.avatar_url)
  const profileAvatarSource = avatarImageSource(userProfile?.profile?.avatar_url)
  const profileHeaderName =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    ''

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Profile')
  }, [])

  useEffect(() => {
    warmAvatarCache(profileAvatarUrl)
  }, [profileAvatarUrl])

  // Load user profile data
  useEffect(() => {
    if (userProfile) {
      const data = {
        fullName: (userProfile.profile.full_name || '').trim(),
        email: userProfile.profile.email || '',
        phone: userProfile.profile.phone || '',
        baseCurrency: userProfile.profile.base_currency || 'USD',
        easetag: userProfile.profile.easetag || '',
      }
      setProfileData(data)
      setEditProfileData(data)
    }
  }, [userProfile])

  // Load user statistics
  useEffect(() => {
    if (!user || !transactions.length || !exchangeRates.length) return

    const calculateUserStats = async () => {
      const baseCurrency = userProfile?.profile.base_currency || 'USD'
      const stats = await userService.getUserStats(user.id, transactions, exchangeRates, baseCurrency, userProfile)
      setUserStats(stats)
    }

    calculateUserStats()
  }, [user, userProfile, transactions, exchangeRates])

  const handleEditProfile = () => {
    easetagCheckSeqRef.current += 1
    setCheckingEasetag(false)
    setEditProfileData(profileData)
    setIsEditing(true)
    setEasetagAvailable(null)
    setEasetagValidationError(null)
  }

  // Check easetag availability
  const checkEasetagAvailability = async (easetag: string) => {
    const profileTag = (profileData.easetag || '').replace(/^@/, '').trim().toLowerCase()
    const cleanTag = easetag.replace(/^@/, "").trim().toLowerCase()
    if (!cleanTag || cleanTag === profileTag) {
      setEasetagAvailable(null)
      setEasetagValidationError(null)
      return
    }
    if (cleanTag.length < 4) {
      setEasetagAvailable(null)
      setEasetagValidationError(null)
      return
    }

    setCheckingEasetag(true)
    setEasetagValidationError(null)
    const seq = ++easetagCheckSeqRef.current
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (seq === easetagCheckSeqRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }

      const apiUrl = getApiBaseUrl()
      const response = await fetch(
        `${apiUrl}/api/username/check?easetag=${encodeURIComponent(cleanTag)}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )

      let data: Record<string, unknown> = {}
      try {
        data = (await response.json()) as Record<string, unknown>
      } catch {
        if (seq === easetagCheckSeqRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }

      if (!response.ok) {
        if (seq === easetagCheckSeqRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }
      const validRaw = data.valid
      const isInvalid =
        validRaw === false || String(validRaw).toLowerCase() === 'false' || validRaw === 0
      if (isInvalid) {
        if (seq === easetagCheckSeqRef.current) {
          setEasetagAvailable(null)
          const err = typeof data.error === 'string' ? data.error.trim() : ''
          setEasetagValidationError(err || 'This Easetag is not valid.')
        }
        return
      }
      const availRaw = data.available
      const isAvail =
        availRaw === true ||
        availRaw === 1 ||
        (typeof availRaw === 'string' && ['true', '1'].includes(availRaw.toLowerCase()))
      if (seq === easetagCheckSeqRef.current) {
        setEasetagValidationError(null)
        setEasetagAvailable(isAvail)
      }
    } catch (error) {
      console.error('Error checking easetag:', error)
      if (seq === easetagCheckSeqRef.current) {
        setEasetagAvailable(null)
        setEasetagValidationError(null)
      }
    } finally {
      if (seq === easetagCheckSeqRef.current) {
        setCheckingEasetag(false)
      }
    }
  }

  // Debounce easetag check
  const easetagCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleEasetagChange = (text: string) => {
    // Remove @ if user types it, we'll add it in display
    const cleanText = text.replace(/^@/, "")
    setEditProfileData(prev => ({ ...prev, easetag: cleanText }))
    setEasetagValidationError(null)

    // Clear previous timeout
    if (easetagCheckTimeout.current) {
      clearTimeout(easetagCheckTimeout.current)
    }

    // Check availability after 500ms delay (min 4 chars matches server validation)
    if (cleanText.length >= 4) {
      easetagCheckTimeout.current = setTimeout(() => {
        checkEasetagAvailability(cleanText)
      }, 500)
    } else {
      setEasetagAvailable(null)
      setEasetagValidationError(null)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    if (!editProfileData.fullName?.trim()) {
      setProfileNotice({ title: 'Error', message: 'Please enter your full name' })
      return
    }

    setLoading(true)
    try {
      const updatePayload: UserProfileData = {
        fullName: editProfileData.fullName.trim(),
        phone: editProfileData.phone,
      }
      const updateResult = await userService.updateProfile(user.id, updatePayload)
      await supabase.auth.refreshSession().catch(() => undefined)

      const nextTag = (editProfileData.easetag || '').replace(/^@/, '').trim().toLowerCase()
      const prevTag = (profileData.easetag || '').replace(/^@/, '').trim().toLowerCase()
      if (nextTag && nextTag !== prevTag) {
        await userService.updateEasetag(nextTag)
      }

      let fromServer = personalFromUpdateProfileResult(updateResult)
      if (!fromServer) {
        fromServer = await fetchPersonalSettings(user.id)
      }
      if (fromServer) {
        applyPersonalSettingsFromServer(fromServer, nextTag && nextTag !== prevTag ? { easetag: editProfileData.easetag } : undefined)
      }
      const updatedProfileData = fromServer
        ? {
            fullName: (fromServer.fullName || '').trim(),
            email: fromServer.email || editProfileData.email,
            phone: fromServer.phone ?? '',
            baseCurrency: profileData.baseCurrency,
            easetag: editProfileData.easetag,
          }
        : editProfileData
      setProfileData(updatedProfileData)
      setEditProfileData(updatedProfileData)

      if (refreshUserProfile) {
        await refreshUserProfile()
      }

      setIsEditing(false)
      setEasetagAvailable(null)
      setEasetagValidationError(null)
      setProfileNotice({ title: 'Success', message: 'Profile updated successfully' })
    } catch (error) {
      console.error('Error updating profile:', error)
      setProfileNotice({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update profile',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEdit = () => {
    easetagCheckSeqRef.current += 1
    setCheckingEasetag(false)
    setEditProfileData(profileData)
    setIsEditing(false)
    setEasetagAvailable(null)
    setEasetagValidationError(null)
    if (easetagCheckTimeout.current) {
      clearTimeout(easetagCheckTimeout.current)
    }
  }

  const handleSignOutPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowLogoutDialog(true)
  }

  const performSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
      setProfileNotice({ title: 'Error', message: 'Failed to sign out' })
    } finally {
      setIsLoggingOut(false)
      setShowLogoutDialog(false)
    }
  }

  const handleSupport = () => {
    navigation.navigate('Support')
  }

  const handlePrivacy = () => {
    privacyLink.openLink('https://www.easner.com/privacy', 'Privacy Policy')
  }

  const handleTerms = () => {
    termsLink.openLink('https://www.easner.com/terms', 'Terms of Service')
  }

  const getSelectedCurrency = () => {
    return currencies.find((c) => c.code === profileData.baseCurrency)
  }

  const formatNumber = (num: number) => {
    // Values less than 1,000: show with decimals (e.g., 12.50)
    if (num < 1000) {
      return num.toFixed(2)
    }
    
    // Values 1,000 to 9,999: show as whole numbers (e.g., 1,000, 1,500)
    if (num < 10000) {
      return Math.round(num).toLocaleString()
    }
    
    // Values 10,000 and above: apply K/M/B/T rounding
    if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T'
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
    return num.toFixed(0)
  }

  const formatCurrency = (amount: number, currency: string) => {
    const currencyInfo = currencies.find((c) => c.code === currency)
    const formattedNumber = formatNumber(amount)
    return `${currencyInfo?.symbol || ''}${formattedNumber}`
  }

  const renderCurrencyPicker = () => (
    <Modal
      visible={showCurrencyPicker}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCurrencyPicker(false)}
    >
      <View style={styles.currencyModalOverlay}>
        <View style={styles.currencyModalContent}>
          <View style={styles.currencyModalHeader}>
            <Text style={styles.currencyModalTitle}>Select Base Currency</Text>
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.currencyCloseButton}
              onPress={() => setShowCurrencyPicker(false)}
            >
              <X size={24} color={palette.brand.slate} strokeWidth={2} />
            </Pressable>
          </View>
          <FlatList
            data={currencies}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.currencyItem}
                onPress={() => {
                  setEditProfileData(prev => ({ ...prev, baseCurrency: item.code }))
                  setShowCurrencyPicker(false)
                }}
              >
                <View style={styles.currencyInfo}>
                  <CurrencyFlag currency={item.code} size={20} style={styles.currencyFlag} />
                  <View style={styles.currencyDetails}>
                    <Text style={styles.currencyCode}>{item.code}</Text>
                    <Text style={styles.currencyName}>{item.name}</Text>
                  </View>
                  <Text style={styles.currencySymbol}>{item.symbol}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  )

  const renderProfileField = (label: string, value: string, onChangeText: (text: string) => void, disabled: boolean = false) => {
    // In edit mode, show TextInput unless the field is explicitly disabled
    const showInput = isEditing && !disabled
    
    return (
      <View style={styles.fieldContainer}>
        <Text style={isEditing ? styles.fieldLabelEdit : styles.fieldLabel}>
          {label}
        </Text>
        {showInput ? (
          <TextInput
            style={styles.fieldInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={`Enter ${label.toLowerCase()}`}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={true}
            autoCapitalize="words"
          />
        ) : (
          <Text style={[styles.fieldValue, disabled && styles.fieldValueDisabled]}>
            {value || 'Not set'}
          </Text>
        )}
      </View>
    )
  }

  const renderEasetagField = () => {
    const easetagT = editProfileData.easetag.replace(/^@/, '').trim()
    const easetagTLen = easetagT.length
    return (
    <View style={styles.fieldContainer}>
      <View style={styles.easetagLabelContainer}>
        <Text style={isEditing ? styles.fieldLabelEdit : styles.fieldLabel}>Easetag</Text>
        {isEditing ? (
          <View style={styles.easetagStatusSlot}>
            {easetagTLen > 0 ? (
              <View style={styles.easetagStatusContainer}>
                {easetagTLen < 4 ? (
                  <Text style={[styles.easetagStatusTextInline, { color: palette.brand.slate }]}>Min 4 characters</Text>
                ) : checkingEasetag ? (
                  <Text style={[styles.easetagStatusTextInline, { color: palette.brand.slate }]}>Checking…</Text>
                ) : easetagValidationError ? (
                  <Text style={[styles.easetagStatusTextInline, styles.easetagUnavailableText]} numberOfLines={2}>
                    {easetagValidationError}
                  </Text>
                ) : easetagAvailable === true ? (
                  <>
                    <CircleCheck size={16} color={palette.success.main} strokeWidth={2} />
                    <Text style={[styles.easetagStatusTextInline, styles.easetagAvailableText]}>
                      Available
                    </Text>
                  </>
                ) : easetagAvailable === false ? (
                  <>
                    <CircleX size={16} color={palette.error.main} strokeWidth={2} />
                    <Text style={[styles.easetagStatusTextInline, styles.easetagUnavailableText]}>
                      Taken
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {isEditing ? (
        <View>
          <View style={styles.easetagInputContainer}>
            <Text style={styles.easetagPrefix}>@</Text>
            <TextInput
              style={styles.easetagInput}
              value={editProfileData.easetag}
              onChangeText={handleEasetagChange}
              placeholder="youreasetag"
              placeholderTextColor={palette.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              maxLength={20}
            />
            <View style={styles.easetagSpinnerSlot}>
              {checkingEasetag ? <ActivityIndicator size="small" color={palette.brand.slate} /> : null}
            </View>
          </View>
          <Text style={styles.fieldDescription}>
            People can send you money for free using your Easetag.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.fieldValue}>
            {profileData.easetag ? `@${profileData.easetag}` : 'Not set'}
          </Text>
          <Text style={styles.fieldDescription}>
            People can send you money for free using your Easetag.
          </Text>
        </>
      )}
    </View>
    )
  }

  const renderCurrencyField = () => (
    <View style={styles.fieldContainer}>
      <Text style={isEditing ? styles.fieldLabelEdit : styles.fieldLabel}>Base Currency</Text>
      {isEditing ? (
        <Pressable
         android_ripple={ripple.neutral}
          style={styles.currencySelector}
          onPress={() => setShowCurrencyPicker(true)}
        >
          <View style={styles.currencySelectorContent}>
            <CurrencyFlag currency={editProfileData.baseCurrency} size={20} style={styles.currencyFlag} />
            <Text style={styles.currencySelectorText}>
              {editProfileData.baseCurrency} - {currencies.find(c => c.code === editProfileData.baseCurrency)?.name || 'Select Currency'}
            </Text>
            <ChevronDown size={16} color={palette.brand.slate} strokeWidth={2} />
          </View>
        </Pressable>
      ) : (
        <View style={styles.currencyDisplay}>
          <CurrencyFlag currency={profileData.baseCurrency} size={20} style={styles.currencyFlag} />
          <Text style={styles.currencyText}>{profileData.baseCurrency}</Text>
      </View>
      )}
      <Text style={styles.currencyDescription}>
        Used for reporting your total sent amount
      </Text>
    </View>
  )

  const renderMenuButton = (title: string, onPress: () => void, isDestructive: boolean = false) => (
    <Pressable android_ripple={ripple.neutral} style={styles.menuButton} onPress={onPress}>
      <Text style={[styles.menuButtonText, isDestructive && styles.destructiveText]}>
        {title}
      </Text>
      <Text style={styles.menuButtonArrow}>›</Text>
    </Pressable>
  )

  return (
    <ScreenWrapper>
      <KeyboardSafeContainer>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        style={styles.scrollContainer}
      >
      {/* Profile Header */}
      <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerAvatar}>
              {profileAvatarSource ? (
                <Image
                  source={profileAvatarSource}
                  style={userAvatarStyles.image}
                  resizeMode="cover"
                />
              ) : (
                <Text style={userAvatarStyles.initials}>{initialsFromFullName(profileHeaderName)}</Text>
              )}
            </View>
          </View>
          <Text style={styles.pageTitle}>Settings</Text>
          <Text style={styles.pageSubtitle}>Manage your account information</Text>
      </View>

        <View style={styles.contentContainer}>
      {/* Profile Information */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Profile</Text>
          {!isEditing ? (
                <Pressable android_ripple={ripple.neutral} onPress={handleEditProfile} style={styles.editButtonContainer} >
                  <Pencil size={18} color={palette.neutral.white} strokeWidth={2} />
              <Text style={styles.editButton}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.editActions}>
                  <Pressable android_ripple={ripple.neutral} onPress={handleCancelEdit} disabled={loading}>
                    <Text style={styles.cancelButton}>Discard</Text>
              </Pressable>
              <Pressable android_ripple={ripple.neutral} onPress={handleSaveProfile} disabled={loading}>
                <Text style={[styles.saveButton, loading && styles.disabledButton]}>
                  {loading ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

            <View style={styles.profileContent}>
              {isEditing ? (
                <>
        {renderProfileField(
          'Full Name',
          editProfileData.fullName,
          (text) => setEditProfileData(prev => ({ ...prev, fullName: text }))
        )}
        {renderProfileField(
          'Email',
          editProfileData.email,
          (text) => setEditProfileData(prev => ({ ...prev, email: text })),
          true // Email should not be editable
        )}
        {renderProfileField(
          'Phone Number',
                    editProfileData.phone,
                    (text) => setEditProfileData(prev => ({ ...prev, phone: text }))
                  )}
                  {renderEasetagField()}
                  {renderCurrencyField()}
                </>
              ) : (
                <>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Full Name</Text>
                    <Text style={styles.fieldValue}>{profileData.fullName?.trim() || 'Not set'}</Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Email Address</Text>
                    <Text style={styles.fieldValue}>{profileData.email}</Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Phone Number</Text>
                    <Text style={styles.fieldValue}>{profileData.phone || 'Not set'}</Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Easetag</Text>
                    <Text style={styles.fieldValue}>
                      {profileData.easetag ? `@${profileData.easetag}` : 'Not set'}
                    </Text>
                    <Text style={styles.fieldDescription}>
                      People can send you money for free using your Easetag.
                    </Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Base Currency</Text>
                    <View style={styles.currencyDisplay}>
                      <CurrencyFlag currency={profileData.baseCurrency} size={20} style={styles.currencyFlag} />
                      <Text style={styles.currencyText}>{profileData.baseCurrency}</Text>
                    </View>
                    <Text style={styles.currencyDescription}>
                      Used for reporting your total sent amount
                    </Text>
                  </View>
                </>
              )}
            </View>
      </View>

          {/* Status Section */}
      <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusContent}>
              <View style={styles.statusItem}>
                <View style={styles.statusLeft}>
                  <Mail size={16} color={palette.primary.main} strokeWidth={2} />
                  <Text style={styles.statusLabel}>Email</Text>
                </View>
                <View style={[styles.statusBadge, userProfile?.email_confirmed_at ? styles.verifiedBadge : styles.pendingBadge]}>
                  <Text style={[styles.statusBadgeText, userProfile?.email_confirmed_at ? styles.verifiedText : styles.pendingText]}>
                    {userProfile?.email_confirmed_at ? 'Verified' : 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={styles.statusDivider} />
              <View style={styles.statusStats}>
                <View style={styles.statusStatItem}>
                  <Text style={styles.statusStatLabel}>Member since</Text>
                  <Text style={styles.statusStatValue}>{userStats.memberSince}</Text>
                </View>
                <View style={styles.statusStatItem}>
                  <Text style={styles.statusStatLabel}>Total transactions</Text>
                  <Text style={styles.statusStatValue}>{userStats.totalTransactions}</Text>
                </View>
                <View style={styles.statusStatItem}>
                  <Text style={styles.statusStatLabel}>Total sent</Text>
                  <Text style={styles.statusStatValue}>{formatCurrency(userStats.totalSent, profileData.baseCurrency)}</Text>
                </View>
              </View>
            </View>
      </View>

          {/* App Actions */}
      <View style={styles.section}>
            <Text style={styles.sectionTitle}>App</Text>
        {renderMenuButton('Account Verification', () => navigation.navigate('AccountVerification'))}
        {renderMenuButton('Support', handleSupport)}
        {renderMenuButton('Privacy Policy', handlePrivacy)}
        {renderMenuButton('Terms of Service', handleTerms)}
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        {renderMenuButton('Sign Out', handleSignOutPress, true)}
      </View>

      {/* App Version */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>
        </View>

        {/* Currency Picker Modal */}
        {renderCurrencyPicker()}
    </ScrollView>
      <ExternalLinkModal
        visible={privacyLink.isVisible}
        url={privacyLink.url}
        title={privacyLink.title}
        onClose={privacyLink.closeLink}
      />
      <ExternalLinkModal
        visible={termsLink.isVisible}
        url={termsLink.url}
        title={termsLink.title}
        onClose={termsLink.closeLink}
      />

      <EasnerAlertSheet
        visible={showLogoutDialog}
        onDismiss={() => {
          if (!isLoggingOut) setShowLogoutDialog(false)
        }}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        primaryLabel="Sign Out"
        onPrimary={() => void performSignOut()}
        secondaryLabel="Cancel"
        onSecondary={() => setShowLogoutDialog(false)}
        primaryLoading={isLoggingOut}
      />

      <EasnerAlertSheet
        visible={profileNotice !== null}
        onDismiss={() => setProfileNotice(null)}
        title={profileNotice?.title ?? ''}
        message={profileNotice?.message ?? ''}
        primaryLabel="OK"
        onPrimary={() => setProfileNotice(null)}
        singleAction
      />
      </KeyboardSafeContainer>
    </ScreenWrapper>
  )
}

// Export ProfileScreen directly (authentication handled at navigator level)
export default function ProfileScreen(props: NavigationProps) {
  return <ProfileContent {...props} />
}
