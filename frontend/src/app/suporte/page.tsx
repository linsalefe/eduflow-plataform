'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen, Search, ChevronDown, ChevronUp, CheckCircle,
  Rocket, MessageCircle, GitBranch, Zap, FileText, Radio,
  Sparkles, Settings, Lightbulb, X,
} from 'lucide-react';
import AppShell from '@/components/app-shell';

interface Tutorial {
  id: number;
  category: string;
  title: string;
  difficulty: 'basico' | 'intermediario';
  content: string;
}

const CATEGORIES = [
  'Todos', 'Primeiros Passos', 'Conversas', 'Pipeline', 'Automacoes',
  'Landing Pages', 'Canais e Integracoes', 'Agente IA', 'Configuracoes', 'Dicas Avancadas',
];

const categoryIcons: Record<string, any> = {
  'Primeiros Passos': Rocket,
  'Conversas': MessageCircle,
  'Pipeline': GitBranch,
  'Automacoes': Zap,
  'Landing Pages': FileText,
  'Canais e Integracoes': Radio,
  'Agente IA': Sparkles,
  'Configuracoes': Settings,
  'Dicas Avancadas': Lightbulb,
};

const tutorials: Tutorial[] = [
  {
    id: 1,
    category: 'Primeiros Passos',
    title: 'Bem-vindo ao EduFlow',
    difficulty: 'basico',
    content: `O EduFlow e um CRM completo com IA para acelerar suas vendas. Com ele voce gerencia leads, conversas, automacoes e muito mais — tudo em um so lugar.

\u2022 Dashboard: painel de controle com resumo do seu negocio
\u2022 Conversas: inbox unificado com WhatsApp e Instagram, com agente de IA
\u2022 Pipeline: funis de venda visuais com drag and drop
\u2022 Automacoes: sequencias automaticas de mensagens
\u2022 Landing Pages: crie paginas de captura com rastreamento UTM
\u2022 Canais: conecte multiplos WhatsApp e Instagram

Dica: comece pelo Dashboard toda manha — em 30 segundos voce tem uma foto completa do que precisa de atencao.`,
  },
  {
    id: 2,
    category: 'Primeiros Passos',
    title: 'Conectando seu primeiro canal',
    difficulty: 'basico',
    content: `O primeiro passo e conectar um canal de WhatsApp para comecar a receber e enviar mensagens.

1. Acesse Canais no menu lateral
2. Clique em Novo Canal
3. Escolha WhatsApp (conexao via QR Code)
4. Digite um nome para o canal (ex: "Comercial")
5. Escaneie o QR Code com o WhatsApp do numero que deseja conectar
6. Aguarde a confirmacao de conexao (status ficara verde)

Apos conectar, todos os leads que enviarem mensagem para esse numero aparecerao automaticamente na aba Conversas.

Dica: use um numero dedicado para vendas. Evite usar seu WhatsApp pessoal como canal comercial.`,
  },
  {
    id: 3,
    category: 'Primeiros Passos',
    title: 'Configurando o Agente de IA',
    difficulty: 'basico',
    content: `O agente de IA responde automaticamente seus leads no WhatsApp enquanto voce foca no que importa.

1. Acesse Config. IA no menu lateral
2. Selecione o canal que deseja configurar
3. Ative o agente de IA (toggle)
4. Personalize o prompt do sistema:
  - Descreva seu negocio em detalhes
  - Defina o tom de voz (formal, descontraido, etc.)
  - Liste perguntas frequentes e respostas
  - Defina regras (ex: nao passar preco, agendar reuniao)
5. Adicione documentos na Base de Conhecimento (RAG)
  - O agente usa esses documentos para responder com precisao
6. Salve e teste enviando uma mensagem para o numero conectado

O agente de IA funciona 24 horas por dia, 7 dias por semana. Ele responde instantaneamente e mantem o lead engajado ate que um humano assuma.

Dica: quanto mais detalhado o prompt e a base de conhecimento, melhor o agente responde. Invista pelo menos 1 hora nessa configuracao \u2014 e o que vai determinar a qualidade do atendimento automatizado.`,
  },
  {
    id: 4,
    category: 'Conversas',
    title: 'Usando o Inbox de Conversas',
    difficulty: 'basico',
    content: `O inbox e onde voce gerencia todas as conversas com seus leads em tempo real.

\u2022 A lista lateral mostra todos os contatos, ordenados pela mensagem mais recente
\u2022 Filtros disponiveis: por status (novo, qualificado, etc.), por tag, por canal, por responsavel
\u2022 Clique em um contato para abrir a conversa completa
\u2022 O painel direito mostra informacoes do lead: status, tags, notas, valor e atribuicao

Para enviar mensagens:
\u2022 Digite no campo de texto e pressione Enter
\u2022 Use o icone de emoji para adicionar emojis
\u2022 Use o icone de clip para enviar arquivos, imagens e audio
\u2022 Use o icone de microfone para gravar audio

Dica: use tags para categorizar seus leads (ex: "Quente", "Frio", "Aguardando proposta"). Isso facilita filtrar e priorizar.`,
  },
  {
    id: 5,
    category: 'Conversas',
    title: 'Pausando e Retomando a IA',
    difficulty: 'basico',
    content: `Voce pode controlar quando a IA responde e quando voce assume a conversa.

Para pausar a IA em um contato:
\u2022 Abra a conversa do contato
\u2022 No painel direito (ou modal no mobile), encontre "Agente IA"
\u2022 Desative o toggle — a IA para de responder
\u2022 Agora voce responde manualmente

Para reativar a IA:
\u2022 Ative o toggle novamente
\u2022 A IA volta a responder as proximas mensagens do lead

A IA tambem desliga automaticamente quando:
\u2022 O lead e movido para certos estagios do pipeline (configuravel)
\u2022 Voce envia uma mensagem manual na conversa

Dica: pause a IA quando o lead estiver em negociacao avancada. Conversas sensiveis de preco e fechamento sao melhores com atendimento humano.`,
  },
  {
    id: 6,
    category: 'Conversas',
    title: 'Tags, Notas e Atribuicao',
    difficulty: 'basico',
    content: `Organize seus leads com tags, notas e atribuicao para nunca perder o contexto.

Tags:
\u2022 No painel do contato, clique em "+ Adicionar tag"
\u2022 Selecione uma tag existente ou crie uma nova com nome e cor
\u2022 Use tags como: "Quente", "VIP", "Retorno", "Indicacao"
\u2022 Remova tags clicando no X ao lado do nome

Notas:
\u2022 Clique em "Editar" na secao de Notas
\u2022 Escreva observacoes importantes sobre o lead
\u2022 Ex: "Quer fechar ate sexta", "Tem orcamento de R$ 5.000"
\u2022 As notas ficam visiveis para toda a equipe

Atribuicao:
\u2022 No campo "Atribuido a", selecione o responsavel pelo lead
\u2022 Apenas o responsavel recebe notificacoes sobre aquele contato
\u2022 Util quando tem equipe de vendas

Dica: crie uma tag "Prioridade" em vermelho para leads que precisam de atencao imediata. Filtre por ela no inicio do dia.`,
  },
  {
    id: 7,
    category: 'Pipeline',
    title: 'Criando e Gerenciando Funis',
    difficulty: 'basico',
    content: `O Pipeline e onde voce visualiza e gerencia seus leads em um quadro Kanban.

\u2022 Acesse Pipeline no menu lateral
\u2022 O sistema ja vem com um "Pipeline Principal" configurado
\u2022 Para criar novos funis, clique em "Novo Funil"
\u2022 Cada funil tem suas proprias colunas independentes
\u2022 Limite: ate 10 funis por conta

Exemplos de funis:
\u2022 Funil Comercial: Novo \u2192 Em Contato \u2192 Qualificado \u2192 Negociando \u2192 Convertido \u2192 Perdido
\u2022 Funil Pos-Venda: Onboarding \u2192 Ativo \u2192 Retencao \u2192 Churn
\u2022 Funil Parcerias: Lead \u2192 Reuniao \u2192 Proposta \u2192 Fechado

Para gerenciar:
\u2022 Clique na aba do funil para alternar entre eles
\u2022 Use o icone de engrenagem para configurar colunas
\u2022 Use o menu (\u22ee) para renomear ou excluir um funil

Dica: vincule cada canal a um funil especifico em Canais. Assim, leads do WhatsApp Comercial vao pro Funil de Vendas e leads do WhatsApp Suporte vao pro Funil de Pos-Venda.`,
  },
  {
    id: 8,
    category: 'Pipeline',
    title: 'Movendo Leads entre Colunas e Funis',
    difficulty: 'basico',
    content: `Mover leads e a acao principal do pipeline. Existem duas formas:

Dentro do mesmo funil:
\u2022 Arraste o card do lead de uma coluna para outra (drag and drop)
\u2022 Ou clique no card e use os botoes "Mover para" no painel de detalhes

Entre funis diferentes:
\u2022 Clique no card do lead para abrir os detalhes
\u2022 Na secao "Mover para outro funil", escolha o funil de destino
\u2022 O lead vai para a coluna "Novo" do funil de destino

O que acontece ao mover:
\u2022 O status do lead (lead_status) muda para a coluna de destino
\u2022 Automacoes vinculadas aquela coluna sao disparadas automaticamente
\u2022 Se a coluna estiver configurada para desligar a IA, ela e desligada
\u2022 Um registro e criado no historico de atividades

Dica: configure as colunas que devem desligar a IA automaticamente (ex: "Qualificado", "Convertido") na engrenagem do pipeline.`,
  },
  {
    id: 9,
    category: 'Pipeline',
    title: 'Configurando Colunas do Pipeline',
    difficulty: 'intermediario',
    content: `Cada funil tem colunas personalizaveis que representam os estagios do seu processo de vendas.

Para configurar:
1. Selecione o funil desejado
2. Clique no icone de engrenagem
3. No modal de configuracao voce pode:
  - Renomear colunas existentes
  - Mudar a cor de cada coluna
  - Adicionar novas colunas
  - Remover colunas (cuidado: leads ficarao sem coluna)
  - Reordenar arrastando pelo icone de grip
  - Configurar quais colunas desligam a IA (icone de estrela em vermelho)
4. Clique em Salvar

Dica: mantenha entre 4 e 7 colunas por funil. Menos que isso e pouco controle, mais que isso gera confusao. O ideal e refletir exatamente o seu processo real de vendas.`,
  },
  {
    id: 10,
    category: 'Automacoes',
    title: 'Criando sua Primeira Automacao',
    difficulty: 'basico',
    content: `Automacoes enviam sequencias de mensagens automaticamente quando um lead entra em um estagio do pipeline.

1. Acesse Automacoes no menu lateral
2. Clique em "Novo fluxo"
3. Preencha:
  - Nome: ex: "Follow-up Sem Resposta"
  - Funil: selecione em qual funil essa automacao atua
  - Estagio: quando o lead entrar neste estagio, a sequencia inicia
  - Canal: qual WhatsApp enviar (se tiver mais de um)
4. Monte a sequencia de mensagens:
  - Mensagem 1: enviada apos X minutos/horas/dias
  - Mensagem 2: enviada apos Y tempo da anterior
  - Adicione quantas mensagens quiser
5. Salve e ative o fluxo

Variaveis disponiveis nas mensagens:
\u2022 {nome} — nome do lead

Dica: a primeira mensagem deve ser enviada em ate 1 hora. Mensagens de follow-up em 1 dia, 3 dias e 7 dias funcionam bem para a maioria dos casos.`,
  },
  {
    id: 11,
    category: 'Automacoes',
    title: 'Gerenciando Fluxos Ativos',
    difficulty: 'intermediario',
    content: `Apos criar automacoes, e importante monitorar e ajustar conforme os resultados.

Na lista de automacoes:
\u2022 Toggle verde/cinza: ativa ou pausa o fluxo
\u2022 Icone de lapis: edita o fluxo
\u2022 Icone de lixeira: remove o fluxo
\u2022 Clique na seta para expandir e ver detalhes

Ao expandir voce ve:
\u2022 Fila de execucoes pendentes: leads que vao receber mensagem em breve
\u2022 Historico: mensagens ja enviadas com sucesso ou falha
\u2022 Cada step com o tempo de delay e a mensagem

Regras importantes:
\u2022 Se o lead responder, TODAS as automacoes pendentes dele sao canceladas
\u2022 Se o lead mudar de estagio, as automacoes do estagio anterior sao canceladas
\u2022 Se a IA estiver ativa para o lead, automacoes NAO sao disparadas
\u2022 Automacoes sao vinculadas ao funil — so disparam para leads daquele funil

Dica: crie automacoes para os estagios iniciais (Novo, Em Contato) e evite nos estagios finais. Leads em negociacao avancada merecem contato humano.`,
  },
  {
    id: 12,
    category: 'Landing Pages',
    title: 'Criando uma Landing Page',
    difficulty: 'basico',
    content: `Landing Pages sao paginas de captura para gerar leads diretamente no seu CRM.

1. Acesse Landing Pages no menu lateral
2. Clique em "Nova Pagina"
3. Configure:
  - Titulo da pagina
  - Descricao
  - Campos do formulario (nome, telefone, e-mail, etc.)
  - Cor e estilo
  - Imagem de fundo (opcional)
4. Publique a pagina
5. Copie o link e compartilhe nas redes sociais, anuncios ou bio do Instagram

Quando alguem preencher o formulario:
\u2022 O lead e criado automaticamente no CRM
\u2022 Aparece na aba Conversas
\u2022 Entra no pipeline na coluna "Novo"
\u2022 O agente de IA pode enviar uma mensagem de boas-vindas

Dica: adicione parametros UTM no link (?utm_source=instagram&utm_campaign=promo) para rastrear de onde vem seus leads.`,
  },
  {
    id: 13,
    category: 'Canais e Integracoes',
    title: 'Conectando WhatsApp',
    difficulty: 'basico',
    content: `O WhatsApp é conectado via QR Code. Voce pode ter multiplos numeros.

1. Acesse Canais no menu lateral
2. Clique em Novo Canal \u2192 WhatsApp
3. De um nome (ex: "Comercial", "Suporte")
4. Escaneie o QR Code que aparecera
5. Aguarde o status ficar "Conectado" (verde)

Cada canal pode ter:
\u2022 Pipeline diferente (leads vao pro funil certo automaticamente)
\u2022 Configuracao de IA independente
\u2022 Automacoes proprias

Se desconectar:
\u2022 Clique no icone de QR Code para reconectar
\u2022 Escaneie novamente
\u2022 Mensagens recebidas durante a desconexao NAO sao perdidas pelo WhatsApp

Dica: se o WhatsApp desconectar frequentemente, verifique se o celular esta com internet estavel e bateria. O WhatsApp Web depende do celular conectado.`,
  },
  {
    id: 14,
    category: 'Canais e Integracoes',
    title: 'Conectando Instagram',
    difficulty: 'intermediario',
    content: `Conecte o Instagram Direct para gerenciar DMs diretamente no EduFlow.

1. Acesse Canais \u2192 Novo Canal \u2192 Instagram Direct
2. Faca login com sua conta do Instagram
3. Autorize as permissoes necessarias
4. Apos conectar, DMs do Instagram aparecerao na aba Conversas

Requisitos:
\u2022 Conta do Instagram precisa ser Profissional (Comercial ou Criador)
\u2022 A pagina do Facebook precisa estar vinculada ao Instagram
\u2022 Voce precisa ser administrador da pagina do Facebook

O que funciona:
\u2022 Receber e responder DMs
\u2022 O agente de IA pode responder no Instagram tambem
\u2022 Leads do Instagram entram no pipeline normalmente

Dica: mude para conta Profissional em Configuracoes > Conta > Mudar para conta Profissional no Instagram.`,
  },
  {
    id: 15,
    category: 'Canais e Integracoes',
    title: 'Vinculando Canal a um Pipeline',
    difficulty: 'basico',
    content: `Cada canal pode direcionar leads para um pipeline especifico. Isso e essencial quando voce tem funis diferentes.

1. Acesse Canais no menu lateral
2. Em cada card de canal, voce vera um seletor de pipeline (se tiver mais de 1 funil)
3. Selecione o pipeline desejado
4. A mudanca e instantanea

Exemplo de configuracao:
\u2022 WhatsApp "Comercial" \u2192 Funil de Vendas
\u2022 WhatsApp "Suporte" \u2192 Funil Pos-Venda
\u2022 Instagram \u2192 Funil de Vendas

Todo lead novo que chegar por aquele canal sera automaticamente colocado no pipeline selecionado.

Dica: se nao configurar, o lead cai no "Pipeline Principal" como padrao. Configure assim que criar um novo funil.`,
  },
  {
    id: 16,
    category: 'Agente IA',
    title: 'Escrevendo um Bom Prompt',
    difficulty: 'intermediario',
    content: `O prompt e a instrucao principal que define como o agente de IA se comporta. Um prompt bem escrito e a diferenca entre um agente que converte e um que espanta leads.

Estrutura recomendada (siga esta ordem):

1. Identidade e papel
  - Defina quem e o agente: "Voce e a assistente virtual da [nome da empresa]"
  - De um nome ao agente (ex: Ana, Lia, Sofia)
  - Defina o papel: atendente, consultora comercial, suporte tecnico

2. Contexto do negocio
  - Descreva o que sua empresa faz em 2-3 paragrafos
  - Liste os produtos ou servicos oferecidos
  - Descreva o publico-alvo (faixa etaria, perfil, necessidades)
  - Mencione diferenciais competitivos

3. Objetivo da conversa
  - O que o agente deve alcancar: qualificar o lead, agendar reuniao, tirar duvidas, coletar dados
  - Defina o "final ideal" da conversa (ex: lead agendou uma call)
  - Defina quando encaminhar para um humano

4. Tom de voz e estilo
  - Formal, semiformal ou descontraido
  - Usar ou nao emojis (e com que frequencia)
  - Tamanho das mensagens (curtas e diretas ou mais explicativas)
  - Idioma (portugues BR, sem girias regionais, etc.)

5. Perguntas de qualificacao
  - Liste as perguntas que o agente deve fazer, em ordem
  - Exemplo: nome, interesse principal, orcamento disponivel, prazo
  - Defina quantas perguntas fazer antes de encaminhar

6. Regras e restricoes (MUITO IMPORTANTE)
  - O que o agente NUNCA deve fazer:
  - Nao inventar informacoes que nao estao na base de conhecimento
  - Nao passar precos (se for politica da empresa)
  - Nao fazer promessas de prazo ou garantia
  - Nao falar mal de concorrentes
  - Nao responder sobre assuntos fora do escopo
  - O que fazer quando nao souber a resposta: "Vou verificar com a equipe e te retorno em breve"

7. Formato das respostas
  - Mensagens curtas (1-3 paragrafos no maximo por resposta)
  - Usar listas quando explicar multiplas opcoes
  - Sempre terminar com uma pergunta ou CTA (call to action)
  - Nao enviar blocos gigantes de texto

8. Encerramento
  - Como finalizar a conversa positivamente
  - Exemplo: "Foi um prazer te atender! Qualquer duvida, e so chamar aqui"
  - Quando agendar: confirmar data, horario e meio (call, presencial, etc.)

Exemplo de prompt completo:

"Voce e a Sofia, consultora comercial da [empresa]. Seu objetivo e qualificar leads interessados em [servico/produto] e agendar uma reuniao com um consultor.

Sobre a empresa: [descreva em 2-3 linhas o que a empresa faz, diferenciais e publico].

Tom: seja simpatica, profissional e use emojis com moderacao (maximo 1-2 por mensagem). Mensagens curtas e diretas.

Fluxo de qualificacao:
1. Cumprimente e pergunte o nome
2. Pergunte o que motivou o interesse
3. Pergunte o prazo (quando pretende comecar)
4. Pergunte se tem orcamento definido
5. Agradeca e ofereca agendar uma reuniao com um especialista

Regras:
- NUNCA invente informacoes. Se nao souber, diga que vai verificar.
- NUNCA passe valores exatos. Diga que os valores sao personalizados e que o consultor apresentara na reuniao.
- Se o lead perguntar algo fora do escopo, redirecione gentilmente para o tema.
- Se o lead demonstrar urgencia, priorize o agendamento."

Erros comuns a evitar:
\u2022 Prompt muito curto: "Atenda os clientes" \u2014 a IA nao sabe o que fazer
\u2022 Prompt contraditorio: "Seja direta" + "Explique tudo em detalhes"
\u2022 Nao definir restricoes: sem regras, a IA pode inventar precos e prazos
\u2022 Copiar prompts genericos da internet: cada negocio e unico

Dica: escreva o prompt como se estivesse treinando um novo funcionario no primeiro dia. Quanto mais contexto e regras claras, melhor o resultado. Revise e ajuste semanalmente com base nas conversas reais.`,
  },
  {
    id: 17,
    category: 'Agente IA',
    title: 'Base de Conhecimento (RAG)',
    difficulty: 'intermediario',
    content: `A Base de Conhecimento (RAG) e o que torna seu agente de IA realmente inteligente. Sem ela, o agente so tem o prompt. Com ela, o agente responde com precisao usando informacoes reais do seu negocio.

Como funciona tecnicamente:
\u2022 Voce faz upload de documentos (PDF, TXT, DOCX)
\u2022 O sistema divide o documento em trechos pequenos e indexa cada um
\u2022 Quando o lead faz uma pergunta, o sistema busca os trechos mais relevantes
\u2022 Esses trechos sao enviados junto com a pergunta para a IA
\u2022 A IA responde com base nos trechos encontrados \u2014 nao inventa

O que adicionar na base de conhecimento:

1. FAQ completo (ESSENCIAL)
  - Liste as 20-30 perguntas mais frequentes dos seus clientes
  - Para cada pergunta, escreva a resposta ideal
  - Formato: "Pergunta: ... Resposta: ..."
  - Exemplo: "Pergunta: Qual o prazo de entrega? Resposta: O prazo medio e de 15 dias uteis apos a confirmacao do pagamento."

2. Descricao de produtos/servicos
  - Nome, descricao detalhada, beneficios, publico-alvo
  - Diferenciais em relacao a concorrencia
  - Casos de uso e resultados esperados

3. Tabela de precos (OPCIONAL \u2014 so se quiser que a IA informe)
  - Se incluir: precos exatos, condicoes, formas de pagamento
  - Se NAO incluir: a IA vai dizer que nao tem essa informacao (comportamento correto se seu prompt disser "nao passe precos")

4. Politicas da empresa
  - Politica de cancelamento e reembolso
  - Garantias oferecidas
  - Prazos de atendimento e resposta
  - Formas de pagamento aceitas

5. Informacoes de contato e localizacao
  - Endereco, telefone, horario de funcionamento
  - Links uteis (site, redes sociais)
  - Como chegar (se atendimento presencial)

6. Depoimentos e cases (para prova social)
  - "Mais de 500 clientes atendidos"
  - Depoimentos curtos (use iniciais ou genericos)
  - Resultados alcancados por clientes

7. Informacoes do mercado/nicho
  - Dados relevantes do setor
  - Tendencias que reforcam a venda
  - Comparativos com alternativas (sem citar nomes de concorrentes)

Boas praticas:

\u2022 Um documento por tema: em vez de um PDF gigante, crie documentos separados (FAQ.txt, Servicos.txt, Politicas.txt). Isso melhora a precisao da busca.

\u2022 Linguagem simples e direta: escreva como se estivesse explicando para o cliente, nao em linguagem tecnica interna.

\u2022 Atualize regularmente: mudou o preco? Atualize o documento. Lancou servico novo? Adicione. Documentos desatualizados = respostas erradas.

\u2022 Teste apos cada upload: envie as perguntas mais comuns para o agente e veja se ele responde corretamente. Se nao, ajuste o documento.

\u2022 Evite contradicoes: se o prompt diz "nao passe precos" mas o documento tem precos, a IA pode ficar confusa. Mantenha consistencia.

Formato ideal do documento FAQ:

Pergunta: O que e [seu servico]?
Resposta: [Explicacao clara e objetiva em 2-3 linhas]

Pergunta: Quanto custa?
Resposta: Os valores sao personalizados de acordo com a necessidade de cada cliente. Agende uma conversa com nosso consultor para receber uma proposta sob medida.

Pergunta: Qual o prazo?
Resposta: [Prazo medio com ressalvas quando necessario]

Pergunta: Como funciona o pagamento?
Resposta: [Formas de pagamento, parcelamento, etc.]

Dica: crie um documento "FAQ.txt" com pelo menos 20 perguntas e respostas. Esse unico documento ja vai melhorar drasticamente a qualidade das respostas do agente. Revise mensalmente e adicione novas perguntas que os leads fazem frequentemente.`,
  },
  {
    id: 18,
    category: 'Configuracoes',
    title: 'Gerenciando Usuarios da Equipe',
    difficulty: 'basico',
    content: `Adicione membros da sua equipe para trabalhar juntos no CRM.

1. Acesse Usuarios no menu lateral
2. Clique em "Novo Usuario"
3. Preencha: nome, e-mail, senha e tipo de acesso
4. Tipos de acesso:
  - Admin: acesso total a todas as funcionalidades
  - Consultor: acesso a conversas, pipeline e contatos (nao ve configuracoes)
5. O usuario recebera um e-mail de boas-vindas

Cada membro da equipe pode:
\u2022 Ser atribuido a leads especificos
\u2022 Ver apenas as conversas atribuidas a ele (ou todas, se admin)
\u2022 Receber notificacoes dos seus leads

Dica: crie um usuario para cada vendedor/consultor. Assim voce rastreia quem atendeu quem e mantem responsabilidade clara.`,
  },
  {
    id: 19,
    category: 'Configuracoes',
    title: 'Configurando Metas de Vendas',
    difficulty: 'intermediario',
    content: `Defina metas mensais para acompanhar o desempenho da equipe.

1. Acesse Metas no menu lateral
2. Configure:
  - Meta de leads: quantos leads novos por mes
  - Meta de conversao: quantos leads convertidos
  - Meta de faturamento: valor em R$ esperado
3. O Dashboard mostra o progresso em tempo real com barras de progresso

As metas ajudam a:
\u2022 Manter foco no resultado
\u2022 Identificar gargalos (muitos leads mas poucas conversoes?)
\u2022 Motivar a equipe com metricas claras
\u2022 Tomar decisoes baseadas em dados

Dica: comece com metas realistas baseadas nos ultimos 3 meses. Aumente gradualmente conforme o processo melhora.`,
  },
  {
    id: 20,
    category: 'Dicas Avancadas',
    title: 'Fluxo Completo: Do Lead ao Cliente',
    difficulty: 'intermediario',
    content: `Este e o fluxo ideal para usar o EduFlow do inicio ao fim.

1. Lead chega (WhatsApp, Instagram ou Landing Page)
   \u2192 Entra automaticamente no pipeline do canal
   \u2192 Agente IA inicia atendimento

2. IA qualifica o lead
   \u2192 Faz perguntas de qualificacao
   \u2192 Coleta informacoes importantes
   \u2192 IA move o lead para "Em Contato" automaticamente

3. Humano assume quando necessario
   \u2192 Pause a IA no contato
   \u2192 Continue a conversa manualmente
   \u2192 Adicione notas e tags relevantes

4. Negociacao e fechamento
   \u2192 Mova o lead para "Qualificado" ou "Negociando"
   \u2192 Automacoes de follow-up entram em acao
   \u2192 Feche o negocio e mova para "Convertido"

5. Pos-venda
   \u2192 Mova o lead para outro funil (ex: Pos-Venda)
   \u2192 Configure automacoes de onboarding
   \u2192 Mantenha o relacionamento

Dica: o EduFlow e mais poderoso quando TODOS os estagios estao configurados — IA, automacoes, pipeline e equipe trabalhando juntos. Nao pule etapas.`,
  },
  {
    id: 21,
    category: 'Dicas Avancadas',
    title: 'Otimizando a Conversao com Multiplos Funis',
    difficulty: 'intermediario',
    content: `Usar multiplos funis estrategicamente pode aumentar significativamente sua taxa de conversao.

Estrategia por canal:
\u2022 Crie um funil para cada fonte de leads (Instagram, Google Ads, Indicacao)
\u2022 Compare qual canal converte mais
\u2022 Invista mais no canal com melhor ROI

Estrategia por produto/servico:
\u2022 Funil para Produto A com colunas especificas
\u2022 Funil para Produto B com processo diferente
\u2022 Cada funil com automacoes personalizadas

Estrategia por equipe:
\u2022 Funil do Vendedor 1
\u2022 Funil do Vendedor 2
\u2022 Compare desempenho individual

Para analisar:
\u2022 Veja quantos leads tem em cada coluna de cada funil
\u2022 Identifique onde leads estao "travando"
\u2022 Colunas com muitos leads parados = gargalo do processo
\u2022 Ajuste automacoes e processos para destravar

Dica: revise seus funis toda semana. Leads parados ha mais de 7 dias precisam de acao — ou um follow-up, ou mover para "Perdido" e partir para o proximo.`,
  },
];

