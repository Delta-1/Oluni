# Oluni integrado

O Oluni reúne em um só aplicativo o registro de ponto e os módulos de feedback, relatos anônimos, bem-estar e IA.

## Infraestrutura utilizada

- Repositório: Delta-1/Oluni; publicação automática da branch main.
- Aplicativo e API: https://oluni.up.railway.app
- Banco utilizado: `qaiqflcxfxygynumapyp`.
- WhatsApp: processo persistente do próprio aplicativo no Railway, com sessão
  independente por empresa. Nenhuma alteração no serviço WORKSPACES.
- O banco original do Oluni (`eqjgumevweiswqhogvgk`) permanece intacto:
  o conector disponível não tem permissão para administrá-lo. Não houve
  transferência de seus usuários, marcações ou históricos.

Os registros permanecem no contrato de armazenamento existente,
com filtro de aplicativo e empresa e conteúdo criptografado. Não houve alteração
de esquema, de credenciais ou do segredo de criptografia do banco compartilhado.

## Primeiro acesso

1. Abra o site e escolha **Começar agora** para cadastrar a empresa e seu RH.
2. Em **Hoje**, copie o convite e compartilhe com a equipe.
3. Cada colaborador abre o convite e cadastra nome, WhatsApp, nascimento,
   função, e-mail e senha. O setor vem do convite escolhido pelo RH. O servidor define a empresa e o perfil.
4. Nos acessos seguintes, todos usam somente e-mail e senha.
5. Em **Colaboradores**, o RH encontra o código individual: 0000 para o administrador, 0001 para o primeiro colaborador.
6. Abra **Totem** em um aparelho da empresa. O colaborador digita seu código.

Links expiram após 180 dias. Em **Mais → Convite e totem**, o RH pode renovar
cada link separadamente. A renovação invalida o anterior e preserva as contas.

## Ponto e relatórios

O fluxo segue o Oluni atualizado: entrada, início do intervalo, fim do
intervalo e saída. O funcionário tem um botão principal e o histórico ao lado.
O horário é atribuído pelo servidor; a sequência e a repetição de requisições
são verificadas. Um intervalo de 30 segundos bloqueia duplo toque acidental.

Uma jornada em aberto continua no dia de origem se o último registro ocorreu
há menos de 20 horas, inclusive na passagem da meia-noite. Registros não podem
ser alterados pelo usuário nesta versão.

O RH filtra por período, setor e colaborador e exporta CSV. O saldo compara as jornadas
concluídas com os minutos diários e dias de trabalho configurados. Não é um
fechamento automático de folha: faltas em dias sem marcação, feriados, escalas,
horas extras 50%/100% e ajustes retroativos ainda exigem implementação/conferência.

## WhatsApp

1. O RH abre **WhatsApp**, gera o QR e conecta o número da empresa.
2. O colaborador abre o perfil e solicita a verificação do número cadastrado.
3. O código recebido deve ser digitado no aplicativo. Ele expira em 10 minutos,
   permite no máximo cinco tentativas e não é retornado pela API pública.
4. A recuperação de senha usa o e-mail e envia um código somente para um
   WhatsApp previamente verificado. A troca encerra as sessões anteriores.

O menu funciona sem chave de IA:

- `1` ou `PONTO`: consulta os registros da jornada.
- `2` ou `ATESTADO`: orienta o envio de PDF, JPG ou PNG de até 5 MB.
- `3` ou `RH`: abre uma solicitação visível ao RH, que pode responder pelo painel.
- `4`: entra no modo da assistente por 15 minutos. Esse modo requer chave de IA
  configurada pelo RH e autorização do colaborador.
- `MENU`: sai do modo IA e mostra os serviços.
- `HUMOR 1` a `HUMOR 5`: preserva o check-in de bem-estar.
- `PARAR`: desativa o atendimento desse colaborador.

Saudação e menu são editáveis em **Mais → Jornada e atendimento**. Os números
do menu são comandos fixos; o texto editável deve conservar o significado.
O bot não solicita a senha. Os anexos ficam na pasta do colaborador identificado
pelo WhatsApp verificado. A análise/aceitação do atestado é feita pelo RH.
Extração de conteúdo por IA e reconhecimento facial ainda não estão implementados.

Os documentos são armazenados em blocos criptografados no armazenamento existente,
sem URL pública. Funcionário consulta seus arquivos; RH consulta os da empresa.

## Android e atualizações

O diretório `mobile` contém o aplicativo nativo reaproveitado do Oluni,
com identidade Android própria (`br.com.oluni.app`) e a mesma interface do site. O build
consome a API do Railway. O GitHub Actions gera e publica automaticamente o APK
quando a interface ou o aplicativo muda.

- Release de teste: `https://github.com/Delta-1/Oluni/releases/tag/android-preview`.
- Atualizador: procura o canal `android-latest` deste repositório, verifica
  versão, origem, hash do arquivo e certificado antes de abrir o instalador.
