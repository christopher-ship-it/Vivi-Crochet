/**
 * Expo config. Cleartext HTTP is disabled unless EXPO_PUBLIC_ALLOW_HTTP=true (local dev only).
 * Production builds must set EXPO_PUBLIC_API_BASE_URL to an HTTPS API URL.
 *
 * Plain JS so EAS CLI can load this without the TypeScript CommonJS bug on newer Node.
 */
module.exports = ({ config }) => {
  const allowHttp = process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true';
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    'https://app-vivi-api-hwbmc3dzhkewa5hb.centralindia-01.azurewebsites.net';

  return {
    ...config,
    name: 'VIVI Crochet',
    slug: 'vivi-crochet',
    owner: 'chris88navi',
    scheme: 'vivi',
    version: '1.0.2',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/4f86f1a4-7441-4b27-a794-d1bcc7b954da',
    },
    androidStatusBar: {
      barStyle: 'dark-content',
      backgroundColor: '#ffffff',
      translucent: false,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'in.vivicrochet.app',
      buildNumber: '3',
    },
    android: {
      package: 'in.vivicrochet.app',
      versionCode: 3,
      adaptiveIcon: {
        backgroundColor: '#fff0f4',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-video',
      'expo-secure-store',
      'expo-font',
      'expo-status-bar',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow VIVI Crochet to use your location to fill your delivery address.',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: allowHttp,
          },
        },
      ],
    ],
    extra: {
      apiBaseUrl,
      eas: {
        projectId: '4f86f1a4-7441-4b27-a794-d1bcc7b954da',
      },
    },
  };
};
