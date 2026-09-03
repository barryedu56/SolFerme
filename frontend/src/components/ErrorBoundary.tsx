import React from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
  info: string;
}

/**
 * Dernier filet : au lieu d'un crash silencieux (écran blanc / boucle de
 * fermeture) dans un build EAS, on affiche l'erreur JS à l'écran. Indispensable
 * pour diagnostiquer un plantage qui ne se produit qu'en build de production.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info: info.componentStack || '' });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: '#FFF8EC', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#B00020', marginBottom: 8 }}>
          Une erreur a interrompu l'application
        </Text>
        <Text style={{ fontSize: 13, color: '#444', marginBottom: 12 }}>
          Fais une capture de cet écran et envoie-la — ça permet de corriger.
        </Text>
        <ScrollView style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12 }}>
          <Text selectable style={{ fontSize: 12, color: '#B00020', fontWeight: '700' }}>
            {String(error?.name || 'Error')}: {String(error?.message || error)}
          </Text>
          {!!error?.stack && (
            <Text selectable style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
              {error.stack}
            </Text>
          )}
          {!!info && (
            <Text selectable style={{ fontSize: 11, color: '#888', marginTop: 10 }}>
              {info}
            </Text>
          )}
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null, info: '' })}
          style={{ backgroundColor: '#F9D760', padding: 14, borderRadius: 10, marginTop: 14, alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '800', color: '#000' }}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }
}
