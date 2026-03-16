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
    {
        "type": "function",
        "function": {
            "name": "get_contact_details",
            "description": "Busca informações detalhadas de um contato/lead específico: nome, telefone, status no pipeline, score, formação, atuação, motivação, valor do deal, tags e última mensagem.",
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
            "description": "Retorna as últimas mensagens trocadas com um contato/lead. Mostra quem enviou (lead ou atendente/IA), conteúdo e horário.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome ou parte do nome do contato"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Quantidade de mensagens a retornar (default: 10)"
                    }
                },
                "required": ["lead_name"]
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
            "description": "Envia uma mensagem de follow-up via WhatsApp para um lead específico. REQUER CONFIRMAÇÃO do usuário antes de executar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome do lead que receberá o follow-up"
                    },
                    "message": {
                        "type": "string",
                        "description": "Mensagem personalizada para enviar. Se não informada, usa mensagem padrão de follow-up."
                    }
                },
                "required": ["lead_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_make_call",
            "description": "Dispara uma ligação de IA (ElevenLabs Voice) para um lead sobre um curso/produto específico. REQUER CONFIRMAÇÃO do usuário antes de executar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome do lead para ligar"
                    },
                    "course": {
                        "type": "string",
                        "description": "Nome do curso ou produto sobre o qual ligar"
                    }
                },
                "required": ["lead_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_move_pipeline",
            "description": "Move um lead para uma coluna específica do pipeline/Kanban. REQUER CONFIRMAÇÃO do usuário antes de executar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome do lead a ser movido"
                    },
                    "target_stage": {
                        "type": "string",
                        "description": "Coluna de destino (ex: novo, em_contato, qualificado, em_matricula, matriculado, perdido)"
                    }
                },
                "required": ["lead_name", "target_stage"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "action_schedule",
            "description": "Agenda uma reunião ou ligação com um lead para uma data e hora específica. REQUER CONFIRMAÇÃO do usuário antes de executar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_name": {
                        "type": "string",
                        "description": "Nome do lead"
                    },
                    "date": {
                        "type": "string",
                        "description": "Data no formato YYYY-MM-DD (ex: 2026-03-20)"
                    },
                    "time": {
                        "type": "string",
                        "description": "Hora no formato HH:MM (ex: 14:30)"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["voice_ai", "consultant"],
                        "description": "Tipo: voice_ai (ligação IA) ou consultant (consultora humana)"
                    },
                    "course": {
                        "type": "string",
                        "description": "Curso/produto relacionado ao agendamento"
                    }
                },
                "required": ["lead_name", "date", "time"]
            }
        }
    },
]