import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listCategories, listCourses } from '../../src/api/courses';
import { ApiClientError } from '../../src/api/client';
import { CourseCard } from '../../src/components/CourseCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Category, Course } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';

export default function LearnScreen() {
  const router = useRouter();
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
    return <LoadingView message="Loading courses…" />;
  }

  if (error && courses.length === 0) {
    return <ErrorView message={error} onRetry={() => load()} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CROCHET ACADEMY</Text>
        <Text style={styles.title}>Learn & Loop</Text>
        <Text style={styles.sub}>Video classes in your language. Stream on your phone</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeCategoryId === null && styles.tabActive]}
          onPress={() => setActiveCategoryId(null)}
        >
          <Text style={[styles.tabText, activeCategoryId === null && styles.tabTextActive]}>All</Text>
        </Pressable>
        {categories.map((cat) => (
          <Pressable
            key={cat.id}
            style={[styles.tab, activeCategoryId === cat.id && styles.tabActive]}
            onPress={() => setActiveCategoryId(cat.id)}
          >
            <Text style={[styles.tabText, activeCategoryId === cat.id && styles.tabTextActive]}>
              {cat.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: dockClearance + 16 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.pink} />
        }
        ListHeaderComponent={
          error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => load(true)}>
                <Text style={styles.bannerAction}>Retry</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyView
            title="No courses yet"
            message="Published courses from the admin dashboard will appear here."
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
    backgroundColor: colors.cream,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2.2,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 6,
    letterSpacing: -0.4,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 19,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.softBorder,
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
    padding: spacing.md,
    paddingBottom: 32,
  },
  banner: {
    backgroundColor: colors.pinkMist,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    padding: 12,
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
