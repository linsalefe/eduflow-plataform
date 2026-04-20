# Baseline — Taxa de Qualificação por Tenant

**Capturado em:** 2026-04-20T16:15:00-03:00
**Referência:** contatos criados nos últimos 30 dias, status IN ('qualificado', 'agendado', 'convertido').

Este snapshot é o ponto de partida **antes** do Laboratório do Agente (few-shot) entrar em produção.
Critério de sucesso da Sprint 1: em 30 dias de uso ativo, taxa sobe >=10 pp num tenant com >=5 correções.

| tenant_id | tenant_name | total_contatos_30d | qualificados_30d | taxa_% |
|-----------|-------------|--------------------|-------------------|--------|
| 1 | Cliente Atual | 49 | 2 | 4.08 |
| 2 | Focus | 0 | 0 | 0.00 |
| 3 | Novo teste | 0 | 0 | 0.00 |
| 4 | GV Sports Education | 237 | 13 | 5.49 |
| 5 | Div Agência | 18 | 0 | 0.00 |
| 6 | Anhanguera Belo Horizonte Carlos Prates | 227 | 20 | 8.81 |
| 7 | Álefe Lins | 9 | 0 | 0.00 |

_Gerado automaticamente pelo prompt L.4._
