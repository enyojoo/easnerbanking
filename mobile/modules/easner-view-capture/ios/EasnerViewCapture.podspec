Pod::Spec.new do |s|
  s.name           = 'EasnerViewCapture'
  s.version        = '1.0.0'
  s.summary        = 'UIKit view snapshot for receipt PNG capture on iOS'
  s.description    = 'Captures a React Native view to a PNG tmpfile using UIKit drawHierarchy.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
