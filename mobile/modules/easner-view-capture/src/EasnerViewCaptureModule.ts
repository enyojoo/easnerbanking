import { NativeModule, requireNativeModule } from 'expo'

declare class EasnerViewCaptureModule extends NativeModule {
  captureView(viewTag: number): Promise<string>
}

export default requireNativeModule<EasnerViewCaptureModule>('EasnerViewCapture')
