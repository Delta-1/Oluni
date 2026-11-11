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
   função, setor, e-mail e senha. O servidor define a empresa e o perfil.
4. Nos acessos seguintes, todos usam somente e-mail e senha.
5. Em **Colaboradores**, o RH encontra o código individual de seis números.
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

O RH filtra por período e colaborador e exporta CSV. O saldo compara as jornadas
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
