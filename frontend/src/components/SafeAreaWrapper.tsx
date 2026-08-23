import React, { useEffect, useState } from 'react';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { ViewStyle, StyleProp, View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Wrapper compatible qui utilise react-native-safe-area-context
 * pour remplacer le SafeAreaView déprécié de react-native core.
 * Affiche un bandeau d'avertissement quand l'appareil est hors-ligne.
 */
interface SafeAreaWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export const SafeAreaWrapper: React.FC<SafeAreaWrapperProps> = ({ children, style, edges }) => {
  const [isOffline, setIsOffline] = useState(false);

  const checkIsOffline = (state: any) => {
    if (Platform.OS === 'web') {
      return !state.isConnected;
    }
    return !(state.isConnected && state.isInternetReachable);
  };

  useEffect(() => {
    // Vérification initiale
    NetInfo.fetch().then(state => {
      setIsOffline(checkIsOffline(state));
    });
    // Écouteur de changement de connectivité
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(checkIsOffline(state));
    });
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaContextView style={[style, Platform.OS === 'web' && { flex: 1 }]} edges={edges}>
      {isOffline && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>⚠️ Mode hors-ligne — les modifications seront synchronisées au retour du réseau</Text>
        </View>
      )}
      {children}
    </SafeAreaContextView>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FF9800',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  bannerText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default SafeAreaWrapper;