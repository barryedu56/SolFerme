// getSentryExpoConfig = getDefaultConfig d'Expo + les réglages Sentry (Debug IDs
// pour relier les source maps aux erreurs). Sans upload de source maps c'est
// inoffensif ; ça prépare le terrain pour quand SENTRY_AUTH_TOKEN sera ajouté.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

const {
  resolver: { sourceExts, assetExts }
} = config;

// On s'assure que .js est bien présent et prioritaire pour node_modules
config.resolver.sourceExts = [...new Set(['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs', ...sourceExts])];

// Ajouter .wasm à assetExts pour permettre à Metro de le servir
config.resolver.assetExts.push('wasm');

module.exports = config;
