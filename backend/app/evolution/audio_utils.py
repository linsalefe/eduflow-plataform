"""
Conversão de áudio para o formato OGG/Opus que o WhatsApp PTT exige.

WhatsApp aceita PTT (mensagem de voz) apenas em:
  - Container: OGG
  - Codec: Opus
  - Canais: mono (1)
  - Sample rate: 16000 Hz

Navegadores gravam em formatos diferentes via MediaRecorder:
  - Chrome/Edge: audio/webm;codecs=opus
  - Firefox: audio/ogg;codecs=opus (nem sempre 16kHz mono)
  - Safari: audio/mp4

Para garantir compatibilidade 100% com qualquer browser, convertemos
todo áudio recebido para o formato PTT padrão antes de enviar à Evolution API.
"""
import asyncio
import logging
import os
import shutil

logger = logging.getLogger(__name__)


class AudioConversionError(Exception):
    """Erro ao converter áudio com ffmpeg."""


def _resolve_ffmpeg_binary() -> str | None:
    """
    Resolve o caminho absoluto do ffmpeg.

    Tenta nesta ordem:
      1. shutil.which no PATH atual.
      2. shutil.which com PATH estendido (cobre o caso do systemd ter PATH restrito).
      3. Caminhos absolutos comuns em sistemas Linux/Mac.

    Retorna o caminho absoluto se encontrar, ou None.
    """
    found = shutil.which("ffmpeg")
    if found:
        return found

    extended_path = os.pathsep.join([
        os.environ.get("PATH", ""),
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/opt/homebrew/bin",
    ])
    found = shutil.which("ffmpeg", path=extended_path)
    if found:
        return found

    for candidate in ("/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    return None


# Resolvido uma vez no import. Se não encontrar, _FFMPEG_BIN fica None
# e a primeira chamada lança erro claro (em vez de falhar silenciosamente).
_FFMPEG_BIN = _resolve_ffmpeg_binary()
if _FFMPEG_BIN:
    logger.info("ffmpeg resolvido em: %s", _FFMPEG_BIN)
else:
    logger.warning(
        "ffmpeg NÃO encontrado no PATH nem em caminhos comuns. "
        "Conversão de áudio falhará. Instale com: sudo apt install ffmpeg"
    )


async def convert_to_whatsapp_ptt(audio_bytes: bytes) -> bytes:
    """
    Converte qualquer áudio para OGG/Opus mono 16kHz (formato PTT do WhatsApp).

    Usa ffmpeg via subprocess com stdin/stdout (sem arquivos temporários).

    Args:
        audio_bytes: Bytes do áudio de entrada (webm, mp4, ogg, mp3, etc).

    Returns:
        Bytes do áudio convertido em OGG/Opus mono 16kHz.

    Raises:
        AudioConversionError: Se ffmpeg não estiver instalado, falhar ou retornar saída vazia.
    """
    if not audio_bytes:
        raise AudioConversionError("Bytes de áudio vazios.")

    if not _FFMPEG_BIN:
        raise AudioConversionError(
            "ffmpeg não encontrado no servidor. Instale com: sudo apt install ffmpeg"
        )

    cmd = [
        _FFMPEG_BIN,
        "-loglevel", "error",
        "-i", "pipe:0",
        "-vn",
        "-c:a", "libopus",
        "-b:a", "64k",
        "-ar", "16000",
        "-ac", "1",
        "-f", "ogg",
        "pipe:1",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as e:
        raise AudioConversionError(
            f"ffmpeg não pôde ser executado em {_FFMPEG_BIN}: {e}"
        ) from e

    stdout, stderr = await proc.communicate(input=audio_bytes)

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        logger.error("ffmpeg falhou (rc=%s): %s", proc.returncode, err)
        raise AudioConversionError(f"ffmpeg retornou {proc.returncode}: {err}")

    if not stdout:
        raise AudioConversionError("ffmpeg retornou saída vazia.")

    logger.info(
        "Áudio convertido: %d bytes -> %d bytes (OGG/Opus 16kHz mono)",
        len(audio_bytes), len(stdout)
    )
    return stdout
