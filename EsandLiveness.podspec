require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "EsandLiveness"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = { :type => "Proprietary", :file => "LICENSE" }
  s.authors      = package["author"]

  # Keep this aligned with the bundled framework's MinimumOSVersion and Mach-O load command.
  s.platforms    = { :ios => "9.0" }
  s.source       = { :git => "https://github.com/RD0086/react-native-liveness.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"
  s.vendored_frameworks = "ios/Frameworks/EsLivingDetection.framework"
  s.resources = "ios/Frameworks/EsLivingIcon.bundle"
  s.frameworks = "UIKit", "AVFoundation", "Accelerate", "JavaScriptCore"
  s.libraries = "z"

  install_modules_dependencies(s)
end
