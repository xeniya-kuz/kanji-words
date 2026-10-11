// Extends app.json. APK builds (the "preview" profile in eas.json sets APK_BUILD=1) compress the
// native libraries, so the downloaded file is much smaller. Google Play builds keep the default
// (uncompressed), which Play prefers because it splits the app per device anyway.
module.exports = ({ config }) => {
  if (process.env.APK_BUILD !== '1') return config;
  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
        ? [plugin[0], { ...plugin[1], android: { ...plugin[1].android, useLegacyPackaging: true } }]
        : plugin,
    ),
  };
};
