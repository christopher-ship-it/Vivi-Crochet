import { Ionicons } from '@expo/vector-icons';
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
import {
  DIAL_CODE_OPTIONS,
  type DialCodeOption,
} from '../data/dialCodes';
import { colors, fonts, radii, spacing } from '../theme';

type PhoneInputFieldProps = {
  /** When true, lock prefix to +91 and 10-digit national number. */
  indiaMode: boolean;
  dialCode: string;
  onDialCodeChange: (dial: string) => void;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  onFocus?: () => void;
  /** Tighter paddings for dense address forms. */
  compact?: boolean;
};

export function PhoneInputField({
  indiaMode,
  dialCode,
  onDialCodeChange,
  value,
  onChangeText,
  error,
  label = 'Phone',
  required = true,
  disabled,
  onFocus,
  compact = false,
}: PhoneInputFieldProps) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIAL_CODE_OPTIONS;
    return DIAL_CODE_OPTIONS.filter(
      (item) =>
        item.country.toLowerCase().includes(q)
        || item.dial.includes(q.replace(/^\+/, '')),
    );
  }, [query]);

  function selectDial(option: DialCodeOption) {
    onDialCodeChange(option.dial);
    setPickerOpen(false);
    setQuery('');
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>
        {label}
        {required ? <Text style={styles.star}> *</Text> : null}
      </Text>
      <View style={[styles.row, compact && styles.rowCompact, error ? styles.rowError : null]}>
        {indiaMode ? (
          <View style={[styles.prefix, compact && styles.prefixCompact]}>
            <Text style={[styles.prefixText, compact && styles.prefixTextCompact]}>+91</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.prefixButton, compact && styles.prefixCompact]}
            onPress={() => {
              setQuery('');
              setPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Country calling code"
            disabled={disabled}
          >
            <Text style={[styles.prefixText, compact && styles.prefixTextCompact]}>
              {dialCode ? `+${dialCode}` : 'Code'}
            </Text>
            <Ionicons name="chevron-down" size={compact ? 12 : 14} color={colors.muted} />
          </Pressable>
        )}
        <TextInput
          style={[styles.input, compact && styles.inputCompact]}
          value={value}
          onChangeText={(next) =>
            onChangeText(
              indiaMode
                ? next.replace(/\D/g, '').slice(0, 10)
                : next.replace(/\D/g, '').slice(0, 15),
            )
          }
          placeholder={indiaMode ? '10-digit mobile' : 'Local phone number'}
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          maxLength={indiaMode ? 10 : 15}
          editable={!disabled}
          onFocus={onFocus}
        />
      </View>
      {error ? <Text style={[styles.error, compact && styles.errorCompact]}>{error}</Text> : null}
      {!error && !indiaMode && !compact ? (
        <Text style={styles.hint}>Select country code, then enter your local number.</Text>
      ) : null}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Country code</Text>
            <Pressable
              onPress={() => setPickerOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.dial}-${item.country}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item.dial === dialCode;
              return (
                <Pressable
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => selectDial(item)}
                >
                  <Text style={styles.optionDial}>+{item.dial}</Text>
                  <Text style={styles.optionCountry}>{item.country}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.pink} /> : null}
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
  wrap: {
    marginBottom: 12,
  },
  wrapCompact: {
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    marginBottom: 6,
  },
  labelCompact: {
    fontSize: 11,
    marginBottom: 4,
  },
  star: {
    color: colors.pink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f3f3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  rowCompact: {
    borderRadius: 10,
  },
  rowError: {
    borderColor: colors.danger,
  },
  prefix: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.softBorder,
  },
  prefixCompact: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  prefixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.softBorder,
  },
  prefixText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  prefixTextCompact: {
    fontSize: 13,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  inputCompact: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  errorCompact: {
    fontSize: 11,
    marginTop: 4,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 16,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f3f3',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  optionRowSelected: {
    backgroundColor: colors.pinkSoft,
  },
  optionDial: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    minWidth: 52,
  },
  optionCountry: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
});
