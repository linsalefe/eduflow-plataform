# backend/app/jarvis/tools.py
"""
Definição das tools que o GPT-4o pode chamar para buscar dados reais do CRM.
IMPORTANTE: as tools expostas ao GPT em runtime são filtradas por
backend/app/jarvis/filters.py com base em agent_plan_flags e features do tenant.
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
                        "description": "Nome da coluna do pipeline (ex: novo, em_contato, qualificado, etc). Se não informado, retorna todas."
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
            "parameters": {"type": "object", "properties": {}}
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
            "description": "Quanto falta para bater a meta de faturamento e/ou leads do mês. Inclui ticket médio e vendas necessárias.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_contact_details",
            "description": "Busca informações detalhadas de um contato/lead específico: nome, telefone, status no pipeline, score, valor do deal, tags e última mensagem.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome ou parte do nome do contato"
                    }
                },
                "required": ["lead_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_contact_conversations",
            "description": "Retorna as últimas mensagens trocadas com um contato/lead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {"type": "string", "description": "Nome ou parte do nome do contato"},
                    "limit": {"type": "integer", "description": "Quantidade de mensagens (default: 10)"}
                },
                "required": ["lead_name"]
            }
        }
    },

    # ============================================================
    # NOVAS TOOLS — Sprint 3 / Jarvis J.1
    # ============================================================
    {
        "type": "function",
        "function": {
            "name": "get_upcoming_schedules",
            "description": "Lista os próximos agendamentos (reuniões, ligações) dentro de uma janela de dias. Use para perguntas como 'quais minhas próximas reuniões?' ou 'o que tenho amanhã?'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Janela em dias a partir de hoje (default: 7). Use 1 para 'amanhã', 7 para 'semana', 30 para 'mês'."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "completed", "cancelled", "all"],
                        "description": "Filtro de status (default: pending)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_tasks",
            "description": "Lista as tarefas atribuídas ao usuário logado. Use para 'minhas tarefas', 'tarefas pendentes', 'o que preciso fazer hoje'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "completed", "all"],
                        "description": "Filtro de status (default: pending)"
                    },
                    "due_filter": {
                        "type": "string",
                        "enum": ["today", "overdue", "week", "all"],
                        "description": "Filtro por data: today (vencem hoje), overdue (atrasadas), week (próximos 7 dias), all (todas). Default: all"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_form_submissions_summary",
            "description": "Resumo de leads que vieram de landing pages no período, com breakdown opcional por UTM source/campaign. Use para 'quantos leads vieram da LP hoje?', 'qual campanha trouxe mais leads?'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month"],
                        "description": "Período (default: week)"
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["utm_source", "utm_campaign", "utm_medium", "landing_page", "none"],
                        "description": "Agrupamento (default: none)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_landing_page_performance",
            "description": "Performance de cada landing page: quantos leads captou no período. Use para 'qual LP está convertendo melhor?', 'minhas landing pages'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["week", "month", "all"],
                        "description": "Período (default: month)"
                    }
                }
            }
        }
    },

    # ============================================================
    # ACTION TOOLS — requerem confirmação do usuário
    # ============================================================
    {
        "type": "function",
        "function": {
            "name": "action_send_followup",
            "description": "Envia uma mensagem de follow-up via WhatsApp para um lead específico. REQUER CONFIRMAÇÃO.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {"type": "string", "description": "Nome do lead"},
                    "message": {"type": "string", "description": "Mensagem personalizada (opcional)"}
                },
                "required": ["lead_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_make_call",
            "description": "Dispara uma ligação de IA para um lead. REQUER CONFIRMAÇÃO.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {"type": "string", "description": "Nome do lead para ligar"},
                    "course": {"type": "string", "description": "Assunto/produto sobre o qual ligar (opcional)"}
                },
                "required": ["lead_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_move_pipeline",
            "description": "Move um lead para uma coluna específica do pipeline/Kanban. REQUER CONFIRMAÇÃO.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {"type": "string", "description": "Nome do lead"},
                    "target_stage": {"type": "string", "description": "Coluna de destino"}
                },
                "required": ["lead_name", "target_stage"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_schedule",
            "description": "Agenda uma reunião ou ligação com um lead. REQUER CONFIRMAÇÃO.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {"type": "string", "description": "Nome do lead"},
                    "date": {"type": "string", "description": "Data formato YYYY-MM-DD"},
                    "time": {"type": "string", "description": "Hora formato HH:MM"},
                    "type": {"type": "string", "enum": ["voice_ai", "consultant"], "description": "Tipo do agendamento"},
                    "course": {"type": "string", "description": "Produto/assunto (opcional)"}
                },
                "required": ["lead_name", "date", "time"]
            }
        }
    },
]
