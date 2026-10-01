import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, type TranslationKey } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
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

type TabIconName = 'offers' | 'home' | 'shop' | 'learn' | 'live' | 'profile';

interface TabItem {
  routeName: string;
  labelKey: TranslationKey;
  icon: TabIconName;
}

const TAB_ITEMS: TabItem[] = [
  { routeName: 'offers', labelKey: 'tabs.offers', icon: 'offers' },
  { routeName: 'index', labelKey: 'tabs.home', icon: 'home' },
  { routeName: 'shop', labelKey: 'tabs.shop', icon: 'shop' },
  { routeName: 'learn', labelKey: 'tabs.learn', icon: 'learn' },
  { routeName: 'live', labelKey: 'tabs.live', icon: 'live' },
  { routeName: 'profile', labelKey: 'tabs.profile', icon: 'profile' },
];

const HAIRLINE = 'rgba(34, 26, 30, 0.12)';
const STROKE = 1.9;
const ICON = 22;

const DOCK_HEIGHT = 52;
const DOCK_TOP_GAP = 6;
const DOCK_MIN_BOTTOM = 8;

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
  /** Soft pulse when Offers is not selected. */
  animateOffers?: boolean;
}

const OFFER_SIZE = 34;

/**
 * Raised gradient % badge that breaks out above the dock. While Offers isn't selected it
 * pulses a halo, hops now and then and twinkles a yellow spark, so it's hard to miss.
 */
