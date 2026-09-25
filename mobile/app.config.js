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
    version: '1.0.12',
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
        // Blush + logo so a hung JS bundle still shows branding (not a blank pink slab).
        // AnimatedSplash uses the same SPLASH_STAGE_COLOR for a seamless handoff.
        'expo-splash-screen',
        {
          backgroundColor: '#ffd0e0',
          image: './assets/vivi-splash-logo.png',
          imageWidth: 220,
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
      buildNumber: '12',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'in.vivicrochet.app',
      versionCode: 11,
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
