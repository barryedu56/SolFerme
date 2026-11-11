"""Journal des écritures REFUSÉES (4xx sur POST/PUT/PATCH/DELETE).

Sans lui, un enregistrement refusé par le serveur lors d'une synchronisation
(ex. « capacité de la ferme dépassée ») ne laisse aucune trace côté serveur :
le journal d'accès ne montre que « 400 ». On écrit ici le MESSAGE D'ERREUR
renvoyé (jamais le corps de la requête, qui peut contenir des données
personnelles ou des mots de passe), tronqué, avec l'utilisateur.
"""
import logging

logger = logging.getLogger('solferme.refus')

_WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
_SKIP_PREFIXES = ('/api/auth/',)  # identifiants : ne rien journaliser


class RejectedWriteLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if (
                request.method in _WRITE_METHODS
                and 400 <= response.status_code < 500
                and response.status_code != 401
                and not request.path.startswith(_SKIP_PREFIXES)
            ):
                user = getattr(request, 'user', None)
                uid = getattr(user, 'id', None) if getattr(user, 'is_authenticated', False) else None
                body = getattr(response, 'content', b'')[:400].decode('utf-8', 'replace')
                logger.warning('REFUS %s %s -> %s (user=%s) %s',
                               request.method, request.path, response.status_code, uid, body)
        except Exception:  # le journal ne doit jamais casser une réponse
            pass
        return response
