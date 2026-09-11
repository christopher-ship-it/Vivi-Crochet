import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

interface TabRoute {
  key: string;
  name: string;
  params?: object;
}

interface TabDescriptor {
  options: {
    title?: string;
    tabBarAccessibilityLabel?: string;
  };
}

export interface PremiumTabBarProps {
  state: {
    index: number;
    routes: TabRoute[];
  };
  descriptors: Record<string, TabDescriptor>;
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented?: boolean };
    navigate: (name: string, params?: object) => void;
  };
}

type TabIconName = 'home' | 'shop' | 'learn' | 'live' | 'profile';

interface TabItem {
  routeName: string;
  label: string;
  icon: TabIconName;
}

const TAB_ITEMS: TabItem[] = [
  { routeName: 'index', label: 'Home', icon: 'home' },
  { routeName: 'shop', label: 'Shop', icon: 'shop' },
  { routeName: 'learn', label: 'Learn', icon: 'learn' },
  { routeName: 'live', label: 'Live', icon: 'live' },
  { routeName: 'profile', label: 'My VIVI', icon: 'profile' },
];

const HAIRLINE = 'rgba(34, 26, 30, 0.12)';
const STROKE = 1.9;
const ICON = 26;

const DOCK_HEIGHT = 62;
const DOCK_TOP_GAP = 8;
const DOCK_MIN_BOTTOM = 12;

/**
 * The dock floats above the screen, so scrollable content has to reserve this
 * much room at the bottom to avoid finishing underneath it.
 */
export function useTabDockClearance() {
  const insets = useSafeAreaInsets();
  return DOCK_HEIGHT + DOCK_TOP_GAP + Math.max(insets.bottom, DOCK_MIN_BOTTOM);
}

interface IconProps {
  name: TabIconName;
  color: string;
  filled: boolean;
}

function TabIcon({ name, color, filled }: IconProps) {
  // Filled glyphs read as the active state, matching Instagram's tab bar.
  const fill = filled ? color : 'transparent';
  const knockout = filled ? colors.white : color;

  switch (name) {
    case 'home':
      return (
        <View style={iconStyles.box}>
          <View
            style={[
              iconStyles.homeRoof,
              { borderBottomColor: color, borderLeftWidth: ICON * 0.42, borderRightWidth: ICON * 0.42, borderBottomWidth: ICON * 0.32 },
            ]}
          />
          <View
            style={[
              iconStyles.homeBody,
              {
                borderColor: color,
                backgroundColor: fill,
                width: ICON * 0.66,
                height: ICON * 0.42,
              },
            ]}
          >
            <View style={[iconStyles.homeDoor, { backgroundColor: knockout }]} />
          </View>
        </View>
      );

    case 'shop':
      return (
        <View style={iconStyles.box}>
          <View
            style={[
              iconStyles.bagHandle,
              { borderColor: color, width: ICON * 0.42, height: ICON * 0.2 },
            ]}
          />
          <View
            style={[
              iconStyles.bagBody,
              {
                borderColor: color,
                backgroundColor: fill,
                width: ICON * 0.74,
                height: ICON * 0.58,
              },
            ]}
          />
        </View>
      );

    case 'learn':
      return (
        <View
          style={[
            iconStyles.reel,
            {
              borderColor: color,
              backgroundColor: fill,
              width: ICON * 0.84,
              height: ICON * 0.84,
            },
          ]}
        >
          <View style={[iconStyles.playTri, { borderLeftColor: knockout }]} />
        </View>
      );

    case 'live':
      return (
        <View
          style={[
            iconStyles.liveRing,
            {
              borderColor: color,
              backgroundColor: fill,
              width: ICON * 0.84,
              height: ICON * 0.84,
            },
          ]}
        >
          <View style={[iconStyles.liveDot, { backgroundColor: knockout }]} />
        </View>
      );

    case 'profile':
      return (
        <View
          style={[
            iconStyles.avatar,
            {
              borderColor: color,
              backgroundColor: fill,
              width: ICON * 0.86,
              height: ICON * 0.86,
            },
          ]}
        >
          <View style={[iconStyles.avatarHead, { borderColor: knockout, backgroundColor: fill }]} />
          <View style={[iconStyles.avatarBody, { borderColor: knockout, backgroundColor: fill }]} />
        </View>
      );
  }
}

export function PremiumTabBar({ state, descriptors, navigation }: PremiumTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, DOCK_MIN_BOTTOM) }]}>
      <View style={styles.dock}>
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS.find((t) => t.routeName === route.name);
          if (!item) return null;

          const focused = state.index === index;
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? item.label}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={6}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              <TabIcon name={item.icon} color={focused ? colors.pink : colors.muted} filled={focused} />
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  box: {
    width: ICON,
    height: ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  homeBody: {
    borderWidth: STROKE,
    borderTopWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  homeDoor: {
    width: 4,
    height: 6,
  },
  bagHandle: {
    borderWidth: STROKE,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginBottom: -1,
  },
  bagBody: {
    borderWidth: STROKE,
    borderRadius: 3,
  },
  reel: {
    borderWidth: STROKE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTri: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  liveRing: {
    borderWidth: STROKE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  avatar: {
    borderWidth: STROKE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  avatarHead: {
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: STROKE,
    marginBottom: 1.5,
  },
  avatarBody: {
    width: 15,
    height: 8,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderWidth: STROKE,
    borderBottomWidth: 0,
    marginBottom: -1,
  },
});

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: DOCK_TOP_GAP,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: DOCK_HEIGHT,
    paddingHorizontal: 4,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderRadius: 22,
    paddingHorizontal: 2,
  },
  tabPressed: {
    opacity: 0.55,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
    color: colors.muted,
    marginTop: 3,
    textAlign: 'center',
  },
  labelActive: {
    fontFamily: fonts.extraBold,
    color: colors.pink,
  },
});
