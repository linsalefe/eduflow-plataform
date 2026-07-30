import os

from dotenv import load_dotenv

# Carregado aqui explicitamente: este módulo é importado indiretamente por
# app.main antes da chamada de load_dotenv() de lá, então não dá para depender
# da ordem de import para as variáveis existirem.
load_dotenv()

EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "http://100.26.100.8:8080")

EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY")
if not EVOLUTION_API_KEY:
    raise RuntimeError(
        "EVOLUTION_API_KEY não configurada. Defina a variável no .env do backend "
        "(ou no EnvironmentFile do systemd) antes de subir a aplicação. "
        "Veja backend/.env.example."
    )

EDUFLOW_WEBHOOK_URL = os.getenv(
    "EDUFLOW_WEBHOOK_URL", "https://portal.eduflowia.com/api/evolution/webhook"
)
