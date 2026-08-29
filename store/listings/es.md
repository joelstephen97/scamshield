<!-- Translated store listing (es). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Bloqueador de estafas y phishing: ScamShield

## Short description

Bloquea sitios de estafa, phishing y tiendas falsas. 100% en el dispositivo: tu navegación nunca sale de tu ordenador.

## Full description

No hay servidor. ScamShield lee la página en la que estás, el mensaje que pegas
y la tienda donde estás pagando — todo dentro de tu navegador — y nunca
envía a ningún otro sitio lo que navegas, escribes o pegas.

**Por qué ScamShield**

La mayoría de las extensiones antiestafa se conectan a sus servidores:
envían las páginas que visitas, o un hash de ellas, a los servidores de una
empresa y reciben un veredicto de vuelta. ScamShield no lo hace, porque no lo
necesita — la misma detección que se ejecutaría en la nube se ejecuta
localmente en su lugar. Eso significa sin cuenta, sin una caída del
servidor que te deje desprotegido, y nada sobre tu navegación que pueda
filtrarse, ser requerido judicialmente o venderse en silencio más adelante.
Es gratis, sin nivel premium, sin prueba y sin "actualiza para desbloquear
la protección en tiempo real" — todo el producto es el producto gratuito.

**Qué bloquea**

- **Inicios de sesión de bancos y marcas falsificados** — ScamShield compara
  mediante hash el icono y el logo de la página con una tabla de 64 marcas
  (bancos, operadoras y servicios gubernamentales de los EAU incluidos,
  junto a PayPal, Microsoft, Google y más) y detecta dominios con
  homógrafos IDN que deletrean una marca usando caracteres extranjeros
  parecidos. Un inicio de sesión falso con el logo correcto en el dominio
  equivocado se detecta incluso cuando la dirección en sí parece familiar.
- **Tiendas falsas** — cuentas regresivas falsas, presión de "solo quedan
  2", insignias de confianza enlazadas de forma indebida, solicitudes de
  pago fuera de la plataforma y datos de contacto ausentes se muestran en
  una tarjeta de compra emergente antes de que pagues.
- **Vaciadores de wallets cripto** — avisa antes de aprobaciones riesgosas
  y firmas a ciegas, incluidas las delegaciones de cuenta EIP-7702 y las
  solicitudes multi-wallet EIP-6963, y bloquea directamente los intentos de
  robo de la frase de recuperación.
- **Estafas de soporte técnico** — un bloqueo a pantalla completa para
  páginas de "tu PC está infectado, llama a este número ahora", con una
  salida de un clic que primero desactiva las trampas de bloqueo de
  pantalla y del botón Atrás de la página.
- **Ataques ClickFix y del portapapeles** — el truco de malware de más
  rápido crecimiento de 2025: un falso CAPTCHA de "verifica que eres
  humano" que te convence de pegar un comando en Ejecutar de Windows. ScamShield
  sobrescribe la carga maliciosa del portapapeles y bloquea la página a
  pantalla completa antes de que pueda ejecutarse.
- **Formularios que filtran datos** — avisa en el momento en que un sitio
  envía el correo o el teléfono que escribiste a un rastreador, *antes* de
  que pulses enviar, y señala por separado los scripts de fingerprinting y
  las trampas de permiso de notificaciones "haz clic en Permitir para
  continuar".

**Cómo funciona**

1. ScamShield lee la propia página, en tu dispositivo — su texto, diseño,
   formularios de inicio de sesión e iconos — en el momento en que la
   abres, o el mensaje que pegas en el popup para una comprobación de
   mensaje sospechoso.
2. Un modelo en el dispositivo y un conjunto de reglas puntúan lo que
   encuentra. Una sola señal débil nunca produce más que una discreta nota
   de *sospechoso*; un veredicto de *peligroso* necesita que coincidan
   señales independientes, así que las páginas legítimas rara vez se marcan
   por error.
3. Obtienes una razón en lenguaje sencillo, no solo un banner rojo, con una
   solución en un clic: *Salir de esta página* ante una alerta peligrosa,
   *Llévame al sitio real* ante una página de suplantación de marca — o, si
   ScamShield se equivocó, pausa la alerta en ese sitio durante una hora, un día
   o para siempre.

**Estadísticas y explicabilidad**

Cada alerta se abre en un panel *¿Por qué este veredicto?* que enumera las
razones exactas detrás de ella — un icono de marca en el dominio
equivocado, un dominio similar, un campo de contraseña que envía a un host
externo — en lugar de una puntuación sin explicar. La pestaña Estadísticas
de los ajustes muestra páginas comprobadas, amenazas detenidas y hallazgos
de privacidad, con un gráfico de actividad diaria que puedes alternar entre
los últimos 7 días, los últimos 30 días o tus totales desde la instalación.
Cada cifra se calcula y almacena en tu dispositivo; ninguna se envía jamás
a ningún sitio.

**Privacidad: qué hace y qué no hace ScamShield**

ScamShield solicita acceso a las páginas que visitas porque así es como el
análisis en el dispositivo realmente las lee — el texto, el diseño, los
formularios de inicio de sesión y los iconos — la comprobación ocurre
localmente, en tu navegador, no en un servidor en algún lugar. Lo único que
sale de tu dispositivo de forma predeterminada es una simple descarga de
archivo: la lista pública de amenazas de dominios de estafa conocidos,
obtenida periódicamente del feed de código abierto de ScamShield para que el
bloqueo funcione justo después de la instalación y sin conexión. Nada sobre
ti o tu navegación específica acompaña esa descarga. El envío de reportes
comunitarios, opcional y desactivado de forma predeterminada, puede enviar
un nombre de host anonimizado y una señal de riesgo numérica de una página
marcada como peligrosa — nunca una URL, el texto de la página ni nada que
hayas escrito — y solo si tú mismo lo activas. Ajustes → Acerca de muestra
exactamente qué ha salido de tu dispositivo, para que puedas verificar tú
mismo la telemetría cero en lugar de fiarte de nuestra palabra.

