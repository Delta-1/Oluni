# WhatsApp da empresa - Oluni 2.5

## Atendimento pela equipe

O RH conecta o número em **WhatsApp > Conexão**. Em **Equipe**, autoriza os colaboradores que vão atender com seus próprios logins. Eles encontram **Atendimento WhatsApp** em **Mais**; essa permissão não abre as configurações de IA, os documentos pessoais ou a visão de bem-estar do RH.

Em **Conversas**, a equipe recebe novas mensagens de contatos externos e colaboradores, busca o contato, assume, responde, transfere e finaliza. Assumir pausa o bot naquela conversa. Devolver ao bot libera os serviços automáticos. As respostas identificam o atendente. Texto, PDF, imagens JPG/PNG/WebP, áudio OGG/MP3/M4A e vídeo MP4 têm limite de 5 MB por anexo. Não há importação de conversas antigas nem grupos. Mensagens novas enviadas pelo aparelho da empresa também entram no atendimento e pausam o bot; mensagens enviadas pelo próprio sistema têm marcadores para evitar ecos e exposição de códigos de recuperação.

## Menu de visitantes, sem IA

Contatos não vinculados recebem uma saudação e um menu de atendimento da empresa. O RH edita os textos e a ativação em **Bot e bem-estar > Menu automático para visitantes**. `{empresa}` insere o nome da empresa.

- 1 / RH: solicita atendimento ao RH.
- 2 / ATESTADO: inicia a identificação para envio de documento.
- 3 / ATENDIMENTO: atendimento geral da empresa.
- MENU: apresenta os serviços novamente.
- PARAR: interrompe as respostas automáticas; MENU permite voltar.

Visitantes não usam a chave de IA, mesmo quando o modo de perguntas livres está ativo para colaboradores. Ao solicitar uma pessoa, o bot confirma e aguarda, sem repetir o menu em cada mensagem. O atendente deve assumir a conversa para responder.

## Atestado com nome ou código

1. A pessoa envia **ATESTADO** ou **2**.
2. O bot solicita **nome completo ou código pessoal**, por exemplo 0001.
3. A identificação precisa coincidir com uma pessoa ativa da empresa **e com o número cadastrado**. O código ou nome isolado não dá acesso a uma conta. Se os dados forem ambíguos, use o código; se o número não corresponder, envie pelo aplicativo ou procure o RH.
4. Depois de confirmar a identificação, o bot pede PDF, JPG ou PNG de até 5 MB.
5. O arquivo fica na pasta pessoal em **Documentos**, para análise do RH. Ele não entra como anexo na caixa compartilhada. A IA não lê ou aprova atestados.

A confirmação vale por 15 minutos e não altera o e-mail, a senha, o WhatsApp verificado para recuperação ou as autorizações de IA. Não se pede senha pelo WhatsApp. O aplicativo continua permitindo upload direto na própria conta autenticada.

## Bot inicia o contato de bem-estar

O RH configura **WhatsApp > Bot e bem-estar > Convites de bem-estar**:

- **Programado:** dias e horário fixo.
- **Automático:** dias e uma janela de horário; o minuto varia por pessoa e dia dentro dela.
- Intervalo mínimo de 1 a 30 dias; padrão 3 dias.
- Pergunta de abertura editável, sempre acompanhada da identificação do bot, participação opcional e forma de parar.

A função começa desativada. O colaborador precisa verificar seu telefone e autorizar **Quero receber convites de bem-estar pelo WhatsApp** no perfil, além do atendimento pelo WhatsApp. Não é necessário mandar OI para receber um convite autorizado. Para continuar conversando com IA, ele também autoriza IA e o RH salva/ativa a chave na configuração do bot. O primeiro convite e o comando HUMOR funcionam sem IA.

- **BEM-ESTAR / CONVERSAR:** inicia a conversa de escuta quando habilitada e autorizada.
- **HUMOR 1 a HUMOR 5:** registro autodeclarado; o compartilhamento com o RH segue a preferência do perfil.
- **PARAR BEM-ESTAR:** remove a autorização de convites sem interromper os serviços comuns.
- **MENU:** encerra a conversa de bem-estar e retorna aos serviços.

O bot faz perguntas abertas sobre o dia de trabalho. Não faz diagnóstico, testes clínicos, classificação de saúde mental ou avaliação para decisões de emprego. O RH só vê os check-ins compartilhados; não recebe um laudo ou classificação inferida pela IA.

### Limite de privacidade do número compartilhado

O histórico de bem-estar fica separado da caixa de atendimento, da conversa da Flora no aplicativo e da IA de serviços. O contexto de IA conserva até 16 mensagens por sessão de até 24 horas e é limpo ao voltar ao menu, revogar participação ou assumir atendimento humano. **Quem tem acesso ao WhatsApp conectado pode ver as mensagens no próprio aparelho**; não há promessa de sigilo contra o dono do número. O provedor de IA recebe os textos dirigidos à IA após autorização. Essa informação aparece no perfil e na mensagem de convite.

### Operação do agendador

O processo persistente do Oluni no Railway verifica os envios a cada minuto usando o fuso configurado na empresa. O horário programado tem tolerância de 30 minutos; o modo automático também respeita o fim da janela. Não há disparo retroativo em massa após uma indisponibilidade. São processados até 30 convites por rodada; para equipes grandes, prefira uma janela distribuída. O processo atual possui uma réplica.

Cada envio tem reserva durável por empresa, pessoa e dia, antes de sair para o WhatsApp. Reiniciar não repete reservas existentes. Falhas sem confirmação ficam como entrega incerta e não são reenviadas automaticamente. Um atendimento humano em andamento ou uma conversa de bem-estar ainda aberta impede outro convite. O painel apresenta somente situações de entrega, sem conteúdo de saúde.

## Validação

Os testes locais usam banco em memória, contas fictícias, transporte simulado e IA simulada. Cobrem isolamento por empresa, permissão de atendente, atribuição concorrente, envio idempotente, anexos, identificação de atestado, menu de visitantes sem IA, consentimentos, fuso/horário, frequência, reinício e entrega incerta. Envios e pareamento reais precisam de número conectado e chave válida da empresa. Nenhum disparo real à equipe foi realizado na implementação.