- Produção exige os segredos `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`.
- Sem assinatura permanente, publica-se somente APK de teste. O Android exige
  confirmação para instalar atualizações; a instalação não é silenciosa.
- APKs de versões anteriores com outro identificador Android exigem uma nova instalação. Atualizações deste aplicativo verificam o mesmo identificador e certificado.

## Limpeza autorizada de contas

A limpeza inicial de contas foi solicitada pelo usuário. O procedimento
`PONTONORTE_RESET_ACCOUNTS_ONCE` é executado uma única vez por identificador e
registra contagens em um marcador de manutenção. Remove empresas, usuários,
sessões, códigos e vínculos de acesso exclusivamente do namespace exclusivo do aplicativo.
Conteúdos históricos são preservados sem acesso pelas contas removidas.

A variável deve ser esvaziada após confirmar o log da execução. O marcador
impede repetir a limpeza em um novo deploy com o mesmo identificador.

## Validação

Testes de API cobrem convites, privilégios, isolamento entre empresas, ponto
concorrente e idempotente, totem, jornadas noturnas, documentos privados,
recuperação de senha, bot sem IA e limpeza de contas executada uma única vez.
O número real da empresa precisa ser conectado por QR antes do teste de
mensagens no WhatsApp. Reconhecimento facial e teste em Android físico pendentes.

## Melhorias da versão 2.1

- Nome Oluni no site, Android, mensagens e relatórios.
- Cadastro de empresa reduzido: nome da empresa, responsável, WhatsApp, e-mail e senha. Nascimento permanece obrigatório para colaboradores.
- O e-mail permanece preenchido durante a recuperação de senha.
- Totem com teclado numérico e aviso de falta de conexão.
- Repetição de tentativa de ponto usa o mesmo identificador se a resposta for perdida.
- Painel inicial com primeiros passos e indicadores que abrem a área correspondente.
- Administrador também encontra Meu ponto no menu Mais.
- Navegação dos módulos de bem-estar voltou a abrir as telas indicadas.
- Perfil verifica WhatsApp em um único fluxo, sem exigir enviar um código longo ao bot.

O adaptador conserva identificadores e a derivação criptográfica anteriores para manter os registros legíveis. A marca apresentada aos usuários é Oluni. A variável de segredo anterior continua aceita por compatibilidade; não deve ser rotacionada durante a troca de marca.


## Versão 2.2 — setores, presença e tarefas

- **Colaboradores → Setores e convites**: crie o setor, escolha-o e copie o convite. O cadastro exibe o setor fixo. O servidor confere a assinatura do convite e ignora tentativas de trocar o setor pelo formulário. Arquivar um setor sem pessoas ativas também invalida seus convites.
- **Editar ficha**: defina setor, função, método de ponto e permissão para criar pequenos checklists. A configuração individual prevalece sobre o padrão da empresa. Setores legados são vinculados automaticamente ao cadastro de setores.
- Códigos por empresa: `0000` (administrador), `0001` a `9999`, depois `A0000` a `A9999`, `B0000` etc., até `Z9999`. Códigos antigos continuam como aliases no servidor. O totem possui botão para selecionar a letra.
- O método padrão é escolhido no cadastro da empresa e em **Mais → Jornada e atendimento**. Há código/toque, QR, foto e checklist. QR e checklist contam uma presença por dia; jornada contabiliza entrada, intervalo e saída. A presença não produz saldo artificial de horas.
- **Colaboradores → Imprimir QR**: selecione pessoas ou um setor inteiro, defina cópias e gere até 240 etiquetas por lote. A folha A4 reúne nome, código, setor e QR. Impressão funciona pelo navegador e pelo diálogo nativo do Android.
- O QR é individual e assinado, sem senha. O colaborador conecta sua conta, escaneia sua etiqueta e confirma a presença com localização recente. Um QR de outro usuário ou empresa não é aceito. Etiquetas estáticas podem ser copiadas; o QR não é prova de identidade biométrica nem garantia de posição física. Localização vem do dispositivo, com precisão registrada.
- No ponto por foto, a câmera registra uma imagem, salva privadamente e exige confirmação do ponto. O servidor vincula a comprovação ao dono e impede reutilizá-la em outra marcação.
- Em **Checklists**, o RH atribui responsável, data, itens e quantidade exigida de fotos antes/depois (0 a 10 por etapa). O funcionário envia o antes, inicia o serviço, marca os itens, envia o depois e conclui. O servidor aplica essas etapas. Fotos ficam privadas e organizadas por tarefa, com horário de recebimento. O RH pode filtrar por setor, pessoa, situação e data.
- Em **Jornada e atendimento** ou na ficha, o RH pode autorizar pequenas tarefas criadas pelo próprio funcionário. Ele só cria para si e não pode alterar uma tarefa já atribuída pelo RH.
- A navegação móvel do colaborador tem Ponto, Tarefas, Documentos e Perfil na barra inferior.

