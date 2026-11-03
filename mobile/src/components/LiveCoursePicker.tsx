import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { liveCourseDiscount, type LiveCourse } from '../api/live';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { LIVE_PROJECT_PHOTOS } from './liveProjectPhotos';
import { AppImage } from './AppImage';

/** Pink-to-gold fill that makes the complete-course pack stand out from the single courses. */
const BUNDLE_GRADIENT = ['#ffd6e4', '#ffe9a8'] as const;

interface Props {
  courses: LiveCourse[];
  selectedId: string | null;
  onSelect: (courseId: string) => void;
}

/**
 * The Live page's course chooser: Basic, Intermediate, Advanced and the Artist pack that bundles
 * them, with one detail panel that follows the pick. Everything shown comes from the admin.
 */
export function LiveCoursePicker({ courses, selectedId, onSelect }: Props) {
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);
  const selected = courses.find((c) => c.id === selectedId) ?? null;
  const parts = courses.filter((c) => !c.isBundle);

  function hoursLabel(hours: number): string {
    if (hours === 1) return t('live.oneHourDaily');
    if (hours === 2) return t('live.twoHoursDaily');
    return t('live.hoursDaily', { count: hours });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>{t('live.pickCourse').toUpperCase()}</Text>

      <View style={styles.grid}>
        {courses.map((course) => {
          const active = course.id === selectedId;
          return (
            <Pressable
              key={course.id}
              style={[styles.option, course.isBundle && styles.optionBundle, active && styles.optionActive]}
              onPress={() => onSelect(course.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('live.courseOptionA11y', {
                name: course.name,
                price: formatInr(course.price),
              })}
            >
              {course.isBundle ? (
                <LinearGradient
                  colors={BUNDLE_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: radii.md - 1 }]}
                />
              ) : null}
              {course.isBundle ? (
                <View style={styles.optionTag}>
                  <Text style={styles.optionTagText}>
                    {liveCourseDiscount(course) != null
                      ? t('productCard.percentOff', { percent: liveCourseDiscount(course) ?? 0 })
                      : t('live.artistPack')}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.optionName, course.isBundle && styles.optionNameBundle]} numberOfLines={1}>
                {course.isBundle ? t('live.allThreeCourses') : course.name}
              </Text>
              <View style={styles.priceRow}>
                <Text style={[styles.optionPrice, course.isBundle && styles.optionPriceBundle]}>{formatInr(course.price)}</Text>
                {course.mrp != null && course.mrp > course.price ? (
                  <Text style={styles.mrp}>{formatInr(course.mrp)}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {selected.isBundle ? t('live.packIncludesTitle') : selected.name}
          </Text>
          {!selected.isBundle ? <Text style={styles.panelTagline}>{hoursLabel(selected.hoursPerDay)}</Text> : null}
          {selected.tagline && !/daily/i.test(selected.tagline) ? (
            <Text style={styles.panelTagline}>{selected.tagline}</Text>
          ) : null}
          {liveCourseDiscount(selected) != null && selected.mrp != null ? (
            <View style={[styles.priceRow, styles.panelPriceRow]}>
              <Text style={styles.panelPrice}>{formatInr(selected.price)}</Text>
              <Text style={styles.mrp}>{formatInr(selected.mrp)}</Text>
              <View style={styles.offPill}>
                <Text style={styles.offPillText}>
                  {t('productCard.percentOff', { percent: liveCourseDiscount(selected) ?? 0 })}
                </Text>
              </View>
            </View>
          ) : null}

          {selected.isBundle ? (
            <>
              {parts.map((course, index) => (
                <View key={course.id} style={[styles.partRow, index > 0 && styles.partRowBorder]}>
                  <View style={styles.partCopy}>
                    <Text style={styles.partName}>
                      {index + 1}. {course.name}
                    </Text>
                    <Text style={styles.partMeta}>
                      {t('live.courseDays', { count: course.durationDays })} · {hoursLabel(course.hoursPerDay)}
                    </Text>
                  </View>
                  <Text style={styles.partPrice}>{formatInr(course.price)}</Text>
                </View>
              ))}
              <Text style={styles.note}>
                {t('live.packSummary', { days: selected.durationDays })} {t('live.withoutMaterial')}
              </Text>
            </>
          ) : null}

          {selected.learn.length > 0 ? (
            <>
              <Text style={styles.panelHeading}>{t('live.whatYouLearn')}</Text>
              {selected.learn.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </>
          ) : null}

          {selected.projects.length > 0 ? (
            <>
              <Text style={styles.panelHeading}>{t('live.projectsYouMake')}</Text>
              <View style={styles.projects}>
                {selected.projects.map((project) => (
                  <View key={project.name} style={styles.project}>
                    <View style={styles.projectPhoto}>
                      {project.imageUrl ? (
                        <AppImage
                          uri={project.imageUrl}
                          style={styles.projectImage}
                          contentFit="cover"
                          accessibilityLabel={project.name}
                        />
                      ) : LIVE_PROJECT_PHOTOS[project.name] ? (
                        <Image
                          source={LIVE_PROJECT_PHOTOS[project.name]}
                          style={styles.projectImage}
                          resizeMode="cover"
                          accessibilityLabel={project.name}
                        />
                      ) : (
                        <Ionicons name="images-outline" size={20} color={colors.pink} />
                      )}
                    </View>
                    <Text style={styles.projectName} numberOfLines={2}>
                      {project.name}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {selected.isBundle ? (
            <View style={styles.certificate}>
              <Text style={styles.certificateText}>{t('live.certificateLine')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    sectionLabel: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 1.6,
      color: colors.pink,
      marginBottom: 8,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    option: {
      flexGrow: 1,
      flexBasis: '47%',
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    optionBundle: {
      borderColor: '#f5cd68',
    },
    optionNameBundle: {
      color: colors.pinkDark,
    },
    optionPriceBundle: {
      fontSize: 16,
      color: colors.ink,
    },
    optionActive: {
      borderWidth: 2,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderColor: colors.pink,
      backgroundColor: colors.pinkSoft,
    },
    optionTag: {
      position: 'absolute',
      top: -9,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#f5cd68',
    },
    optionTagText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      color: colors.ink,
    },
    optionName: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
    },
    optionPrice: {
      marginTop: 1,
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.pink,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      columnGap: 8,
    },
    mrp: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    panelPriceRow: {
      marginTop: 4,
      alignItems: 'center',
    },
    panelPrice: {
      fontFamily: fonts.extraBold,
      fontSize: 18,
      color: colors.pink,
    },
    offPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.pinkDark,
    },
    offPillText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      color: colors.white,
    },
    panel: {
      marginTop: 8,
      padding: 8,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    panelTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      lineHeight: 19,
      color: colors.ink,
    },
    panelTagline: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.muted,
    },
    partRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 5,
    },
    partRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    partCopy: {
      flex: 1,
    },
    partName: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
    },
    partMeta: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
    },
    partPrice: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.pink,
    },
    note: {
      marginTop: 10,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      color: colors.muted,
    },
    certificate: {
      marginTop: 6,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.sm,
      backgroundColor: '#f5cd68',
    },
    certificateText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      lineHeight: 16,
      color: colors.ink,
    },
    panelHeading: {
      marginTop: 6,
      marginBottom: 2,
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingVertical: 0,
    },
    bullet: {
      width: 6,
      height: 6,
      marginTop: 7,
      borderRadius: 3,
      backgroundColor: colors.pink,
    },
    bulletText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.ink,
    },
    projects: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    project: {
      width: 54,
      alignItems: 'center',
    },
    projectPhoto: {
      width: 54,
      height: 34,
      borderRadius: radii.sm,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.pinkSoft,
    },
    projectImage: {
      width: '100%',
      height: '100%',
    },
    projectName: {
      marginTop: 2,
      textAlign: 'center',
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 14,
      color: colors.muted,
    },
  });
}
