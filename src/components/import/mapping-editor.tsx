import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ColumnPicker, columnLabel } from '@/components/import/column-picker';
import { ThemedText } from '@/components/themed-text';
import { REQUIRED_ROLES, type DeckKind } from '@/core/anki/detect-columns';
import type { AnyMapping, PlanGroup } from '@/core/anki/import-plan';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Role = keyof AnyMapping;

const ROLES: Record<DeckKind, { role: Role; label: string; hint: string }[]> = {
  words: [
    { role: 'word', label: 'Word', hint: 'The word written with kanji' },
    { role: 'reading', label: 'Reading', hint: 'Hiragana or katakana' },
    { role: 'translation', label: 'Translation', hint: 'Meaning in your language' },
    { role: 'furigana', label: 'Furigana', hint: 'Ruby or 漢字[かんじ], optional' },
  ],
  kanji: [
    { role: 'kanji', label: 'Kanji', hint: 'One kanji per note' },
    { role: 'keyword', label: 'Keyword', hint: 'e.g. RTK keyword, optional' },
    { role: 'frame', label: 'Frame number', hint: 'RTK frame, optional' },
    { role: 'onyomi', label: "On'yomi", hint: 'Optional' },
    { role: 'kunyomi', label: "Kun'yomi", hint: 'Optional' },
  ],
};

type MappingEditorProps = {
  kind: DeckKind;
  group: PlanGroup;
  onChange: (mapping: AnyMapping) => void;
};

/** One row per field; tapping a row opens the column picker for it. */
export function MappingEditor({ kind, group, onChange }: MappingEditorProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState<Role | null>(null);
  const required = REQUIRED_ROLES[kind] as Role[];
  const editingRole = ROLES[kind].find((r) => r.role === editing);

  return (
    <Card>
      {ROLES[kind].map(({ role, label, hint }) => {
        const index = group.mapping[role];
        const profile = index != null ? group.profiles[index] : undefined;
        const missing = index == null && required.includes(role);
        return (
          <Pressable
            key={role}
            onPress={() => setEditing(role)}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.label}>
              <ThemedText type="smallBold">{label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {hint}
              </ThemedText>
            </View>
            <View style={styles.value}>
              {profile ? (
                <>
                  <ThemedText type="small">{columnLabel(profile)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {profile.samples.join(' · ')}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" style={{ color: missing ? theme.wrong : theme.textSecondary }}>
                  {missing ? 'Choose a column' : 'Not used'}
                </ThemedText>
              )}
            </View>
          </Pressable>
        );
      })}

      {editingRole && (
        <ColumnPicker
          title={editingRole.label}
          profiles={group.profiles}
          selected={group.mapping[editingRole.role]}
          optional={!required.includes(editingRole.role)}
          onClose={() => setEditing(null)}
          onSelect={(index) => {
            // A column can hold only one field: take it away from any other field first.
            const next: AnyMapping = { ...group.mapping };
            for (const key of Object.keys(next) as Role[]) if (next[key] === index) delete next[key];
            if (index == null) delete next[editingRole.role];
            else next[editingRole.role] = index;
            onChange(next);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  label: { flex: 1 },
  value: { flex: 1.3, alignItems: 'flex-end', justifyContent: 'center' },
});