const STORAGE_KEY = 'eduflow_tutorials_seen';

function getSeenIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function formatContent(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trimStart();
    // Dica lines
    if (trimmed.startsWith('Dica:')) {
      return (
        <p key={i} className="mt-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-[13px] text-blue-800 leading-relaxed">
          <strong>Dica:</strong> {trimmed.slice(5)}
        </p>
      );
    }
    // Bullet points
    if (trimmed.startsWith('\u2022')) {
      return (
        <p key={i} className="text-[13px] text-gray-600 leading-relaxed pl-2">
          {trimmed}
        </p>
      );
    }
    // Numbered items
    if (/^\d+\./.test(trimmed)) {
      return (
        <p key={i} className="text-[13px] text-gray-600 leading-relaxed pl-1">
          {trimmed}
        </p>
      );
    }
    // Sub-items with dash
    if (trimmed.startsWith('-')) {
      return (
        <p key={i} className="text-[13px] text-gray-500 leading-relaxed pl-6">
          {trimmed}
        </p>
      );
    }
    // Section headers (lines ending with :)
    if (trimmed.endsWith(':') && trimmed.length < 60 && !trimmed.startsWith('\u2022')) {
      return (
        <p key={i} className="text-[13px] font-semibold text-gray-700 mt-2 leading-relaxed">
          {trimmed}
        </p>
      );
    }
    // Empty lines
    if (!trimmed) return <div key={i} className="h-2" />;
    // Regular text
    return (
      <p key={i} className="text-[13px] text-gray-600 leading-relaxed">
        {trimmed}
      </p>
    );
  });
}

