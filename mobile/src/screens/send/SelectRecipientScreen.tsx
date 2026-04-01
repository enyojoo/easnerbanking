import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Animated,
  Alert,
  Image,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Plus, Search } from 'lucide-react-native'
import { NavigationProps, Recipient } from '../../types'
import { colors, shadows, textStyles, borderRadius, spacing } from '../../theme'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useUserData } from '../../contexts/UserDataContext'
import { recipientService } from '../../lib/recipientService'
import { useAuth } from '../../contexts/AuthContext'
import { getAccountTypeConfigFromCurrency } from '../../lib/currencyAccountTypes'
import { formatIBAN, formatSortCode, formatRoutingNumber, formatAccountNumber } from '../../utils/formatters'
import { CountryCurrency } from '../../lib/countryCurrencyMapping'
import { getCatalogByRecipientType, getRecipientProviders, getWalletAssets, getWalletNetworksForAsset } from '../../lib/recipientCatalog'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'
import { Wallet, Building2, Smartphone } from 'lucide-react-native'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import { getCountryCodeForCurrency } from '@easner/shared'

export default function SelectRecipientScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { userProfile } = useAuth()
  const { recipients, refreshRecipients, invalidateRecipients, currencies } = useUserData()
  const [searchTerm, setSearchTerm] = useState('')
  // New 3-step flow states
  const [showRecipientTypeModal, setShowRecipientTypeModal] = useState(false) // Step 1: Choose type
  const [showBankAccountForm, setShowBankAccountForm] = useState(false) // Step 2: Bank Account form
  const [selectedRecipientType, setSelectedRecipientType] = useState<'wallet' | 'bank' | 'mobile' | null>(null)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false) // Inline dropdown for country
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showWalletAssetDropdown, setShowWalletAssetDropdown] = useState(false)
  const [showWalletNetworkDropdown, setShowWalletNetworkDropdown] = useState(false)
  const [currencySearchTerm, setCurrencySearchTerm] = useState('')
  const [providerSearchTerm, setProviderSearchTerm] = useState('')
  const [walletAssetSearchTerm, setWalletAssetSearchTerm] = useState('')
  const [walletNetworkSearchTerm, setWalletNetworkSearchTerm] = useState('')
  const [showScanModal, setShowScanModal] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedCountryCurrency, setSelectedCountryCurrency] = useState<CountryCurrency | null>(null)
  const [transferType, setTransferType] = useState<'ACH' | 'Wire' | null>(null) // For USA
  
  const [newRecipient, setNewRecipient] = useState({
    fullName: '',
    accountNumber: '',
    bankName: '',
    currency: 'USD',
    routingNumber: '',
    sortCode: '',
    iban: '',
    swiftBic: '',
    phoneNumber: '',
    provider: '',
    walletAddress: '',
    network: '',
    memoTag: '',
    checkingOrSavings: '',
    addressLine1: '',
  })
  
  // Get pre-selected recipient ID from route params
  const preSelectedRecipientId = (route.params as any)?.selectedRecipientId as string | undefined
  const preferredBalanceCurrency = String((route.params as any)?.preferredBalanceCurrency || '').toUpperCase()
  const selectedPaymentMethod = (route.params as any)?.selectedPaymentMethod as
    | 'balance'
    | 'linkBank'
    | 'virtualBank'
    | 'otherCurrency'
    | undefined
  const selectedOtherCurrency = (route.params as any)?.selectedOtherCurrency as string | undefined
  const selectedOtherPaymentMethod = (route.params as any)?.selectedOtherPaymentMethod as string | undefined
  
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(
    preSelectedRecipientId 
      ? recipients.find(r => r.id === preSelectedRecipientId) || null
      : null
  )

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start()
  }, [headerAnim, contentAnim])

  // Update selected recipient when recipients change
  useEffect(() => {
    if (preSelectedRecipientId) {
      const recipient = recipients.find(r => r.id === preSelectedRecipientId)
      if (recipient) {
        setSelectedRecipient(recipient)
      }
    }
  }, [recipients, preSelectedRecipientId])

  const getInitials = (fullName: string) => {
    const names = fullName.trim().split(' ').filter(name => name.length > 0)
    if (names.length === 0) return '??'
    if (names.length === 1) return names[0][0].toUpperCase()
    return names.slice(0, 2).map(name => name[0]).join('').toUpperCase()
  }

  // Filter recipients by search term (no grouping)
  const filteredRecipients = recipients.filter(recipient =>
    recipient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipient.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (recipient.account_number && recipient.account_number.includes(searchTerm)) ||
    (recipient.iban && recipient.iban.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSelectRecipient = async (recipient: Recipient) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedRecipient(recipient)
    
    // Navigate to SendAmountScreen (same as SelectRecentRecipientScreen)
    // Pass fromSelectRecipient to enable instant transition
    navigation.navigate('SendAmount' as never, {
      recipient,
      fromSelectRecipient: true,
      preferredBalanceCurrency: preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
        ? preferredBalanceCurrency
        : undefined,
      selectedPaymentMethod,
      selectedOtherCurrency: selectedOtherCurrency ?? null,
      selectedOtherPaymentMethod: selectedOtherPaymentMethod ?? null,
    } as never)
  }

  const handleAddNewRecipient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    resetForm()
    setShowRecipientTypeModal(true)
  }

  // Check if we should show add recipient modal on mount
  useEffect(() => {
    const showAddRecipient = (route.params as any)?.showAddRecipient
    if (showAddRecipient) {
      setShowRecipientTypeModal(true)
    }
  }, [route.params])

  const resetForm = () => {
    setNewRecipient({
      fullName: '',
      accountNumber: '',
      bankName: '',
      currency: 'USD',
      routingNumber: '',
      sortCode: '',
      iban: '',
      swiftBic: '',
      phoneNumber: '',
      provider: '',
      walletAddress: '',
      network: '',
      memoTag: '',
      checkingOrSavings: '',
      addressLine1: '',
    })
    setTransferType(null)
    setError('')
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowScanModal(false)
    setProviderSearchTerm('')
    setWalletAssetSearchTerm('')
    setWalletNetworkSearchTerm('')
  }

  const mapFieldName = (fieldName: string): string => {
    const fieldMap: Record<string, string> = {
      account_name: "fullName",
      routing_number: "routingNumber",
      account_number: "accountNumber",
      bank_name: "bankName",
      sort_code: "sortCode",
      iban: "iban",
      swift_bic: "swiftBic",
    }
    return fieldMap[fieldName] || fieldName
  }

  const extractWalletAddress = (value: string): string => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const noQuery = raw.split('?')[0]
    if (noQuery.includes(':')) {
      const parts = noQuery.split(':')
      return parts[parts.length - 1] || raw
    }
    return noQuery
  }

  const handleScanPress = async () => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission()
    if (!perm?.granted) {
      Alert.alert('Camera permission needed', 'Please enable camera permission to scan wallet address QR codes.')
      return
    }
    setShowScanModal(true)
  }

  const isFormValid = () => {
    if (!newRecipient.fullName || !newRecipient.currency) return false

    if (selectedRecipientType === 'wallet') {
      return !!newRecipient.network && !!newRecipient.walletAddress
    }
    if (selectedRecipientType === 'mobile') {
      return !!newRecipient.provider && !!newRecipient.phoneNumber
    }

    // For US accounts, transfer type is required
    if (selectedCountryCurrency?.countryCode === 'US' && !transferType) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.checkingOrSavings) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.addressLine1.trim()) {
      return false
    }

    const accountConfig = getAccountTypeConfigFromCurrency(newRecipient.currency)
    const requiredFields = accountConfig.requiredFields

    for (const field of requiredFields) {
      const formFieldName = mapFieldName(field)
      const fieldValue = newRecipient[formFieldName as keyof typeof newRecipient]
      if (!fieldValue || (typeof fieldValue === "string" && !fieldValue.trim())) {
        return false
      }
    }

    return true
  }

  const handleAddRecipient = async () => {
    if (!userProfile?.id) {
      Alert.alert('Error', 'User not authenticated')
      return
    }

    if (!isFormValid()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      const accountNumberForType =
        selectedRecipientType === 'wallet'
          ? newRecipient.walletAddress
          : selectedRecipientType === 'mobile'
            ? newRecipient.phoneNumber
            : newRecipient.accountNumber
      const bankNameForType =
        selectedRecipientType === 'wallet'
          ? `Wallet (${newRecipient.network})`
          : selectedRecipientType === 'mobile'
            ? `Mobile Money (${newRecipient.provider})`
            : newRecipient.bankName

      await recipientService.create(userProfile.id, {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        currency: newRecipient.currency,
        countryCode: selectedCountryCurrency?.countryCode,
        phoneNumber: selectedRecipientType === 'mobile' ? newRecipient.phoneNumber : undefined,
        mobileProvider: selectedRecipientType === 'mobile' ? newRecipient.provider : undefined,
        walletNetwork: selectedRecipientType === 'wallet' ? newRecipient.network : undefined,
        walletMemoTag: selectedRecipientType === 'wallet' ? newRecipient.memoTag : undefined,
        routingNumber: newRecipient.routingNumber || undefined,
        sortCode: newRecipient.sortCode || undefined,
        iban: newRecipient.iban || undefined,
        swiftBic: newRecipient.swiftBic || undefined,
        transferType: selectedCountryCurrency?.countryCode === 'US' ? transferType || undefined : undefined,
        checkingOrSavings:
          selectedCountryCurrency?.countryCode === 'US' ? (newRecipient.checkingOrSavings as 'checking' | 'savings' | '') || undefined : undefined,
        addressLine1: selectedCountryCurrency?.countryCode === 'US' ? newRecipient.addressLine1 || undefined : undefined,
      })

      await invalidateRecipients()
      await refreshRecipients(true)
      setError('')
      resetForm()
      setShowBankAccountForm(false)
      Alert.alert('Success', 'Recipient added successfully')
    } catch (error) {
      console.error('Error adding recipient:', error)
      setError('Failed to add recipient')
      Alert.alert('Error', 'Failed to add recipient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const recipientTypeKey = selectedRecipientType === 'mobile' ? 'mobile_money' : (selectedRecipientType || 'bank')
  const filteredCurrencies = getCatalogByRecipientType(recipientTypeKey as any).filter(currency => {
    if (currencySearchTerm) {
      return (
        currency.currencyName.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
        currency.currencyCode.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
        currency.countryName.toLowerCase().includes(currencySearchTerm.toLowerCase())
      )
    }
    return true
  })
  const selectedCatalogEntry = getCatalogByRecipientType(recipientTypeKey as any).find(
    (item) => item.currencyCode === newRecipient.currency && item.countryCode === selectedCountryCurrency?.countryCode,
  ) || getCatalogByRecipientType(recipientTypeKey as any).find((item) => item.currencyCode === newRecipient.currency)
  const isAnyDropdownOpen = showCurrencyDropdown || showProviderDropdown || showWalletAssetDropdown || showWalletNetworkDropdown
  const closeAllDropdowns = () => {
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
  }

  const renderRecipient = ({ item }: { item: Recipient }) => {
    const isSelected = selectedRecipient?.id === item.id
    const isWalletRecipient = String(item.bank_name || '').toLowerCase().includes('wallet')
    const tokenIcon = getTokenIconUrl(item.currency)

    return (
      <TouchableOpacity
        style={[styles.recipientItem, isSelected && styles.recipientItemSelected]}
        onPress={() => handleSelectRecipient(item)}
        activeOpacity={0.7}
      >
        <View style={styles.recipientRow}>
          <View style={styles.avatarContainer}>
            <View style={[styles.recipientAvatar, isSelected && styles.recipientAvatarSelected]}>
              <Text style={[styles.recipientAvatarText, isSelected && styles.recipientAvatarTextSelected]}>
                {getInitials(item.full_name)}
              </Text>
            </View>
            {/* Flag badge on bottom edge of avatar */}
            <View style={styles.avatarFlagBadge}>
              <View style={styles.flagContainer}>
                {isWalletRecipient && tokenIcon ? (
                  <Image source={{ uri: tokenIcon }} style={styles.flagImage} />
                ) : (
                  <CountryFlag
                    code={item.country_code || (item.currency === 'EUR' ? 'EU' : getCountryCodeForCurrency(item.currency) || 'US')}
                    size={20}
                    style={styles.flagImage}
                  />
                )}
              </View>
            </View>
          </View>
          
          <View style={styles.recipientInfo}>
            <Text style={styles.recipientName}>{item.full_name}</Text>
            <Text style={styles.recipientBank}>{item.bank_name}</Text>
            <Text style={styles.recipientAccount}>
              {item.iban || item.account_number || ''}
            </Text>
            <Text style={styles.recipientCurrency}>{item.currency}</Text>
          </View>
          
          <View style={styles.recipientActions}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && (
                <View style={styles.checkboxInner} />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        >
          {/* Header */}
          <Animated.View 
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  })
                }]
              }
            ]}
          >
            <TouchableOpacity 
              onPress={() => {
                navigation.goBack()
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Send Money To</Text>
            </View>
          </Animated.View>

          {/* Search Bar */}
          <Animated.View 
            style={[
              styles.searchContainer,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  })
                }]
              }
            ]}
          >
            <View style={styles.searchWrapper}>
              <Search size={18} color={colors.text.secondary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Search recipients..."
                placeholderTextColor={colors.text.secondary}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm('')}>
                  <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Recipients List - No Grouping */}
          <Animated.View
            style={[
              styles.recipientsContainer,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  })
                }]
              }
            ]}
          >
            {filteredRecipients.length > 0 ? (
              <FlatList
                data={filteredRecipients}
                renderItem={renderRecipient}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="people-outline" size={48} color={colors.text.secondary} />
                </View>
                <Text style={styles.emptyTitle}>No recipients found</Text>
                <Text style={styles.emptyText}>Add a new recipient to get started</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Add new recipient Button - Fixed at bottom */}
        <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + spacing[4] }]}>
          <TouchableOpacity
            style={styles.addRecipientButton}
            onPress={handleAddNewRecipient}
            activeOpacity={0.7}
          >
            <Text style={styles.addRecipientButtonText}>Add new recipient</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Step 1: Recipient Type Selection Modal */}
      <Modal
        visible={showRecipientTypeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowRecipientTypeModal(false)
          resetForm()
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowRecipientTypeModal(false)
              resetForm()
            }}
          />
          <View style={[styles.modalContainer, styles.recipientTypeModal, { 
            paddingBottom: Math.max(insets.bottom, 20),
          }]} 
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {}}
        >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add a new</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowRecipientTypeModal(false)
                  resetForm()
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.recipientTypeOptions}>
              {/* Wallet Address Option */}
              <TouchableOpacity
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  const firstAsset = getWalletAssets()[0] || 'USDT'
                  const firstNetwork = getWalletNetworksForAsset(firstAsset)[0] || ''
                  setSelectedRecipientType('wallet')
                  setNewRecipient(prev => ({ ...prev, currency: firstAsset, network: firstNetwork }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }}
                activeOpacity={0.7}
              >
                <View style={styles.recipientTypeIcon}>
                  <Wallet size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Wallet Address</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send stablecoins to an address</Text>
                </View>
              </TouchableOpacity>

              {/* Bank Account Option */}
              <TouchableOpacity
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setSelectedRecipientType('bank')
                  setSelectedCountryCurrency({
                    countryCode: 'US',
                    countryName: 'United States',
                    currencyCode: 'USD',
                    currencyName: 'US Dollar',
                    flagEmoji: '',
                  })
                  setNewRecipient(prev => ({ ...prev, currency: 'USD' }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }}
                activeOpacity={0.7}
              >
                <View style={styles.recipientTypeIcon}>
                  <Building2 size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Bank Account</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash to a bank account</Text>
                </View>
              </TouchableOpacity>

              {/* Mobile Wallet Option */}
              <TouchableOpacity
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  const firstMobile = getCatalogByRecipientType('mobile_money' as any)[0]
                  const firstCurrency = firstMobile?.currencyCode || 'KES'
                  const firstProvider = getRecipientProviders(firstCurrency, 'mobile_money')[0] || ''
                  setSelectedRecipientType('mobile')
                  setSelectedCountryCurrency({
                    countryCode: firstMobile?.countryCode || 'KE',
                    countryName: firstMobile?.countryName || 'Kenya',
                    currencyCode: firstCurrency,
                    currencyName: firstMobile?.currencyName || 'Kenyan Shilling',
                    flagEmoji: '',
                  })
                  setNewRecipient(prev => ({ ...prev, currency: firstCurrency, provider: firstProvider }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true) // Use same form for now
                }}
                activeOpacity={0.7}
              >
                <View style={styles.recipientTypeIcon}>
                  <Smartphone size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Mobile Money</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash via mobile money</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Step 2: Bank Account Form Modal */}
      <Modal
        visible={showBankAccountForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowBankAccountForm(false)
          resetForm()
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowBankAccountForm(false)
              resetForm()
            }}
          />
          <View 
            style={[styles.modalContainer, { 
              height: '92%',
              paddingBottom: Math.max(insets.bottom, 20),
            }]} 
            onStartShouldSetResponder={() => true}
            onResponderGrant={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRecipientType === 'wallet' ? 'Add Wallet Address' : selectedRecipientType === 'mobile' ? 'Add Mobile Money' : 'Add Bank Account'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowBankAccountForm(false)
                  resetForm()
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalContent}>
              {isAnyDropdownOpen && <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={closeAllDropdowns} />}
              
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              
            {/* Country/Currency Selector - Matching RecipientsScreen */}
            {selectedRecipientType !== 'wallet' && <View style={[styles.currencySelectorWrapper, showCurrencyDropdown && styles.currencySelectorWrapperActive]}>
              <TouchableOpacity
                style={styles.currencySelector}
                onPress={() => {
                  setShowCurrencyDropdown(!showCurrencyDropdown)
                  setCurrencySearchTerm('')
                }}
                activeOpacity={0.7}
              >
                <View style={styles.currencySelectorContent}>
                  {selectedCatalogEntry ? (
                    <CountryFlag code={selectedCatalogEntry.countryCode} size={22} style={styles.currencyFlag} />
                  ) : (
                    <CurrencyFlag currency={newRecipient.currency} size={22} style={styles.currencyFlag} />
                  )}
                  <Text style={styles.currencySelectorText}>
                    {selectedCatalogEntry ? `${newRecipient.currency} - ${selectedCatalogEntry.countryName}` : 'Select currency'}
                  </Text>
                  <Ionicons 
                    name={showCurrencyDropdown ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color="#6b7280" 
                  />
                </View>
              </TouchableOpacity>
              
              {showCurrencyDropdown && (
                <View style={styles.currencyDropdown}>
                  <View style={styles.currencyDropdownSearch}>
                    <Ionicons name="search" size={18} color={colors.neutral[400]} />
                    <TextInput
                      style={styles.currencyDropdownSearchInput}
                      placeholder="Search currencies..."
                      placeholderTextColor={colors.neutral[400]}
                      value={currencySearchTerm}
                      onChangeText={setCurrencySearchTerm}
                    />
                  </View>
                  <ScrollView 
                    style={styles.currencyDropdownList}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredCurrencies.map((item) => {
                      const isSelected =
                        newRecipient.currency === item.currencyCode &&
                        selectedCountryCurrency?.countryCode === item.countryCode

                      return (
                      <TouchableOpacity
                        key={`${item.countryCode}-${item.currencyCode}`}
                        style={[
                          styles.currencyDropdownItem,
                          isSelected && styles.currencyDropdownItemSelected
                        ]}
                        onPress={async () => {
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setSelectedCountryCurrency({
                            countryCode: item.countryCode,
                            countryName: item.countryName,
                            currencyCode: item.currencyCode,
                            currencyName: item.currencyName,
                            flagEmoji: '',
                          })
                              setTransferType(null)
                          const firstProvider = getRecipientProviders(item.currencyCode, 'mobile_money')[0] || ''
                          setNewRecipient(prev => ({
                            ...prev,
                            currency: item.currencyCode,
                            provider: selectedRecipientType === 'mobile' ? firstProvider : prev.provider,
                          }))
                          setShowCurrencyDropdown(false)
                          setCurrencySearchTerm('')
                        }}
                      >
                        <CountryFlag code={item.countryCode} size={22} style={styles.currencyFlag} />
                        <View style={styles.currencyInfo}>
                          <Text style={styles.currencyCode}>{item.currencyCode}</Text>
                          <Text style={styles.currencyName}>{item.countryName}</Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color={colors.primary.main} />
                        )}
                      </TouchableOpacity>
                    )})}
                  </ScrollView>
                </View>
              )}
            </View>}

              {selectedRecipientType === 'mobile' && (
                <>
                  <View style={[styles.currencySelectorWrapper, showProviderDropdown && styles.currencySelectorWrapperActive]}>
                    <TouchableOpacity
                      style={styles.currencySelector}
                      onPress={() => {
                        setShowProviderDropdown(!showProviderDropdown)
                        setShowCurrencyDropdown(false)
                        setShowWalletAssetDropdown(false)
                        setShowWalletNetworkDropdown(false)
                      }}
                      activeOpacity={0.7}
                      disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.provider || 'Select provider'}
                        </Text>
                        <Ionicons name={showProviderDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6b7280" />
            </View>
                    </TouchableOpacity>
                    {showProviderDropdown && (
                      <View style={styles.currencyDropdown}>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search providers..."
                            placeholderTextColor={colors.neutral[400]}
                            value={providerSearchTerm}
                            onChangeText={setProviderSearchTerm}
                          />
                        </View>
                        <ScrollView style={styles.currencyDropdownList} nestedScrollEnabled={true}>
                          {getRecipientProviders(newRecipient.currency, 'mobile_money')
                            .filter((provider) => provider.toLowerCase().includes(providerSearchTerm.toLowerCase()))
                            .map((provider) => (
                            <TouchableOpacity
                              key={provider}
                              style={[styles.currencyDropdownItem, newRecipient.provider === provider && styles.currencyDropdownItemSelected]}
                              onPress={async () => {
                                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                setNewRecipient(prev => ({ ...prev, provider }))
                                setShowProviderDropdown(false)
                                setProviderSearchTerm('')
                              }}
                            >
                              <View style={styles.currencyInfo}>
                                <Text style={styles.currencyCode}>{provider}</Text>
                              </View>
                              {newRecipient.provider === provider && <Ionicons name="checkmark" size={18} color={colors.primary.main} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.fullName}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                    placeholder="Account name"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.phoneNumber}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, phoneNumber: text }))}
                    placeholder="Phone number"
                    placeholderTextColor={colors.text.secondary}
                    keyboardType="phone-pad"
                    editable={!isSubmitting}
                  />
                </>
              )}

              {selectedRecipientType === 'wallet' && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.fullName}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                    placeholder="Address nickname"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                  <View style={[styles.currencySelectorWrapper, showWalletAssetDropdown && styles.currencySelectorWrapperActive]}>
                    <TouchableOpacity
                      style={styles.currencySelector}
                      onPress={() => {
                        setShowWalletAssetDropdown(!showWalletAssetDropdown)
                        setShowWalletNetworkDropdown(false)
                      }}
                      activeOpacity={0.7}
                      disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        {getTokenIconUrl(newRecipient.currency) ? <Image source={{ uri: getTokenIconUrl(newRecipient.currency)! }} style={styles.cryptoIcon} /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.currency || 'Select asset'}
                        </Text>
                        <Ionicons
                          name={showWalletAssetDropdown ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#6b7280"
                        />
                      </View>
                    </TouchableOpacity>
                    {showWalletAssetDropdown && (
                      <View style={styles.currencyDropdown}>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search asset..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletAssetSearchTerm}
                            onChangeText={setWalletAssetSearchTerm}
                          />
                        </View>
                        <ScrollView style={styles.currencyDropdownList} nestedScrollEnabled={true}>
                          {getWalletAssets()
                            .filter((asset) => asset.toLowerCase().includes(walletAssetSearchTerm.toLowerCase()))
                            .map((asset) => (
                            <TouchableOpacity
                              key={asset}
                              style={[styles.currencyDropdownItem, newRecipient.currency === asset && styles.currencyDropdownItemSelected]}
                              onPress={async () => {
                                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                const networks = getWalletNetworksForAsset(asset)
                                setNewRecipient(prev => ({
                                  ...prev,
                                  currency: asset,
                                  network: networks[0] || '',
                                }))
                                setShowWalletAssetDropdown(false)
                                setWalletAssetSearchTerm('')
                              }}
                            >
                              {getTokenIconUrl(asset) ? <Image source={{ uri: getTokenIconUrl(asset)! }} style={styles.cryptoIcon} /> : null}
                              <View style={styles.currencyInfo}>
                                <Text style={styles.currencyCode}>{asset}</Text>
                              </View>
                              {newRecipient.currency === asset && <Ionicons name="checkmark" size={18} color={colors.primary.main} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <View style={[styles.currencySelectorWrapper, showWalletNetworkDropdown && styles.currencySelectorWrapperActive]}>
                    <TouchableOpacity
                      style={styles.currencySelector}
                      onPress={() => {
                        if (!isSubmitting) {
                          setShowWalletNetworkDropdown(!showWalletNetworkDropdown)
                          setShowWalletAssetDropdown(false)
                        }
                      }}
                      activeOpacity={0.7}
                      disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        {getNetworkIconUrl(newRecipient.network) ? <Image source={{ uri: getNetworkIconUrl(newRecipient.network)! }} style={styles.cryptoIcon} /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.network || 'Select network'}
                        </Text>
                        <Ionicons
                          name={showWalletNetworkDropdown ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#6b7280"
                        />
                      </View>
                    </TouchableOpacity>
                    {showWalletNetworkDropdown && (
                      <View style={styles.currencyDropdown}>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search network..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletNetworkSearchTerm}
                            onChangeText={setWalletNetworkSearchTerm}
                          />
                        </View>
                        <ScrollView style={styles.currencyDropdownList} nestedScrollEnabled={true}>
                          {getWalletNetworksForAsset(newRecipient.currency)
                            .filter((network) => network.toLowerCase().includes(walletNetworkSearchTerm.toLowerCase()))
                            .map((network) => (
                            <TouchableOpacity
                              key={network}
                              style={[styles.currencyDropdownItem, newRecipient.network === network && styles.currencyDropdownItemSelected]}
                              onPress={async () => {
                                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                setNewRecipient(prev => ({ ...prev, network }))
                                setShowWalletNetworkDropdown(false)
                                setWalletNetworkSearchTerm('')
                              }}
                            >
                              {getNetworkIconUrl(network) ? <Image source={{ uri: getNetworkIconUrl(network)! }} style={styles.cryptoIcon} /> : null}
                              <View style={styles.currencyInfo}>
                                <Text style={styles.currencyCode}>{network}</Text>
                              </View>
                              {newRecipient.network === network && <Ionicons name="checkmark" size={18} color={colors.primary.main} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <View style={styles.walletAddressInputWrap}>
                    <TextInput
                      style={[styles.modalInput, styles.walletAddressInput]}
                      value={newRecipient.walletAddress}
                      onChangeText={(text) => setNewRecipient(prev => ({ ...prev, walletAddress: text }))}
                      placeholder="Wallet Address"
                      placeholderTextColor={colors.text.secondary}
                      editable={!isSubmitting}
                    />
                    <TouchableOpacity style={styles.walletScanIconButton} onPress={handleScanPress} activeOpacity={0.7}>
                      <Ionicons name="scan-outline" size={18} color={colors.primary.main} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.memoTag}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, memoTag: text }))}
                    placeholder="Memo / Tag (optional)"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                </>
              )}

              {selectedRecipientType === 'bank' && (() => {
                const accountConfig = newRecipient.currency
                  ? getAccountTypeConfigFromCurrency(newRecipient.currency)
                  : null

                if (!accountConfig) {
                  return (
                    <View style={styles.infoBox}>
                      <Text style={styles.infoText}>Please select a currency first to see the required fields</Text>
                    </View>
                  )
                }

                return (
                  <>
                    {/* Transfer Type Selection - First field for US accounts */}
                    {accountConfig.accountType === "us" && (
                      <View style={styles.transferTypeContainer}>
                        <View style={styles.transferTypeOptions}>
                          <TouchableOpacity
                            style={[styles.transferTypeOption, transferType === 'ACH' && styles.transferTypeOptionSelected]}
                            onPress={() => {
                              setTransferType('ACH')
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.transferTypeOptionText, transferType === 'ACH' && styles.transferTypeOptionTextSelected]}>
                              ACH
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.transferTypeOption, transferType === 'Wire' && styles.transferTypeOptionSelected]}
                            onPress={() => {
                              setTransferType('Wire')
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.transferTypeOptionText, transferType === 'Wire' && styles.transferTypeOptionTextSelected]}>
                              Wire
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Account Name */}
                    <View>
                      <TextInput
                        style={styles.modalInput}
                        value={newRecipient.fullName}
                        onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                        placeholder="Account name"
                        placeholderTextColor={colors.text.secondary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        editable={!isSubmitting}
                      />
                    </View>

                    {/* Bank Name - Always required */}
                    <View>
                      <TextInput
                        style={styles.modalInput}
                        value={newRecipient.bankName}
                        onChangeText={(text) => setNewRecipient(prev => ({ ...prev, bankName: text }))}
                        placeholder={`${accountConfig.fieldLabels.bank_name} *`}
                        placeholderTextColor={colors.text.secondary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        editable={!isSubmitting}
                      />
                    </View>

                    {/* US Account Fields */}
                    {accountConfig.accountType === "us" && (
                      <>
                        <View style={styles.transferTypeContainer}>
                          <View style={styles.transferTypeOptions}>
                            <TouchableOpacity
                              style={[styles.transferTypeOption, newRecipient.checkingOrSavings === 'checking' && styles.transferTypeOptionSelected]}
                              onPress={() => {
                                setNewRecipient(prev => ({ ...prev, checkingOrSavings: 'checking' }))
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.transferTypeOptionText, newRecipient.checkingOrSavings === 'checking' && styles.transferTypeOptionTextSelected]}>
                                Checking
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.transferTypeOption, newRecipient.checkingOrSavings === 'savings' && styles.transferTypeOptionSelected]}
                              onPress={() => {
                                setNewRecipient(prev => ({ ...prev, checkingOrSavings: 'savings' }))
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.transferTypeOptionText, newRecipient.checkingOrSavings === 'savings' && styles.transferTypeOptionTextSelected]}>
                                Savings
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.addressLine1}
                            onChangeText={(text) => setNewRecipient(prev => ({ ...prev, addressLine1: text }))}
                            placeholder="Address *"
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="words"
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.routingNumber}
                            onChangeText={(text) => {
                              const formatted = formatRoutingNumber(text)
                              setNewRecipient(prev => ({ ...prev, routingNumber: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.routing_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            maxLength={9}
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.accountNumber}
                            onChangeText={(text) => {
                              const formatted = formatAccountNumber(text)
                              setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.account_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                        </View>
                      </>
                    )}

                    {/* UK Account Fields */}
                    {accountConfig.accountType === "uk" && (
                      <>
                        <View style={styles.twoColumnRow}>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={styles.modalInput}
                              value={newRecipient.sortCode}
                              onChangeText={(text) => {
                                const formatted = formatSortCode(text)
                                setNewRecipient(prev => ({ ...prev, sortCode: formatted }))
                              }}
                              placeholder={`${accountConfig.fieldLabels.sort_code} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              maxLength={8}
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                          </View>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={styles.modalInput}
                              value={newRecipient.accountNumber}
                              onChangeText={(text) => {
                                const formatted = formatAccountNumber(text)
                                setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                              }}
                              placeholder={`${accountConfig.fieldLabels.account_number} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                          </View>
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                            }}
                            placeholder={accountConfig.fieldLabels.iban}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                        <TextInput
                          style={styles.modalInput}
                          value={newRecipient.swiftBic}
                          onChangeText={(text) => setNewRecipient(prev => ({ ...prev, swiftBic: text.toUpperCase() }))}
                          placeholder={accountConfig.fieldLabels.swift_bic}
                          placeholderTextColor={colors.text.secondary}
                          autoCapitalize="characters"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                          editable={!isSubmitting}
                        />
                      </>
                    )}

                    {/* EURO Account Fields */}
                    {accountConfig.accountType === "euro" && (
                      <>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.iban} *`}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.swiftBic}
                            onChangeText={(text) => setNewRecipient(prev => ({ ...prev, swiftBic: text.toUpperCase() }))}
                            placeholder={accountConfig.fieldLabels.swift_bic}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                      </>
                    )}

                    {/* Generic Account Fields */}
                    {accountConfig.accountType === "generic" && (
                      <View>
                        <TextInput
                          style={styles.modalInput}
                          value={newRecipient.accountNumber}
                          onChangeText={(text) => {
                            const formatted = formatAccountNumber(text)
                            setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                          }}
                          placeholder={`${accountConfig.fieldLabels.account_number} *`}
                          placeholderTextColor={colors.text.secondary}
                          keyboardType="number-pad"
                          autoComplete="off"
                          autoCorrect={false}
                          textContentType="none"
                          editable={!isSubmitting}
                        />
                      </View>
                    )}
                  </>
                )
              })()}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowBankAccountForm(false)
                    setError('')
                    resetForm()
                  }}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton, (isSubmitting || !isFormValid()) && styles.disabledButton]}
                  onPress={handleAddRecipient}
                  disabled={isSubmitting || !isFormValid()}
                >
                  <Text style={styles.saveButtonText}>
                    {isSubmitting ? 'Adding...' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
              </View>
            </ScrollView>
            {showScanModal && (
              <View style={styles.scanOverlay}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    const address = extractWalletAddress(data)
                    if (!address) return
                    setNewRecipient(prev => ({ ...prev, walletAddress: address }))
                    setShowScanModal(false)
                  }}
                />
                <View style={styles.scanUiLayer}>
                  <View style={styles.scanHeaderRow}>
                    <Text style={styles.scanTitle}>Scan wallet address</Text>
                    <TouchableOpacity style={styles.scanCloseButton} onPress={() => setShowScanModal(false)}>
                      <Ionicons name="close" size={22} color={colors.text.inverse} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.scanCenterGroup}>
                    <View style={styles.scanFrame} />
                    <Text style={styles.scanHint}>Align QR code inside the frame</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
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
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  searchInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Regular',
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: 0.5,
    borderTopColor: colors.frame.border,
    ...shadows.md,
  },
  addRecipientButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRecipientButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  recipientsContainer: {
    paddingHorizontal: spacing[5],
  },
  recipientItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  recipientItemSelected: {
    borderWidth: 2,
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main + '05',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    overflow: 'visible',
    marginRight: spacing[3],
  },
  recipientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipientAvatarSelected: {
    backgroundColor: colors.primary.main,
  },
  recipientAvatarText: {
    ...textStyles.titleMedium,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '700',
  },
  recipientAvatarTextSelected: {
    color: colors.text.inverse,
  },
  avatarFlagBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
  flagContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  flagImage: {
    width: 20,
    height: 20,
  },
  recipientInfo: {
    flex: 1,
    marginRight: spacing[2],
  },
  recipientName: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: 2,
  },
  recipientBank: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  recipientAccount: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    fontFamily: 'Outfit-Regular',
    marginTop: 2,
  },
  recipientCurrency: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
    marginTop: 2,
  },
  recipientActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.light,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.xl,
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  emptyTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: spacing[2],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollView: {
    flex: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: spacing[8],
    flexGrow: 1,
  },
  modalContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    position: 'relative',
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing[4],
    backgroundColor: '#F9F9F9',
    fontFamily: 'Outfit-Regular',
    fontSize: 13,
    minHeight: 48,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  modalButton: {
    flex: 1,
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F9F9F9',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  saveButton: {
    backgroundColor: colors.primary.main,
  },
  cancelButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  saveButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  walletAddressInputWrap: {
    marginBottom: spacing[4],
    position: 'relative',
  },
  walletAddressInput: {
    marginBottom: 0,
    paddingRight: 44,
  },
  walletScanIconButton: {
    position: 'absolute',
    right: spacing[3],
    top: '50%',
    transform: [{ translateY: -16 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    zIndex: 9000,
  },
  scanUiLayer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing[12],
    paddingHorizontal: spacing[6],
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scanCenterGroup: {
    marginTop: spacing[16],
    alignItems: 'center',
  },
  scanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  scanTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  scanCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
  scanHint: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    textAlign: 'center',
    marginTop: spacing[3],
  },
  currencySelectorWrapper: {
    marginBottom: spacing[4],
    zIndex: 1000,
  },
  currencySelectorWrapperActive: {
    zIndex: 4000,
  },
  currencySelector: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    backgroundColor: '#F9F9F9',
  },
  currencySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySelectorText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginLeft: spacing[2],
    fontFamily: 'Outfit-Regular',
  },
  currencyDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing[1],
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    maxHeight: 260,
    zIndex: 5000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  currencyDropdownSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  currencyDropdownSearchInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    paddingVertical: spacing[1],
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  currencyDropdownList: {
    maxHeight: 220,
  },
  currencyDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  currencyDropdownItemSelected: {
    backgroundColor: colors.primary.main + '10',
  },
  currencyFlag: {
    fontSize: 16,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: spacing[2],
  },
  cryptoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: spacing[2],
  },
  currencyCode: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  currencyName: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[0],
    fontFamily: 'Outfit-Regular',
  },
  currencySymbol: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  recipientTypeModal: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
  },
  recipientTypeOptions: {
    padding: spacing[5],
    gap: spacing[3],
  },
  recipientTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    gap: spacing[3],
  },
  recipientTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipientTypeContent: {
    flex: 1,
  },
  recipientTypeTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: spacing[1],
  },
  recipientTypeSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  transferTypeContainer: {
    marginBottom: spacing[2],
  },
  transferTypeOptions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  transferTypeOption: {
    flex: 1,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferTypeOptionSelected: {
    backgroundColor: colors.primary.main + '15',
    borderColor: colors.primary.main,
    borderWidth: 1.5,
  },
  transferTypeOptionText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  transferTypeOptionTextSelected: {
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
  },
  errorContainer: {
    backgroundColor: colors.error.background,
    borderColor: colors.error.light,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  infoText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  halfInput: {
    flex: 1,
    marginBottom: 0,
  },
  currencyModalSearchContainer: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyModalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[100],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  currencyModalSearchInput: {
    flex: 1,
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: spacing[3],
  },
  currencyCode: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
  },
  currencyName: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[0],
  },
  currencySymbol: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
})
