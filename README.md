# Oluni

Ponto, equipe e atendimento em um só lugar.

- Aplicativo: https://oluni.up.railway.app
- Interface no GitHub Pages: https://delta-1.github.io/Oluni/
- Código: https://github.com/Delta-1/Oluni
- Android: https://github.com/Delta-1/Oluni/releases/download/android-preview/Oluni.apk

## Começar

1. Abra o aplicativo e toque em **Começar agora** para cadastrar a empresa e seu acesso de administração geral.
2. Copie o convite na tela **Hoje** e envie aos colaboradores.
3. Cada pessoa cadastra seu próprio acesso pelo convite; depois entra apenas com e-mail e senha.
4. Abra o **Totem** em um aparelho na empresa. O colaborador usa seu código de quatro números (0000 para o administrador, 0001 para o primeiro colaborador) e o teclado da tela.
5. Em **WhatsApp**, conecte o número da administração pelo QR. Os telefones cadastrados identificam colaboradores, sem verificação adicional de WhatsApp. Outros números usam o menu de visitantes.

## Recursos

- Entrada, início de intervalo, volta do intervalo e saída com horário do servidor e proteção contra repetição.
- Meu ponto com uma ação principal, registros da jornada e histórico.
- Convites e links de totem revogáveis, separados por empresa.
- Relatórios por período e colaborador, saldo de jornada e exportação CSV.
- Documentos privados enviados pelo aplicativo ou WhatsApp, com análise do RH.
- Menu e saudação do WhatsApp editáveis; consulta de ponto, documentos e pedidos ao RH sem chave de IA.
- Assistente opcional com chave de API e consentimento.
- Bem-estar, feedbacks e canal de relatos anônimos.
- Aplicativo Android gerado automaticamente pelo GitHub Actions.

