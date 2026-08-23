const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const {
  resolver: { sourceExts, assetExts }
} = config;

// On s'assure que .js est bien présent et prioritaire pour node_modules
config.resolver.sourceExts = [...new Set(['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs', ...sourceExts])];

// Ajouter .wasm à assetExts pour permettre à Metro de le servir
config.resolver.assetExts.push('wasm');

module.exports = config;
