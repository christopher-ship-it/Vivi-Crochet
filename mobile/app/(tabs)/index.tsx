import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listCourses } from '../../src/api/courses';
import { listProducts } from '../../src/api/products';
import { ApiClientError } from '../../src/api/client';
import { ProductAutoScrollRail } from '../../src/components/ProductAutoScrollRail';
import { LoadingView, ErrorView, EmptyView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Course, Product } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';
import { COURSE_ROW_COLORS, formatCourseMeta, formatInr } from '../../src/utils/format';
import { applyStatusBar } from '../../src/utils/statusBar';

export default function HomeScreen() {
  const router = useRouter();
  const dockClearance = useTabDockClearance();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [productRailActive, setProductRailActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setProductRailActive(true);
      applyStatusBar('dark');
      return () => {
        setProductRailActive(false);
        applyStatusBar('dark');
      };
    }, []),
  );

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const data = await listProducts();
      setProducts(data);
    } catch (err) {
      setProductsError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    setCoursesError(null);
    try {
      const data = await listCourses();
      setCourses(data.slice(0, 4));
    } catch (err) {
      setCoursesError(err instanceof ApiClientError ? err.message : 'Failed to load courses.');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadCourses();
  }, [loadProducts, loadCourses]);

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: dockClearance + 24 }}>
      <View style={styles.hero}>
        <Text style={styles.tag}>HANDMADE WITH LOVE</Text>
        <Text style={styles.headline}>
          Every loop is a{'\n'}
          <Text style={styles.headlineAccent}>choice.</Text>
        </Text>
        <View style={styles.choiceRow}>
          <Pressable onPress={() => router.push('/(tabs)/learn')} hitSlop={6}>
            <Text style={styles.choiceLabel}>Learn</Text>
          </Pressable>
          <Text style={styles.choiceDivider}>·</Text>
          <Pressable onPress={() => router.push('/(tabs)/shop')} hitSlop={6}>
            <Text style={styles.choiceLabel}>Shop</Text>
          </Pressable>
          <Text style={styles.choiceDivider}>·</Text>
          <Pressable onPress={() => router.push('/(tabs)/live')} hitSlop={6}>
            <Text style={styles.choiceLabel}>Live</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.academyHeaderWrap}>
          <View style={styles.sectionEyebrowRow}>
            <View style={styles.sectionEyebrowSpacer} />
            <Text style={styles.sectionEyebrow}>LEARN & LOOP</Text>
          </View>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionNum}>1</Text>
            <Text style={styles.sectionHeading}>Crochet Academy</Text>
            <Pressable onPress={() => router.push('/(tabs)/learn')}>
              <Text style={styles.sectionLink}>All →</Text>
            </Pressable>
          </View>
        </View>

        {coursesLoading && (
          <View style={styles.inlineState}>
            <LoadingView message="Loading courses…" />
          </View>
        )}
        {!coursesLoading && coursesError && (
          <View style={styles.inlineState}>
            <ErrorView message={coursesError} onRetry={loadCourses} />
          </View>
        )}
        {!coursesLoading && !coursesError && courses.length === 0 && (
          <View style={styles.emptyCourses}>
            <Text style={styles.emptyText}>Published courses will appear here.</Text>
          </View>
        )}
        {!coursesLoading && !coursesError && courses.map((course, i) => {
          const palette = COURSE_ROW_COLORS[i % COURSE_ROW_COLORS.length];
          return (
            <Pressable
              key={course.id}
              style={[styles.courseRow, { backgroundColor: palette.bg }]}
              onPress={() => router.push(`/course/${course.id}`)}
            >
              <View style={styles.courseRowText}>
                <Text style={[styles.courseRowName, { color: palette.ink }]}>{course.name}</Text>
                <Text style={[styles.courseRowSub, { color: palette.subInk }]}>
                  {formatCourseMeta(course)}
                </Text>
              </View>
              <Text style={[styles.courseRowPrice, { color: palette.priceInk }]}>
                {formatInr(course.price)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.shopSection}>
        <View style={styles.sectionHeaderWrap}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionNum}>2</Text>
            <Text style={styles.sectionHeading}>Shop handmade creations.</Text>
            <Pressable onPress={() => router.push('/(tabs)/shop')}>
              <Text style={styles.sectionLink}>SHOP ALL →</Text>
            </Pressable>
          </View>
        </View>

        {productsLoading && (
          <View style={styles.shopInlineState}>
            <LoadingView message="Loading products…" />
          </View>
        )}
        {!productsLoading && productsError && (
          <View style={styles.shopInlineState}>
            <ErrorView message={productsError} onRetry={loadProducts} />
          </View>
        )}
        {!productsLoading && !productsError && products.length === 0 && (
          <View style={styles.shopInlineState}>
            <EmptyView
              title="No products yet"
              message="Handmade pieces will appear here when published."
            />
          </View>
        )}
        {!productsLoading && !productsError && products.length > 0 && (
          <ProductAutoScrollRail
            products={products}
            isActive={productRailActive}
            onProductPress={(id) => router.push(`/product/${id}`)}
          />
        )}
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  hero: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.softBorder,
  },
  tag: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.pink,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 1.4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headline: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  headlineAccent: {
    color: colors.pink,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  choiceLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.pink,
  },
  choiceDivider: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  shopSection: {
    backgroundColor: colors.white,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  sectionHeaderWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  academyHeaderWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionEyebrowSpacer: {
    width: 30,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  sectionNum: {
    width: 22,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 28,
    color: colors.pink,
  },
  sectionHeading: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  section: {
    backgroundColor: colors.pinkMist,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  sectionEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.pinkDark,
  },
  sectionLink: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.pink,
  },
  shopInlineState: {
    minHeight: 72,
    overflow: 'hidden',
  },
  inlineState: {
    minHeight: 88,
    overflow: 'hidden',
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  courseRowText: {
    flex: 1,
    paddingRight: 12,
  },
  courseRowName: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  courseRowSub: {
    fontFamily: fonts.regular,
    fontSize: 10,
    marginTop: 2,
  },
  courseRowPrice: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
  },
  emptyCourses: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});