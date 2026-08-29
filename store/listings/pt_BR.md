<!-- Translated store listing (pt_BR). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Bloqueador de golpes e phishing: Parry

## Short description

Bloqueia sites de golpe, phishing e lojas falsas. 100% no dispositivo: sua navegação nunca sai do seu computador.

## Full description

Não existe servidor. O Parry lê a página em que você está, a mensagem que
você cola e a loja onde está fechando a compra — tudo dentro do seu
navegador — e nunca envia para nenhum outro lugar o que você navega, digita
ou cola.

**Por que o Parry**

A maioria das extensões antigolpe se comunica com seus servidores: elas
enviam as páginas que você visita, ou um hash delas, para os servidores de
uma empresa e recebem um veredito de volta. O Parry não faz isso, porque
não precisa — a mesma detecção que rodaria na nuvem roda localmente. Isso
significa nenhuma conta, nenhuma queda de servidor que deixe você
desprotegido, e nada sobre sua navegação que possa vazar, ser exigido por
intimação judicial ou ser vendido silenciosamente depois. É gratuito, sem
nível premium, sem período de teste e sem "faça upgrade para desbloquear a
proteção em tempo real" — o produto inteiro é o produto gratuito.

**O que ele bloqueia**

- **Logins de bancos e marcas falsificados** — o Parry compara por hash o
  ícone e o logotipo da página com uma tabela de 64 marcas (bancos,
  operadoras de telecomunicações e serviços governamentais dos Emirados
  Árabes Unidos incluídos, ao lado de PayPal, Microsoft, Google e outros) e
  detecta domínios com homógrafos IDN que grafam uma marca usando caracteres
  estrangeiros parecidos. Um login falso com o logotipo certo no domínio
  errado é detectado mesmo quando o próprio endereço parece familiar.
- **Lojas falsas** — contagens regressivas falsas, pressão de "só restam
  2", selos de confiança com hotlink, pedidos de pagamento fora da
  plataforma e falta de dados de contato são exibidos em um cartão de
  compras pop-up antes de você fechar o pedido.
- **Drenadores de carteiras cripto** — avisa antes de aprovações arriscadas
  e assinaturas às cegas, incluindo delegação de conta EIP-7702 e
  solicitações multi-carteira EIP-6963, e bloqueia diretamente tentativas
  de roubo da frase de recuperação.
- **Golpes de suporte técnico** — um bloqueio em tela cheia para páginas de
  "seu PC está infectado, ligue para este número agora", com uma saída de
  um clique que primeiro desarma as armadilhas de bloqueio de tela e do
  botão Voltar da página.
- **Ataques ClickFix e de área de transferência** — o golpe de malware que
  mais cresce em 2025: um falso CAPTCHA de "verifique que você é humano"
  que convence você a colar um comando no Executar do Windows. O Parry
  sobrescreve a carga maliciosa na área de transferência e bloqueia a
  página em tela cheia antes que ela possa ser executada.
- **Formulários vazadores** — avisa no momento em que um site envia o
  e-mail ou telefone que você digitou para um rastreador, *antes* de você
  apertar enviar, e aponta separadamente scripts de fingerprinting e
  armadilhas de permissão de notificação "clique em Permitir para
  continuar".

**Como funciona**

1. O Parry lê a própria página, no seu dispositivo — seu texto, layout,
   formulários de login e ícones — no momento em que você a abre, ou a
   mensagem que você cola no popup para uma verificação de mensagem
   suspeita.
2. Um modelo no dispositivo e um conjunto de regras avaliam o que
   encontram. Um único sinal fraco nunca gera mais do que uma nota discreta
   de *suspeito*; um veredito de *perigoso* exige que sinais independentes
   concordem, então páginas legítimas raramente são sinalizadas por
   engano.
3. Você recebe um motivo em linguagem simples, não só um banner vermelho,
   com uma solução de um clique: *Sair desta página* em um alerta perigoso,
   *Ir para o site real* em uma página de personificação de marca — ou, se
   o Parry errou, pause o alerta nesse site por uma hora, um dia ou para
   sempre.

**Estatísticas e explicabilidade**

Cada alerta se abre em um painel *Por que esse veredito?* que lista os
motivos exatos por trás dele — um ícone de marca no domínio errado, um
domínio parecido, um campo de senha enviando para um host estranho — em vez
de uma pontuação sem explicação. A aba Estatísticas nas configurações
mostra páginas verificadas, ameaças interrompidas e achados de privacidade,
com um gráfico de atividade diária que você pode alternar entre os últimos
7 dias, os últimos 30 dias ou seus totais desde a instalação. Todo número é
calculado e armazenado no seu dispositivo; nada disso é enviado para
qualquer lugar.

**Privacidade: o que o Parry faz e não faz**

O Parry pede acesso às páginas que você visita porque é assim que a análise
no dispositivo realmente as lê — o texto, o layout, os formulários de login
e os ícones — a verificação acontece localmente, no seu navegador, não em
um servidor em algum lugar. A única coisa que sai do seu dispositivo por
padrão é um simples download de arquivo: a lista pública de ameaças de
domínios de golpe conhecidos, obtida periodicamente do feed de código
aberto do Parry para que o bloqueio funcione logo após a instalação e
offline. Nada sobre você ou sua navegação específica acompanha esse
download. Relatórios comunitários, opcionais e desativados por padrão,
podem enviar um nome de host anonimizado e um sinal de risco numérico para
uma página sinalizada como perigosa — nunca uma URL, o texto da página ou
qualquer coisa que você digitou — e só se você mesmo ativar isso.
Configurações → Sobre mostra exatamente o que saiu do seu dispositivo, para
que você possa verificar a telemetria zero por conta própria em vez de só
confiar na nossa palavra.

