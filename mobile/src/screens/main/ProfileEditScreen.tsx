import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  FlatList,
  Animated,
  ActivityIndicator,
  Keyboard,
  Platform,
  Image,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { ArrowLeft, Calendar, Camera, CircleCheck, CircleX, Trash2 } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import {
  userService,
  personalFromUpdateProfileResult,
  fetchPersonalSettings,
  UserProfileData,
  UserStats,
} from '../../lib/userService'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, userAvatarStyles, PROFILE_EDIT_AVATAR_SIZE, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { supabase } from '../../lib/supabase'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import * as ImagePicker from 'expo-image-picker'
import { uploadProfileAvatar, PROFILE_AVATAR_MAX_BYTES } from '../../lib/profileAvatarUpload'
import { getApiBaseUrl } from '../../lib/apiClient'
import { avatarImageSource, bustAvatarUrl, normalizeAvatarUrl, warmAvatarCache } from '../../lib/avatarCache'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { EasnerAlertSheet } from '../../components/premium'

const ACCOUNT_DELETED_FLAG_KEY = '@easner_account_deleted'

function ProfileEditContent({ navigation }: NavigationProps) {
  const { user, userProfile, refreshUserProfile, applyPersonalSettingsFromServer, signOut } = useAuth()
  const insets = useSafeAreaInsets()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [noticeSheet, setNoticeSheet] = useState<{ title: string; message: string } | null>(null)
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    easetag: '',
    dateOfBirth: '',
    avatarUrl: null as string | null,
  })
  const [editProfileData, setEditProfileData] = useState(profileData)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [checkingEasetag, setCheckingEasetag] = useState(false)
  const [easetagAvailable, setEasetagAvailable] = useState<boolean | null>(null)
  const [easetagValidationError, setEasetagValidationError] = useState<string | null>(null)
  const easetagCheckSeqRef = useRef(0)
  /**
   * After save we apply `PUT /api/settings/personal` payload to local state immediately.
   * Skip the next `userProfile`→form sync so a stale context snapshot cannot overwrite names
   * before the parent re-renders with refreshed auth profile.
   */
  const skipNextProfileHydrateRef = useRef(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Initialize with existing date or default to 25 years ago
    if (userProfile?.profile?.date_of_birth) {
      return new Date(userProfile.profile.date_of_birth)
    }
    const date = new Date()
    date.setFullYear(date.getFullYear() - 25)
    return date
  })
  const editAvatarSource = avatarImageSource(editProfileData.avatarUrl)
  const profileAvatarSource = avatarImageSource(profileData.avatarUrl)

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useEffect(() => {
    if (!userProfile) return
    /**
     * While the user is editing, `refreshUserProfile()` (focus, Noah sync, etc.) must not
     * overwrite `editProfileData` or typed first/middle/last names snap back to server values.
     */
    if (isEditing) return
    if (skipNextProfileHydrateRef.current) {
      skipNextProfileHydrateRef.current = false
      return
    }

    const dob = userProfile.profile.date_of_birth || ''
    const data = {
      fullName: (userProfile.profile.full_name || '').trim(),
      email: userProfile.profile.email || '',
      phone: userProfile.profile.phone || '',
      easetag: userProfile.profile.easetag || '',
      dateOfBirth: dob,
      avatarUrl:
        typeof userProfile.profile.avatar_url === 'string' && userProfile.profile.avatar_url.trim()
          ? userProfile.profile.avatar_url.trim()
          : null,
    }
    setProfileData(data)
    setEditProfileData(data)
    if (dob) {
      setSelectedDate(new Date(dob))
    } else {
      const date = new Date()
      date.setFullYear(date.getFullYear() - 25)
      setSelectedDate(date)
    }
  }, [userProfile, isEditing])

  const handleEditProfile = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    easetagCheckSeqRef.current += 1
    setCheckingEasetag(false)
    setEditProfileData(profileData)
    setIsEditing(true)
    setEasetagAvailable(null)
    setEasetagValidationError(null)
  }

  const handleSaveProfile = async () => {
    if (!user) return

    if (!editProfileData.fullName?.trim()) {
      setNoticeSheet({ title: 'Error', message: 'Please enter your full name' })
      return
    }

    setLoading(true)
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const updateResult = await userService.updateProfile(user.id, {
        fullName: editProfileData.fullName.trim(),
        phone: editProfileData.phone,
        dateOfBirth: editProfileData.dateOfBirth,
        avatarUrl: editProfileData.avatarUrl,
      })
      /** `updateProfile` refreshes JWT after API save; keep an extra refresh before hub refetch for older binaries. */
      await supabase.auth.refreshSession().catch(() => undefined)

      const nextTag = editProfileData.easetag.replace(/^@/, '').trim().toLowerCase()
      const prevTag = (profileData.easetag || '').replace(/^@/, '').trim().toLowerCase()
      let easetagSaved = false
      if (nextTag && nextTag !== prevTag) {
        try {
          await userService.updateEasetag(nextTag)
          easetagSaved = true
        } catch (easetagErr) {
          console.error('Easetag update failed after profile save:', easetagErr)
          setNoticeSheet({
            title: 'Easetag not updated',
            message:
              easetagErr instanceof Error
                ? `${easetagErr.message}\n\nYour other profile changes were saved.`
                : 'Your other profile changes were saved, but the Easetag could not be updated.',
          })
        }
      }

      let fromServer = personalFromUpdateProfileResult(updateResult)
      if (!fromServer) {
        fromServer = await fetchPersonalSettings(user.id)
      }
      if (fromServer) {
        applyPersonalSettingsFromServer(fromServer, easetagSaved ? { easetag: editProfileData.easetag } : undefined)
      }
      const updatedProfileData = fromServer
        ? (() => {
            return {
              fullName: (fromServer.fullName || '').trim(),
              email: fromServer.email || editProfileData.email,
              phone: fromServer.phone ?? '',
              easetag: editProfileData.easetag,
              dateOfBirth: fromServer.dateOfBirth || '',
              avatarUrl: fromServer.avatarUrl,
            }
          })()
        : {
            ...editProfileData,
            dateOfBirth: editProfileData.dateOfBirth,
          }

      setProfileData(updatedProfileData)
      setEditProfileData(updatedProfileData)
      if (updatedProfileData.dateOfBirth) {
        setSelectedDate(new Date(updatedProfileData.dateOfBirth))
      }
      skipNextProfileHydrateRef.current = true

      if (refreshUserProfile) {
        await refreshUserProfile()
      }

      setIsEditing(false)
      setShowDatePicker(false)
      setEasetagAvailable(null)
      setEasetagValidationError(null)
      setNoticeSheet({ title: 'Success', message: 'Profile updated successfully' })
    } catch (error) {
      console.error('Error updating profile:', error)
      setNoticeSheet({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update profile',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEdit = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    easetagCheckSeqRef.current += 1
    setCheckingEasetag(false)
    setEditProfileData(profileData)
    setIsEditing(false)
    setShowDatePicker(false)
    setEasetagAvailable(null)
    setEasetagValidationError(null)
    if (easetagCheckTimeout.current) {
      clearTimeout(easetagCheckTimeout.current)
    }
  }

  const profilePhotoInitials = () => {
    const full = (isEditing ? editProfileData.fullName : profileData.fullName).trim()
    return initialsFromFullName(full || undefined)
  }

  const handlePickProfilePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setNoticeSheet({
        title: 'Permission needed',
        message: 'Allow photo library access to set a profile photo.',
      })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (asset.fileSize != null && asset.fileSize > PROFILE_AVATAR_MAX_BYTES) {
      setNoticeSheet({ title: 'File too large', message: 'Photo must be 2MB or smaller.' })
      return
    }
    setUploadingAvatar(true)
    try {
      const up = await uploadProfileAvatar({
        uri: asset.uri,
        name: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      })
      if ('error' in up) {
        setNoticeSheet({ title: 'Upload failed', message: up.error })
        return
      }
      const bustedUrl = bustAvatarUrl(up.url)
      setEditProfileData((prev) => ({ ...prev, avatarUrl: bustedUrl }))
      warmAvatarCache(bustedUrl)
    } finally {
      setUploadingAvatar(false)
    }
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
      if (!apiUrl) {
        if (seq === easetagCheckSeqRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }
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

  // Helper function to format date as YYYY-MM-DD using local timezone
  const formatDateToISO = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false)
      if (event.type === 'set' && date) {
        setSelectedDate(date)
        const dateString = formatDateToISO(date) // Use local timezone
        setEditProfileData(prev => ({ ...prev, dateOfBirth: dateString }))
      }
    } else {
      // iOS - update date as user scrolls
      if (date) {
        setSelectedDate(date)
      }
    }
  }

  const handleDatePickerConfirm = () => {
    // iOS only - called when user taps "Done"
    if (selectedDate) {
      const dateString = formatDateToISO(selectedDate) // Use local timezone
      setEditProfileData(prev => ({ ...prev, dateOfBirth: dateString }))
    }
    setShowDatePicker(false)
  }

  const handleDatePickerCancel = () => {
    // iOS only - restore original date if cancelled
    if (editProfileData.dateOfBirth) {
      setSelectedDate(new Date(editProfileData.dateOfBirth))
    }
    setShowDatePicker(false)
  }

  const formatDateOfBirth = (dateString: string) => {
    if (!dateString) return 'Not set'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    } catch {
      return dateString
    }
  }

  const handleDeleteAccount = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      if (!user?.id) return
      setDeleteLoading(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setShowDeleteDialog(false)
        setNoticeSheet({
          title: 'Delete account',
          message: 'Your session expired. Please sign in again.',
        })
        return
      }
      const apiUrl = getApiBaseUrl()
      const res = await fetch(`${apiUrl}/api/settings/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!res.ok) {
        let msg = 'Unable to delete account.'
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) msg = data.error
        } catch {
          // ignore
        }
        setShowDeleteDialog(false)
        setNoticeSheet({ title: 'Delete account', message: msg })
        return
      }

      setShowDeleteDialog(false)
      // Show "Account deleted" message after we return to onboarding.
      await AsyncStorage.setItem(ACCOUNT_DELETED_FLAG_KEY, '1').catch(() => undefined)
      // Ensure local state is cleared and user exits to Auth stack.
      await signOut()
    } catch (e) {
      setShowDeleteDialog(false)
      setNoticeSheet({
        title: 'Delete account',
        message: e instanceof Error ? e.message : 'Unable to delete account.',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const renderProfileField = (label: string, value: string, onChangeText: (text: string) => void, disabled: boolean = false) => {
    const isEmailField = label.trim().toLowerCase() === 'email'
    const isNameField = label === 'Full Name'
    const trimmed = (value || '').trim()
    const readOnlyText = trimmed || 'Not set'
    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabelEdit}>{label}</Text>
        {isEditing ? (
          <TextInput
            style={[styles.fieldInput, disabled && styles.fieldInputReadOnly]}
            value={value}
            onChangeText={onChangeText}
            placeholder={`Enter ${label.toLowerCase()}`}
            placeholderTextColor={colors.text.tertiary}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={!disabled}
            autoCapitalize={isEmailField ? 'none' : 'words'}
            autoCorrect={isEmailField || isNameField ? false : true}
            keyboardType={isEmailField ? 'email-address' : 'default'}
          />
        ) : (
          <View style={[styles.fieldInput, styles.fieldInputReadOnly, styles.fieldReadOnlyInner]}>
            <Text
              style={[
                styles.fieldReadOnlyText,
                styles.fieldReadOnlyTextView,
                !trimmed && styles.fieldReadOnlyPlaceholder,
              ]}
              numberOfLines={isEmailField ? 4 : 3}
            >
              {readOnlyText}
            </Text>
          </View>
        )}
      </View>
    )
  }

  const renderDateOfBirthField = () => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabelEdit}>Date of Birth</Text>
      {isEditing ? (
        <>
          <Pressable
           android_ripple={ripple.neutral}
            style={[styles.fieldInput, styles.dateInputContainer]}
            onPress={() => {
              // Initialize selectedDate with current value when opening picker
              if (editProfileData.dateOfBirth) {
                setSelectedDate(new Date(editProfileData.dateOfBirth))
              }
              setShowDatePicker(true)
            }} >
            <Text style={[
              styles.dateInputText,
              !editProfileData.dateOfBirth && { color: colors.text.tertiary }
            ]}>
              {editProfileData.dateOfBirth 
                ? formatDateOfBirth(editProfileData.dateOfBirth)
                : 'Select date of birth'}
            </Text>
            <Calendar size={18} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
          {Platform.OS === 'android' && showDatePicker ? (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
            />
          ) : null}
        </>
      ) : (
        <View style={[styles.fieldInput, styles.fieldInputReadOnly, styles.fieldReadOnlyInner]}>
          <Text
            style={[
              styles.fieldReadOnlyText,
              styles.fieldReadOnlyTextView,
              !profileData.dateOfBirth?.trim() && styles.fieldReadOnlyPlaceholder,
            ]}
            numberOfLines={2}
          >
            {profileData.dateOfBirth?.trim()
              ? formatDateOfBirth(profileData.dateOfBirth)
              : 'Not set'}
          </Text>
        </View>
      )}
    </View>
  )

  const renderEasetagField = () => {
    const easetagT = editProfileData.easetag.replace(/^@/, '').trim()
    const easetagTLen = easetagT.length

    if (!isEditing) {
      const tag = (profileData.easetag || '').replace(/^@/, '').trim()
      return (
        <View style={styles.fieldContainer}>
          <View style={styles.easetagLabelContainer}>
            <Text style={[styles.fieldLabelEdit, styles.easetagFieldLabel]}>Easetag</Text>
            <View style={styles.easetagStatusSlot} />
          </View>
          <View style={[styles.easetagInputContainer, styles.fieldInputReadOnly]}>
            <Text style={styles.easetagPrefix}>@</Text>
            <Text
              style={[
                styles.fieldReadOnlyText,
                styles.fieldReadOnlyTextView,
                styles.easetagReadOnlyValue,
                !tag && styles.fieldReadOnlyPlaceholder,
              ]}
              numberOfLines={1}
            >
              {tag || 'Not set'}
            </Text>
          </View>
          <Text style={[styles.easetagHelperText, { color: colors.text.tertiary }]}>
            People can send you money for free using your Easetag.
          </Text>
        </View>
      )
    }

    return (
      <View style={styles.fieldContainer}>
        <View style={styles.easetagLabelContainer}>
          <Text style={[styles.fieldLabelEdit, styles.easetagFieldLabel]}>Easetag</Text>
          <View style={styles.easetagStatusSlot}>
            {easetagTLen > 0 ? (
              <View style={styles.easetagStatusContainer}>
                {easetagTLen < 4 ? (
                  <Text style={[styles.easetagStatusTextInline, { color: colors.text.tertiary }]}>Min 4 characters</Text>
                ) : checkingEasetag ? (
                  <Text style={[styles.easetagStatusTextInline, { color: colors.text.tertiary }]}>Checking…</Text>
                ) : easetagValidationError ? (
                  <Text
                    style={[styles.easetagStatusTextInline, { color: colors.error.main }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {easetagValidationError}
                  </Text>
                ) : easetagAvailable === true ? (
                  <>
                    <CircleCheck size={14} color={colors.success.main} strokeWidth={2} />
                    <Text style={[styles.easetagStatusTextInline, { color: colors.success.main }]}>
                      Available
                    </Text>
                  </>
                ) : easetagAvailable === false ? (
                  <>
                    <CircleX size={14} color={colors.error.main} strokeWidth={2} />
                    <Text style={[styles.easetagStatusTextInline, { color: colors.error.main }]}>
                      Taken
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <View>
          <View style={styles.easetagInputContainer}>
            <Text style={styles.easetagPrefix}>@</Text>
            <TextInput
              style={styles.easetagInput}
              value={editProfileData.easetag}
              onChangeText={handleEasetagChange}
              placeholder="youreasetag"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              maxLength={20}
            />
          </View>
          <Text style={[styles.easetagHelperText, { color: colors.text.tertiary }]}>
            People can send you money for free using your Easetag.
          </Text>
        </View>
      </View>
    )
  }


  return (
    <ScreenWrapper>
      <KeyboardSafeContainer style={styles.container} keyboardVerticalOffset={0}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + spacing[10],
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium Header - Matching Send Flow */}
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
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.goBack()
              }}
              style={styles.backButton} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Your Profile</Text>
            </View>
          </Animated.View>

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
            <View style={styles.profileCard}>
              <View style={styles.profileTopRow}>
                <View style={styles.avatarColumn}>
                  {isEditing ? (
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.avatarEditTouchable}
                      onPress={async () => {
                        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        void handlePickProfilePhoto()
                      }}
                      disabled={uploadingAvatar || loading} accessibilityRole="button"
                      accessibilityLabel="Upload or change profile photo"
                    >
                      <View
                        style={[
                          userAvatarStyles.circle,
                          styles.profileAvatarCircle,
                          styles.avatarEditCircle,
                          !editProfileData.avatarUrl?.trim() && styles.avatarEditCircleEmpty,
                        ]}
                      >
                      {editAvatarSource ? (
                          <>
                            <Image source={editAvatarSource} style={userAvatarStyles.image} />
                            <View style={styles.avatarEditPhotoOverlay} pointerEvents="none">
                              <Camera size={22} color={colors.text.inverse} strokeWidth={2} />
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={userAvatarStyles.initials}>{profilePhotoInitials()}</Text>
                            <View style={styles.avatarEditPhotoOverlay} pointerEvents="none">
                              <Camera size={22} color={colors.text.inverse} strokeWidth={2} />
                            </View>
                          </>
                        )}
                        {uploadingAvatar ? (
                          <View style={styles.avatarUploading}>
                            <ActivityIndicator color={colors.text.inverse} size="small" />
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  ) : (
                    <View style={[userAvatarStyles.circle, styles.profileAvatarCircle]}>
                      {profileAvatarSource ? (
                        <Image
                          source={profileAvatarSource}
                          style={userAvatarStyles.image}
                        />
                      ) : (
                        <Text style={userAvatarStyles.initials}>{profilePhotoInitials()}</Text>
                      )}
                    </View>
                  )}
                  <View style={styles.avatarRemoveSlot}>
                    {isEditing && editProfileData.avatarUrl?.trim() ? (
                      <Pressable
                       android_ripple={ripple.neutral}
                        onPress={() => setEditProfileData((p) => ({ ...p, avatarUrl: null }))}
                        disabled={uploadingAvatar || loading} >
                        <Text style={styles.avatarRemoveText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <View style={styles.buttonContainer}>
                  {!isEditing ? (
                    <Pressable
                     android_ripple={ripple.neutral}
                      onPress={handleEditProfile}
                      style={styles.actionButton} >
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                       android_ripple={ripple.neutral}
                        onPress={handleCancelEdit}
                        disabled={loading} style={styles.actionButtonSecondary}
                      >
                        <Text style={styles.actionButtonTextSecondary}>Discard</Text>
                      </Pressable>
                      <Pressable
                       android_ripple={ripple.neutral}
                        onPress={handleSaveProfile}
                        disabled={loading} style={[styles.actionButton, loading && styles.actionButtonDisabled]}
                      >
                        {loading ? (
                          <ActivityIndicator size={11} color={colors.text.inverse} />
                        ) : (
                          <Text style={styles.actionButtonText}>Save</Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              <View>
                {renderProfileField(
                  'Full Name',
                  isEditing ? editProfileData.fullName : profileData.fullName,
                  (text) => setEditProfileData((prev) => ({ ...prev, fullName: text })),
                )}
                {renderProfileField(
                  'Email',
                  isEditing ? editProfileData.email : profileData.email,
                  (text) => setEditProfileData((prev) => ({ ...prev, email: text })),
                  true,
                )}
                {renderProfileField(
                  'Phone Number',
                  isEditing ? editProfileData.phone : profileData.phone,
                  (text) => setEditProfileData((prev) => ({ ...prev, phone: text })),
                )}
                {renderDateOfBirthField()}
                {renderEasetagField()}
              </View>
            </View>

            {/* Delete Account Section */}
            <View style={styles.deleteSection}>
              <Pressable
               android_ripple={ripple.destructiveTint}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setShowDeleteDialog(true)
                }}
                style={styles.deleteButton} >
                <Trash2 size={18} color={colors.error.main} strokeWidth={2.25} />
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardSafeContainer>

      <EasnerAlertSheet
        visible={showDeleteDialog}
        onDismiss={() => {
          if (!deleteLoading) setShowDeleteDialog(false)
        }}
        title="Delete Account"
        message="Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted."
        primaryLabel="Delete Account"
        onPrimary={() => void handleDeleteAccount()}
        onSecondary={() => setShowDeleteDialog(false)}
        primaryDestructive
        primaryLoading={deleteLoading}
      />

      <EasnerAlertSheet
        visible={noticeSheet !== null}
        onDismiss={() => setNoticeSheet(null)}
        title={noticeSheet?.title ?? ''}
        message={noticeSheet?.message ?? ''}
        primaryLabel="OK"
        onPrimary={() => setNoticeSheet(null)}
        singleAction
      />

      {Platform.OS === 'ios' ? (
        <Modal
          visible={showDatePicker && isEditing}
          animationType="slide"
          transparent={true}
          onRequestClose={handleDatePickerCancel}
        >
          <View style={styles.dateModalOverlay}>
            <View style={[styles.dateModalContent, { paddingBottom: insets.bottom }]}>
              <View style={styles.dateModalHeader}>
                <Pressable android_ripple={ripple.neutral} style={styles.dateCancelButton} onPress={handleDatePickerCancel}>
                  <Text style={styles.dateCancelButtonText}>Cancel</Text>
                </Pressable>
                <Text style={styles.dateModalTitle}>Select Date of Birth</Text>
                <Pressable android_ripple={ripple.neutral} style={styles.dateConfirmButtonHeader} onPress={handleDatePickerConfirm}>
                  <Text style={styles.dateConfirmButtonTextHeader}>Done</Text>
                </Pressable>
              </View>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                  minimumDate={new Date(1900, 0, 1)}
                  textColor={colors.text.primary}
                  style={styles.datePicker}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContainer: {
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
  content: {
    padding: spacing[5],
    gap: spacing[4],
  },
  /** Avatar + photo actions left, Edit / Discard+Save right; tops align with each other */
  profileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  avatarColumn: {
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 75,
    height: 32,
  },
  actionButtonSecondary: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 75,
    height: 32,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    ...textStyles.labelMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  profileCard: {
    ...surfaceFrameStyle(colors),
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  profileAvatarCircle: {
    width: PROFILE_EDIT_AVATAR_SIZE,
    height: PROFILE_EDIT_AVATAR_SIZE,
    borderRadius: PROFILE_EDIT_AVATAR_SIZE / 2,
  },
  avatarEditTouchable: {
    borderRadius: PROFILE_EDIT_AVATAR_SIZE / 2,
  },
  avatarEditCircle: {
    borderWidth: 1,
    borderColor: colors.frame.border,
  },
  avatarEditCircleEmpty: {
    borderStyle: 'dashed',
    borderColor: colors.primary.main + '66',
    backgroundColor: colors.primary.main + '0a',
  },
  /** Dim veil over photo so the camera reads as centered “tap to change” */
  avatarEditPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRemoveText: {
    ...textStyles.labelMedium,
    color: colors.error.main,
    fontWeight: '500',
  },
  /** Keeps avatar column height stable when “Remove” is hidden (view mode / no photo). */
  avatarRemoveSlot: {
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  /** Uniform space between every form group (same as phone → DOB and DOB → easetag) */
  fieldContainer: {
    marginBottom: spacing[3],
  },
  fieldLabelEdit: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    marginBottom: spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    minHeight: 48,
    ...textStyles.textInputSingleLine,
    color: colors.text.primary,
    backgroundColor: colors.background.primary,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      ios: { paddingVertical: 12 },
    }),
  },
  /** Edit: editable fields use canvas primary; read-only (email) matches view “muted” boxes */
  fieldInputReadOnly: {
    backgroundColor: colors.frame.background,
    color: colors.text.secondary,
  },
  fieldReadOnlyInner: {
    justifyContent: 'center',
  },
  fieldReadOnlyText: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: '500',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  /** View mode: same typography as values on muted field (aligned with email read-only input) */
  fieldReadOnlyTextView: {
    color: colors.text.secondary,
  },
  fieldReadOnlyPlaceholder: {
    color: colors.text.tertiary,
  },
  easetagReadOnlyValue: {
    flex: 1,
    minWidth: 0,
  },
  /** Same top margin as other field hints; separate token for Easetag edit copy */
  easetagHelperText: {
    ...textStyles.bodySmall,
    marginTop: spacing[1],
  },
  /**
   * Same rhythm as DOB: `fieldLabelEdit` uses marginBottom below the label — here the label + status
   * sit on the row bottom (flex-end) so there’s no extra air under “Easetag” inside the row.
   * Fixed height keeps status from moving the @ field; gap to the box is only easetagInput marginTop.
   */
  easetagLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 16,
    marginBottom: 0,
    gap: spacing[2],
  },
  /** Same line box as other edit labels; no extra bottom margin (spacing lives on the input). */
  easetagFieldLabel: {
    marginBottom: 0,
    flexShrink: 0,
    lineHeight: 14,
    paddingVertical: 0,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  /** Default column: alignItems = horizontal axis → flex-end pins status to the right */
  easetagStatusSlot: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    height: '100%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  easetagStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    flexWrap: 'nowrap',
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  easetagStatusTextInline: {
    ...textStyles.bodySmall,
    fontSize: 11,
    fontWeight: '500',
  },
  easetagInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    marginTop: spacing[1],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
  },
  easetagPrefix: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    fontWeight: '500',
  },
  easetagInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingRight: spacing[3],
    minHeight: 0,
    ...textStyles.textInputSingleLine,
    color: colors.text.primary,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center', paddingVertical: 0 },
      ios: { paddingVertical: 12 },
    }),
  },
  dateInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateInputText: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
    flex: 1,
  },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dateModalContent: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingTop: spacing[4],
    width: '100%',
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    borderBottomWidth: 0.5,
    borderBottomColor: colors.frame.border,
    width: '100%',
  },
  datePickerWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
  },
  datePicker: {
    width: '100%',
    height: 200,
  },
  dateModalTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontWeight: '600',
  },
  dateCancelButton: {
    padding: spacing[1],
  },
  dateCancelButtonText: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  dateConfirmButtonHeader: {
    padding: spacing[1],
  },
  dateConfirmButtonTextHeader: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontWeight: '600',
  },
  deleteSection: {
    marginTop: spacing[2],
    alignItems: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  deleteButtonText: {
    ...textStyles.bodyMedium,
    color: colors.error.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
})

export default function ProfileEditScreen(props: NavigationProps) {
  return <ProfileEditContent {...props} />
}
