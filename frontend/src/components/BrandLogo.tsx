import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';

/**
 * Logo officiel SolFerme.
 *
 * L'unique fichier disponible (`assets/icon.png`) est l'icône d'application :
 * la marque (poule + œuf) sur un carré crème arrondi avec une ombre.
 * Ce composant RECADRE l'image pour n'afficher que la marque (sans le carré
 * ni l'ombre), et la présente dans un conteneur au style contrôlé.
 *
 * Dès qu'un PNG transparent de la marque seule sera fourni, il suffira de
 * remplacer `LOGO` et de passer `CROP = 1` (plus de recadrage).
 */
const LOGO = require('../../assets/icon.png');
const CROP = 1.35; // facteur de zoom : retire l'ombre / le bord du carré, garde toute la marque

type Shape = 'circle' | 'squircle' | 'square';

interface Props {
  size?: number;
  /** Forme du fond derrière la marque. */
  shape?: Shape;
  /** Couleur du fond (par défaut crème, cohérent avec l'image). */
  background?: string;
  /** Affiche le mot « SolFerme » à droite du logo. */
  withName?: boolean;
  nameColor?: string;
  nameSize?: number;
  style?: ViewStyle | ViewStyle[];
}

export const BrandLogo: React.FC<Props> = ({
  size = 64,
  shape = 'squircle',
  background = '#FFF8EC',
  withName = false,
  nameColor = '#1A1A1A',
  nameSize,
  style,
}) => {
  const radius = shape === 'circle' ? size / 2 : shape === 'squircle' ? size * 0.26 : size * 0.08;
  const inner = size * CROP;
  const offset = -(inner - size) / 2;

  const mark = (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: radius, backgroundColor: background },
      ]}
    >
      <Image
        source={LOGO}
        resizeMode="contain"
        style={{ width: inner, height: inner, marginLeft: offset, marginTop: offset }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );

  if (!withName) return <View style={style as any}>{mark}</View>;

  return (
    <View style={[styles.row, style as any]}>
      {mark}
      <Text
        style={[
          styles.name,
          { color: nameColor, fontSize: nameSize ?? Math.round(size * 0.52), marginLeft: size * 0.28 },
        ]}
      >
        SolFerme
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  mark: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontWeight: '800', letterSpacing: 0.3 },
});
