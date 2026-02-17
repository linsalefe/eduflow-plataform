"""
Máquina de Estados Finita (FSM) para controle da conversa.
O coração do sistema - garante que a IA não "viaje" e colete todos os campos.

Estados:
  OPENING → CONTEXT → QUALIFY → HANDLE_OBJECTION → NEXT_STEP → CLOSE
                                                      ├─ SCHEDULE
                                                      ├─ WARM_TRANSFER
                                                      └─ FOLLOW_UP
"""
from enum import Enum
from typing import Optional
from dataclasses import dataclass, field
from datetime import datetime
from app.voice_ai.config import REQUIRED_FIELDS, SCORE_WEIGHTS


class State(str, Enum):
    OPENING = "OPENING"
    CONTEXT = "CONTEXT"
    QUALIFY = "QUALIFY"
    HANDLE_OBJECTION = "HANDLE_OBJECTION"
    SCHEDULE = "SCHEDULE"
    WARM_TRANSFER = "WARM_TRANSFER"
    FOLLOW_UP = "FOLLOW_UP"
    CLOSE = "CLOSE"


# Transições válidas
TRANSITIONS = {
    State.OPENING: [State.CONTEXT, State.CLOSE],
    State.CONTEXT: [State.QUALIFY, State.CLOSE],
    State.QUALIFY: [State.HANDLE_OBJECTION, State.SCHEDULE, State.WARM_TRANSFER, State.FOLLOW_UP, State.CLOSE],
    State.HANDLE_OBJECTION: [State.QUALIFY, State.SCHEDULE, State.WARM_TRANSFER, State.FOLLOW_UP, State.CLOSE],
    State.SCHEDULE: [State.CLOSE],
    State.WARM_TRANSFER: [State.CLOSE],
    State.FOLLOW_UP: [State.CLOSE],
    State.CLOSE: [],
}


@dataclass
class CallSession:
    """Estado completo de uma sessão de chamada."""
    call_id: int
    lead_id: Optional[int] = None
    lead_name: str = ""
    lead_phone: str = ""
    course: str = ""
    source: str = ""
    campaign: str = ""

    # FSM
    state: State = State.OPENING
    previous_state: Optional[State] = None

    # Dados coletados
    collected_fields: dict = field(default_factory=dict)
    objections: list = field(default_factory=list)
    tags: list = field(default_factory=list)

    # Histórico de conversa (para enviar ao LLM)
    conversation_history: list = field(default_factory=list)

    # Métricas
    turn_count: int = 0
    total_latency_ms: int = 0
    qualify_retries: int = 0
    objection_count: int = 0

    # Controle
    started_at: Optional[datetime] = None
    is_active: bool = True

    def get_missing_fields(self) -> list:
        """Retorna campos obrigatórios que ainda faltam para o estado atual."""
        required = REQUIRED_FIELDS.get(self.state.value, [])
        return [f for f in required if f not in self.collected_fields]

    def can_advance(self) -> bool:
        """Verifica se todos os campos obrigatórios do estado atual foram coletados."""
        return len(self.get_missing_fields()) == 0

    def calculate_score(self) -> tuple[int, dict]:
        """Calcula score do lead (0-100) com breakdown."""
        breakdown = {}
        total = 0
        for field_name, weight in SCORE_WEIGHTS.items():
            if field_name == "sem_objecao":
                # Se não tem objeções, ganha os pontos
                if not self.objections:
                    breakdown[field_name] = weight
                    total += weight
                else:
                    breakdown[field_name] = max(0, weight - (len(self.objections) * 5))
                    total += breakdown[field_name]
            elif field_name in self.collected_fields:
                breakdown[field_name] = weight
                total += weight
            else:
                breakdown[field_name] = 0
        return min(100, total), breakdown


class FSMEngine:
    """Motor da FSM - controla transições e validações."""

    def __init__(self, session: CallSession):
        self.session = session

    def transition(self, target: State) -> bool:
        """
        Tenta fazer transição para o estado alvo.
        Retorna True se bem-sucedida, False se inválida.
        """
        current = self.session.state

        # Verificar se transição é válida
        if target not in TRANSITIONS.get(current, []):
            print(f"⚠️ Transição inválida: {current} → {target}")
            return False

        # Se está saindo de QUALIFY, verificar campos obrigatórios
        # (exceto se está indo para HANDLE_OBJECTION ou CLOSE)
        if current == State.QUALIFY and target not in [State.HANDLE_OBJECTION, State.CLOSE]:
            if not self.session.can_advance():
                missing = self.session.get_missing_fields()
                print(f"⚠️ Campos faltando para sair de QUALIFY: {missing}")
                # Permite transição mas registra
                self.session.tags.append("qualify_incomplete")

        self.session.previous_state = current
        self.session.state = target
        return True

    def get_next_action(self, llm_action: str) -> State:
        """
        Decide o próximo estado com base na ação sugerida pelo LLM.
        Funciona como uma camada de validação sobre o LLM.
        """
        action_map = {
            "continue": self.session.state,  # Fica no mesmo estado
            "advance": self._get_natural_next(),
            "handle_objection": State.HANDLE_OBJECTION,
            "schedule": State.SCHEDULE,
            "transfer": State.WARM_TRANSFER,
            "follow_up": State.FOLLOW_UP,
            "end_call": State.CLOSE,
        }
        return action_map.get(llm_action, self.session.state)

    def _get_natural_next(self) -> State:
        """Retorna o próximo estado natural da sequência."""
        natural_flow = {
            State.OPENING: State.CONTEXT,
            State.CONTEXT: State.QUALIFY,
            State.QUALIFY: State.SCHEDULE,  # Default é agendar se qualificou
            State.HANDLE_OBJECTION: State.QUALIFY,
        }
        return natural_flow.get(self.session.state, State.CLOSE)

    def update_fields(self, fields: dict):
        """Atualiza campos coletados na sessão."""
        for key, value in fields.items():
            if value is not None and value != "":
                self.session.collected_fields[key] = value

    def add_objection(self, objection: str):
        """Registra objeção do lead."""
        if objection and objection not in self.session.objections:
            self.session.objections.append(objection)
            self.session.objection_count += 1

    def add_turn(self, role: str, text: str):
        """Adiciona turno ao histórico."""
        self.session.conversation_history.append({
            "role": role,
            "content": text,
            "state": self.session.state.value,
            "timestamp": datetime.utcnow().isoformat(),
        })
        if role == "user":
            self.session.turn_count += 1

    def get_session_summary(self) -> dict:
        """Retorna resumo completo da sessão para salvar no DB."""
        score, breakdown = self.session.calculate_score()
        return {
            "state": self.session.state.value,
            "score": score,
            "score_breakdown": breakdown,
            "collected_fields": self.session.collected_fields,
            "objections": self.session.objections,
            "tags": self.session.tags,
            "turn_count": self.session.turn_count,
            "objection_count": self.session.objection_count,
        }

    def determine_outcome(self) -> str:
        """Determina o outcome da chamada com base no estado final."""
        state = self.session.state
        score, _ = self.session.calculate_score()

        if state == State.SCHEDULE:
            return "scheduled"
        elif state == State.WARM_TRANSFER:
            return "transferred"
        elif state == State.FOLLOW_UP:
            return "follow_up"
        elif state == State.CLOSE:
            if score >= 60:
                return "qualified"
            else:
                return "not_qualified"
        return "incomplete"
