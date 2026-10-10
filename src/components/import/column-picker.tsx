import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { ColumnProfile } from '@/core/anki/detect-columns';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const columnLabel = (p: ColumnProfile) => `Column ${p.index + 1}${p.name ? ` · ${p.name}` : ''}`;

type ColumnPickerProps = {
  title: string;
  profiles: ColumnProfile[];
  selected?: number;
  optional: boolean;
  onSelect: (index: number | undefined) => void;
  onClose: () => void;
};

/** Full-screen list of the export's columns with sample values, to pick the column for one field. */
export function ColumnPicker({ title, profiles, selected, optional, onSelect, onClose }: ColumnPickerProps) {
  const theme = useTheme();
  const columns = profiles.filter((p) => !p.reserved && p.fill > 0);

  const option = (key: string, label: string, samples: string[], active: boolean, value: number | undefined) => (
    <Pressable
      key={key}
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {samples.map((sample, i) => (
        <ThemedText key={i} type="small" themeColor="textSecondary" numberOfLines={1}>
          {sample}
        </ThemedText>
      ))}
    </Pressable>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {optional && option('none', 'Not used', [], selected == null, undefined)}
            {columns.map((p) => option(String(p.index), columnLabel(p), p.samples, selected === p.index, p.index))}
          </ScrollView>
          <View style={styles.footer}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  title: { fontSize: 24, lineHeight: 32 },
  list: { paddingHorizontal: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.four },
  option: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  footer: { padding: Spacing.four },
});
