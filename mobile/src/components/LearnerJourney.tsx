import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii } from '../theme';
import type { LearnerJourneySnapshot, JourneyMilestone } from '../utils/learnerJourney';

type Props = {
  journey: LearnerJourneySnapshot;
  /**
   * `learn` = fuller card; `profile` = compact under member card;
   * `strip` = one-line "continue learning" row (Learn tab).
   */
  variant?: 'learn' | 'profile' | 'strip';
  onPressMilestone?: (courseId: string) => void;
  onPressCta?: (courseId: string | null) => void;
};

function encourageKey(journey: LearnerJourneySnapshot): TranslationKey {
  if (journey.journeyComplete) return 'journey.encourageAllDone';
  if (journey.finishedCount === 2) return 'journey.encourageMaster';
  if (journey.finishedCount === 1) return 'journey.encourageSignature';
  if (journey.inProgressCount > 0 || journey.purchasedCount > 0) {
    return 'journey.encourageKeepGoing';
  }
  return 'journey.encourageStart';
}

const RING_SIZE = 38;
const RING_STROKE = 3.5;

/**
 * Circular progress ring drawn from plain Views (two clipped half-rings), so it needs no
 * native drawing library. Progress runs clockwise from 12 o'clock.
 */
function ProgressRing({ pct }: { pct: number }) {
  const half = RING_SIZE / 2;
  const angle = Math.max(0, Math.min(100, pct)) * 3.6;
  const rightTurn = Math.min(angle, 180) - 135;
  const leftTurn = Math.max(angle - 180, 0) - 135;
  const ring = {
    position: 'absolute' as const,
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: half,
    borderWidth: RING_STROKE,
    borderColor: 'transparent',
  };
  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      {/* Track */}
      <View style={[ring, { left: 0, borderColor: colors.pinkMist }]} />
      {/* Right half: 0 to 180 degrees */}
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: RING_SIZE, overflow: 'hidden' }}>
        <View
          style={[
            ring,
            {
              left: -half,
              borderTopColor: colors.pink,
              borderRightColor: colors.pink,
              transform: [{ rotate: `${rightTurn}deg` }],
            },
          ]}
        />
      </View>
      {/* Left half: 180 to 360 degrees */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: RING_SIZE, overflow: 'hidden' }}>
        <View
          style={[
            ring,
            {
              left: 0,
              borderBottomColor: colors.pink,
              borderLeftColor: colors.pink,
              transform: [{ rotate: `${leftTurn}deg` }],
            },
          ]}
        />
      </View>
    </View>
  );
}

function statusGlyph(status: JourneyMilestone['status']): keyof typeof Ionicons.glyphMap {
  if (status === 'finished') return 'ribbon';
  if (status === 'in_progress') return 'play-circle';
  if (status === 'owned') return 'book';
  return 'lock-closed';
}

