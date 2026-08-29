<!-- Translated store listing (pt_BR). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Parry — Proteção contra Golpes e Phishing

## Short description

Proteção no dispositivo: avisa você, detecta marcas falsas e verifica mensagens. Nada sai do dispositivo.

## Full description

O Parry avisa você antes que uma página de golpe ou phishing te engane —
totalmente no seu dispositivo. Ele analisa mais do que a barra de endereço:
observa o texto, o layout e o formulário de login da página, e reconhece
quando uma página está usando o ícone ou logotipo de uma marca em um domínio
errado, detectando imitações convincentes que um verificador baseado só em
URL não perceberia. Recebeu um WhatsApp, SMS ou e-mail suspeito? Cole-o no
popup para um veredito instantâneo e privado.

Um clique te leva de volta à segurança: *Sair desta página* em um aviso de
perigo, ou *Ir para o site real* em uma página de falsificação de marca. Se o
Parry errar, use *Confiar neste site* por uma hora, até amanhã ou para
sempre — e *Relatar um erro* com um toque.

Privado por design: nada do que você navega, digita ou verifica sai do seu
dispositivo. A única atividade de rede é o download do arquivo público da
lista de ameaças e — apenas se você optar por isso — o envio de um nome de
host anonimizado e sinal de risco de uma página sinalizada. Uma página de
Configurações mostra exatamente o que sai do seu dispositivo, para que você
mesmo possa verificar o zero telemetria.

Disponível em 20 idiomas, incluindo traduções completas de menus, avisos e
configurações — não apenas a ficha da loja traduzida.

Recursos:
• Avisos de phishing e golpes em tempo real, com motivos em linguagem clara
• Análise de página: um modelo no dispositivo lê a própria página — texto,
  layout, formulários de login — para detectar páginas de phishing novas,
  não apenas URLs já conhecidas como maliciosas
• Detecção de imitação de marca: ícones e logotipos comparados por hash com
  uma tabela de 64 marcas (49 com hashes de ícone), incluindo bancos,
  operadoras e serviços governamentais dos Emirados Árabes Unidos (Emirates
  NBD, ADCB, FAB, Mashreq, e&, du, Noon, UAE PASS, MOHRE, Dubai Police…), além
  de domínios com homógrafos IDN (caracteres estrangeiros parecidos
  substituindo letras latinas)
• Verificador de mensagens de golpe: cole qualquer texto de SMS/WhatsApp/
  e-mail para um veredito instantâneo e totalmente privado
• Detecta formulários de login falsos que enviam sua senha para outro site
  (logins de logon único via Google/Microsoft/Okta são reconhecidos como
  seguros)
• Pacote de privacidade: avisa quando um site envia seu e-mail/telefone a um
  rastreador antes de você enviar o formulário, identifica scripts de
  fingerprinting e sinaliza armadilhas de permissão de notificação do tipo
  "clique em Permitir para continuar"
• Verificações de compras: contagens regressivas falsas, pressão falsa de
  "restam só 2", selos de confiança sem link real, pedidos de pagamento fora
  da plataforma e falta de dados de contato, exibidos em um cartão de
  compras no popup
• Verificação de resultado patrocinado no Google/Bing/DuckDuckGo — sinaliza
  um anúncio que leva a um lugar diferente do site exibido
• Aviso em tela cheia para golpes quase certos (ataques de área de
  transferência via ClickFix/CAPTCHA falso, avisos falsos de atualização do
  navegador, phishing de taxa de entrega, páginas de intimidação de suporte
  técnico), com uma pausa forçada e comparação entre o domínio real e o
  falso, reservado para detecções com quase zero falsos positivos
• Modo estrito: um único botão que bloqueia até páginas "suspeitas" em tela
  cheia, com linguagem mais simples, ideal para um familiar menos
  familiarizado com tecnologia
• Resgate em um clique: *Ir para o site real* em páginas de falsificação de
  marca, *Sair desta página* em qualquer aviso de perigo
• Confie em um site por 1 hora, até amanhã ou para sempre — e relate um erro
  com um toque
• Bloqueia domínios de golpe conhecidos — atualizados diariamente a partir de
  uma lista de código aberto (OpenPhish + URLhaus, fortemente filtrada contra
  falsos positivos)
• Proteção de carteira cripto: avisa antes de aprovações arriscadas e
  assinaturas às cegas (incluindo delegação de conta EIP-7702 e suporte a
  múltiplas carteiras via EIP-6963); bloqueia o roubo de frase de recuperação
• Proteção contra sequestro de área de transferência: avisa quando um site
  copia um comando para sua área de transferência
• Oculta conteúdo falso de prêmio/sorteio
• Exportação/importação de configurações e sincronização opcional entre
  dispositivos (usando a sincronização do seu próprio navegador — ainda sem
  conta ou servidor do Parry)
• Escolha o seu idioma: todos os 20 idiomas ficam disponíveis no popup ou nas
  configurações, independente do idioma do seu navegador
• Histórico e estatísticas de proteção, armazenados só no seu dispositivo;
  modo escuro
• Estatísticas: páginas verificadas, ameaças bloqueadas e descobertas de
  privacidade, com um gráfico de atividade diária — contadas e armazenadas no
  seu dispositivo, nunca enviadas para lugar nenhum
• Relatórios da comunidade opcionais, desativados por padrão — nunca URLs ou
  texto da página
• Menor e mais rápido: ~0,6 MB descompactado, sem tempo de execução pesado
• 100% de análise no dispositivo — sem rastreamento, sem coleta de dados

## What's new (0.7.0)

- Nova aba Estatísticas nas configurações: páginas verificadas no
  dispositivo, ameaças bloqueadas, descobertas de privacidade e um gráfico
  de atividade diária — veja os últimos 7 dias, os últimos 30 dias ou seus
  totais desde a instalação — tudo contado e armazenado no seu dispositivo,
  nunca enviado para lugar nenhum.
- Um aviso discreto e dispensável de avaliação aparece no popup somente
  depois que o Parry realmente bloquear algo duas vezes — recuse uma
  vez e ele desaparece para sempre.
- Nova opção de idioma nas configurações: escolha o idioma do próprio
  Parry, independente do seu navegador, com suporte a sincronização
  entre dispositivos se você tiver ativado a sincronização do seu
  navegador.

Nenhuma permissão nova. Continua usando `storage`, `declarativeNetRequest`,
`alarms` e acesso http/https, exatamente como na 0.3.1.
