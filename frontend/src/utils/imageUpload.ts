import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Ajoute une image choisie via expo-image-picker à un FormData multipart.
 *
 * Sur Web, `asset.uri` est une URL `blob:` (objet mémoire du navigateur) —
 * l'ajouter telle quelle au FormData ne transmet aucune donnée binaire au
 * serveur (contrairement à React Native, `fetch`/XHR sur le Web exige un vrai
 * `Blob`/`File`). expo-image-picker expose ce fichier réel via `asset.file`
 * sur Web : c'est lui qu'il faut utiliser.
 * Sur Android/iOS, `asset.uri` est un chemin local — on garde la forme
 * `{ uri, name, type }` que le networking natif de React Native sait lire.
 */
export const appendImageToFormData = (formData: FormData, asset: ImagePickerAsset, field: string) => {
  const webFile = (asset as any).file as File | undefined;
  if (Platform.OS === 'web' && webFile) {
    formData.append(field, webFile, webFile.name || 'photo.jpg');
    return;
  }
  const filename = asset.uri.split('/').pop();
  const match = /\.(\w+)$/.exec(filename || '');
  const type = match ? `image/${match[1]}` : 'image';
  // @ts-ignore — forme spéciale React Native (uri/name/type) pour multipart natif
  formData.append(field, { uri: asset.uri, name: filename || 'photo.jpg', type });
};

/**
 * En-têtes à passer à axios pour un envoi de FormData.
 *
 * L'instance axios de l'app force `Content-Type: application/json` par
 * défaut ; il faut donc l'écraser pour un upload. Mais lui donner la valeur
 * littérale `'multipart/form-data'` (sans le paramètre `boundary`) casse le
 * découpage des champs côté serveur — Content-Type doit contenir EXACTEMENT
 * le boundary généré par le client HTTP. Passer `undefined` supprime l'en-tête
 * pour cette requête et laisse le client (fetch/XHR sur Web, le pont réseau
 * natif sur Android/iOS) le régénérer lui-même avec le bon boundary.
 */
export const MULTIPART_HEADERS = { 'Content-Type': undefined as unknown as string };