export default function SuportePage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [seenIds, setSeenIds] = useState<number[]>([]);

  useEffect(() => {
    setSeenIds(getSeenIds());
  }, []);

  const toggleSeen = (id: number) => {
    const updated = seenIds.includes(id)
      ? seenIds.filter((s) => s !== id)
      : [...seenIds, id];
    setSeenIds(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const filtered = tutorials.filter((t) => {
    const matchCategory = activeCategory === 'Todos' || t.category === activeCategory;
    const matchSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const progress = seenIds.length;
  const total = tutorials.length;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Central de Ajuda</h1>
              <p className="text-[13px] text-muted-foreground">
                Aprenda a usar o EduFlow com tutoriais passo a passo
              </p>
            </div>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-2.5">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground font-medium">Progresso</p>
              <p className="text-[14px] font-bold text-foreground">
                {progress}/{total}
              </p>
            </div>
            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: '#10b981' }}
              />
            </div>
            <span className="text-[12px] font-semibold text-emerald-600">{pct}%</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tutorial..."
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const count =
              cat === 'Todos'
                ? tutorials.length
                : tutorials.filter((t) => t.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                  activeCategory === cat
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white text-muted-foreground border border-border hover:bg-muted/50'
                }`}
              >
                {cat}
                <span
                  className={`text-[10px] ${
                    activeCategory === cat ? 'opacity-70' : 'opacity-50'
                  }`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Tutorials grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.length === 0 ? (
            <div className="md:col-span-2 bg-white rounded-2xl border border-dashed border-border py-16 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-[14px] font-medium text-muted-foreground">
                Nenhum tutorial encontrado
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Tente outra busca ou categoria
              </p>
            </div>
          ) : (
            filtered.map((t) => {
              const isExpanded = expandedId === t.id;
              const isSeen = seenIds.includes(t.id);
              const CatIcon = categoryIcons[t.category] || BookOpen;

              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border border-border overflow-hidden transition-all ${
                    isExpanded ? 'md:col-span-2 shadow-lg' : 'hover:shadow-md'
                  }`}
                >
                  {/* Card header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-3"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSeen ? 'bg-emerald-50' : 'bg-primary/5'
                      }`}
                    >
                      {isSeen ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <CatIcon className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`text-[14px] font-semibold ${
                            isSeen ? 'text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {t.title}
                        </h3>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                            t.difficulty === 'basico'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {t.difficulty === 'basico' ? 'Basico' : 'Intermediario'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t.category}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-border">
                      <div className="pt-4 space-y-1">
                        {formatContent(t.content)}
                      </div>
                      <div className="mt-5 flex items-center justify-between">
                        <button
                          onClick={() => toggleSeen(t.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${
                            isSeen
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-primary text-white hover:bg-primary/90'
                          }`}
                        >
                          <CheckCircle className="w-4 h-4" />
                          {isSeen ? 'Lido' : 'Marcar como lido'}
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          Tutorial {t.id} de {total}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
