# Oluni 3 · Operação

## Primeiro acesso

1. Cadastre a empresa e seu acesso de administrador. No telefone, selecione o país e digite somente o número com DDD/código de área.
2. A primeira tela pede o WhatsApp do escritório ou setor responsável. Clique em Gerar QR Code. No telefone da empresa, abra Aparelhos conectados → Conectar aparelho e leia o QR. Se necessário, escolha Conectar depois.
3. Continue para a instalação: escaneie o QR no celular, abra o link ou baixe o APK Android. Também é possível adicionar o site à tela inicial. Clique em Começar a usar.
4. Em Convite e totem, crie setores e gere os convites com o setor predefinido. O colaborador cadastra telefone, e-mail e senha pelo convite. Não há verificação inicial de WhatsApp. O número cadastrado identifica a pessoa; ambiguidades não escolhem uma conta automaticamente. Use um número pessoal por colaborador. A recuperação de senha continua exigindo código enviado ao telefone cadastrado.

## WhatsApp por setor

Abra WhatsApp → Números e equipes. Cadastre um nome, tipo de atendimento e setor. Cada setor pode ter uma conexão, um número e uma equipe própria. Gere e escaneie o QR de cada número. Marque quem atende nesse canal e salve. O administrador acompanha todos; atendentes só abrem os canais autorizados. Pessoas de outros setores não são identificadas como colaborador naquele canal específico. O número geral do escritório atende a empresa inteira.

O seletor superior escolhe o canal. Em Bot e bem-estar, personalize o menu de visitantes e o bot daquele número. Os visitantes recebem mensagens automáticas de serviços, sem IA. A programação de bem-estar é da empresa e utiliza o número correspondente ao setor de cada colaborador, com autorização voluntária no perfil. O conteúdo das conversas de bem-estar não vai à caixa compartilhada de atendimento; o aparelho WhatsApp e o provedor de IA podem ter acesso às mensagens, conforme explicado ao colaborador.

## Atendimento

- Alterne entre lista de conversas e Kanban: A fazer → Em atendimento → Concluído. Abra uma conversa, clique em Assumir e responda. Finalizar conclui; Devolver à fila libera o atendimento/bot. Nos detalhes, transfira somente para uma pessoa da equipe deste canal, salve nome/etiquetas ou fixe o contato.
- No menu de cada mensagem, responda citando, encaminhe, reaja ou apague só da sua visualização. Mensagens próprias de texto podem ser editadas; o remetente ou administrador pode pedir a exclusão das mensagens da equipe no WhatsApp. O provedor pode recusar alterações fora das regras dele; o sistema informa o erro.
- Grave pelo microfone, pare e ouça antes de enviar. Áudio até 2 minutos/5 MB, convertido em Opus no servidor. Também é possível anexar PDF, imagem, áudio e MP4 até 5 MB; figurinhas usam WebP. A assinatura pode ficar no início, no final ou desativada por canal.
- Em Nova conversa → Grupo, escolha um grupo do número conectado. Grupos têm atendimento humano; o bot não responde neles. O histórico exibido começa no marco de conexão, sem importar conversas antigas.
- Envios com entrega incerta não são repetidos automaticamente. Confira no WhatsApp antes de criar outra mensagem.

## Arquivos

Documentos → Pastas e arquivos: o colaborador abre sua pasta; o RH seleciona uma pessoa. Crie subpastas, envie até 5 MB e mova os arquivos pela lista. PDF, imagens, Word/Excel, CSV e texto são aceitos. Outros colaboradores/atendentes não acessam essas pastas. Atestados entram numa pasta própria e mantêm a análise do RH em Atestados · análise do RH. Pelo WhatsApp, ATESTADO pede nome completo ou código e confere o telefone antes do envio. Senhas não são pedidas pelo bot.

## Quadro de notas

