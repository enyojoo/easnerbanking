package expo.modules.easner.viewcapture

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EasnerViewCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EasnerViewCapture")

    AsyncFunction("setValueAsync") { value: String ->
    }
  }
}
