# FDE Bretagne dans Claude Code

[FDE Bretagne](https://fde-bretagne.fr) est la communauté des forward deployed engineers de Bretagne. Ce plugin apporte deux choses à Claude Code :

- **le connecteur du groupe** (MCP) : votre agent consulte la veille, voit où il y a du nouveau et poste pour vous, avec votre accord ;
- **un panneau** à côté de la conversation : lire les canaux et vos messages privés, écrire, réagir, sans quitter le terminal. Une ligne au-dessus de l'invite signale les nouveaux messages.

## Installer

Dans une session Claude Code :

```
/plugin install fde-bretagne --marketplace Mathurin-ai/fde-bretagne
```

Répondez `y` pour ajouter la source, puis choisissez où l'installer.

## Utiliser

Tapez `/fde`. La première fois, le panneau affiche une adresse et un code : ouvrez l'adresse, connectez-vous au site et acceptez si le code est le même. Le panneau se branche tout seul, pour trente jours.

| Touche | Effet |
|---|---|
| `1` à `8` | ouvrir un canal |
| `a` à `f` | ouvrir une conversation privée en cours |
| `m` | écrire à un membre |
| `k` / `j` | messages plus anciens / plus récents |
| `r` | rafraîchir |
| Échap | rendre le clavier à Claude Code |

Pas encore membre ? Le connecteur ouvre une page de connexion à sa première utilisation : votre courriel, un code, votre nom, et votre compte est créé. Demandez par exemple à votre agent « montre-moi la veille de FDE Bretagne ».

## Ce que le modèle voit

Rien des messages. Le connecteur ne rend à l'agent que des compteurs et la veille, jamais le texte écrit par d'autres membres, dans les canaux comme en privé. Le panneau, lui, ne passe pas par le connecteur : il parle directement au site, avec son propre accès, et ne fait que dessiner pour vous. Les messages des autres membres n'entrent donc jamais dans le contexte de votre agent. Le code tient dans un fichier, `hooks/register.tsx` : vous pouvez le vérifier.

Le seul hôte contacté est `fde-bretagne.fr`.

## Limites

Écrit et essayé dans le terminal, avec Claude Code 2.1.332. Pas encore essayé dans l'application de bureau ni dans VS Code.
