// Must be first: native splash failsafe before PostHog / AppNavigator evaluate.
import './src/lib/splashBoot';
import './src/lib/coldStartMetrics';
import './src/lib/backgroundTasks';
import { installStaleWebBundleReload } from './src/lib/reloadStaleWebBundle';

installStaleWebBundleReload();
import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import { PostHogProvider } from './src/components/PostHogProvider';

function Root() {
  return React.createElement(PostHogProvider, null, React.createElement(App));
}

registerRootComponent(Root);