**Limites atuais:** biometria facial permanece indisponível até conectar um provedor com identificação e prova de vida; foto de comprovação não substitui isso. Câmera, GPS e impressão nativos ainda precisam de validação em aparelho físico. Um checklist é uma atribuição para uma data; recorrência automática ainda não existe. As regras de folha indicadas acima continuam pendentes.


## Versão 2.3 — foto de perfil e crachá

1. No cadastro pelo convite, o colaborador pode escolher uma foto. Ela é opcional e não exige aprovação do RH.
2. Em **Meu perfil → Foto e crachá**, o colaborador troca/remove a foto e abre seu crachá. A foto também aparece na lista de pessoas e na identificação do perfil.
3. O RH configura a logo em **Mais → Jornada e atendimento → Logo e crachá**. Ela passa a compor os cartões de toda a empresa.
4. Em **Colaboradores**, a ação principal é **Ver crachá**. A edição e a ativação/desativação permanecem em **Gerenciar**.
5. O crachá mostra logo/nome da empresa, foto, nome, função, setor, código individual e QR de consulta. Sem foto ou logo, mostra uma identificação visual provisória.
6. Em **Imprimir crachás**, selecione pessoas, filtre por setor e defina as cópias. Até 60 cartões por lote, em folhas A4, com cada cartão medindo 54 × 86 mm. Também é possível imprimir cópias pelo cartão individual. A impressão física e o seletor de fotos em Android real ainda precisam de conferência em aparelho.

### Consulta online

O QR abre uma consulta por um identificador criptográfico que não serve para autenticação ou registro de ponto. Ela mostra nome/foto, empresa/logo, função, setor, código e situação atual do cadastro. Telefone, e-mail, nascimento, documentos e marcações não são expostos. O identificador fica no fragmento da URL, para não entrar no caminho dos logs HTTP; a consulta da API usa POST.

Desativar a conta faz a consulta indicar cadastro desativado. **Renovar QR do crachá**, na visualização do RH, invalida o link anterior e exige reimpressão. Fotos/logos são decodificados e regravados no servidor sem metadados EXIF, em registros criptografados separados das evidências de ponto e serviço. A foto escolhida pelo usuário não constitui reconhecimento biométrico nem aprovação de identidade pelo RH.

A seleção para impressão de crachás e etiquetas usa uma tabela compacta, com busca, setor, código, seleção e quantidade na mesma linha. A lista tem rolagem própria e o resumo informa os selecionados e o total de cópias.


## Versão 2.4 — modelos de crachá e bot do WhatsApp

### Personalizar o cartão

Em **Mais → Jornada e atendimento → Logo e crachá → Personalizar crachá**:

- Escolha Minimalista, Triângulos, Bolinhas, Diagonal ou Pontinhos e a cor dos detalhes.
- Para um fundo próprio, escolha uma imagem JPG/PNG/WebP; ela é validada, redimensionada e armazenada criptografada, sem metadados.
- O enquadramento permite preencher o cartão ou mostrar a imagem inteira; a visibilidade ajusta a intensidade do fundo.
- Confira a prévia e clique **Salvar modelo de crachá**. A escolha vale para os crachás da empresa, na consulta, na impressão individual e no lote.
- Trocar um enfeite não apaga a imagem já salva; remover a imagem exclui apenas o fundo, preservando foto e logo. Texto e QR têm áreas claras de proteção no modelo com imagem.

O tamanho de impressão e a lista compacta de seleção permanecem iguais. SVGs de enfeites e imagens de fundo são conteúdo do cartão e não dependem de fontes ou imagens externas.

### Configurar IA no atendimento

Em **WhatsApp → Bot de IA do WhatsApp**, o RH escolhe o provedor (Google Gemini/OpenAI), modelo disponível na sua conta, chave API, nome do bot, orientações e quando responder: opção 4 do menu ou perguntas livres. A chave fica criptografada no servidor, e as respostas de configuração mostram somente se há uma chave salva. É necessário salvar e ativar o bot; a chave não é fornecida pelo aplicativo.

Saudação, menu, consulta de ponto e recebimento de documentos continuam sem IA. Somente colaboradores vinculados e autorizados recebem respostas; o uso de IA também exige consentimento no perfil. MENU limpa a conversa de atendimento e volta aos serviços; PARAR desativa respostas. A memória do atendimento é limitada às últimas 16 mensagens e expira após 15 minutos sem interação.

O bot de serviços usa contexto do próprio colaborador e um histórico separado da Flora, sem incluir conversas privadas de bem-estar. Ele orienta os serviços do RH; a gravação de ponto, o recebimento de documentos e a análise/aprovação humana continuam nos fluxos do sistema. Não há decisões automáticas sobre atestados ou vínculos de trabalho.

A chave anterior, se já configurada na Assistente de IA, é preservada como compatibilidade até salvar a configuração independente do WhatsApp. Não é necessário alterar os serviços de mensageria de outros projetos.
