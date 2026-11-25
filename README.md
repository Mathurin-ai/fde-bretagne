# FDE Bretagne dans Claude Code

Les canaux de [FDE Bretagne](https://fde-bretagne.fr), la communauté des forward deployed engineers de Bretagne, dans un panneau à côté de votre conversation : lire, écrire, réagir, sans quitter le terminal. Une ligne au-dessus de l'invite signale les nouveaux messages.

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
| `k` / `j` | messages plus anciens / plus récents |
| `r` | rafraîchir |
| Échap | rendre le clavier à Claude Code |

Il faut être membre : on le devient en ajoutant le connecteur du groupe, comme expliqué sur [fde-bretagne.fr](https://fde-bretagne.fr).

## Ce que le modèle voit

Rien des messages. Le panneau ne passe pas par le connecteur MCP, dont les réponses peuvent être lues par le modèle : il parle directement au site, avec son propre accès, et ne fait que dessiner pour vous. Les messages des autres membres n'entrent donc jamais dans le contexte de votre agent. Le code tient dans un fichier, `hooks/register.tsx` : vous pouvez le vérifier.

Le seul hôte contacté est `fde-bretagne.fr`.

## Limites

Écrit et essayé dans le terminal, avec Claude Code 2.1.332. Pas encore essayé dans l'application de bureau ni dans VS Code.
