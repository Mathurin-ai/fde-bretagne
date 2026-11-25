// Les canaux de FDE Bretagne dans un panneau de Claude Code, et un bandeau quand il y a du nouveau.
//
// Le panneau ne passe pas par le connecteur : ce qu'un connecteur rend, le modèle peut le lire. Il demande son
// propre accès au site (le membre l'accepte dans son navigateur en comparant un code), puis lit et écrit par
// $.http.fetch. Rien ici n'appelle $.session.append ni ne rend de texte au modèle : les messages des autres
// membres sont dessinés pour la personne, et pour elle seule.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Canal, Message, Reaction, Vue } from '../types'

const SITE = 'https://fde-bretagne.fr'
const PANNEAU = 'fde-bretagne'
const VIDE: Vue = {
  etat: 'vide', code: '', url: '', canaux: [], ouvert: '', messages: [], note: '', avis: '',
  ecriture: false, emojis: [], choix: 0, envois: 0, prenom: '', jour: 0, decalage: 0,
}

const vue = atom({ plugin: 'fde-bretagne', key: 'vue' } as const, VIDE, { shape: 'vue-4' })

// Deuxième filet, après celui du serveur : aucun caractère de commande ne va au terminal.
const propre = (t: unknown) => String(t ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')

// Les couleurs du site. Le blanc de l'hermine reste la couleur du texte du terminal, clair ou sombre.
const ABRICOT = '#f5a65b'
const ROSE = '#ee7f8f'
const CIEL = '#8eb4e8'
const TEINTES = [ABRICOT, ROSE, CIEL, '#b7a6f0']
const SIGNES: Record<string, string> = {
  annonces: '📣', veille: '🔭', presentations: '👋', 'en-production': '🚀',
  outillage: '🧰', entraide: '🛟', missions: '💼', rencontres: '🍻',
}
const PHRASES = [
  "Ici on met l'IA en service, pas en slide.",
  'Du beurre salé dans le pipeline.',
  'Kouign-amann et pull requests.',
  'Ça déploie fort, même par crachin.',
  'Moins de démos, plus de mises en prod.',
  "Une galette, un café, un déploiement.",
  'Le vendredi, on déploie quand même.',
]
const VIDES = [
  'Pas un chat ici. À vous l\'honneur !',
  'Canal tout neuf, encore sous blister.',
  'Silence radio. Lancez le premier message.',
]

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

async function ouvrirCanal($: any, cle: string) {
  if (!cle) return
  const r = await appeler($, `/api/canaux/${encodeURIComponent(cle)}`)
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const messages: Message[] = (r.donnees.messages ?? []).map((m: Message) => ({
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
  await update($, vue, v => ({
    ...v,
    ouvert: cle,
    messages,
    note: propre(r.donnees.note),
    ecriture: !!r.donnees.ecriture,
    emojis: (r.donnees.emojis ?? []).map(propre),
    avis: '',
    choix: 0,
    decalage: 0,
    canaux: v.canaux.map(c => (c.canal === cle ? { ...c, nouveaux: 0 } : c)),
  }))
  // Tout tient dans la fenêtre du panneau : on la ramène en haut, sur le logo et les canaux.
  $.clock.after(200, () => $.ui.scroll({ in: PANNEAU, to: 'start' }))
}

async function charger($: any) {
  const r = await appeler($, '/api/canaux')
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, v => ({ ...v, avis: 'Le site ne répond pas. Réessayez.' }))
  const canaux = enCanaux(r.donnees.canaux)
  const avant = await read($, vue)
  const jour = new Date(await $.clock.now()).getDate()
  await update($, vue, v => ({ ...v, etat: 'pret' as const, code: '', url: '', canaux, avis: '', prenom: propre(r.donnees.membre), jour }))
  await ouvrirCanal($, avant.ouvert || canaux.find(c => c.nouveaux)?.canal || canaux[0]?.canal || '')
}

// La relève de fond, pour le bandeau : les compteurs seulement, et jamais de demande d'accès.
async function relever($: any) {
  const r = await appeler($, '/api/canaux')
  if (r.status !== 200) return
  const canaux = enCanaux(r.donnees.canaux)
  await update($, vue, v => ({ ...v, canaux }))
}

async function envoyer($: any, texte: string) {
  const v = await read($, vue)
  if (!texte.trim() || !v.ouvert) return
  const r = await appeler($, `/api/canaux/${encodeURIComponent(v.ouvert)}`, { texte })
  if (r.status === 401) return demander($)
  if (r.status !== 200) return update($, vue, x => ({ ...x, avis: propre(r.donnees?.erreur) || "Le message n'est pas parti." }))
  await update($, vue, x => ({ ...x, envois: x.envois + 1 }))
  $.ui.toast('Message parti dans #' + v.ouvert)
  // Le champ vient d'être redessiné vide : on y remet le curseur, pour enchaîner.
  const suite = await read($, vue)
  $.clock.after(250, () => $.ui.focus({ requestId: PANNEAU, key: `saisie-${suite.ouvert}-${suite.envois}` }))
  await ouvrirCanal($, v.ouvert)
}

async function reagir($: any, message: number, emoji: string) {
  const v = await read($, vue)
  const r = await appeler($, `/api/messages/${message}/reaction`, { emoji })
  if (r.status === 401) return demander($)
  await ouvrirCanal($, v.ouvert)
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

async function montrer($: any, cle: string) {
  await $.ui.open({ id: PANNEAU, title: 'FDE Bretagne', focus: true })
  const v = await read($, vue)
  if (v.etat === 'pret' && cle) return ouvrirCanal($, cle)
  await update($, vue, x => ({ ...x, ouvert: cle || x.ouvert }))
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

  // Le bandeau : une ligne au-dessus de l'invite quand un canal a du nouveau. Des compteurs, jamais de texte.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, vue)
    const neufs = v.canaux.filter(c => c.nouveaux > 0)
    if (e.props.hasSurvey || neufs.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const resume = neufs.slice(0, 3).map(c => `${c.nouveaux} dans #${c.canal}`).join(', ')

    return (
      <Box>
        <Text dimColor>FDE Bretagne : {resume}{neufs.length > 3 ? '…' : ''}  </Text>
        <Button key="voir" label="Voir" onPress={() => montrer($, neufs[0]?.canal ?? '')} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANNEAU }, async ($, e) => {
    const { Box, Text, Button, Link, Input } = $.ui.resolve(e)
    const v = await read($, vue)

    // L'hermine du logo, en demi-blocs : trois points de couleur, puis la moucheture.
    const logo = (
      <Box flexDirection="column" width={5} flexShrink={0} marginRight={2}>
        <Text wrap="truncate">
          <Text color={ROSE}>{' ▄'}</Text>
          <Text color={ABRICOT}>{'▀'}</Text>
          <Text color={CIEL}>{'▄ '}</Text>
        </Text>
        <Text wrap="truncate">{' ▟█▙ '}</Text>
        <Text wrap="truncate">{'▛▘█▝▜'}</Text>
      </Box>
    )
    const titre = (
      <Text>
        <Text bold>FDE Bretagne</Text>
        <Text color={ABRICOT}>{v.prenom ? `  Demat, ${v.prenom} !` : '  Demat !'}</Text>
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
        <Box flexDirection="column">
          {entete}
          <Text bold>Brancher ce panneau</Text>
          <Text>Ouvrez cette adresse, connectez-vous au site, et acceptez si le code est le même :</Text>
          <Box marginY={1} flexDirection="column">
            <Link href={v.url} label={v.url} />
            <Text bold color={ABRICOT}>{v.code}</Text>
          </Box>
          <Text dimColor>Le panneau se met à jour tout seul une fois la demande acceptée.</Text>
          <Button key="fait" hotkey="r" plain label="J'ai accepté" onPress={() => retirer($)} />
        </Box>
      )
    }

    if (v.etat !== 'pret') {
      return (
        <Box flexDirection="column">
          {entete}
          <Text>{v.avis || 'Les canaux du groupe, sans quitter le terminal.'}</Text>
          <Box marginTop={1}>
            <Button key="ouvrir" hotkey="r" variant="primary" label="Ouvrir les canaux" onPress={() => charger($)} />
          </Box>
        </Box>
      )
    }

    const actuel = v.canaux.find(c => c.canal === v.ouvert)
    const colonnes = Math.max(24, e.props.bodyColumns ?? 60)
    const lignes = (texte: string, retrait = 0) =>
      texte.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length + retrait) / colonnes)), 0)
    const hauteur = (m: Message) =>
      2 + lignes(m.texte) + (m.cite ? 1 : 0) + (m.points ?? []).reduce((n, p) => n + lignes(p, 4), 0) +
      (m.id && v.emojis.length ? 1 : 0)
    // Ce qui ne bouge pas : l'en-tête et les canaux (6), le titre du canal, la saisie, le pied.
    const fixe = 5 + lignes(`${v.ouvert}     ${actuel?.sert_a ?? ''}`) + (v.ecriture ? 3 : v.note ? 2 : 0) + 2
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
      <Box flexDirection="column">
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
          </Box>
        </Box>
        <Text>
          <Text bold color={ABRICOT}>{SIGNES[v.ouvert] ?? '#'} {v.ouvert}</Text>
          {actuel?.sert_a ? <Text dimColor>{`  ${actuel.sert_a}`}</Text> : ''}
        </Text>
        {v.avis ? <Text color={ROSE}>{v.avis}</Text> : null}
        {debut > 0 ? (
          <Button key="avant" hotkey="k" plain dimColor onPress={() => update($, vue, x => ({ ...x, decalage: Math.min(x.messages.length - 1, x.decalage + pas) }))}>
            <Text underline>{`↑ ${debut} plus ancien${debut > 1 ? 's' : ''}`}</Text>
          </Button>
        ) : null}
        {fil.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor italic>{VIDES[(v.ouvert.length + v.jour) % VIDES.length]}</Text>
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
                <Box gap={2}>
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
            {e.surface === 'terminal' ? <Text color={ABRICOT} bold>{'› '}</Text> : ''}
            <Box flexGrow={1} flexDirection="column">
              <Input
                key={`saisie-${v.ouvert}-${v.envois}`}
                placeholder={e.surface === 'terminal' ? `Écrire dans #${v.ouvert}, Entrée pour envoyer` : `Écrire dans #${v.ouvert}`}
                value=""
                autoFocus
                rows={2}
                submitLabel="Envoyer"
                onSubmit={texte => { void envoyer($, texte) }}
              />
            </Box>
          </Box>
        ) : null}
        <Box marginTop={1} gap={3}>
          <Button key="rafraichir" hotkey="r" plain dimColor onPress={() => charger($)}>
            <Text underline>Rafraîchir</Text>
          </Button>
          <Link href={`${SITE}/canaux/${v.ouvert}`} label="Ouvrir sur le site" />
        </Box>
      </Box>
    )
  })
}
