import { registerWebModule, NativeModule } from 'expo';

// EasnerViewCaptureModule is not available on the web platform.
class EasnerViewCaptureModule extends NativeModule<{}> {}

export default registerWebModule(EasnerViewCaptureModule, 'EasnerViewCaptureModule');
