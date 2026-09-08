import { StyleSheet, Text, View } from 'react-native';
import type { OrderPipelineStep } from '../types/orders';
import { colors, fonts } from '../theme';

interface OrderPipelineProps {
  steps: OrderPipelineStep[];
}

export function OrderPipeline({ steps }: OrderPipelineProps) {
  return (
    <View style={styles.root}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const dotColor = step.current ? colors.pinkDark : step.done ? colors.pink : colors.white;
        const ringColor = step.done || step.current ? colors.pink : '#e0d1d6';
        const lineColor = step.done ? colors.pink : '#eee0e4';
        const ink = step.done || step.current ? colors.ink : colors.muted;

        return (
          <View key={`${step.label}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotColor, borderColor: ringColor }]} />
              {!isLast && <View style={[styles.line, { backgroundColor: lineColor }]} />}
            </View>
            <View style={styles.content}>
              <Text style={[styles.label, { color: ink }]}>{step.label}</Text>
              <Text style={styles.when}>{step.when}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 26,
  },
  content: {
    flex: 1,
    paddingBottom: 14,
  },
  label: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
  },
  when: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
});
