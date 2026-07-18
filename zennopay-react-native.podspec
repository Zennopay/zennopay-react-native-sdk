require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "zennopay-react-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.authors      = { "Zennopay" => "sdk@zennopay.in" }
  # The native Zennopay pod requires iOS 16, so the bridge does too.
  s.platforms    = { :ios => "16.0" }
  s.source       = { :git => "https://github.com/Zennopay/zennopay-react-native-sdk.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"

  # The native Zennopay iOS SDK that renders the sheet + receipt and provides
  # `Zennopay.presentCheckout(...)` / `Zennopay.presentReceipt(...)`.
  s.dependency "Zennopay", "~> 0.6.0"

  # React Native / TurboModule interop — install_modules_dependencies wires up
  # both the legacy bridge and the new architecture (Fabric/TurboModules).
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
