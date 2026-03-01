"""
Módulo de envio de mensagens via Instagram Direct (Messaging API)
"""
import httpx

BASE_URL = "https://graph.instagram.com/v22.0"


async def send_instagram_message(recipient_id: str, text: str, ig_user_id: str, access_token: str) -> dict:
    """Envia mensagem de texto via Instagram Direct."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/{ig_user_id}/messages",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": text},
            },
        )
        result = response.json()
        if response.status_code != 200:
            print(f"❌ Instagram send error: {result}")
        return result


async def send_instagram_image(recipient_id: str, image_url: str, ig_user_id: str, access_token: str) -> dict:
    """Envia imagem via Instagram Direct."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/{ig_user_id}/messages",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "recipient": {"id": recipient_id},
                "message": {
                    "attachment": {
                        "type": "image",
                        "payload": {"url": image_url},
                    }
                },
            },
        )
        result = response.json()
        if response.status_code != 200:
            print(f"❌ Instagram image send error: {result}")
        return result