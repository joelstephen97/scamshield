<!--
  Canonical English store listing. This is the source text Task 4's
  translation agents work from to produce the other 19 locale listings.

  NOTE: two of our _locales directory names differ from the locale codes the
  Chrome Web Store developer dashboard expects when uploading a translated
  listing: `pt_BR` must be entered as `pt-BR`, and `zh_CN` must be entered as
  `zh-CN` (hyphen, not underscore, and the dashboard is case-sensitive about
  the region suffix). Every other locale code matches its directory name.
-->

## Name

ScamShield — Protección contra estafas y phishing

## Short description

Protección contra estafas y phishing en el dispositivo: avisa, detecta marcas falsas, revisa mensajes. Nada sale del dispositivo.

## Full description

ScamShield te avisa antes de que una página de estafa o phishing te engañe,
todo en tu propio dispositivo. Analiza mucho más que la barra de direcciones:
observa el texto, el diseño y el formulario de inicio de sesión de la
página, y reconoce cuando una página luce el icono o el logotipo de una marca
en un dominio equivocado, detectando así imitaciones convincentes que un
comprobador basado solo en la URL pasaría por alto. ¿Recibiste un WhatsApp,
un SMS o un correo sospechoso? Pégalo en la ventana emergente para obtener un
veredicto instantáneo y privado.

Un clic te devuelve a un lugar seguro: *Salir de esta página* ante un aviso
peligroso, o *Llévame al sitio real* ante una página que suplanta una marca.
Si ScamShield se equivoca, puedes *confiar en el sitio* durante una hora,
hasta mañana o siempre, e *informar de un error* con un solo toque.

Privado por diseño: nada de lo que navegas, escribes o compruebas sale nunca
de tu dispositivo. La única actividad de red es la descarga del archivo
público de la lista de amenazas y —solo si lo activas tú— el envío de un
nombre de host anonimizado y una señal de riesgo de una página marcada. Una
página de ajustes muestra exactamente qué sale de tu dispositivo, para que
puedas comprobar tú mismo que no hay telemetría.

Disponible en 20 idiomas, con traducciones completas de menús, avisos y
ajustes, no solo una ficha de tienda traducida.

Funciones:
• Avisos de phishing y estafas en tiempo real, con motivos en lenguaje claro
• Análisis de la página: un modelo en el dispositivo lee la propia página
  —texto, diseño, formularios de inicio de sesión— para detectar páginas de
  phishing totalmente nuevas, no solo URL ya conocidas como maliciosas
• Detección de imitaciones de marca: iconos y logotipos comparados mediante
  hash con una tabla de 64 marcas (49 con hashes de icono), incluidos bancos,
  operadoras y servicios gubernamentales de los Emiratos Árabes Unidos
  (Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon, UAE PASS, MOHRE, Dubai
  Police…), además de dominios con homógrafos IDN (caracteres extranjeros
  similares que sustituyen letras latinas)
• Comprobador de mensajes de estafa: pega cualquier texto de SMS/WhatsApp/
  correo para obtener un veredicto instantáneo y totalmente privado
• Detecta formularios de inicio de sesión falsos que envían tu contraseña a
  otro sitio (los inicios de sesión únicos mediante Google/Microsoft/Okta se
  reconocen como seguros)
• Paquete de privacidad: avisa cuando un sitio envía tu correo/teléfono a un
  rastreador antes de que pulses enviar, identifica scripts de creación de
  huellas digitales y marca las trampas de notificación de «haz clic en
  Permitir para continuar»
• Comprobaciones de compra: cuentas atrás falsas, presión falsa de «solo
  quedan 2», insignias de confianza enlazadas directamente, solicitudes de
  pago fuera de la plataforma y falta de datos de contacto, mostrados en una
  tarjeta de compra emergente
• Comprobación de resultados patrocinados en Google/Bing/DuckDuckGo: marca un
  anuncio que lleva a un sitio distinto del que muestra
