// Les canaux de FDE Bretagne dans un panneau de Claude Code, et un bandeau quand il y a du nouveau.
//
// Le panneau ne passe pas par le connecteur : ce qu'un connecteur rend, le modèle peut le lire. Il demande son
// propre accès au site (le membre l'accepte dans son navigateur en comparant un code), puis lit et écrit par
// $.http.fetch. Rien ici n'appelle $.session.append ni ne rend de texte au modèle : les messages des autres
// membres, dans les canaux comme en privé, sont dessinés pour la personne, et pour elle seule.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Canal, Membre, Message, Prive, Reaction, Vue } from '../types'

const SITE = 'https://fde-bretagne.fr'
const PANNEAU = 'fde-bretagne'
const VIDE: Vue = {
  etat: 'vide', code: '', url: '', canaux: [], prives: [], ouvert: '', prive: 0, nomPrive: '', ditPrive: '', annuaire: [], annuaireOuvert: false, annuaireTotal: 0, annuaireMot: '', messages: [], note: '', avis: '',
  ecriture: false, emojis: [], choix: 0, envois: 0, prenom: '', jour: 0, decalage: 0,
}

const vue = atom({ plugin: 'fde-bretagne', key: 'vue' } as const, VIDE, { shape: 'vue-7' })

// Deuxième filet, après celui du serveur : aucun caractère de commande ne va au terminal.
const propre = (t: unknown) => String(t ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')

// Les couleurs du site. Le blanc de l'hermine reste la couleur du texte du terminal, clair ou sombre.
// Le jaune du groupe. Pour du texte, on prend la couleur d'avertissement du thème, lisible en clair comme en sombre.
const JAUNE = '#ffd23f'
const ACCENT = 'warning'
const ROSE = '#ee7f8f'
const CIEL = '#8eb4e8'
const TEINTES = [ACCENT, ROSE, CIEL, '#b7a6f0']
const SIGNES: Record<string, string> = {
  annonces: '📣', veille: '🔭', presentations: '👋', 'en-production': '🚀',
  outillage: '🧰', entraide: '🛟', missions: '💼', rencontres: '🍻',
}
const PHRASES = [
  'Du beurre salé dans le pipeline.',
  'Kouign-amann et pull requests.',
  'Ça déploie fort, même par crachin.',
  "Une galette, un café, un déploiement.",
  'Le vendredi, on déploie quand même.',
]
const VIDES = [
  'Pas un chat ici. À vous l\'honneur !',
  'Canal tout neuf, encore sous blister.',
  'Silence radio. Lancez le premier message.',
]

// Le logo du site, pour les surfaces qui dessinent des images : l'hermine et ses trois points sur fond sombre.
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="64" height="64" shape-rendering="crispEdges">' +
  '<rect width="16" height="16" rx="3" fill="#1f1e1c"/>' +
  '<rect x="7" y="2" width="2" height="1" fill="#ffd23f"/><rect x="5" y="4" width="2" height="1" fill="#ee7f8f"/><rect x="9" y="4" width="2" height="1" fill="#8eb4e8"/>' +
  '<g fill="#f6f2ea"><rect x="7" y="6" width="2" height="2"/><rect x="6" y="8" width="4" height="2"/><rect x="5" y="10" width="6" height="2"/>' +
  '<rect x="4" y="12" width="2" height="1"/><rect x="7" y="12" width="2" height="2"/><rect x="10" y="12" width="2" height="1"/><rect x="4" y="13" width="1" height="1"/><rect x="11" y="13" width="1" height="1"/></g></svg>'

let minuterie: { cancel: () => void } | undefined

async function appeler($: any, chemin: string, corps?: unknown) {
  const jeton = String((await $.store.get('jeton')) ?? '')
  if (!jeton) return { status: 401, donnees: null as any }
  const r = await $.http.fetch(SITE + chemin, {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  })
  let donnees: any = null
  try {
    donnees = JSON.parse(r.text)
  } catch {}
  return { status: r.status as number, donnees }
}

const enCanaux = (liste: unknown): Canal[] =>
  (Array.isArray(liste) ? liste : []).map((c: Canal) => ({
    canal: propre(c.canal),
    nom: propre(c.nom),
    sert_a: propre(c.sert_a),
    messages: Number(c.messages) || 0,
    nouveaux: Number(c.nouveaux) || 0,
  }))

const enMessages = (liste: unknown): Message[] =>
  (Array.isArray(liste) ? liste : []).map((m: Message) => ({
    ...(m.id ? { id: Number(m.id) } : {}),
    jour: propre(m.jour),
    heure: propre(m.heure),
    auteur: propre(m.auteur),
    teinte: Number(m.teinte) || 0,
    texte: propre(m.texte),
    ...(m.cite ? { cite: propre(m.cite) } : {}),
    ...(m.points ? { points: m.points.map(propre) } : {}),
    ...(m.reactions ? { reactions: m.reactions.map((x: Reaction) => ({ emoji: propre(x.emoji), n: Number(x.n) || 0, moi: !!x.moi })) } : {}),
  }))

const enPrives = (liste: unknown): Prive[] =>
  (Array.isArray(liste) ? liste : []).map((c: Prive) => ({ membre: Number(c.membre) || 0, nom: propre(c.nom), nouveaux: Number(c.nouveaux) || 0 }))

async function ouvrirCanal($: any, cle: string) {
  if (!cle) return
  const r = await appeler($, `/api/canaux/${encodeURIComponent(cle)}`)
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const messages = enMessages(r.donnees.messages)
  await update($, vue, v => ({
    ...v,
    ouvert: cle,
    prive: 0,
    nomPrive: '',
    ditPrive: '',
    messages,
    note: propre(r.donnees.note),
    ecriture: !!r.donnees.ecriture,
    emojis: (r.donnees.emojis ?? []).map(propre),
    avis: '',
    choix: 0,
    decalage: 0,
    annuaireOuvert: false,
    canaux: v.canaux.map(c => (c.canal === cle ? { ...c, nouveaux: 0 } : c)),
  }))
  // Tout tient dans la fenêtre du panneau : on la ramène en haut, sur le logo et les canaux.
  $.clock.after(200, () => $.ui.scroll({ in: PANNEAU, to: 'start' }))
}

// Ouvrir la conversation privée avec un membre. La lire, c'est l'avoir lue.
async function ouvrirPrive($: any, membre: number) {
  if (!membre) return
  const r = await appeler($, `/api/prives/${membre}`)
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const messages = enMessages(r.donnees.messages)
  await update($, vue, v => ({
    ...v,
    ouvert: '',
    prive: membre,
    nomPrive: propre(r.donnees.nom),
    ditPrive: propre(r.donnees.sert_a),
    messages,
    note: propre(r.donnees.note),
    ecriture: !!r.donnees.ecriture,
    emojis: [],
    avis: '',
    choix: 0,
    decalage: 0,
    annuaireOuvert: false,
    prives: v.prives.map(c => (c.membre === membre ? { ...c, nouveaux: 0 } : c)),
  }))
  $.clock.after(200, () => $.ui.scroll({ in: PANNEAU, to: 'start' }))
}

// Déplier la liste des membres à qui écrire, à la place du fil.
async function ouvrirAnnuaire($: any, mot = '') {
  const r = await appeler($, `/api/membres${mot.trim() ? `?q=${encodeURIComponent(mot.trim().slice(0, 60))}` : ''}`)
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const annuaire: Membre[] = (Array.isArray(r.donnees.membres) ? r.donnees.membres : []).map((m: Membre) => ({
    membre: Number(m.membre) || 0,
    nom: propre(m.nom),
    sert_a: propre(m.sert_a),
  }))
  await update($, vue, v => ({ ...v, annuaire, annuaireOuvert: true, annuaireTotal: Number(r.donnees.total) || annuaire.length, annuaireMot: propre(r.donnees.q), avis: '' }))
}

// Recharger ce qui est ouvert, canal ou conversation.
async function rouvrir($: any) {
  const v = await read($, vue)
  return v.prive ? ouvrirPrive($, v.prive) : ouvrirCanal($, v.ouvert)
}

async function charger($: any) {
  const r = await appeler($, '/api/canaux')
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const canaux = enCanaux(r.donnees.canaux)
  const avant = await read($, vue)
  const jour = new Date(await $.clock.now()).getDate()
  const prives = enPrives(r.donnees.prives)
  await update($, vue, v => ({ ...v, etat: 'pret' as const, code: '', url: '', canaux, prives, avis: '', prenom: propre(r.donnees.membre), jour }))
  if (avant.prive) return ouvrirPrive($, avant.prive)
  // Un canal archivé entre-temps n'est plus dans la liste : on retombe sur le premier.
  const garde = canaux.some(c => c.canal === avant.ouvert) ? avant.ouvert : ''
  await ouvrirCanal($, garde || canaux.find(c => c.nouveaux)?.canal || canaux[0]?.canal || '')
}

// La relève de fond, pour le bandeau : les compteurs seulement, et jamais de demande d'accès.
async function relever($: any) {
  const r = await appeler($, '/api/canaux')
  if (r.status !== 200) return
  const canaux = enCanaux(r.donnees.canaux)
  const prives = enPrives(r.donnees.prives)
  await update($, vue, v => ({ ...v, canaux, prives }))
}

async function envoyer($: any, texte: string) {
  const v = await read($, vue)
  if (!texte.trim() || (!v.ouvert && !v.prive)) return
  const r = await appeler($, v.prive ? `/api/prives/${v.prive}` : `/api/canaux/${encodeURIComponent(v.ouvert)}`, { texte })
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, x => ({ ...x, avis: propre(r.donnees?.erreur) || "Le message n'est pas parti." }))
  await update($, vue, x => ({ ...x, envois: x.envois + 1 }))
  $.ui.toast(v.prive ? `Message parti pour ${v.nomPrive}` : `Message parti dans #${v.ouvert}`)
  // Le champ vient d'être redessiné vide : on y remet le curseur, pour enchaîner.
  const suite = await read($, vue)
  $.clock.after(250, () => $.ui.focus({ requestId: PANNEAU, key: `saisie-${suite.ouvert || suite.prive}-${suite.envois}` }))
  await rouvrir($)
}

