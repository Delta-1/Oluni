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

## Flora e atestados (3.5)

- O cadastro pede o telefone uma vez. A autorização opcional de IA é independente da identificação do telefone; a recuperação de senha mantém seu código de segurança.
- Após o cadastro pelo link, o sistema prepara uma mensagem de boas-vindas. Com o WhatsApp conectado, ela é enviada em segundo plano, sem atrasar a entrada no painel. Se o número estiver desconectado, o envio aguarda. Entregas incertas não são repetidas automaticamente. O perfil e Colaboradores → Boas-vindas pelo WhatsApp mostram envio, entrega ou leitura, conforme os eventos recebidos. Isso não comprova titularidade nem implica verificação do número.
- **Colaboradores conversam diretamente com a Flora**, sem menu ou escolha de número. As perguntas livres usam a chave central ou a configuração de IA da empresa/setor. Caso a pessoa ainda não tenha autorizado IA, a mensagem explica o envio ao provedor e permite responder ACEITO IA. Serviços e coleta de arquivos continuam sem IA.
- O menu em **WhatsApp → Bot → Menu de serviços** é exclusivo para contatos externos. Atendimento humano e encaminhamentos por setor permanecem disponíveis. Assistentes públicos opcionais continuam separados dos internos.
- A pessoa pode escrever que precisa enviar um atestado e continuar conversando normalmente. PDF, JPG e PNG de até 5 MB, com nome ou código do colaborador, ficam em uma fila de conferência, sem entrar na pasta pessoal automaticamente. Telefone e identificação textual apenas sugerem o destino; divergências e nomes ambíguos são destacados.
- **Documentos → Atestados → Pendentes → Conferir**: o RH abre o arquivo, verifica a identificação e seleciona uma pessoa da lista, com busca por nome, código ou setor. **Enviar para pasta** abre uma segunda tela com nome e código; somente **Confirmar envio** arquiva em Atestados. Há também solicitação de reenvio com justificativa. Arquivos enviados por terceiros seguem a mesma conferência e não dão acesso ao cadastro ou às pastas.
- Apenas os setores autorizados em **Documentos → Acessos** podem conferir e arquivar. As permissões dos números do WhatsApp são independentes. Documentos médicos nunca alimentam a base de orientação da IA.
- O chat da Flora no aplicativo mostra a mensagem imediatamente, permite preparar o próximo texto durante a resposta, mantém a rolagem no histórico quando a pessoa está lendo e oferece repetição de mensagens que falharam. Identificações de requisição impedem duplicação no servidor.
- Conversas da Flora no aplicativo e no atendimento automático do colaborador ficam fora da caixa humana. No WhatsApp, os responsáveis pelo número conectado ainda podem ler mensagens no aparelho; o sistema não promete sigilo perante eles. O RH só vê check-ins autodeclarados quando a pessoa autoriza o compartilhamento. Não há inferência de estado mental ou avaliação profissional a partir das conversas.
- **RH** pede uma pessoa e pausa a automação durante o atendimento. **PARAR** pausa as respostas; **VOLTAR** retoma. O ponto permanece no aplicativo/totem para respeitar o método e a localização da empresa; a Flora consulta apenas os registros do próprio colaborador.

A integração central usa as variáveis de servidor OLUNI_AI_API_KEY, OLUNI_AI_PROVIDER, OLUNI_AI_MODEL e OLUNI_AI_ENABLED. As credenciais não são expostas no aplicativo. Instalação e atualização Android continuam sujeitas à assinatura e à confirmação do instalador.
