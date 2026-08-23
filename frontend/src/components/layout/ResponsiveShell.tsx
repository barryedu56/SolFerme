import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { DesktopSidebar } from './DesktopSidebar';
import { useTheme } from '../../context/ThemeContext';

interface ResponsiveShellProps {
  children: React.ReactNode;
  enabled?: boolean;
  currentRouteName?: string;
}

export const ResponsiveShell: React.FC<ResponsiveShellProps> = ({ children, enabled = true, currentRouteName }) => {
  const { isDesktopOrTablet } = useBreakpoint();
  const { theme } = useTheme();

  const shouldRenderDesktopShell = enabled && isDesktopOrTablet && Platform.OS === 'web';

  if (!shouldRenderDesktopShell) {
    return <View style={styles.mobileContainer}>{children}</View>;
  }

  return (
    <View style={[styles.desktopContainer, { backgroundColor: theme.colors.background }]}>
      <DesktopSidebar currentRouteName={currentRouteName} />
      <View style={styles.mainContent}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mobileContainer: {
    flex: 1,
  },
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  mainContent: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
});