Mais → Quadro de notas. Use o quadro pessoal ou crie um quadro da empresa (ADM) ou do setor. Adicione notas, escolha a cor e arraste pela alça. O texto é salvo ao sair do campo. Notas podem ser concluídas ou apagadas. Para ver alterações de outras pessoas, toque em Atualizar quadro. Se houver edições concorrentes, o sistema solicita atualização para evitar sobrescrever o trabalho alheio.

## Crachás

Jornada e atendimento → Logo e crachá → Personalizar crachá. Configure enfeite/fundo, cor, fonte/peso/tamanho do nome, estilo vertical/horizontal/compacto, dimensões em mm, arredondamento, folha A4/Carta/A5/personalizada, orientação, margens e espaçamento. Salve e gere a fila em Imprimir crachás. Imprima em 100%, sem ajustar à página; o navegador pode pedir confirmação da folha. O servidor recusa um crachá que não caiba na folha. O QR do crachá consulta o vínculo e não registra ponto.

## IA central e fase de projeto

Não há cobrança implementada nesta fase. Flora e bot podem herdar a mesma integração central. O administrador da plataforma provisiona `OLUNI_AI_API_KEY`, `OLUNI_AI_PROVIDER` e `OLUNI_AI_MODEL` no servidor Railway do Oluni; a chave não aparece no aplicativo nem é copiada para os registros de cada empresa. Sem chave disponível, as telas mostram “aguardando ativação”; menus, ponto, documentos e atendimento humano continuam funcionando. Chaves próprias de empresas existentes continuam suportadas nas opções avançadas. Autorização pessoal para conversar com IA e para convites de bem-estar é independente do cadastro de telefone. Nenhuma avaliação clínica ou classificação de funcionário é gerada para o RH.

## Instalação e atualizações

Mais → Instalar aplicativo reabre QR, link e download. O site sempre carrega a versão atual ao abrir e verifica novas versões durante o uso, mostrando atualização sem perder edições em andamento. O aplicativo Android verifica versões compatíveis e pede confirmação no instalador do aparelho. O canal de produção requer os quatro segredos de assinatura Android do workflow, conforme `docs/OLUNI.md`. Sem assinatura permanente, o canal Android continua sendo uma compilação com assinatura temporária e não oferece atualização automática de produção. A chave central de IA também precisa ser provisionada antes de o bot e a Flora responderem por ela.

## Infraestrutura e validação

A atualização preserva o armazenamento criptografado e o namespace existente do Oluni no Supabase compartilhado. Não inclui limpeza de dados, alteração de credenciais ou de outros sistemas. O Railway precisa de `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg` para gravar voz compatível. Testes locais usam banco em memória e gateway simulado; envio/recebimento real, QR e funções nativas do WhatsApp dependem de pareamento pelo responsável. Não são enviados testes para números reais.


## Correção 3.0.1 · telefone e edição cadastral

O telefone possui bandeira, código internacional editável e um campo próprio para o número nacional com DDD. Digitar 55 no código seleciona o Brasil; 591 seleciona a Bolívia. O nome do país aparece apenas ao abrir a lista pesquisável. O país inicial é sugerido pelo fuso horário/idioma do aparelho, sem GPS ou consulta externa; sempre é possível trocar. Na inscrição, repita o telefone para conferir a digitação, sem envio de código. O campo ocupa uma linha inteira e mantém espaço utilizável no celular.

Em Perfil, a pessoa pode alterar nome, CPF, telefone, nascimento, endereço e função. O RH/administrador usa Colaboradores → Ficha para corrigir os mesmos dados e definir setor/método de ponto. CPF é opcional e tem validação dos dígitos. E-mail de acesso, código do colaborador e permissões não são alterados por essa edição. CPF/endereço não entram no QR público do crachá. Telefones e CPFs duplicados na mesma empresa são recusados ao corrigir uma ficha. Ao trocar o telefone, o vínculo antigo é removido e códigos de recuperação enviados ao número anterior deixam de funcionar.
