<!-- Translated store listing (it). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Blocco truffe e phishing: Parry

## Short description

Blocca siti truffa, phishing e negozi falsi. 100% sul dispositivo: la tua navigazione non lascia mai il tuo computer.

## Full description

Non esiste un server. Parry legge la pagina su cui ti trovi, il messaggio
che incolli e il negozio dove stai per pagare — interamente dentro il tuo
browser — e non invia mai altrove ciò che navighi, digiti o incolli.

**Perché Parry**

La maggior parte delle estensioni anti-truffa comunica con i propri server:
inviano le pagine che visiti, o un loro hash, ai server di un'azienda e
ricevono un verdetto in cambio. Parry non lo fa, perché non ne ha bisogno —
lo stesso rilevamento che girerebbe nel cloud viene eseguito localmente.
Questo significa nessun account, nessuna interruzione del server che ti
lascia senza protezione, e niente sulla tua navigazione che possa trapelare,
essere richiesto con un'ingiunzione o essere venduto silenziosamente in
seguito. È gratuito, senza livello premium, senza prova gratuita e senza
"esegui l'upgrade per sbloccare la protezione in tempo reale" — l'intero
prodotto è il prodotto gratuito.

**Cosa blocca**

- **Login bancari e di marchi imitati** — Parry confronta tramite hash
  l'icona e il logo della pagina con una tabella di 64 marchi (banche,
  operatori telefonici e servizi governativi degli Emirati Arabi Uniti
  inclusi, insieme a PayPal, Microsoft, Google e altri) e rileva i domini
  con omografi IDN che scrivono un marchio usando caratteri stranieri
  simili. Un falso login con il logo giusto sul dominio sbagliato viene
  individuato anche quando l'indirizzo stesso sembra familiare.
- **Negozi falsi** — falsi conti alla rovescia, pressione "ne restano solo
  2", badge di fiducia hotlinkati, richieste di pagamento fuori piattaforma
  e contatti mancanti vengono mostrati in una scheda acquisti pop-up prima
  del checkout.
- **Drainer di wallet crypto** — avvisa prima di approvazioni rischiose e
  firme alla cieca, incluse le deleghe di account EIP-7702 e le richieste
  multi-wallet EIP-6963, e blocca del tutto i tentativi di furto della frase
  di recupero.
- **Truffe di supporto tecnico** — un blocco a schermo intero per le pagine
  "il tuo PC è infetto, chiama subito questo numero", con una via di fuga in
  un clic che prima disinnesca le trappole di blocco schermo e del pulsante
  Indietro della pagina.
- **Attacchi ClickFix e da appunti** — il trucco malware in più rapida
  crescita del 2025: un falso CAPTCHA "verifica di essere umano" che ti
  convince a incollare un comando nella finestra Esegui di Windows. Parry
  sovrascrive il payload dannoso negli appunti e blocca la pagina a schermo
  intero prima che possa essere eseguito.
- **Moduli che perdono dati** — avvisa nel momento in cui un sito invia
  l'email o il numero di telefono digitati a un tracker, *prima* che tu
  prema invio, e indica separatamente gli script di fingerprinting e le
  trappole di permesso notifiche "clicca su Consenti per continuare".

**Come funziona**

1. Parry legge la pagina stessa, sul tuo dispositivo — il suo testo, il
   layout, i moduli di accesso e le icone — nel momento in cui la apri,
   oppure il messaggio che incolli nel popup per un controllo di messaggio
   sospetto.
2. Un modello sul dispositivo e un insieme di regole valutano ciò che
   trova. Un singolo segnale debole non produce mai più di una discreta nota
   *sospetta*; un verdetto *pericoloso* richiede che segnali indipendenti
   concordino, così le pagine legittime vengono segnalate per errore molto
   raramente.
3. Ricevi una motivazione in linguaggio semplice, non solo un banner rosso,
   con una soluzione in un clic: *Lascia questa pagina* per un avviso
   pericoloso, *Portami al sito vero* per una pagina che imita un marchio —
   oppure, se Parry ha sbagliato, metti in pausa l'avviso su quel sito per
   un'ora, un giorno o per sempre.

**Statistiche e spiegabilità**

Ogni avviso si apre in un pannello *Perché questo verdetto?* che elenca le
ragioni esatte dietro di esso — un'icona di marca sul dominio sbagliato, un
dominio ingannevole, un campo password che invia a un host esterno — invece
di un punteggio inspiegato. La scheda Statistiche nelle impostazioni mostra
le pagine controllate, le minacce bloccate e le rilevazioni sulla privacy,
con un grafico dell'attività giornaliera che puoi alternare tra gli ultimi 7
giorni, gli ultimi 30 giorni o i tuoi totali dall'installazione. Ogni numero
viene calcolato e memorizzato sul tuo dispositivo; nessuno di essi viene mai
inviato altrove.

**Privacy: cosa fa e cosa non fa Parry**

Parry chiede l'accesso alle pagine che visiti perché è così che l'analisi
sul dispositivo le legge davvero — il testo, il layout, i moduli di accesso
e le icone — il controllo avviene localmente, nel tuo browser, non su un
server da qualche parte. L'unica cosa che lascia il tuo dispositivo per
impostazione predefinita è un semplice download di file: l'elenco pubblico
delle minacce con i domini truffa noti, scaricato periodicamente dal feed
open source di Parry, così il blocco funziona subito dopo l'installazione e
anche offline. Niente su di te o sulla tua navigazione specifica accompagna
quel download. Le segnalazioni della community, facoltative e disattivate
per impostazione predefinita, possono inviare un nome host anonimizzato e un
segnale di rischio numerico per una pagina segnalata come pericolosa — mai
un URL, il testo della pagina o qualcosa che hai digitato — e solo se lo
attivi tu stesso. Impostazioni → Informazioni mostra esattamente cosa ha
lasciato il tuo dispositivo, così puoi verificare tu stesso l'assenza di
telemetria invece di fidarti della nostra parola.

