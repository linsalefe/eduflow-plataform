"""
Client para Evolution API v2.x
Gerencia instâncias, QR code, status e envio de mensagens.
"""
import httpx
import logging
from app.evolution.config import EVOLUTION_API_URL, EVOLUTION_API_KEY, EDUFLOW_WEBHOOK_URL

logger = logging.getLogger(__name__)


HEADERS = {
    "apikey": EVOLUTION_API_KEY,
    "Content-Type": "application/json",
}


class EvolutionAPIError(RuntimeError):
    """
    Erro vindo da Evolution API: status HTTP >= 400 ou corpo que não é JSON.

    Existe porque a Evolution responde erros com JSON válido (ex.: 403
    "This name is already in use"). Sem checar o status_code, res.json()
    tem sucesso e o erro passa despercebido.
    """

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        super().__init__(f"Evolution API respondeu {status_code}: {body}")


def _check(res: httpx.Response) -> dict:
    """Valida a resposta da Evolution API e devolve o JSON decodificado."""
    if res.status_code >= 400:
        raise EvolutionAPIError(res.status_code, res.text[:300])
    try:
        return res.json()
    except ValueError:
        raise EvolutionAPIError(res.status_code, f"resposta não-JSON: {res.text[:300]}")


async def create_instance(instance_name: str) -> dict:
    """Cria uma instância no Evolution API e configura o webhook."""
    async with httpx.AsyncClient(timeout=30) as client:
        # Criar instância
        res = await client.post(
            f"{EVOLUTION_API_URL}/instance/create",
            headers=HEADERS,
            json={
                "instanceName": instance_name,
                "integration": "WHATSAPP-BAILEYS",
                "qrcode": True,
                "rejectCall": False,
                "groupsIgnore": True,
                "alwaysOnline": False,
                "readMessages": False,
                "readStatus": False,
                "syncFullHistory": False,
            },
        )
        data = _check(res)

        # Configurar webhook
        wh_res = await client.post(
            f"{EVOLUTION_API_URL}/webhook/set/{instance_name}",
            headers=HEADERS,
            json={
                "webhook": {
                    "enabled": True,
                    "url": f"{EDUFLOW_WEBHOOK_URL}/{instance_name}",
                    "webhookByEvents": False,
                    "webhookBase64": True,
                    "events": [
                        "MESSAGES_UPSERT",
                        "CONNECTION_UPDATE",
                        "QRCODE_UPDATED",
                        "MESSAGES_UPDATE",
                        "SEND_MESSAGE",
                    ],
                }
            },
        )

        # Webhook falhando não invalida a instância recém-criada: levantar aqui
        # deixaria uma instância órfã no Evolution (sem canal correspondente no
        # banco), que é justamente o tipo de inconsistência que queremos evitar.
        # Sinalizamos no retorno para o chamador poder avisar o usuário.
        if wh_res.status_code >= 400:
            logger.warning(
                "Falha ao configurar webhook da instância %s: %s %s",
                instance_name, wh_res.status_code, wh_res.text[:300],
            )
        if isinstance(data, dict):
            data["webhook_configured"] = wh_res.status_code < 400

        return data


async def get_instance_status(instance_name: str) -> dict:
    """Verifica o status de conexão da instância."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
            headers=HEADERS,
        )
        return _check(res)


async def get_qrcode(instance_name: str) -> dict:
    """Busca o QR code da instância."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{EVOLUTION_API_URL}/instance/connect/{instance_name}",
            headers=HEADERS,
        )
        return _check(res)


async def delete_instance(instance_name: str) -> dict:
    """Deleta uma instância."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.delete(
            f"{EVOLUTION_API_URL}/instance/delete/{instance_name}",
            headers=HEADERS,
        )
        return _check(res)


async def logout_instance(instance_name: str) -> dict:
    """Desconecta o WhatsApp da instância (sem deletar)."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.delete(
            f"{EVOLUTION_API_URL}/instance/logout/{instance_name}",
            headers=HEADERS,
        )
        return _check(res)


async def send_text(instance_name: str, to: str, text: str) -> dict:
    """Envia mensagem de texto via WhatsApp."""
    # Formata número (remove +, adiciona @s.whatsapp.net)
    number = to.replace("+", "").replace("-", "").replace(" ", "")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{EVOLUTION_API_URL}/message/sendText/{instance_name}",
            headers=HEADERS,
            json={
                "number": number,
                "text": text,
            },
        )
        return res.json()


async def send_buttons(
    instance_name: str,
    to: str,
    title: str,
    buttons: list[dict],
    description: str = "",
    footer: str = "",
) -> dict:
    """
    Envia mensagem com botões interativos nativos do WhatsApp.

    Parâmetros:
      - buttons: lista de dicts com {id, label}. Máx 3 botões.

    Em caso de erro HTTP, retorna {"error": str, "status": int}.
    Chamador deve fazer fallback pra send_text numerado.
    """
    number = to.replace("+", "").replace("-", "").replace(" ", "")

    evo_buttons = [
        {
            "type": "reply",
            "displayText": b.get("label", "")[:20],
            "id": b.get("id", ""),
        }
        for b in buttons[:3]
    ]

    payload = {
        "number": number,
        "title": title[:60] if title else "",
        "description": (description or "")[:1024],
        "footer": (footer or "")[:60],
        "buttons": evo_buttons,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{EVOLUTION_API_URL}/message/sendButtons/{instance_name}",
                headers=HEADERS,
                json=payload,
            )
            if res.status_code >= 400:
                return {"error": res.text[:200], "status": res.status_code}
            return res.json()
    except Exception as e:
        return {"error": str(e)[:200], "status": 0}


async def send_media(instance_name: str, to: str, media_type: str, base64_data: str, filename: str, mimetype: str, caption: str = "") -> dict:
    """Envia mídia (imagem, vídeo, documento) via Evolution API."""
    number = to.replace("+", "").replace("-", "").replace(" ", "")

    # Remover prefixo data:...;base64, se existir
    if ";base64," in base64_data:
        base64_data = base64_data.split(";base64,")[1]

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{EVOLUTION_API_URL}/message/sendMedia/{instance_name}",
            headers=HEADERS,
            json={
                "number": number,
                "mediatype": media_type,
                "media": base64_data,
                "fileName": filename,
                "mimetype": mimetype,
                "caption": caption,
            },
        )
        return res.json()


async def send_audio(instance_name: str, to: str, base64_data: str) -> dict:
    """Envia áudio via Evolution API usando sendWhatsAppAudio."""
    number = to.replace("+", "").replace("-", "").replace(" ", "")

    # Remover prefixo data:...;base64, se existir
    if ";base64," in base64_data:
        base64_data = base64_data.split(";base64,")[1]

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{EVOLUTION_API_URL}/message/sendWhatsAppAudio/{instance_name}",
            headers=HEADERS,
            json={
                "number": number,
                "audio": base64_data,
                "encoding": True,
            },
        )
        return res.json()


async def get_profile_picture(instance_name: str, number: str) -> str | None:
    """Busca a URL da foto de perfil de um contato via Evolution API."""
    number = number.replace("+", "").replace("-", "").replace(" ", "")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/{instance_name}",
                headers=HEADERS,
                json={"number": number},
            )
            data = res.json()
            if isinstance(data, dict):
                return data.get("profilePictureUrl") or data.get("profilePicUrl") or None
            return None
    except Exception:
        return None


async def list_instances() -> list:
    """Lista todas as instâncias criadas."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{EVOLUTION_API_URL}/instance/fetchInstances",
            headers=HEADERS,
        )
        return res.json()