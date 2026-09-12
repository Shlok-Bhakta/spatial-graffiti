const { withAppDelegate, withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function allowForcedDebugBundling(script) {
  const skipped =
    'if [[ "$CONFIGURATION" = *Debug* && -z "$FORCE_BUNDLING" ]]; then\n  export SKIP_BUNDLING=1\nfi';
  const skippedEscaped =
    'if [[ \\"$CONFIGURATION\\" = *Debug* && -z \\"$FORCE_BUNDLING\\" ]]; then\\n  export SKIP_BUNDLING=1\\nfi';
  const forceRelease = `${skipped}
if [[ -n "$FORCE_BUNDLING" ]]; then
  export CONFIGURATION=Release
fi`;
  const forceReleaseEscaped = `${skippedEscaped}\\nif [[ -n \\"$FORCE_BUNDLING\\" ]]; then\\n  export CONFIGURATION=Release\\nfi`;
  return script
    .replace(
      'if [[ "$CONFIGURATION" = *Debug* ]]; then\n  export SKIP_BUNDLING=1\nfi',
      forceRelease,
    )
    .replace(
      'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export SKIP_BUNDLING=1\\nfi',
      forceReleaseEscaped,
    );
}

function withForcedDebugBundle(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase.shellScript !== 'string') {
        continue;
      }
      if (!phase.shellScript.includes('SKIP_BUNDLING=1')) {
        continue;
      }
      phase.shellScript = allowForcedDebugBundling(phase.shellScript);
    }
    return mod;
  });
}

function withEmbeddedBundleURL(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      return mod;
    }
    const next = mod.modResults.contents.replace(
      /override func bundleURL\(\) -> URL\? \{[\s\S]*?\n  \}/,
      `override func bundleURL() -> URL? {
    if let embedded = Bundle.main.url(forResource: "main", withExtension: "jsbundle") {
      return embedded
    }
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return nil
#endif
  }`,
    );
    if (next === mod.modResults.contents) {
      throw new Error('Failed to patch AppDelegate.bundleURL for embedded JS');
    }
    mod.modResults.contents = next;
    return mod;
  });
}

function withExpoModulesJsiDateAbs(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const file = path.join(
        mod.modRequest.projectRoot,
        'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift',
      );
      if (!fs.existsSync(file)) {
        throw new Error(
          'expo-modules-jsi Date.swift is missing; cannot apply the Xcode 26.3 abs() patch',
        );
      }
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('Swift.abs(milliseconds)')) {
        return mod;
      }
      if (!source.includes('abs(milliseconds)')) {
        throw new Error(
          'expo-modules-jsi Date.swift no longer calls abs(milliseconds); drop the Xcode 26.3 patch',
        );
      }
      fs.writeFileSync(
        file,
        source.replaceAll('abs(milliseconds)', 'Swift.abs(milliseconds)'),
      );
      return mod;
    },
  ]);
}

function withIosGraffiti(config) {
  config.ios = config.ios ?? {};
  config.ios.infoPlist = config.ios.infoPlist ?? {};
  delete config.ios.infoPlist.UIDesignRequiresCompatibility;
  return withEmbeddedBundleURL(withForcedDebugBundle(withExpoModulesJsiDateAbs(config)));
}

module.exports = withIosGraffiti;
module.exports.allowForcedDebugBundling = allowForcedDebugBundling;
