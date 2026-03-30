import Constants from 'expo-constants'

/** True when running inside the Expo Go app (remote push & some APIs are limited / warn). */
export const isExpoGo = Constants.appOwnership === 'expo'
