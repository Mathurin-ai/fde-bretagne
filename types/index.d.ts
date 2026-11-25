export type Canal = { canal: string; nom: string; sert_a: string; messages: number; nouveaux: number }
// Une conversation privée en cours : l'autre membre, et ce qu'on n'a pas lu.
export type Prive = { membre: number; nom: string; nouveaux: number }
// Un membre à qui écrire, dans la liste « Écrire à un membre ».
export type Membre = { membre: number; nom: string; sert_a: string }
export type Reaction = { emoji: string; n: number; moi: boolean }
export type Message = {
  id?: number
  jour: string
  heure: string
  auteur: string
  // L'identifiant de l'auteur, quand on peut lui écrire en privé (pas pour ses propres messages).
  membre?: number
  teinte?: number
  texte: string
  cite?: string
  points?: string[]
  reactions?: Reaction[]
}
export type Vue = {
  // vide : rien demandé. attente : le membre doit accepter dans son navigateur. pret : les canaux sont là.
  etat: 'vide' | 'attente' | 'pret'
  code: string
  url: string
  canaux: Canal[]
  prives: Prive[]
  // Le canal ouvert, ou '' quand c'est une conversation privée (prive porte alors l'identifiant de l'autre membre).
  ouvert: string
  prive: number
  nomPrive: string
  // La liste « Écrire à un membre », quand elle est dépliée à la place du fil.
  annuaire: Membre[]
  annuaireOuvert: boolean
  // Combien de membres répondent à la recherche, et le mot cherché.
  annuaireTotal: number
  annuaireMot: string
  ditPrive: string
  messages: Message[]
  note: string
  avis: string
  ecriture: boolean
  emojis: string[]
  // Le message auquel on est en train de répondre, ou 0.
  reponseA: number
  // Le message dont le choix de réactions est déplié, ou 0.
  choix: number
  // Change à chaque envoi : le champ de saisie repart vide.
  envois: number
  prenom: string
  // Combien de messages récents sont passés sous la fenêtre quand on remonte le fil.
  decalage: number
  // Le jour du mois, pour varier la petite phrase d'accueil.
  jour: number
}

declare module 'claude-code' {
  interface PluginState {
    'fde-bretagne': { vue: Shaped<Vue> }
  }
}