## Desenvolvimento

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npm start
```

O ambiente de desenvolvimento usa registros sintéticos e armazenamento temporário. Produção exige Supabase real. O Railway serve a interface e a API no mesmo processo; mantém conexões de WhatsApp separadas por número/setor.

## Configuração

Use `.env.example` para novas instalações. O backend exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `OLUNI_SECRET` com pelo menos 32 caracteres. Chaves e credenciais ficam no servidor. A implantação existente preserva a variável de segredo anterior e os identificadores internos do armazenamento para manter a compatibilidade criptográfica.

Não troque o segredo de criptografia para alterar a marca. O banco compartilhado usa filtros exclusivos de aplicativo e empresa. As aplicações externas não são alteradas pelo Oluni.

## Android

```sh
cd mobile
npm ci
npm run android:sync
```

O fluxo `.github/workflows/build-android.yml` compila o APK. A identidade é `br.com.oluni.app`. Assinatura permanente requer os quatro segredos Android descritos em [docs/OLUNI.md](docs/OLUNI.md). Sem eles, o workflow publica o canal de teste. Atualizações de produção verificam assinatura e integridade e abrem o instalador do Android.

## Limites atuais

O reconhecimento facial não está implementado. O saldo exibido compara jornadas concluídas com a carga diária configurada; feriados, escalas, ajustes e adicionais de folha exigem conferência do RH. Entrega real no WhatsApp requer um número conectado pelo responsável.

Veja [o guia completo](docs/OLUNI.md) para operação, infraestrutura e validação.


Na versão 2.2, o RH cria setores, gera convites com setor predefinido, escolhe método de ponto por empresa ou colaborador, imprime QR Codes em lote e atribui checklists com fotos de antes/depois. Veja o fluxo completo e os limites atuais em [docs/OLUNI.md](docs/OLUNI.md).

A versão 2.3 adiciona foto de perfil sem aprovação, logo da empresa, crachá individual com consulta online e impressão em lote. Há 40 testes de API, com isolamento entre empresas e revogação dos links de crachá.

A versão 2.4 traz modelos geométricos, cores e fundo próprio para crachás, com prévia, além de configuração independente da IA do WhatsApp. 46 testes cobrem os fluxos e o isolamento de dados.


A versão 3.0 adiciona telefone com país e bandeira, reconhecimento pelo número cadastrado sem verificação inicial, conexões/equipes por setor, onboarding de WhatsApp e instalação, pastas pessoais, quadros de post-its e atendimento em Kanban. O chat inclui citações, encaminhamento, reações, edição, exclusão, voz com revisão, figurinhas WebP, grupos e etiquetas. Crachás têm dimensões, folhas, margens, fontes e estilos configuráveis. Veja [a operação da versão 3](docs/OLUNI_V3.md).

## Atendimento e documentos (3.4)

- **WhatsApp → Bot → Menu de serviços**: configure opções com rótulo e ação para colaboradores ou visitantes. O menu não usa IA. A quarta opção da equipe abre a assistente interna; `MENU` volta aos serviços. Durante a conversa com IA, saudações e números não reiniciam o menu. `PONTO`, `ATESTADO`, `DOCUMENTOS` e `RH` são serviços diretos.
- **Assistente de IA**: configure a chave do setor ou use a integração central. Assistentes adicionais têm público fixo (interno ou externo), instruções independentes e podem ser associados a opções do menu. Visitantes só usam IA após selecionar uma assistente pública e autorizar o envio de mensagens ao provedor.
- **Bot → Arquivos**: selecione o assistente e envie manuais em TXT, Markdown, DOCX ou PDF com texto. Limites: 5 MB, 100 páginas por PDF, 200 mil caracteres por arquivo, 20 arquivos e 2 milhões de caracteres por assistente. PDFs escaneados precisam de texto selecionável. As pastas pessoais não alimentam esta base.
- **WhatsApp → Números**: somente a administração geral configura conexões, setores autorizados e pessoas da equipe. Cada API de mensagens, arquivos e atualizações verifica o acesso ao número. Encaminhar para outro número fornece um link `wa.me`; não transfere automaticamente o histórico.
- **Colaboradores → Convidar colaborador**: escolha link ou telefone, setor, função, WhatsApp responsável e documentos. Salvar o telefone prepara um convite; não envia mensagem automaticamente. Peça à pessoa para enviar `INICIAR CADASTRO` ao número escolhido. O cadastro coleta nome, CPF, nascimento, e-mail e endereço sem senha pelo WhatsApp. A conta é criada após concluir os dados. Para usar o app depois, a pessoa pode criar uma senha pelo fluxo de recuperação.
- **Documentos → Pastas**: busque por colaborador, setor e nome de arquivo, baixe arquivos individuais ou um ZIP. Em **Solicitações e documentos pendentes**, escolha os documentos e prepare a coleta. **Cobrar pendências** envia uma mensagem explícita, limitada a uma por hora.
- Na coleta, a pessoa escolhe o documento, envia frente e verso e usa `PRÓXIMO` para o seguinte. Arquivos ficam como recebidos para análise humana. `CONCLUIR` encerra a coleta; `MENU` volta aos serviços.
- **Documentos → Acessos**: a administração pode autorizar setores a gerenciar todas as pastas da empresa e/ou convidar e solicitar documentos. Esses acessos são independentes das permissões dos números de WhatsApp e não liberam relatos privados de bem-estar.
- Visitantes que enviam documentos por terceiros ficam no atendimento humano. Um atendente com acesso à pasta pode conferir a identidade e usar **Salvar na pasta do colaborador** nas opções do anexo.
- Pedir atendimento humano pausa a automação até `MENU` ou liberação da equipe. Assumir a conversa pausa inclusive a coleta. A IA não aprova documentos, não decide contratação, não interpreta atestados clinicamente e não recebe dados de outras pessoas como contexto.

As mensagens do menu são numeradas. Os seletores de ação são usados na configuração; não há dependência de botões interativos nativos do WhatsApp.