async function reagir($: any, message: number, emoji: string) {
  const r = await appeler($, `/api/messages/${message}/reaction`, { emoji })
  if (r.status === 401) return demander($)
  await rouvrir($)
}

// Demander un accès : le site rend un code à comparer et une adresse à ouvrir dans le navigateur.
async function demander($: any) {
  await $.store.delete('jeton')
  const r = await $.http.fetch(`${SITE}/terminal/demande`, { method: 'POST' })
  if (!r.ok) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const d = JSON.parse(r.text)
  await $.store.set('secret', String(d.secret))
  await update($, vue, () => ({ ...VIDE, etat: 'attente' as const, code: propre(d.code), url: propre(d.url) }))
  minuterie?.cancel()
  let essais = 0
  minuterie = $.clock.every(3000, async () => {
    essais += 1
    if (essais > 200 || (await retirer($))) minuterie?.cancel()
  })
}

// Aller chercher le jeton une fois la demande acceptée. Vrai quand il n'y a plus rien à attendre.
async function retirer($: any): Promise<boolean> {
  const secret = String((await $.store.get('secret')) ?? '')
  if (!secret) return true
  const r = await $.http.fetch(`${SITE}/terminal/jeton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
  })
  if (r.status === 202) return false
  await $.store.delete('secret')
  if (!r.ok) {
    await update($, vue, v => ({ ...v, etat: 'vide' as const, avis: 'La demande a expiré.' }))
    return true
  }
  await $.store.set('jeton', String(JSON.parse(r.text).jeton))
  await charger($)
  return true
}

// Ouvrir le panneau, sur un canal, sur une conversation privée, ou là où on l'avait laissé.
async function montrer($: any, cle: string, prive = 0) {
  await $.ui.open({ id: PANNEAU, title: 'FDE Bretagne', focus: true })
  const v = await read($, vue)
  if (v.etat === 'pret' && prive) return ouvrirPrive($, prive)
  if (v.etat === 'pret' && cle) return ouvrirCanal($, cle)
  await update($, vue, x => (prive ? { ...x, prive, ouvert: '' } : { ...x, ouvert: cle || x.ouvert, prive: cle ? 0 : x.prive }))
  await charger($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'fde', description: 'Ouvrir les canaux de FDE Bretagne dans un panneau' })
    // Toutes les trois minutes, voir s'il y a du nouveau. Sans accès déjà accordé, la relève ne fait rien.
    void relever($)
    $.clock.every(180000, () => relever($))

    return next(e)
  })

  on('command.run', { command: 'fde' }, async $ => {
    await montrer($, '')

    // Pour la personne seule : cette ligne ne part dans aucune demande au modèle.
    return { text: 'Panneau FDE Bretagne ouvert.', isTextDisplayOnly: true }
  })

  // Le bandeau : une ligne au-dessus de l'invite quand il y a du nouveau. Des compteurs, jamais de texte.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, vue)
    const neufs = v.canaux.filter(c => c.nouveaux > 0)
    const prives = v.prives.filter(c => c.nouveaux > 0)
    if (e.props.hasSurvey || (neufs.length === 0 && prives.length === 0)) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const nPrives = prives.reduce((n, c) => n + c.nouveaux, 0)
    const resume = [
      ...(nPrives ? [`${nPrives} message${nPrives > 1 ? 's privés' : ' privé'}`] : []),
      ...neufs.slice(0, 3).map(c => `${c.nouveaux} dans #${c.canal}`),
    ].join(', ')

    return (
      <Box>
        <Text dimColor>FDE Bretagne : {resume}{neufs.length > 3 ? '…' : ''}  </Text>
        <Button key="voir" label="Voir" onPress={() => montrer($, prives.length ? '' : neufs[0]?.canal ?? '', prives[0]?.membre ?? 0)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANNEAU }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link, Input } = elements
    const v = await read($, vue)
    const terminal = e.surface === 'terminal'

    // L'hermine du logo, en demi-blocs : trois points de couleur, puis la moucheture.
    const logo = !terminal && 'Svg' in elements ? (
      <Box marginRight={2} flexShrink={0}>
        <elements.Svg source={LOGO_SVG} alt="Logo de FDE Bretagne" width={44} height={44} />
      </Box>
    ) : (
      <Box flexDirection="column" width={5} flexShrink={0} marginRight={2}>
        <Text wrap="truncate">
          <Text color={ROSE}>{' ▄'}</Text>
          <Text color={JAUNE}>{'▀'}</Text>
          <Text color={CIEL}>{'▄ '}</Text>
        </Text>
        <Text wrap="truncate">{' ▟█▙ '}</Text>
        <Text wrap="truncate">{'▛▘█▝▜'}</Text>
      </Box>
    )
    const titre = (
      <Text>
        <Text bold>FDE Bretagne</Text>
        <Text color={ACCENT}>{v.prenom ? `  Demat, ${v.prenom} !` : '  Demat !'}</Text>
      </Text>
    )
    const entete = (
      <Box marginBottom={1}>
        {logo}
        <Box flexDirection="column" justifyContent="center">
          {titre}
          <Text dimColor italic>{PHRASES[v.jour % PHRASES.length]}</Text>
        </Box>
      </Box>
    )

    if (v.etat === 'attente') {
      return (
        <Box flexDirection="column" paddingX={1}>
          {entete}
          <Text bold>Brancher ce panneau</Text>
          <Text>Ouvrez cette adresse, connectez-vous au site, et acceptez si le code est le même :</Text>
          <Box marginY={1} flexDirection="column">
            <Link href={v.url} label={v.url} />
            <Text bold color={ACCENT}>{v.code}</Text>
          </Box>
          <Text dimColor>Le panneau se met à jour tout seul une fois la demande acceptée.</Text>
          <Button key="fait" hotkey="r" plain label="J'ai accepté" onPress={() => retirer($)} />
        </Box>
      )
    }

    if (v.etat !== 'pret') {
      return (
        <Box flexDirection="column" paddingX={1}>
          {entete}
          <Text>{v.avis || 'Les canaux du groupe, sans quitter le terminal.'}</Text>
          <Box marginTop={1}>
            <Button key="ouvrir" hotkey="r" variant="primary" label="Ouvrir les canaux" onPress={() => charger($)} />
          </Box>
        </Box>
      )
    }

    const actuel = v.canaux.find(c => c.canal === v.ouvert)
    const colonnes = Math.max(24, (e.props.bodyColumns ?? 60) - 2)
    const lignes = (texte: string, retrait = 0) =>
      texte.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length + retrait) / colonnes)), 0)
    const hauteur = (m: Message) =>
      2 + lignes(m.texte) + (m.cite ? 1 : 0) + (m.points ?? []).reduce((n, p) => n + lignes(p, 4), 0) +
      (m.id && v.emojis.length ? 1 : 0)
    // Ce qui ne bouge pas : l'en-tête et les canaux (6), le titre du canal, la saisie, le pied.
    const intitule = v.prive ? v.nomPrive : v.ouvert
    const sousTitre = v.prive ? v.ditPrive || 'Message privé' : actuel?.sert_a ?? ''
    const fixe = 6 + lignes(`${intitule}     ${sousTitre}`) + (v.ecriture ? 3 : v.note ? 2 : 0) + 2
    const place = Math.max(5, (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30) - fixe)
    // La fenêtre sur le fil : les derniers messages qui tiennent, moins ceux qu'on a laissés en dessous en remontant.
    const fin = Math.max(Math.min(1, v.messages.length), v.messages.length - v.decalage)
    let debut = fin
    let reste = place
    while (debut > 0) {
      const m = v.messages[debut - 1] as Message
      const cout = hauteur(m) + (debut - 1 === 0 || v.messages[debut - 2]?.jour !== m.jour ? 2 : 0)
      if (cout > reste && debut < fin) break
      reste -= cout
      debut -= 1
    }
    const fil: Array<{ jour?: string; m?: Message }> = []
    let dernierJour = ''
    for (const m of v.messages.slice(debut, fin)) {
      if (m.jour !== dernierJour) fil.push({ jour: m.jour })
      dernierJour = m.jour
      fil.push({ m })
    }
    const pas = Math.max(1, fin - debut)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          {logo}
          <Box flexDirection="column" flexGrow={1}>
            {titre}
            <Box flexWrap="wrap" columnGap={1} marginTop={1}>
              {v.canaux.map((c, i) => (
                <Button key={`canal-${c.canal}`} hotkey={String(i + 1)} plain onPress={() => ouvrirCanal($, c.canal)}>
                  <Text
                    bold={c.canal === v.ouvert || c.nouveaux > 0}
                    inverse={c.canal === v.ouvert}
                    dimColor={c.canal !== v.ouvert && !c.nouveaux}
                  >
                    {` ${c.canal} `}
                  </Text>
                  {c.nouveaux ? <Text color={ROSE} bold>{`●${c.nouveaux}`}</Text> : ''}
                </Button>
              ))}
            </Box>
            <Box flexWrap="wrap" columnGap={1}>
              <Text dimColor>✉</Text>
              {v.prives.slice(0, 6).map((c, i) => (
                <Button key={`prive-${c.membre}`} hotkey={'abcdef'.charAt(i)} plain onPress={() => ouvrirPrive($, c.membre)}>
                  <Text bold={c.membre === v.prive || c.nouveaux > 0} inverse={c.membre === v.prive} dimColor={c.membre !== v.prive && !c.nouveaux}>
                    {` ${c.nom} `}
                  </Text>
                  {c.nouveaux ? <Text color={ROSE} bold>{`●${c.nouveaux}`}</Text> : ''}
                </Button>
              ))}
              <Button key="annuaire" hotkey="m" plain dimColor={!v.annuaireOuvert} onPress={() => ouvrirAnnuaire($)}>
                <Text underline>écrire à un membre</Text>
              </Button>
            </Box>
          </Box>
        </Box>
        {v.annuaireOuvert ? (
          <Box flexDirection="column">
            <Text>
              <Text bold color={ACCENT}>✉ Écrire à un membre</Text>
              <Text dimColor>{'  Une conversation à deux, que les autres ne voient pas.'}</Text>
            </Text>
            <Box marginTop={1}>
              {terminal ? <Text color={ACCENT} bold>{'› '}</Text> : ''}
              <Box flexGrow={1} flexDirection="column">
                <Input
                  key={`chercher-${v.annuaireMot}`}
                  placeholder={`Chercher par nom ou par activité${terminal ? ', Entrée pour chercher' : ''}`}
                  value={v.annuaireMot}
                  submitLabel="Chercher"
                  onSubmit={mot => { void ouvrirAnnuaire($, mot) }}
                />
              </Box>
            </Box>
            {v.annuaire.length === 0 && (
              <Box marginTop={1}>
                <Text dimColor italic>
                  {v.annuaireMot ? `Aucun membre ne répond à « ${v.annuaireMot} ».` : 'Vous êtes la première personne ici. Les autres membres apparaîtront dans cette liste.'}
                </Text>
              </Box>
            )}
            <Box flexDirection="column" marginTop={1}>
              {v.annuaire.slice(0, 30).map(m => (
                <Button key={`membre-${m.membre}`} plain onPress={() => ouvrirPrive($, m.membre)}>
                  <Text bold>{m.nom}</Text>
                  {m.sert_a ? <Text dimColor>{`  ${m.sert_a}`}</Text> : ''}
                </Button>
              ))}
            </Box>
            {v.annuaireTotal > v.annuaire.length ? (
              <Text dimColor italic>{`${v.annuaireTotal - v.annuaire.length} autres membres. Précisez la recherche pour les voir.`}</Text>
            ) : null}
          </Box>
        ) : (
          <Box flexDirection="column">
          <Text>
            <Text bold color={ACCENT}>{v.prive ? '✉' : SIGNES[v.ouvert] ?? '#'} {intitule}</Text>
            {sousTitre ? <Text dimColor>{`  ${sousTitre}`}</Text> : ''}
          </Text>
          {v.avis ? <Text color={ROSE}>{v.avis}</Text> : null}
          {debut > 0 ? (
            <Button key="avant" hotkey="k" plain dimColor onPress={() => update($, vue, x => ({ ...x, decalage: Math.min(x.messages.length - 1, x.decalage + pas) }))}>
              <Text underline>{`↑ ${debut} plus ancien${debut > 1 ? 's' : ''}`}</Text>
            </Button>
          ) : null}
          {fil.length === 0 && (
            <Box marginTop={1}>
              <Text dimColor italic>{v.prive ? 'Aucun message pour l\'instant. Seuls vous deux verrez cette conversation.' : VIDES[(v.ouvert.length + v.jour) % VIDES.length]}</Text>
            </Box>
          )}
          {fil.map(ligne =>
            ligne.jour ? (
              <Box marginTop={1}>
                <Text dimColor>── {ligne.jour} ──</Text>
              </Box>
            ) : (
              <Box flexDirection="column" marginTop={1}>
                <Text>
                  <Text bold color={TEINTES[(ligne.m?.teinte ?? 0) % TEINTES.length]}>{ligne.m?.auteur}</Text>
                  <Text dimColor>  {ligne.m?.heure}</Text>
                </Text>
                {ligne.m?.cite ? <Text dimColor>│ {ligne.m.cite}</Text> : null}
                <Text>{ligne.m?.texte}</Text>
                {(ligne.m?.points ?? []).map(p => (
                  <Text dimColor>  · {p}</Text>
                ))}
                {ligne.m?.id && v.emojis.length ? (
                  <Box gap={2} marginTop={terminal ? 0 : 1}>
                    {(ligne.m.reactions ?? []).map(x => (
                      <Button key={`r-${ligne.m?.id}-${x.emoji}`} plain onPress={() => reagir($, ligne.m?.id as number, x.emoji)}>
                        <Text color={x.moi ? CIEL : undefined} bold={x.moi}>{`${x.emoji} ${x.n}`}</Text>
                      </Button>
                    ))}
                    {v.choix === ligne.m.id ? (
                      v.emojis.map(x => (
                        <Button key={`c-${ligne.m?.id}-${x}`} plain label={x} onPress={() => reagir($, ligne.m?.id as number, x)} />
                      ))
                    ) : (
                      <Button
                        key={`plus-${ligne.m.id}`}
                        plain
                        dimColor
                        onPress={() => update($, vue, x => ({ ...x, choix: ligne.m?.id as number }))}
                      >
                        <Text underline>+ réagir</Text>
                      </Button>
                    )}
                  </Box>
                ) : null}
              </Box>
            ),
          )}
          {v.decalage > 0 ? (
            <Box marginTop={1}>
              <Button key="apres" hotkey="j" plain dimColor onPress={() => update($, vue, x => ({ ...x, decalage: Math.max(0, x.decalage - pas) }))}>
                <Text underline>{`↓ ${v.decalage} plus récent${v.decalage > 1 ? 's' : ''}`}</Text>
              </Button>
            </Box>
          ) : null}
          {v.note ? (
            <Box marginTop={1}>
              <Text dimColor italic>{v.note}</Text>
            </Box>
          ) : null}
          {v.ecriture ? (
            <Box marginTop={1} width="100%">
              {terminal ? <Text color={ACCENT} bold>{'› '}</Text> : ''}
              <Box flexGrow={1} flexDirection="column">
                <Input
                  key={`saisie-${v.ouvert || v.prive}-${v.envois}`}
                  placeholder={`${v.prive ? `Écrire à ${v.nomPrive}` : `Écrire dans #${v.ouvert}`}${terminal ? ', Entrée pour envoyer' : ''}`}
                  value=""
                  autoFocus
                  rows={2}
                  submitLabel="Envoyer"
                  onSubmit={texte => { void envoyer($, texte) }}
                />
              </Box>
            </Box>
          ) : null}
          </Box>
        )}
        <Box marginTop={1} gap={3}>
          <Button key="rafraichir" hotkey="r" plain dimColor onPress={() => charger($)}>
            <Text underline>Rafraîchir</Text>
          </Button>
          <Link href={v.prive ? `${SITE}/prives/${v.prive}` : `${SITE}/canaux/${v.ouvert}`} label="Ouvrir sur le site" />
        </Box>
      </Box>
    )
  })
}
