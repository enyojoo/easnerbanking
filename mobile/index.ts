// First import on purpose: captures the JS-start timestamp for the
// `mobile_cold_start` metric (see src/lib/coldStartMetrics.ts).
import './src/lib/coldStartMetrics';
// Native splash failsafe — must run before `App` (see splashGate.ts).
import './src/lib/splashGate';
import './src/lib/backgroundTasks';
// PostHog init: PostHogProvider → getPostHog() (native) / posthog.web.ts (web).
import { installStaleWebBundleReload } from './src/lib/reloadStaleWebBundle';

installStaleWebBundleReload();
import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import { PostHogProvider } from './src/components/PostHogProvider';

function Root() {
  return React.createElement(PostHogProvider, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
