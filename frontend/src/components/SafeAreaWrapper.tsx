import React, { useEffect, useState } from 'react';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { ViewStyle, StyleProp, View, Text, StyleSheet } from 'react-native';
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

  useEffect(() => {
    // Vérification initiale
    NetInfo.fetch().then(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    });
    // Écouteur de changement de connectivité
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    });
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaContextView style={style} edges={edges}>
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