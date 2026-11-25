export type Canal = { canal: string; nom: string; sert_a: string; messages: number; nouveaux: number }
export type Reaction = { emoji: string; n: number; moi: boolean }
export type Message = {
  id?: number
  jour: string
  heure: string
  auteur: string
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
  ouvert: string
  messages: Message[]
  note: string
  avis: string
  ecriture: boolean
  emojis: string[]
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
