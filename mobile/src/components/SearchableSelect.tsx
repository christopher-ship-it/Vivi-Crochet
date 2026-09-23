import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme';

type Props = {
  label: string;
  value: string | null;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  searchable?: boolean;
  /** Allow typing a value that is not in the options list. */
  allowCustom?: boolean;
  /** Tighter spacing for dense registration forms. */
  compact?: boolean;
  onSelect: (value: string) => void;
};

export function SearchableSelect({
  label,
  value,
  placeholder,
  options,
  disabled = false,
  searchable = true,
  allowCustom = false,
  compact = false,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => item.toLowerCase().includes(q));
  }, [options, query]);

  const customCandidate = useMemo(() => {
    if (!allowCustom) return null;
    const q = query.trim();
    if (q.length < 2) return null;
    const exact = options.some((item) => item.toLowerCase() === q.toLowerCase());
    if (exact) return null;
    return q;
  }, [allowCustom, options, query]);

  function choose(next: string) {
    onSelect(next);
    setOpen(false);
  }

  return (
    <View style={compact ? styles.wrapCompact : undefined}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <Pressable
        style={[
          styles.trigger,
          compact && styles.triggerCompact,
          disabled && styles.triggerDisabled,
        ]}
        onPress={() => {
          if (disabled) return;
          setQuery('');
          setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={[
            styles.triggerText,
            compact && styles.triggerTextCompact,
            !value && styles.placeholder,
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 16 : 18} color={colors.muted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={[
            styles.sheet,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {searchable ? (
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={allowCustom ? 'Search or type your city' : 'Search'}
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              autoCapitalize="words"
              clearButtonMode="while-editing"
              onSubmitEditing={() => {
                if (customCandidate) choose(customCandidate);
              }}
              returnKeyType={allowCustom ? 'done' : 'search'}
            />
          ) : null}

          {customCandidate ? (
            <Pressable style={styles.customOption} onPress={() => choose(customCandidate)}>
              <Text style={styles.customOptionText}>Use “{customCandidate}”</Text>
            </Pressable>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>
                {allowCustom
                  ? 'No matches. Type your city above, then tap Use.'
                  : 'No matches. Try another search.'}
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <Pressable
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => choose(item)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={18} color={colors.pink} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapCompact: {
    marginTop: 2,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 12,
  },
  labelCompact: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  trigger: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerDisabled: {
    opacity: 0.45,
  },
  triggerText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  triggerTextCompact: {
    fontSize: 15,
  },
  placeholder: {
    color: colors.muted,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
  },
  close: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.pink,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  option: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionSelected: {
    backgroundColor: colors.pinkSoft,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  optionText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  optionTextSelected: {
    fontFamily: fonts.semiBold,
    color: colors.pink,
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  customOption: {
    borderWidth: 1,
    borderColor: colors.pink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: colors.pinkSoft,
  },
  customOptionText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.pinkDark,
  },
});
