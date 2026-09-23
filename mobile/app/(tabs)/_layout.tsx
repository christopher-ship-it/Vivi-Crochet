import { Tabs } from 'expo-router';
import { PremiumTabBar, type PremiumTabBarProps } from '../../src/components/PremiumTabBar';
import { HeaderBackground } from '../../src/components/HeaderBackground';
import { useI18n } from '../../src/i18n';
import { uiFonts } from '../../src/i18n/uiFonts';
import { colors } from '../../src/theme';

export default function TabLayout() {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);

  return (
    <Tabs
      tabBar={(props) => (
        <PremiumTabBar
          state={props.state}
          descriptors={props.descriptors}
          navigation={props.navigation as PremiumTabBarProps['navigation']}
        />
      )}
      screenOptions={{
        headerStyle: {
          backgroundColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerBackground: () => <HeaderBackground />,
        headerTitleStyle: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
        headerTitleAlign: 'center',
        headerTintColor: colors.pink,
        headerShadowVisible: false,
        tabBarShowLabel: false,
        sceneContainerStyle: { backgroundColor: 'transparent' },
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="offers"
        options={{
          title: t('tabs.offers'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tabs.shop'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: t('learn.title'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: t('tabs.live'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