• Aviso a pantalla completa para estafas casi seguras (ataques al portapapeles
  ClickFix con CAPTCHA falsos, falsas indicaciones de actualización del
  navegador, phishing de tarifas de entrega, páginas intimidatorias de
  soporte técnico), con una pausa forzada y una comparación entre el dominio
  real y el falso, reservado para detecciones con una tasa de falsos
  positivos casi nula
• Modo estricto: un solo interruptor que bloquea a pantalla completa incluso
  las páginas «sospechosas» con un lenguaje más sencillo, para un familiar
  menos experto en tecnología
• Rescate con un clic: *Llévame al sitio real* en páginas que suplantan una
  marca, *Salir de esta página* ante cualquier aviso peligroso
• Confía en un sitio durante 1 hora, hasta mañana o siempre, e informa de un
  error con un solo toque
• Bloquea dominios de estafa conocidos, actualizados a diario desde un feed
  de código abierto (OpenPhish + URLhaus, muy filtrado contra falsos
  positivos)
• Protección del monedero cripto: avisa antes de aprobaciones arriesgadas y
  firmas a ciegas (con compatibilidad con la delegación de cuenta EIP-7702 y
  con múltiples monederos EIP-6963); bloquea el robo de la frase de
  recuperación
• Protección contra el secuestro del portapapeles: avisa cuando un sitio
  copia un comando en tu portapapeles
• Oculta el falso contenido de premios/regalos de estafa
• Exportación/importación de ajustes y sincronización opcional entre
  dispositivos (la propia sincronización de tu navegador, siguiendo sin
  cuenta ni servidor de ScamShield)
• Historial y estadísticas de protección, guardados solo en tu dispositivo;
  modo oscuro
• Informes comunitarios opcionales, desactivados de forma predeterminada,
  nunca con URL ni texto de la página
• Más pequeño y rápido: ~0,6 MB sin comprimir, sin tiempo de ejecución pesado
• Análisis 100 % en el dispositivo: sin rastreo, sin recopilación de datos

## What's new (0.6.0)

La versión de «solo problemas reales»: cada función nueva se dirige a un
patrón de estafa o privacidad real y validado, y ninguna añade un permiso.

- Ahora analiza también dentro de los iframes, donde antes se escondían de
  forma invisible los formularios de phishing.
- Un nuevo nivel de aviso a pantalla completa para estafas casi seguras:
  ataques al portapapeles ClickFix con CAPTCHA falsos, falsas indicaciones de
  actualización del navegador, phishing de tarifas de entrega (DHL/FedEx/
  Aramex/Royal Mail/Evri/Emirates Post/DPD) y páginas intimidatorias de
  soporte técnico, con una pausa forzada y una comparación entre el dominio
  real y el falso, reservado para detecciones con una tasa de falsos
  positivos casi nula.
- Un nuevo paquete de privacidad: avisos de formularios con fugas (tu correo/
  teléfono enviado a un rastreador antes de pulsar enviar, en texto plano o
  con hash), detección de huellas digitales y avisos de trampas de permiso de
  notificación, todo en el dispositivo.
- Nuevas comprobaciones de compra: cuentas atrás falsas, presión falsa de
  «solo quedan 2», insignias de confianza enlazadas directamente, solicitudes
  de pago fuera de la plataforma y falta de datos de contacto, además de una
  comprobación de resultados patrocinados en Google/Bing/DuckDuckGo.
- Modo estricto: un solo interruptor que bloquea a pantalla completa incluso
  las páginas «sospechosas» con un lenguaje más sencillo, para ayudar a un
  familiar menos experto a estar seguro.
- Exportación/importación de ajustes y sincronización opcional entre
  dispositivos (la propia sincronización de tu navegador, siguiendo sin
  cuenta ni servidor de ScamShield).
- Detección de homógrafos IDN y mejoras contra vaciadores de monedero
  (compatibilidad con múltiples monederos EIP-6963, detección de la
  delegación de cuenta EIP-7702).
- Compatibilidad con 20 idiomas, con traducciones completas de menús, avisos
  y ajustes, no solo de la ficha de la tienda.

Sin permisos nuevos. Sigue usando `storage`, `declarativeNetRequest`,
`alarms` y acceso http/https, exactamente igual que la 0.3.1.
