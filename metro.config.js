// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle SQLite databases (assets/db/kanji.db) as assets.
config.resolver.assetExts.push('db');

module.exports = config;