export function LearnerJourney({
  journey,
  variant = 'learn',
  onPressMilestone,
  onPressCta,
}: Props) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, variant), [language, variant]);

  const headline =
    journey.journeyComplete
      ? t('journey.titleComplete')
      : journey.purchasedCount > 0
        ? t('journey.titleActive')
        : t('journey.titleStart');

  const encourage = t(encourageKey(journey));
  const nextMilestone = journey.milestones.find((m) => m.courseId === journey.nextCourseId);
  const ctaLabel = journey.journeyComplete
    ? t('journey.ctaBrowse')
    : nextMilestone?.status === 'locked'
      ? t('journey.ctaUnlock', { name: nextMilestone.shortLabel })
      : t('journey.ctaContinue', { name: nextMilestone?.shortLabel ?? '' });

  if (variant === 'strip') {
    const pct = journey.journeyComplete
      ? 100
      : Math.max(0, Math.min(100, nextMilestone?.progressPct ?? 0));
    return (
      <Pressable
        style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
        onPress={() => onPressCta?.(journey.nextCourseId)}
        accessibilityRole="button"
        accessibilityLabel={`${t('journey.eyebrow')}. ${ctaLabel}`}
      >
        <View style={styles.ring}>
          <ProgressRing pct={pct} />
          <Text style={styles.ringPct}>{pct}%</Text>
        </View>
        <View style={styles.stripCopy}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {t('journey.eyebrow')}
          </Text>
          <Text style={styles.stripTitle} numberOfLines={1}>
            {ctaLabel}
          </Text>
        </View>
        <View style={styles.stripGo}>
          <Ionicons
            name={journey.journeyComplete ? 'arrow-forward' : 'play'}
            size={14}
            color={colors.white}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{t('journey.eyebrow')}</Text>
      <Text style={styles.title}>{headline}</Text>
      <Text style={styles.encourage}>{encourage}</Text>

      <View style={styles.track}>
        {journey.milestones.map((milestone, index) => {
          const done = milestone.status === 'finished';
          const active =
            milestone.status === 'in_progress' || milestone.status === 'owned';
          const locked = milestone.status === 'locked';
          return (
            <View key={milestone.courseId} style={styles.stepWrap}>
              {index > 0 ? (
                <View
                  style={[
                    styles.connector,
                    journey.milestones[index - 1]?.status === 'finished' && styles.connectorDone,
                  ]}
                />
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.step,
                  done && styles.stepDone,
                  active && styles.stepActive,
                  locked && styles.stepLocked,
                  pressed && !locked && styles.pressed,
                ]}
                disabled={locked && !onPressMilestone}
                onPress={() => onPressMilestone?.(milestone.courseId)}
                accessibilityRole="button"
                accessibilityLabel={`${milestone.shortLabel}, ${milestone.badgeLabel}`}
                accessibilityState={{ disabled: locked }}
              >
                <Ionicons
                  name={statusGlyph(milestone.status)}
                  size={14}
                  color={done ? colors.white : active ? colors.pink : '#b0a4a8'}
                />
              </Pressable>
              <Text
                style={[styles.stepLabel, done && styles.stepLabelDone, active && styles.stepLabelActive]}
                numberOfLines={1}
              >
                {milestone.shortLabel}
              </Text>
              {done ? (
                <Text style={styles.badgeLabel} numberOfLines={1}>
                  {milestone.badgeLabel}
                </Text>
              ) : active && milestone.progressPct > 0 ? (
                <Text style={styles.pctLabel}>{milestone.progressPct}%</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        onPress={() => onPressCta?.(journey.nextCourseId)}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.pink} />
      </Pressable>
    </View>
  );
}

function createStyles(fonts: UiFonts, variant: 'learn' | 'profile' | 'strip') {
  const compact = variant === 'profile';
  return StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.pinkMist,
      paddingVertical: 8,
      paddingLeft: 8,
      paddingRight: 10,
    },
    ring: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringPct: {
      position: 'absolute',
      fontFamily: fonts.semiBold,
      fontSize: 9,
      color: colors.pinkDark,
    },
    stripCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    stripTitle: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      lineHeight: 17,
      color: colors.ink,
    },
    stripGo: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.pink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.softBorder,
      paddingHorizontal: compact ? 12 : 14,
      paddingVertical: compact ? 10 : 12,
      gap: compact ? 4 : 6,
    },
    eyebrow: {
      fontFamily: fonts.semiBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.pink,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: compact ? 16 : 18,
      color: colors.ink,
      lineHeight: compact ? 20 : 22,
    },
    encourage: {
      fontFamily: fonts.regular,
      fontSize: compact ? 11 : 12,
      color: colors.muted,
      lineHeight: compact ? 15 : 16,
      marginBottom: 2,
    },
    track: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginTop: 2,
      marginBottom: 2,
    },
    stepWrap: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      position: 'relative',
    },
    connector: {
      position: 'absolute',
      top: 13,
      right: '50%',
      width: '100%',
      height: 1.5,
      backgroundColor: colors.softBorder,
      zIndex: 0,
    },
    connectorDone: {
      backgroundColor: colors.pinkMist,
    },
    step: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.pinkSoft,
      borderWidth: 1.5,
      borderColor: colors.pinkMist,
      zIndex: 1,
    },
    stepDone: {
      backgroundColor: colors.pink,
      borderColor: colors.pink,
    },
    stepActive: {
      backgroundColor: colors.white,
      borderColor: colors.pink,
    },
    stepLocked: {
      backgroundColor: '#f7f2f4',
      borderColor: colors.softBorder,
    },
    stepLabel: {
      fontFamily: fonts.semiBold,
      fontSize: 10,
      color: colors.muted,
      textAlign: 'center',
    },
    stepLabelDone: {
      color: colors.ink,
    },
    stepLabelActive: {
      color: colors.pinkDark,
    },
    badgeLabel: {
      fontFamily: fonts.regular,
      fontSize: 9,
      color: colors.pink,
      textAlign: 'center',
    },
    pctLabel: {
      fontFamily: fonts.regular,
      fontSize: 9,
      color: colors.muted,
      textAlign: 'center',
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingTop: compact ? 4 : 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.softBorder,
      marginTop: 2,
    },
    ctaText: {
      fontFamily: fonts.semiBold,
      fontSize: compact ? 12 : 13,
      color: colors.pink,
    },
    pressed: {
      opacity: 0.85,
    },
  });
}
