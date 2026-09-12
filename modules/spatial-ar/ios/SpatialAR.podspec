Pod::Spec.new do |s|
  s.name           = 'SpatialAR'
  s.version        = '1.0.0'
  s.summary        = 'ARKit and RealityKit spatial graffiti'
  s.description    = 'Native world-tracked drawing for Spatial Graffiti'
  s.author         = 'Spatial Graffiti'
  s.homepage       = 'https://github.com/Shlok-Bhakta/spatial-graffiti'
  s.license        = 'MIT'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'ARKit', 'RealityKit', 'UIKit', 'AVFoundation'
end
