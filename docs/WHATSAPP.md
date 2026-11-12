# WhatsApp e Crachá · Oluni 3.2

WhatsApp ocupa a tela inteira no computador e no celular. Use a seta Oluni para voltar ao sistema. A faixa superior reúne Conversas, Kanban, Bot, Equipe e Menu. As configurações de saudação, IA, bem-estar e números ficam dentro dessa área; as permissões por setor continuam valendo.

Ao abrir Conversas com um número desconectado, o administrador vê as instruções e a conexão é iniciada automaticamente. O QR válido chega da sessão de WhatsApp e é atualizado na tela. O aparelho da empresa deve escaneá-lo em Aparelhos conectados → Conectar aparelho. Atendentes sem permissão administrativa veem a orientação para pedir ao responsável a vinculação.

## Chave padrão do sistema

No Railway, abra o serviço Oluni → Variables:

- OLUNI_AI_API_KEY: chave secreta do provedor.
- OLUNI_AI_PROVIDER: openai ou gemini.
- OLUNI_AI_MODEL: identificador de um modelo liberado para essa chave.
- OLUNI_AI_ENABLED: true para disponibilizar a integração.

Aplique as variáveis no serviço para reiniciar com a configuração. A chave central é lida somente no servidor; não use variáveis VITE_ para guardar segredos e não publique a chave no GitHub.

A Flora e os bots sem chave própria usam a central. Configurações próprias já salvas continuam tendo prioridade: para usar a central, remova a chave própria da empresa/setor. Ativação do bot e consentimentos dos colaboradores continuam sendo respeitados. O menu de serviços e a organização de documentos não precisam de IA.

Para uma chave apenas do setor: WhatsApp → Bot → Assistente de IA → Chave própria deste setor e provedor. Salve e use Testar configuração salva. Para a chave própria da Flora na empresa, use a aba IA do Oluni. Uma chave salva pelo RH nunca altera a integração central de outras empresas.

## Atualização das mensagens

A tela mantém uma consulta autenticada em espera. Uma gravação de atendimento acorda a consulta imediatamente, sem o intervalo anterior de 3,5–4 segundos. O aviso contém apenas uma revisão; a tela busca os dados novamente pelas rotas autorizadas. As permissões são conferidas ao abrir e ao finalizar a espera. Mensagens privadas de bem-estar não acionam o canal de atendimento.

O histórico ativo usa um cache limitado em memória, atualizado após gravações confirmadas. Pausar a aba cancela a espera e voltar à aba sincroniza novamente. O envio aparece imediatamente como Enviando e só muda para Enviada após a confirmação do transporte. A reserva durável e o identificador de envio evitam duplicar uma tentativa de entrega incerta.

As leituras das chaves de transporte e várias consultas independentes foram paralelizadas. O limite geral de uso autenticado é aplicado por usuário, evitando que toda a equipe do escritório compartilhe o mesmo limite do IP. Os limites específicos de login, senha e envio continuam ativos.

O mecanismo de aviso em memória pressupõe a única réplica atual do serviço Railway. Antes de aumentar o número de réplicas, adicione um distribuidor de eventos entre instâncias. A melhoria foi verificada com testes automatizados e transporte de demonstração; o tempo final de entrega real também depende do WhatsApp, da rede e dos anexos.

## Crachá

A aba Crachá reúne Modelo e Imprimir. Modelo permite editar a logo, o fundo, os temas, a fonte, as medidas e a folha. Salvar modelo define um único padrão para a empresa; cada colaborador recebe automaticamente seus próprios dados, foto, código e QR. Imprimir permite selecionar a equipe e as quantidades.

## Aplicativo

A tela não deve ultrapassar a largura do aparelho. Listas e mensagens têm sua própria rolagem. O fundo nativo Android acompanha o tema escuro e não exibe o efeito branco ao arrastar além da borda. O APK é gerado no GitHub Actions; instalação/atualização seguem as regras de assinatura e confirmação do Android.
