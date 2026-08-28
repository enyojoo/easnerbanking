# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve line numbers for Play Console crash deobfuscation (mapping file still required)
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Easner app
-keep class com.easner.android.** { *; }

# React Native / Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# react-native-reanimated / worklets
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.swmansion.worklets.** { *; }

# react-native-gesture-handler / screens
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# Expo modules (reflection-based native modules)
-keep class * extends expo.modules.kotlin.sharedobjects.SharedObject { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep enum * implements expo.modules.kotlin.types.Enumerable { *; }
-keep,allowoptimization,allowobfuscation class * extends expo.modules.kotlin.modules.Module {
  public <init>();
  public expo.modules.kotlin.modules.ModuleDefinitionData definition();
}

# Stripe React Native (+ consumer rules from the SDK)
-keep class com.reactnativestripesdk.** { *; }
-keep class com.stripe.** { *; }
-dontwarn com.stripe.**

# Intercom
-keep class io.intercom.** { *; }
-dontwarn io.intercom.**

# Firebase / FCM (Expo push + Intercom messaging service)
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# PostHog
-keep class com.posthog.** { *; }
-dontwarn com.posthog.**

# Kotlin metadata
-keepclassmembers class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# WebView (Stripe onramp / embedded flows)
-keepclassmembers class * extends android.webkit.WebViewClient { *; }
-keepclassmembers class * extends android.webkit.WebChromeClient { *; }