**Preguntas frecuentes**

**¿En qué se diferencia ScamShield de Guardio, Malwarebytes o Norton?**

Esas extensiones comprueban las páginas que visitas enviando información a
sus propios servidores: Guardio y Bitdefender TrafficLight analizan páginas
en la nube, Norton Safe Web ejecuta un "servicio de reputación de URL
remoto" y, según su propia divulgación, recopila tus datos personales, tu
ubicación y tu historial web, y Avast Online Security envía las URL que
visitas junto con un ID de dispositivo e información del dispositivo a sus
servidores. ScamShield no tiene servidor. Cada comprobación — leer la página,
cotejar iconos de marca, analizar un mensaje pegado — se ejecuta en tu
dispositivo, y nada de lo que navegas, escribes o compruebas se envía a
ningún sitio. La propia ficha de Guardio también limita su nivel gratuito a
solo alertas de sitios web; el bloqueo en tiempo real, la protección de
descargas y la monitorización de filtraciones son funciones de pago
(9,99–34,99 $/mes). El conjunto completo de funciones de ScamShield — bloqueo en
tiempo real, detección de tiendas falsas, protección contra vaciadores de
wallets cripto, bloqueo de estafas de soporte técnico, protección de
portapapeles/ClickFix, un panel de estadísticas y una razón en lenguaje
sencillo en cada alerta — es gratis, sin nivel premium.

**¿ScamShield es realmente gratis? ¿Cuál es la trampa?**

Sí, y no hay ninguna trampa: sin nivel premium, sin prueba, sin "actualiza
para desbloquear la protección en tiempo real". ScamShield no gestiona un
servidor por el que cobrarte, así que no hay nada que venderte después — el
producto entero es el producto gratuito. Eso es distinto de la mayoría de
la categoría: varios rivales regalan un nivel gratuito limitado y cobran
mensualmente por su protección real (el nivel gratuito de Guardio es solo
alertas; el bloqueo completo cuesta 9,99–34,99 $/mes), mientras que otros
son extensiones gratuitas que venden de forma cruzada una suite de
seguridad de pago. ScamShield se sostiene de otra manera — manteniéndose
pequeño, en el dispositivo y lo bastante útil para que lo mantengas
instalado, más donaciones opcionales. Si quieres apoyar su desarrollo, hay
un enlace en la extensión, nunca un muro de pago.

**También incluye**

- Comprobador de mensajes de estafa — pega cualquier texto de SMS/WhatsApp/
  correo para un veredicto instantáneo y totalmente privado.
- Comprobación de resultados patrocinados en Google/Bing/DuckDuckGo —
  señala un anuncio que lleva a un sitio distinto del que muestra.
- Modo estricto — un interruptor bloquea a pantalla completa incluso las
  páginas "sospechosas" con un lenguaje más sencillo, para un familiar
  menos ducho en tecnología.
- Elige tu idioma: los 20 idiomas, seleccionables desde el popup o los
  ajustes, independientemente del idioma de tu navegador.
- Exportación/importación de ajustes y sincronización opcional entre
  dispositivos — la propia sincronización de tu navegador, aún sin cuenta
  ni servidor de ScamShield.
- Modo oscuro, historial de protección y enlaces de rescate en un clic,
  contenido falso de premios/sorteos oculto.

Cifras concretas, no adjetivos: disponible en **20 idiomas** con
traducciones completas de menús, alertas y ajustes (no solo una ficha de
tienda traducida); alrededor de **630 pruebas automatizadas**; una lista de
bloqueo de miles de dominios de estafa, actualizada continuamente desde un
feed de código abierto; y una instalación de menos de 1 MB — unos 450 KB
comprimidos, sin runtime pesado.

## What's new (0.9.0)

- **Una lista de amenazas mucho más grande.** La lista de bloqueo pasó de
  unos pocos miles de dominios a **más de 425.000 dominios de estafa y
  phishing confirmados**, además de una lista de vigilancia con más de un
  millón de entradas de menor confianza — recopiladas de más de una
  docena de bases de datos de amenazas de código abierto, cotejadas entre
  sí y filtradas frente a los sitios más populares del mundo para que las
  falsas alarmas sean poco frecuentes. La comparación sigue ocurriendo
  totalmente en tu dispositivo: la lista se descarga como huellas
  compactas y se comprueba localmente, así que ningún sitio que visitas se
  envía jamás a ningún sitio. Las actualizaciones llegan como pequeños
  diffs cada pocas horas.
- **Cuando ScamShield bloquea un sitio incluido en la lista, ahora te indica qué
  fuentes independientes lo reportaron** — verificable, no una puntuación
  de caja negra.
- **Detección de imitaciones más inteligente**: las comprobaciones de
  suplantación de marca ahora detectan letras intercambiadas, caracteres
  similares, nombres de marca ocultos dentro de subdominios largos y
  terminaciones de dominio intercambiadas, con estrictas salvaguardas para
  que los sitios de marcas reales nunca se marquen por error.
- **Nuevas señales de advertencia**: cadenas de subdominios inusualmente
  profundas, partes de dirección anormalmente largas, destinos de
  acortadores de enlaces, terminaciones de dominio muy usadas en estafas y
  proveedores de alojamiento gratuito ahora añaden indicios de precaución
  al veredicto de una página.

Sin permisos nuevos. Sigue usando `storage`, `declarativeNetRequest`,
`alarms` y acceso http/https, exactamente igual que en 0.3.1.
