/**
 * Extracts a user-friendly error message from an API error response.
 */
export const getErrorMessage = (error: any, defaultMessage: string = 'Une erreur est survenue'): string => {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    // Direct detail or error message from backend
    if (data) {
      if (typeof data.detail === 'string') {
        if (data.detail.includes('No active account found')) return 'Mauvais email ou mot de passe';
        if (data.detail.includes('not found') || data.detail.includes('no account')) return 'Aucun compte associé à cet email';
        if (data.detail.includes('désactivé') || data.detail.includes('disabled')) return 'Votre compte est désactivé, contactez l’administrateur';
        return data.detail;
      }
      if (typeof data.error === 'string') {
        if (data.error.includes('expired')) return 'Ce lien de récupération a expiré';
        if (data.error.includes('invalid')) return 'Le lien est incorrect, veuillez refaire une demande';
        return data.error;
      }
      if (typeof data.message === 'string') {
        if (data.message.includes('Network Error')) return 'Impossible de contacter le serveur, vérifiez votre connexion';
        return data.message;
      }
      if (typeof data === 'string' && data.length > 0) {
        return data;
      }

      // Registration specific / Field specific errors
      if (typeof data === 'object') {
        if (data.email) {
          if (Array.isArray(data.email)) {
            if (data.email[0].includes('already in use') || data.email[0].includes('déjà utilisé')) return 'Cette adresse email est déjà utilisée';
            if (data.email[0].includes('valid email') || data.email[0].includes('valide')) return 'Veuillez entrer une adresse email valide';
          }
        }
        if (data.phone) {
          if (Array.isArray(data.phone) && (data.phone[0].includes('already in use') || data.phone[0].includes('déjà associé'))) return 'Ce numéro est déjà associé à un compte';
        }
        if (data.password) {
          if (Array.isArray(data.password)) {
            if (data.password[0].includes('common') || data.password[0].includes('short') || data.password[0].includes('numeric')) {
               return "Le mot de passe doit respecter les règles de sécurité";
            }
            return data.password[0];
          }
        }

        const firstKey = Object.keys(data)[0];
        const firstError = data[firstKey];
        const firstErrText = Array.isArray(firstError) ? firstError[0] : firstError;

        // 🔧 « invalid pk "-1" - object does not exist » : le formulaire référence
        // un enregistrement créé hors-ligne (id négatif) qui n'a pas encore été
        // synchronisé côté serveur. Message clair au lieu du jargon DRF.
        if (typeof firstErrText === 'string' && /invalid pk ["']?-\d/i.test(firstErrText)) {
          return "Un élément lié (ferme, lot…) n'est pas encore synchronisé avec le serveur. Patientez que la synchronisation se termine, puis réessayez.";
        }

        if (Array.isArray(firstError) && typeof firstError[0] === 'string') {
          return firstError[0];
        }
        if (typeof firstError === 'string') {
          return firstError;
        }
      }
    }

    // Status code fallbacks
    switch (status) {
      case 400:
        return 'Les données envoyées sont invalides ou ne respectent pas une règle métier';
      case 401:
        return 'Votre session a expiré, veuillez vous reconnecter';
      case 403:
        return "Vous n'avez pas l'autorisation d'effectuer cette action";
      case 404:
        return "La ressource demandée est introuvable";
      case 409:
        return 'Cette opération entre en conflit avec une donnée existante';
      case 429:
        return "Trop de tentatives, veuillez réessayer plus tard";
      case 500:
      case 502:
      case 503:
        return 'Le serveur est temporairement indisponible';
    }
  }

  if (error.message === 'Network Error' || error.request) {
    return 'Impossible de contacter le serveur, vérifiez votre connexion';
  }

  // 🔧 Erreurs de validation offline (thrown as native JS Error, no .response)
  if (error instanceof Error && error.message && error.message !== 'Network Error') {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  if (error?.message && typeof error.message === 'string') {
    return error.message;
  }

  return defaultMessage;
};