**Perguntas frequentes**

**Em que o Parry é diferente do Guardio, Malwarebytes ou Norton?**

Essas extensões verificam as páginas que você visita enviando informações
para seus próprios servidores: Guardio e Bitdefender TrafficLight analisam
páginas na nuvem, o Norton Safe Web opera um "serviço remoto de reputação
de URL" e, segundo sua própria divulgação, coleta seus dados pessoais, sua
localização e seu histórico de navegação, e o Avast Online Security envia
as URLs que você visita junto com um ID de dispositivo e informações do
dispositivo para seus servidores. O Parry não tem servidor. Toda
verificação — ler a página, comparar ícones de marca, analisar uma mensagem
colada — roda no seu dispositivo, e nada do que você navega, digita ou
verifica é enviado para qualquer lugar. A própria página do Guardio também
limita seu nível gratuito a apenas alertas de sites; bloqueio em tempo
real, proteção de downloads e monitoramento de vazamentos são recursos
pagos (US$ 9,99–34,99/mês). O conjunto completo de recursos do Parry —
bloqueio em tempo real, detecção de lojas falsas, proteção contra
drenadores de carteiras cripto, bloqueio de golpes de suporte técnico,
proteção de área de transferência/ClickFix, um painel de estatísticas e um
motivo em linguagem simples em cada alerta — é gratuito, sem nível premium.

**O Parry é realmente gratuito? Qual é a pegadinha?**

Sim, e não há pegadinha nenhuma: sem nível premium, sem período de teste,
sem "faça upgrade para desbloquear a proteção em tempo real". O Parry não
opera um servidor para te cobrar, então não há nada para vender depois — o
produto inteiro é o produto gratuito. Isso é diferente da maioria da
categoria: vários concorrentes oferecem um nível gratuito limitado e cobram
mensalmente pela proteção de verdade (o nível gratuito do Guardio é só
alertas; o bloqueio completo custa US$ 9,99–34,99/mês), enquanto outros são
extensões gratuitas que fazem venda cruzada para um pacote de segurança
pago. O Parry se sustenta de outra forma — permanecendo pequeno, no
dispositivo e útil o suficiente para você manter instalado, mais doações
opcionais. Se quiser apoiar o desenvolvimento, há um link na extensão,
nunca um paywall.

**Também incluído**

- Verificador de mensagens de golpe — cole qualquer texto de SMS/WhatsApp/
  e-mail para um veredito instantâneo e totalmente privado.
- Verificação de resultados patrocinados no Google/Bing/DuckDuckGo — sinaliza
  um anúncio que leva a um site diferente do que é exibido.
- Modo estrito — uma opção bloqueia em tela cheia até páginas "suspeitas"
  com linguagem mais simples, para um familiar menos confiante com
  tecnologia.
- Escolha seu idioma: todos os 20 idiomas, selecionáveis pelo popup ou pelas
  configurações, independentemente do idioma do seu navegador.
- Exportação/importação de configurações e sincronização opcional entre
  dispositivos — a própria sincronização do seu navegador, ainda sem conta
  ou servidor do Parry.
- Modo escuro, histórico de proteção e links de resgate de um clique,
  conteúdo falso de prêmio/sorteio oculto.

Números concretos, não adjetivos: disponível em **20 idiomas** com
traduções completas de menus, alertas e configurações (não apenas uma
página da loja traduzida); cerca de **630 testes automatizados**; uma lista
de bloqueio com milhares de domínios de golpe, atualizada continuamente a
partir de um feed de código aberto; e uma instalação com menos de 1 MB —
cerca de 450 KB compactados, sem runtime pesado.

## What's new (0.9.0)

- **Uma lista de ameaças muito maior.** A lista de bloqueio cresceu de
  alguns milhares de domínios para **mais de 425.000 domínios de golpe e
  phishing confirmados**, além de uma lista de observação com mais de um
  milhão de entradas de confiança mais baixa — reunidas de mais de uma
  dezena de bancos de dados de ameaças de código aberto, verificadas
  cruzadamente entre si e filtradas em relação aos sites mais populares do
  mundo para manter os falsos alarmes raros. A comparação ainda acontece
  inteiramente no seu dispositivo: a lista é baixada como impressões
  digitais compactas e verificada localmente, então nenhum site que você
  visita é enviado a lugar nenhum. As atualizações chegam como pequenos
  diffs a cada poucas horas.
- **Quando o Parry bloqueia um site presente na lista, agora ele diz quais
  fontes independentes o reportaram** — verificável, não uma pontuação de
  caixa-preta.
- **Detecção de imitação mais inteligente**: as verificações de
  personificação de marca agora detectam letras trocadas, caracteres
  parecidos, nomes de marca escondidos dentro de subdomínios longos e
  finais de domínio trocados, com salvaguardas rígidas para que sites de
  marcas reais nunca sejam sinalizados por engano.
- **Novos sinais de alerta**: cadeias de subdomínios incomumente
  profundas, partes de endereço anormalmente longas, destinos de
  encurtadores de link, finais de domínio muito usados em golpes e
  provedores de hospedagem gratuita agora somam evidências de cautela ao
  veredito de uma página.

Nenhuma permissão nova. Continua usando `storage`, `declarativeNetRequest`,
`alarms` e acesso http/https, exatamente como na 0.3.1.
