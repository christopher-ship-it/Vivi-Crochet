import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LegalDocument } from '../legal/documents';
import { colors, fonts, spacing } from '../theme';
import { BackButton } from './BackButton';

type Props = {
  document: LegalDocument;
};

export function LegalDocumentScreen({ document }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/profile');
      }
      return true;
    });
    return () => sub.remove();
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: document.title,
          headerBackTitle: 'Back',
          headerLeft: () => (
            <View style={{ marginLeft: 4 }}>
              <BackButton fallbackHref="/(tabs)/profile" />
            </View>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.brandTitle}>VIVI CROCHET</Text>
        <Text style={styles.docTitle}>{document.title}</Text>
        <Text style={styles.effective}>Effective Date: {document.effectiveDate}</Text>

        {document.blocks.map((block, index) => {
          const key = `${block.type}-${index}`;
          switch (block.type) {
            case 'lead':
              return (
                <Text key={key} style={[styles.paragraph, styles.lead]}>
                  {block.text}
                </Text>
              );
            case 'paragraph':
              return (
                <Text key={key} style={styles.paragraph}>
                  {block.text}
                </Text>
              );
            case 'heading':
              return (
                <Text key={key} style={styles.heading}>
                  {block.text}
                </Text>
              );
            case 'subheading':
              return (
                <Text key={key} style={styles.subheading}>
                  {block.text}
                </Text>
              );
            case 'bullets':
              return (
                <View key={key} style={styles.bullets}>
                  {block.items.map((item, itemIndex) => (
                    <View key={`${key}-${itemIndex}`} style={styles.bulletRow}>
                      <Text style={styles.bulletMark}>•</Text>
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              );
            default:
              return null;
          }
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  brandTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.pink,
    marginBottom: 4,
  },
  docTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 6,
  },
  effective: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    marginBottom: 10,
  },
  heading: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: 8,
  },
  subheading: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  bullets: {
    gap: 6,
    marginBottom: 10,
    paddingLeft: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletMark: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 21,
    color: colors.pink,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
});