**Domande frequenti**

**In cosa Parry è diverso da Guardio, Malwarebytes o Norton?**

Quelle estensioni controllano le pagine che visiti inviando informazioni ai
propri server: Guardio e Bitdefender TrafficLight analizzano le pagine nel
cloud, Norton Safe Web gestisce un "Remote URL Reputation Service" e,
secondo la propria dichiarazione, raccoglie i tuoi dati personali, la tua
posizione e la tua cronologia web, e Avast Online Security invia gli URL che
visiti insieme a un ID dispositivo e informazioni sul dispositivo ai propri
server. Parry non ha un server. Ogni controllo — leggere la pagina,
confrontare le icone dei marchi, analizzare un messaggio incollato — viene
eseguito sul tuo dispositivo, e niente di ciò che navighi, digiti o
controlli viene inviato da nessuna parte. La stessa scheda di Guardio
limita inoltre il proprio livello gratuito ai soli avvisi sul sito web; il
blocco in tempo reale, la protezione dai download e il monitoraggio delle
fughe di dati sono funzioni a pagamento (9,99–34,99 $/mese). L'intero set
di funzionalità di Parry — blocco in tempo reale, rilevamento di negozi
falsi, protezione dai drainer di wallet crypto, blocco delle truffe di
supporto tecnico, protezione appunti/ClickFix, una dashboard statistiche e
una motivazione in linguaggio semplice per ogni avviso — è gratuito, senza
livello premium.

**Parry è davvero gratuito? Qual è il trucco?**

Sì, e non c'è alcun trucco: nessun livello premium, nessuna prova gratuita,
nessun "esegui l'upgrade per sbloccare la protezione in tempo reale". Parry
non gestisce un server per cui addebitarti qualcosa, quindi non c'è nulla da
vendere in più — l'intero prodotto è il prodotto gratuito. È un approccio
diverso dalla maggior parte della categoria: diversi concorrenti offrono un
livello gratuito limitato e fanno pagare mensilmente per la protezione vera
(il livello gratuito di Guardio è solo avvisi; il blocco completo costa
9,99–34,99 $/mese), mentre altri sono estensioni gratuite che fanno
cross-selling verso una suite di sicurezza a pagamento. Parry si mantiene in
un altro modo — restando leggero, sul dispositivo e abbastanza utile da
farti tenere l'installazione, più donazioni facoltative. Se vuoi sostenere
lo sviluppo, c'è un link nell'estensione, mai un paywall.

**Anche incluso**

- Controllo messaggi truffa — incolla qualsiasi testo SMS/WhatsApp/email per
  un verdetto istantaneo e completamente privato.
- Controllo dei risultati sponsorizzati su Google/Bing/DuckDuckGo — segnala
  un annuncio che porta a un sito diverso da quello mostrato.
- Modalità rigorosa — un interruttore blocca a schermo intero anche le
  pagine "sospette" con un linguaggio più semplice, per un familiare meno
  esperto di tecnologia.
- Scegli la tua lingua: tutte le 20 lingue, selezionabili dal popup o dalle
  impostazioni, indipendentemente dalla lingua del tuo browser.
- Esportazione/importazione delle impostazioni e sincronizzazione
  facoltativa tra dispositivi — la sincronizzazione del tuo browser, sempre
  senza account o server Parry.
- Modalità scura, cronologia protezione e link di salvataggio in un clic,
  contenuti falsi di premi/omaggi nascosti.

Numeri concreti, non aggettivi: disponibile in **20 lingue** con traduzioni
complete di menu, avvisi e impostazioni (non solo una scheda dello store
tradotta); circa **630 test automatizzati**; una blocklist di migliaia di
domini truffa, aggiornata continuamente da un feed open source; e
un'installazione sotto 1 MB — circa 450 KB compressi, nessun runtime
pesante.

## What's new (0.8.0)

- **ScamShield ora si chiama Parry.** Due prodotti molto noti usano già il
  nome "ScamShield" — il governo di Singapore gestisce una propria app
  nazionale anti-truffa chiamata ScamShield, e lo Scam Shield di T-Mobile è
  un servizio di blocco truffe molto usato da un operatore statunitense —
  quindi l'estensione è stata rinominata per evitare confusione con
  entrambi. Non è cambiato nulla nel modo in cui ti protegge, in ciò che
  raccoglie (niente) o nelle tue impostazioni.
- **Popup ridisegnato:** un menu *Metti in pausa la protezione* a tempo (1
  ora, 1 giorno o Sempre) sostituisce la vecchia formulazione basata sulla
  fiducia, contatori in evidenza mostrano a colpo d'occhio le minacce
  bloccate dall'installazione e questa settimana, ogni avviso si apre in un
  pannello *Perché questo verdetto?* con le ragioni esatte, e un piè di
  pagina rotante più chiaro alterna un promemoria sulla privacy, una
  richiesta di recensione meritata e un link di supporto.
- **Nuova icona** — un semplice simbolo di deviazione che si adatta meglio
  al nuovo nome.

Nessun nuovo permesso. Sempre `storage`, `declarativeNetRequest`, `alarms` e
accesso http/https, esattamente come nella 0.3.1.
