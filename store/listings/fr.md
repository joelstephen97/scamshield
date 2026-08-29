<!-- Translated store listing (fr). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Bloqueur d'arnaques et de phishing : Parry

## Short description

Bloque les sites d'arnaque, le phishing et les faux magasins. 100 % sur l'appareil, votre navigation ne quitte jamais l'ordinateur.

## Full description

Il n'y a pas de serveur. Parry lit la page sur laquelle vous êtes, le
message que vous collez et la boutique où vous passez commande — entièrement
à l'intérieur de votre navigateur — et n'envoie jamais ce que vous
consultez, saisissez ou collez ailleurs.

**Pourquoi Parry**

La plupart des extensions anti-arnaque communiquent avec leurs serveurs :
elles envoient les pages que vous visitez, ou un hachage de celles-ci, aux
serveurs d'une entreprise et reçoivent un verdict en retour. Parry ne le
fait pas, parce qu'il n'en a pas besoin — la même détection qui tournerait
dans le cloud s'exécute localement à la place. Cela signifie pas de compte,
pas de panne de serveur qui vous laisse sans protection, et rien concernant
votre navigation qui puisse fuiter, être requis par une citation à comparaître
ou être discrètement revendu plus tard. C'est gratuit, sans palier premium,
sans essai et sans « passez à la version supérieure pour débloquer la
protection en temps réel » — le produit entier est le produit gratuit.

**Ce qu'il bloque**

- **Connexions bancaires et de marques imitées** — Parry compare par
  hachage l'icône et le logo de la page à une table de 64 marques (banques,
  opérateurs télécoms et services gouvernementaux des Émirats arabes unis
  inclus, aux côtés de PayPal, Microsoft, Google et bien d'autres) et
  détecte les domaines à homographes IDN qui orthographient une marque avec
  des caractères étrangers qui lui ressemblent. Une fausse page de connexion
  arborant le bon logo sur le mauvais domaine est détectée même quand
  l'adresse elle-même paraît familière.
- **Faux magasins** — faux comptes à rebours, pression « plus que 2 en
  stock », badges de confiance en hotlink, demandes de paiement hors
  plateforme et coordonnées manquantes sont signalés dans une fenêtre pop-up
  d'achat avant que vous ne passiez à la caisse.
- **Vidangeurs de portefeuille crypto** — alerte avant les approbations
  risquées et les signatures à l'aveugle, y compris les délégations de
  compte EIP-7702 et les demandes multi-portefeuilles EIP-6963, et bloque
  purement et simplement les tentatives de vol de phrase de récupération.
- **Arnaques au support technique** — un blocage plein écran pour les pages
  « votre PC est infecté, appelez ce numéro maintenant », avec une
  échappatoire en un clic qui désamorce d'abord les pièges de verrouillage
  d'écran et de bouton Retour de la page.
- **Attaques ClickFix et par le presse-papiers** — l'arnaque la plus en
  croissance de 2025 : un faux CAPTCHA « vérifiez que vous êtes humain » qui
  vous incite à coller une commande dans l'exécuteur Windows. Parry
  écrase la charge malveillante du presse-papiers et bloque la page en
  plein écran avant qu'elle ne puisse s'exécuter.
- **Formulaires qui fuient** — alerte dès qu'un site envoie l'e-mail ou le
  numéro de téléphone que vous avez saisi à un traqueur, *avant* que vous
  n'appuyiez sur envoyer, et signale séparément les scripts de prise
  d'empreinte et les pièges de permission de notification « cliquez sur
  Autoriser pour continuer ».

**Comment ça marche**

1. Parry lit la page elle-même, sur votre appareil — son texte, sa mise en
   page, ses formulaires de connexion et ses icônes — au moment où vous
   l'ouvrez, ou le message que vous collez dans le pop-up pour une
   vérification de message suspect.
2. Un modèle embarqué et un ensemble de règles évaluent ce qu'il trouve. Un
   seul signal faible ne produit jamais plus qu'une discrète note
   *suspecte* ; un verdict *dangereux* exige que des signaux indépendants
   concordent, si bien que les pages légitimes sont rarement signalées par
   erreur.
3. Vous obtenez une explication en langage clair, pas seulement une bannière
   rouge, avec une solution en un clic : *Quitter cette page* pour une
   alerte dangereuse, *Aller sur le vrai site* pour une page d'usurpation
   de marque — ou, si Parry s'est trompé, suspendez l'alerte sur ce site
   pendant une heure, un jour ou pour toujours.

**Statistiques et explicabilité**

Chaque alerte s'ouvre sur un panneau *Pourquoi ce verdict ?* qui liste les
raisons exactes derrière elle — une icône de marque sur le mauvais domaine,
un domaine imitateur, un champ de mot de passe qui envoie vers un hôte
étranger — au lieu d'un score inexpliqué. L'onglet Statistiques des
paramètres affiche les pages vérifiées, les menaces stoppées et les constats
de confidentialité, avec un graphique d'activité quotidienne que vous pouvez
basculer entre les 7 derniers jours, les 30 derniers jours, ou vos totaux
depuis l'installation. Chaque chiffre est calculé et stocké sur votre
appareil ; rien n'est jamais envoyé où que ce soit.

**Confidentialité : ce que Parry fait et ne fait pas**

