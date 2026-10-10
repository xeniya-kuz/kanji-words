import { StyleSheet, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Full-screen themed container with safe-area padding, used by every tab. */
export function Screen({ style, children, ...rest }: ViewProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={[styles.safeArea, style]} {...rest}>
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
});
