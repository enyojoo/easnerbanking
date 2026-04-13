import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Keyboard,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { ripple } from '../../lib/androidRipple'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { useUserData } from '../../contexts/UserDataContext'
import { NavigationProps } from '../../types'
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

function ProfileContent({ navigation }: NavigationProps) {
  const { user, userProfile, signOut, refreshUserProfile, applyPersonalSettingsFromServer } = useAuth()
  const { transactions, currencies, exchangeRates } = useUserData()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
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

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Profile')
  }, [])

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
      Alert.alert('Error', 'Please enter your full name')
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
      Alert.alert('Success', 'Profile updated successfully')
    } catch (error) {
      console.error('Error updating profile:', error)
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update profile'
      )
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

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut }
      ]
    )
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
              <Ionicons name="close" size={24} color="#6b7280" />
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
                  <Text style={[styles.easetagStatusTextInline, { color: '#6b7280' }]}>Min 4 characters</Text>
                ) : checkingEasetag ? (
                  <Text style={[styles.easetagStatusTextInline, { color: '#6b7280' }]}>Checking…</Text>
                ) : easetagValidationError ? (
                  <Text style={[styles.easetagStatusTextInline, styles.easetagUnavailableText]} numberOfLines={2}>
                    {easetagValidationError}
                  </Text>
                ) : easetagAvailable === true ? (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={[styles.easetagStatusTextInline, styles.easetagAvailableText]}>
                      Available
                    </Text>
                  </>
                ) : easetagAvailable === false ? (
                  <>
                    <Ionicons name="close-circle" size={16} color="#ef4444" />
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
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              maxLength={20}
            />
            <View style={styles.easetagSpinnerSlot}>
              {checkingEasetag ? <ActivityIndicator size="small" color="#6b7280" /> : null}
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
            <Ionicons name="chevron-down" size={16} color="#6b7280" />
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
                  <Ionicons name="pencil-outline" size={18} color="#ffffff" />
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
                  <Ionicons name="mail-outline" size={16} color="#10b981" />
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
        {renderMenuButton('Sign Out', handleSignOut, true)}
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
      </KeyboardSafeContainer>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 24,
    backgroundColor: '#ffffff',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  contentContainer: {
    padding: 24,
    gap: 24,
  },
  section: {
    backgroundColor: '#ffffff',
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
    color: '#111827',
  },
  editButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#007ACC',
    shadowColor: '#000',
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
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: 'Outfit-SemiBold',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    textAlign: 'center',
  },
  saveButton: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007ACC',
    borderRadius: 8,
    textAlign: 'center',
  },
  disabledButton: {
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
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
    color: '#6b7280',
    marginBottom: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldLabelEdit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
    backgroundColor: '#ffffff',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      ios: { paddingVertical: 12 },
    }),
  },
  fieldValue: {
    fontSize: 16,
    color: '#111827',
    paddingVertical: 8,
    fontWeight: '500',
  },
  currencySelector: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#ffffff',
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
    color: '#111827',
  },
  currencyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  currencyText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  currencyDescription: {
    fontSize: 12,
    color: '#6b7280',
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
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  easetagPrefix: {
    fontSize: 16,
    color: '#6b7280',
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
    color: '#111827',
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
    color: '#10b981',
  },
  easetagUnavailableText: {
    color: '#ef4444',
  },
  fieldDescription: {
    fontSize: 12,
    color: '#6b7280',
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
    color: '#374151',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedBadge: {
    backgroundColor: '#dcfce7',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  verifiedText: {
    color: '#166534',
  },
  pendingText: {
    color: '#92400e',
  },
  statusDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
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
    color: '#6b7280',
  },
  statusStatValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  menuButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuButtonText: {
    fontSize: 16,
    color: '#111827',
  },
  destructiveText: {
    color: '#ef4444',
  },
  menuButtonArrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  // Currency Picker Modal Styles
  currencyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  currencyModalContent: {
    backgroundColor: '#ffffff',
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
    borderBottomColor: '#e5e7eb',
  },
  currencyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  currencyCloseButton: {
    padding: 4,
  },
  currencyItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
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
    color: '#111827',
  },
  currencyName: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  currencySymbol: {
    fontSize: 16,
    color: '#6b7280',
  },
  disabledHint: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  fieldValueDisabled: {
    color: '#9ca3af',
  },
})

// Export ProfileScreen directly (authentication handled at navigator level)
export default function ProfileScreen(props: NavigationProps) {
  return <ProfileContent {...props} />
}
