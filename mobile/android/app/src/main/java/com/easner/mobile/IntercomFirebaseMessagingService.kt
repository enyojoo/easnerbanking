package com.easner.mobile

import expo.modules.notifications.service.ExpoFirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.intercom.reactnative.IntercomModule

class IntercomFirebaseMessagingService : ExpoFirebaseMessagingService() {

    override fun onNewToken(refreshedToken: String) {
        IntercomModule.sendTokenToIntercom(application, refreshedToken)
        super.onNewToken(refreshedToken)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        if (IntercomModule.isIntercomPush(remoteMessage)) {
            IntercomModule.handleRemotePushMessage(application, remoteMessage)
        } else {
            super.onMessageReceived(remoteMessage)
        }
    }
}