Parry demande l'accès aux pages que vous visitez parce que c'est ainsi que
l'analyse embarquée les lit réellement — le texte, la mise en page, les
formulaires de connexion et les icônes — la vérification a lieu localement,
dans votre navigateur, pas sur un serveur quelque part. La seule chose qui
quitte votre appareil par défaut est un simple téléchargement de fichier :
la liste publique des menaces regroupant les domaines d'arnaque connus,
récupérée périodiquement depuis le flux open source de Parry afin que le
blocage fonctionne dès après l'installation et hors ligne. Rien vous
concernant ni concernant votre navigation spécifique n'accompagne ce
téléchargement. Les signalements communautaires, facultatifs et désactivés
par défaut, peuvent envoyer un nom d'hôte anonymisé et un signal de risque
numérique pour une page signalée comme dangereuse — jamais une URL, le texte
d'une page ou quoi que ce soit que vous avez saisi — et seulement si vous
l'activez vous-même. Paramètres → À propos montre exactement ce qui a
quitté votre appareil, afin que vous puissiez vérifier vous-même l'absence
de télémétrie plutôt que de nous croire sur parole.

**Foire aux questions**

**En quoi Parry diffère-t-il de Guardio, Malwarebytes ou Norton ?**

Ces extensions vérifient les pages que vous visitez en envoyant des
informations à leurs propres serveurs : Guardio et Bitdefender
TrafficLight analysent les pages dans le cloud, Norton Safe Web exploite un
« service de réputation d'URL à distance » et, selon sa propre déclaration,
collecte vos données personnelles, votre localisation et votre historique
de navigation, et Avast Online Security envoie les URL que vous visitez
ainsi qu'un identifiant d'appareil et des informations sur celui-ci à ses
serveurs. Parry n'a pas de serveur. Chaque vérification — lire la page,
faire correspondre les icônes de marque, analyser un message collé —
s'exécute sur votre appareil, et rien de ce que vous consultez, saisissez ou
vérifiez n'est envoyé où que ce soit. La propre fiche de Guardio limite
également son offre gratuite aux alertes de site uniquement ; le blocage en
temps réel, la protection des téléchargements et la surveillance des fuites
sont des fonctionnalités payantes (9,99–34,99 $/mois). L'ensemble complet
des fonctionnalités de Parry — blocage en temps réel, détection des faux
magasins, protection contre les vidangeurs de portefeuille crypto, blocage
des arnaques au support technique, protection presse-papiers/ClickFix, un
tableau de bord statistique et une raison en langage clair pour chaque
alerte — est gratuit, sans palier premium.

**Parry est-il vraiment gratuit ? Quel est le piège ?**

Oui, et il n'y a aucun piège : pas de palier premium, pas d'essai, pas de
« passez à la version supérieure pour débloquer la protection en temps
réel ». Parry n'exploite pas de serveur qui justifierait de vous facturer,
il n'y a donc rien à vendre en supplément — le produit entier est le
produit gratuit. C'est une approche différente de la plupart des acteurs de
cette catégorie : plusieurs concurrents offrent un palier gratuit limité et
facturent mensuellement leur véritable protection (le palier gratuit de
Guardio se limite aux alertes ; le blocage complet coûte 9,99–34,99 $/mois),
tandis que d'autres sont des extensions gratuites qui font de la vente
croisée vers une suite de sécurité payante. Parry gagne sa vie autrement —
en restant léger, embarqué et suffisamment utile pour que vous le gardiez
installé, plus des dons facultatifs. Si vous souhaitez soutenir son
développement, il y a un lien dans l'extension, jamais de mur payant.

**Également inclus**

- Vérificateur de messages d'arnaque — collez n'importe quel texte
  SMS/WhatsApp/e-mail pour un verdict instantané et entièrement privé.
- Vérification des résultats sponsorisés sur Google/Bing/DuckDuckGo — signale
  une annonce qui mène ailleurs que le site affiché.
- Mode strict — un interrupteur bloque même les pages « suspectes » en plein
  écran avec un langage plus simple, pour un proche moins à l'aise avec la
  technologie.
- Choisissez votre langue : les 20 langues, sélectionnables depuis le pop-up
  ou les paramètres, indépendamment de la langue de votre navigateur.
- Export/import des paramètres et synchronisation facultative entre
  appareils — la synchronisation propre à votre navigateur, toujours sans
  compte ni serveur Parry.
- Mode sombre, historique de protection et liens de sauvetage en un clic,
  contenu de faux prix/cadeaux masqué.

Des chiffres concrets, pas des adjectifs : disponible en **20 langues** avec
traductions complètes des menus, alertes et paramètres (pas seulement une
fiche boutique traduite) ; environ **630 tests automatisés** ; une liste de
blocage de milliers de domaines d'arnaque, mise à jour en continu depuis un
flux open source ; et une installation de moins de 1 Mo — environ 450 Ko
compressés, sans runtime lourd.

## What's new (0.8.0)

- **ScamShield s'appelle désormais Parry.** Deux produits très connus
  portent déjà le nom « ScamShield » — le gouvernement de Singapour exploite
  sa propre application nationale anti-arnaque appelée ScamShield, et le
  Scam Shield de T-Mobile est un service de blocage d'arnaques largement
  utilisé par un opérateur américain —, l'extension a donc été renommée pour
  éviter toute confusion avec l'un ou l'autre. Rien n'a changé dans la façon
  dont elle vous protège, ce qu'elle collecte (rien) ou vos paramètres.
- **Pop-up repensé :** un menu *Suspendre la protection* programmé (1 heure,
  1 jour ou Toujours) remplace l'ancienne formulation de confiance, des
  compteurs en vedette affichent en un coup d'œil les menaces stoppées
  depuis l'installation et cette semaine, chaque alerte s'ouvre sur un
  panneau *Pourquoi ce verdict ?* détaillant les raisons exactes, et un pied
  de page rotatif plus clair alterne un rappel de confidentialité, une
  demande d'avis méritée et un lien de soutien.
- **Nouvelle icône** — un symbole de parade simple qui correspond mieux au
  nouveau nom.

Aucune nouvelle autorisation. Toujours `storage`, `declarativeNetRequest`,
`alarms` et l'accès http/https, exactement comme en 0.3.1.
