# Oluni

Ponto, equipe e atendimento em um só lugar.

- Aplicativo: https://oluni.up.railway.app
- Interface no GitHub Pages: https://delta-1.github.io/Oluni/
- Código: https://github.com/Delta-1/Oluni
- Android de teste: https://github.com/Delta-1/Oluni/releases/download/android-preview/Oluni-Teste.apk

## Começar

1. Abra o aplicativo e toque em **Começar agora** para cadastrar a empresa e seu acesso de RH.
2. Copie o convite na tela **Hoje** e envie aos colaboradores.
3. Cada pessoa cadastra seu próprio acesso pelo convite; depois entra apenas com e-mail e senha.
4. Abra o **Totem** em um aparelho na empresa. O colaborador usa seu código de quatro números (0000 para o administrador, 0001 para o primeiro colaborador) e o teclado da tela.
5. Em **WhatsApp**, conecte o número da empresa pelo QR. No perfil, cada pessoa verifica o próprio telefone.

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

O ambiente de desenvolvimento usa registros sintéticos e armazenamento temporário. Produção exige Supabase real. O Railway serve a interface e a API no mesmo processo; mantém o WhatsApp conectado por empresa.

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
