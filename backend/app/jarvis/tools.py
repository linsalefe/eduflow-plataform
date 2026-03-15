# backend/app/jarvis/tools.py
"""
Definição das tools que o GPT-4o pode chamar para buscar dados reais do CRM.
"""

JARVIS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_leads_summary",
            "description": "Total de leads criados hoje, essa semana ou esse mês, com breakdown por canal de origem",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Período: today (hoje), week (últimos 7 dias), month (últimos 30 dias)"
                    }
                },
                "required": ["period"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_leads_by_stage",
            "description": "Quantos leads estão em cada coluna do pipeline/Kanban. Pode filtrar por coluna específica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stage_name": {
                        "type": "string",
                        "description": "Nome da coluna do pipeline (ex: novo, em_contato, qualificado, em_matricula, matriculado, perdido). Se não informado, retorna todas."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_revenue_summary",
            "description": "Faturamento atual do mês e progresso em relação à meta mensal configurada",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_stale_leads",
            "description": "Leads sem nenhuma mensagem ou contato há X dias. Retorna nome e dias parados.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Número mínimo de dias sem contato (default: 3)"
                    }
                },
                "required": ["days"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_leads",
            "description": "Leads mais quentes ordenados por score de qualificação da ligação (call_score)",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Quantos leads retornar (default: 5)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_agent_performance",
            "description": "Métricas de desempenho dos agentes de IA: total de atendimentos, agendamentos, taxa de conversão",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Período da análise"
                    }
                },
                "required": ["period"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_goal_progress",
            "description": "Quanto falta para bater a meta de faturamento e/ou leads do mês. Inclui ticket médio e matrículas necessárias.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
]