function OffersTabIcon({
  filled,
  animate,
}: {
  filled: boolean;
  animate: boolean;
}) {
  const halo = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      halo.stopAnimation();
      hop.stopAnimation();
      spark.stopAnimation();
      halo.setValue(0);
      hop.setValue(0);
      spark.setValue(0);
      return;
    }

    const haloLoop = Animated.loop(
      Animated.timing(halo, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const hopLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(hop, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 260, easing: Easing.bounce, useNativeDriver: true }),
        Animated.timing(hop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 220, easing: Easing.bounce, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    const sparkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(spark, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    haloLoop.start();
    hopLoop.start();
    sparkLoop.start();
    return () => {
      haloLoop.stop();
      hopLoop.stop();
      sparkLoop.stop();
    };
  }, [animate, halo, hop, spark]);

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });
  const lift = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const sparkScale = spark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] });

  return (
    <View style={iconStyles.box}>
      <Animated.View style={[iconStyles.offerRaised, { transform: [{ translateY: lift }] }]}>
        {animate ? (
          <Animated.View
            pointerEvents="none"
            style={[iconStyles.offerHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
        ) : null}
        <LinearGradient
          colors={filled ? [colors.pinkDark, colors.pinkDark] : ['#ff6f9b', colors.pinkDark]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={iconStyles.offerDisc}
        >
          <Text style={iconStyles.offerPercent}>%</Text>
        </LinearGradient>
        {animate ? (
          <Animated.View
            pointerEvents="none"
            style={[iconStyles.offerSpark, { opacity: spark, transform: [{ scale: sparkScale }] }]}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Label slot: swaps Offers ↔ yellow Grab now so they never stack. */
function OffersTabLabel({
  offersLabel,
  grabLabel,
  animate,
  fontFamily,
}: {
  offersLabel: string;
  grabLabel: string;
  animate: boolean;
  fontFamily: string;
}) {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }

    phase.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.timing(phase, {
          toValue: 0,
          duration: 320,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(phase, {
          toValue: 1,
          duration: 320,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, phase]);

  const offersOpacity = phase.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const grabOpacity = phase.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const grabScale = phase.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <View style={styles.offersLabelSlot}>
      <Animated.Text
        style={[
          styles.offersLabelText,
          styles.labelOffers,
          {
            fontFamily,
            opacity: offersOpacity,
            transform: [{ translateY: 2 }],
          },
        ]}
        numberOfLines={1}
      >
        {offersLabel}
      </Animated.Text>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.grabNowLabelLayer,
          {
            opacity: grabOpacity,
            transform: [{ translateY: -3 }, { scale: grabScale }],
          },
        ]}
      >
        <View style={styles.grabNowChip}>
          <Text
            style={styles.grabNowText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {grabLabel}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function TabIcon({ name, color, filled, animateOffers }: IconProps) {
  // Filled glyphs read as the active state, matching Instagram's tab bar.
  const fill = filled ? color : 'transparent';
  const knockout = filled ? colors.white : color;

  switch (name) {
    case 'offers':
      return (
        <OffersTabIcon
          filled={filled}
          animate={Boolean(animateOffers) && !filled}
        />
      );

    case 'home':
      return (
        <View style={iconStyles.box}>
          <Text style={[iconStyles.homeLogo, { color }]}>V</Text>
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
  const { t, language } = useI18n();
  const fontsUi = uiFonts(language);
  const compactLabels = language !== 'en';

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, DOCK_MIN_BOTTOM) }]}>
      <View style={styles.dock}>
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS.find((tab) => tab.routeName === route.name);
          if (!item) return null;

          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = t(item.labelKey);

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
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={6}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              {focused ? (
                <View style={styles.tabTopAccent} pointerEvents="none">
                  <View style={styles.tabTopLine} />
                  <LinearGradient
                    colors={[
                      'rgba(232, 33, 91, 0.35)',
                      'rgba(232, 33, 91, 0.12)',
                      'rgba(232, 33, 91, 0)',
                    ]}
                    locations={[0, 0.45, 1]}
                    style={styles.tabTopGlow}
                  />
                </View>
              ) : null}
              <TabIcon
                name={item.icon}
                color={
                  item.icon === 'offers'
                    ? colors.pinkDark
                    : focused
                      ? colors.pink
                      : colors.muted
                }
                filled={focused}
                animateOffers={item.icon === 'offers'}
              />
              {item.icon === 'offers' ? (
                <OffersTabLabel
                  offersLabel={label}
                  grabLabel={t('tabs.grabNow')}
                  animate={!focused}
                  fontFamily={fontsUi.extraBold}
                />
              ) : (
                <Text
                  style={[
                    styles.label,
                    {
                      fontFamily: focused
                        ? fontsUi.extraBold
                        : fontsUi.decorative,
                      fontSize: compactLabels ? 8 : 10,
                      lineHeight: compactLabels ? 10 : 12,
                    },
                    focused && styles.labelActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {label}
                </Text>
              )}
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
  homeLogo: {
    fontFamily: fonts.heading,
    fontSize: 20,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: 'center',
  },
  /** Raised % badge: sits above the dock so it reads as the call to action. */
  offerRaised: {
    width: OFFER_SIZE,
    height: OFFER_SIZE,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerDisc: {
    width: OFFER_SIZE,
    height: OFFER_SIZE,
    borderRadius: OFFER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: colors.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
  },
  offerHalo: {
    position: 'absolute',
    width: OFFER_SIZE,
    height: OFFER_SIZE,
    borderRadius: OFFER_SIZE / 2,
    backgroundColor: colors.pink,
  },
  offerSpark: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.yellow,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  offerPercent: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    lineHeight: 20,
    color: colors.white,
    includeFontPadding: false,
    textAlign: 'center',
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
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: colors.white,
    /* Two soft layers: a faint contact edge + a wide, diffused lift. */
    boxShadow: '0px 1px 2px rgba(34, 26, 30, 0.06), 0px 14px 28px -10px rgba(34, 26, 30, 0.22)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderRadius: 22,
    paddingHorizontal: 2,
  },
  tabTopAccent: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 16,
    alignItems: 'center',
  },
  tabTopLine: {
    width: '100%',
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.65,
    shadowRadius: 8,
    elevation: 5,
  },
  tabTopGlow: {
    marginTop: -1,
    width: '100%',
    height: 14,
  },
  tabPressed: {
    opacity: 0.55,
  },
  label: {
    letterSpacing: 0,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 1,
    width: '100%',
  },
  labelActive: {
    color: colors.pink,
  },
  labelOffers: {
    color: colors.pinkDark,
  },
  offersLabelSlot: {
    marginTop: 1,
    height: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Match grabNowText so Offers ↔ Grab now read at the same size. */
  offersLabelText: {
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0,
    textAlign: 'center',
    paddingHorizontal: 0,
    width: '100%',
    includeFontPadding: false,
  },
  grabNowLabelLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  grabNowChip: {
    backgroundColor: colors.yellow,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  grabNowText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0,
    textAlign: 'center',
    color: colors.ink,
    includeFontPadding: false,
  },
});
