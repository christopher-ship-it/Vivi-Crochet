import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listCategories, listCourses } from '../../src/api/courses';
import { ApiClientError } from '../../src/api/client';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { CourseCard } from '../../src/components/CourseCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Category, Course } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';

export default function LearnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
    }, []),
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const cats = await listCategories();
      setCategories(cats.filter((c) => c.isActive));
      const categoryId = activeCategoryId ?? undefined;
      const data = await listCourses(categoryId);
      setCourses(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategoryId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.stateWrap, { paddingTop: insets.top }]}>
        <LoadingView message="Loading courses…" />
      </View>
    );
  }

  if (error && courses.length === 0) {
    return (
      <View style={[styles.container, styles.stateWrap, { paddingTop: insets.top }]}>
        <ErrorView message={error} onRetry={() => load()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <BrandWordmark />
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="My VIVI settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: dockClearance + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.pink} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.eyebrow}>CROCHET ACADEMY</Text>
            <Text style={styles.title}>Learn & Loop</Text>
            <Text style={styles.scriptAccent}>Made with love</Text>
            <Text style={styles.sub}>
              Video classes in your language.{'\n'}Stream on your phone. Create at your own pace.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
            >
              <Pressable
                style={[styles.tab, activeCategoryId === null && styles.tabActive]}
                onPress={() => setActiveCategoryId(null)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeCategoryId === null }}
              >
                <Text style={[styles.tabText, activeCategoryId === null && styles.tabTextActive]}>
                  All
                </Text>
              </Pressable>
              {categories.map((cat) => {
                const selected = activeCategoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.tab, selected && styles.tabActive]}
                    onPress={() => setActiveCategoryId(cat.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.tabText, selected && styles.tabTextActive]}>{cat.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
                <Pressable onPress={() => load(true)} hitSlop={8}>
                  <Text style={styles.bannerAction}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyView
            title="No courses yet"
            message="Published courses from the academy will appear here."
          />
        }
        renderItem={({ item, index }) => (
          <CourseCard
            course={item}
            index={index}
            onPress={() => router.push(`/course/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  stateWrap: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  listHeader: {
    paddingBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.8,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 46,
    paddingBottom: 4,
    color: colors.ink,
    marginTop: 6,
  },
  scriptAccent: {
    fontFamily: fonts.decorative,
    fontSize: 28,
    lineHeight: 36,
    paddingBottom: 4,
    color: colors.pink,
    marginTop: 2,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginTop: 8,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tabActive: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
  tabText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  tabTextActive: {
    color: colors.white,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  banner: {
    backgroundColor: colors.pinkSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.ink,
  },
  bannerAction: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
});
