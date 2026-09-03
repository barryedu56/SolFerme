export default {
  expo: {
    name: "SolFerme",
    slug: "solferme",
    scheme: "solferme",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#FFF8EC"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.solferme.app",
      buildNumber: "1"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#FFF8EC",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png"
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.RECORD_AUDIO"
      ],
      package: process.env.EXPO_ANDROID_PACKAGE || "com.solferme.app"
    },
    web: {
      favicon: "./assets/favicon.png",
      name: "SolFerme — Gestion d'élevage avicole",
      shortName: "SolFerme",
      description: "Application mobile de gestion d'élevage avicole : production d'œufs, alimentation et stocks, santé du troupeau, employés, ventes et finances. Fonctionne hors-ligne. Pensée pour les éleveurs d'Afrique de l'Ouest.",
      themeColor: "#F9D760",
      lang: "fr"
    },
    plugins: [
      [
        "expo-image-picker",
        {
          "photosPermission": "L'application a besoin d'accéder à vos photos pour changer votre image de profil.",
          "cameraPermission": "L'application a besoin d'accéder à votre caméra pour prendre une photo de profil."
        }
      ],
      "expo-localization",
      [
        "expo-notifications",
        {
          "color": "#F9D760"
        }
      ]
    ],
    // Notifications distantes : renseigner EXPO_PUBLIC_EAS_PROJECT_ID après
    // `eas init` (Expo). Sans lui, seules les notifications LOCALES fonctionnent.
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined
      }
    }
  }
};
