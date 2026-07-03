import ExpoModulesCore
import UIKit

internal final class ViewNotFoundException: Exception, @unchecked Sendable {
  override var reason: String {
    "No native view found for the given React tag."
  }
}

internal final class CaptureFailedException: Exception, @unchecked Sendable {
  override var reason: String {
    "Could not capture the view as a PNG."
  }
}

public class EasnerViewCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EasnerViewCapture")

    AsyncFunction("captureView") { (viewTag: Int) async throws -> String in
      guard let appContext = self.appContext else {
        throw CaptureFailedException()
      }

      return try await MainActor.run {
        guard let view = appContext.findView(withTag: viewTag, ofType: UIView.self) else {
          throw ViewNotFoundException()
        }

        let size = view.bounds.size
        if size.width < 0.1 || size.height < 0.1 {
          throw CaptureFailedException()
        }

        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 0

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { _ in
          _ = view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
        }

        guard let data = image.pngData() else {
          throw CaptureFailedException()
        }

        let filename = "easner-receipt-\(UUID().uuidString).png"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: url)
        return url.path
      }
    }
  }
}
