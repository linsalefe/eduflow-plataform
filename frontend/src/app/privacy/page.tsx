export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Política de Privacidade</h1>
              <p className="text-sm text-gray-400">EduFlow — Plataforma de Atendimento</p>
            </div>
          </div>
          <p className="text-sm text-gray-400">Última atualização: 21 de fevereiro de 2026</p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none space-y-8 text-[15px] leading-relaxed text-gray-600">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Introdução</h2>
            <p>
              A EduFlow (&quot;nós&quot;, &quot;nosso&quot; ou &quot;plataforma&quot;) é uma plataforma de gestão de atendimento 
              e relacionamento com leads voltada para instituições educacionais. Esta Política de Privacidade descreve 
              como coletamos, usamos, armazenamos e protegemos as informações pessoais dos usuários e leads que 
              interagem com nossa plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Informações que Coletamos</h2>
            <p>Podemos coletar as seguintes categorias de informações:</p>
            <p className="mt-3">
              <strong className="text-gray-800">Dados de contato:</strong> nome, número de telefone (WhatsApp), 
              endereço de e-mail e informações fornecidas voluntariamente durante conversas.
            </p>
            <p className="mt-2">
              <strong className="text-gray-800">Dados de interação:</strong> mensagens trocadas via WhatsApp, Instagram Direct 
              e Messenger, incluindo texto, imagens, áudios e documentos enviados pelo usuário.
            </p>
            <p className="mt-2">
              <strong className="text-gray-800">Dados de navegação:</strong> informações coletadas via formulários de 
              landing pages, incluindo parâmetros UTM de campanhas (origem, mídia, campanha).
            </p>
            <p className="mt-2">
              <strong className="text-gray-800">Dados de uso:</strong> registros de interações com a plataforma, 
              status de atendimento, tags e classificações atribuídas pelos atendentes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Como Usamos as Informações</h2>
            <p>As informações coletadas são utilizadas para:</p>
            <p className="mt-3">
              — Gerenciar o atendimento e comunicação com leads e clientes via WhatsApp, Instagram e Messenger.
            </p>
            <p className="mt-1">
              — Qualificar leads e acompanhar o funil de vendas da instituição empresarial.
            </p>
            <p className="mt-1">
              — Enviar mensagens relevantes, incluindo templates aprovados pelo WhatsApp Business API.
            </p>
            <p className="mt-1">
              — Fornecer atendimento automatizado via inteligência artificial quando ativado pela instituição.
            </p>
            <p className="mt-1">
              — Gerar relatórios e métricas de desempenho para a instituição contratante.
            </p>
            <p className="mt-1">
              — Agendar contatos, ligações e follow-ups conforme necessidade do atendimento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Compartilhamento de Dados</h2>
            <p>
              Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros para fins de marketing. 
              Os dados podem ser compartilhados apenas nas seguintes situações:
            </p>
            <p className="mt-3">
              <strong className="text-gray-800">Com a instituição contratante:</strong> os dados dos leads são 
              acessíveis pela instituição empresarial que utiliza a plataforma EduFlow para gerenciar seu atendimento.
            </p>
            <p className="mt-2">
              <strong className="text-gray-800">Provedores de serviço:</strong> utilizamos serviços de terceiros 
              para funcionalidades essenciais, incluindo Meta Platforms (WhatsApp Business API, Instagram, Messenger), 
              provedores de hospedagem em nuvem e serviços de inteligência artificial. Esses provedores acessam 
              dados apenas na medida necessária para prestar seus serviços.
            </p>
            <p className="mt-2">
              <strong className="text-gray-800">Obrigações legais:</strong> podemos divulgar informações quando 
              exigido por lei, ordem judicial ou processo legal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Integração com Meta (WhatsApp, Instagram, Messenger)</h2>
            <p>
              Nossa plataforma utiliza as APIs oficiais da Meta Platforms para comunicação via WhatsApp Business API, 
              Instagram Direct e Messenger. Ao interagir conosco por esses canais:
            </p>
            <p className="mt-3">
              — As mensagens são recebidas e armazenadas em nossos servidores seguros para fins de atendimento.
            </p>
            <p className="mt-1">
              — Utilizamos tokens de acesso OAuth fornecidos pela Meta, que são armazenados de forma criptografada.
            </p>
            <p className="mt-1">
              — Não acessamos dados além do escopo autorizado pelas permissões concedidas durante o login OAuth.
            </p>
            <p className="mt-1">
              — Respeitamos integralmente as Políticas de Plataforma da Meta e os Termos de Uso da API do WhatsApp Business.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Armazenamento e Segurança</h2>
            <p>
              Os dados são armazenados em servidores seguros com as seguintes medidas de proteção:
            </p>
            <p className="mt-3">
              — Comunicação criptografada via HTTPS/TLS em todas as conexões.
            </p>
            <p className="mt-1">
              — Banco de dados com acesso restrito e autenticação obrigatória.
            </p>
            <p className="mt-1">
              — Autenticação por token JWT para acesso à plataforma.
            </p>
            <p className="mt-1">
              — Backups regulares dos dados.
            </p>
            <p className="mt-1">
              — Acesso limitado apenas a usuários autorizados da instituição contratante.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Retenção de Dados</h2>
            <p>
              Os dados pessoais são retidos enquanto necessário para os fins descritos nesta política ou enquanto 
              a instituição contratante mantiver sua conta ativa. Após o encerramento do contrato, os dados serão 
              excluídos em até 90 dias, salvo obrigação legal de retenção.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Direitos dos Titulares (LGPD)</h2>
            <p>
              Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), os titulares dos dados 
              têm direito a:
            </p>
            <p className="mt-3">
              — Confirmação da existência de tratamento de dados pessoais.
            </p>
            <p className="mt-1">
              — Acesso aos dados pessoais coletados.
            </p>
            <p className="mt-1">
              — Correção de dados incompletos, inexatos ou desatualizados.
            </p>
            <p className="mt-1">
              — Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.
            </p>
            <p className="mt-1">
              — Revogação do consentimento a qualquer momento.
            </p>
            <p className="mt-3">
              Para exercer qualquer desses direitos, entre em contato pelo e-mail indicado abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Cookies</h2>
            <p>
              Nossa plataforma pode utilizar cookies essenciais para manter a sessão do usuário autenticado. 
              Não utilizamos cookies de rastreamento ou publicidade de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Alterações nesta Política</h2>
            <p>
              Esta política pode ser atualizada periodicamente. Alterações significativas serão comunicadas 
              através da plataforma. A data da última atualização está indicada no topo deste documento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Contato</h2>
            <p>
              Para dúvidas, solicitações ou exercício de direitos relacionados à privacidade, entre em contato:
            </p>
            <div className="mt-4 bg-gray-50 rounded-xl p-5 border border-gray-100">
              <p className="font-medium text-gray-800">EduFlow</p>
              <p className="mt-1">E-mail: <a href="mailto:privacidade@eduflowia.com" className="text-primary hover:underline">privacidade@eduflowia.com</a></p>
              <p className="mt-1">Website: <a href="https://portal.eduflowia.com" className="text-primary hover:underline">portal.eduflowia.com</a></p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-400">© 2026 EduFlow. Todos os direitos reservados.</p>
        </div>

      </div>
    </div>
  );
}
