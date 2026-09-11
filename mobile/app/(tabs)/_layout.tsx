import { Tabs } from 'expo-router';
import { PremiumTabBar, type PremiumTabBarProps } from '../../src/components/PremiumTabBar';
import { HeaderBackground } from '../../src/components/HeaderBackground';
import { colors, fonts } from '../../src/theme';

export default function TabLayout() {
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
        headerTintColor: colors.pink,
        headerShadowVisible: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn & Loop',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My VIVI',
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
