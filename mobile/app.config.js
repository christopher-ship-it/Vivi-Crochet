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
    version: '1.0.9',
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
      backgroundColor: '#00000000',
      translucent: true,
    },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-video',
      'expo-secure-store',
      'expo-font',
      'expo-status-bar',
      [
        // Plain blush launch screen (no logo): the animated splash
        // (src/components/AnimatedSplash.tsx, SPLASH_STAGE_COLOR) starts on the same colour.
        // The plugin's Android theme always references @drawable/splashscreen_logo, so an image
        // is required; a fully transparent one keeps the screen plain.
        'expo-splash-screen',
        {
          backgroundColor: '#ffd0e0',
          image: './assets/splash-blank.png',
          imageWidth: 200,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon-android.png',
          color: '#e8215b',
          defaultChannel: 'default',
        },
      ],
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
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'in.vivicrochet.app',
      buildNumber: '9',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'in.vivicrochet.app',
      versionCode: 10,
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#fcf3ee',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
      permissions: ['RECEIVE_BOOT_COMPLETED', 'VIBRATE'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      apiBaseUrl,
      eas: {
        projectId: '4f86f1a4-7441-4b27-a794-d1bcc7b954da',
      },
    },
  };
};
