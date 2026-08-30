"""
Transcrição de áudio local (offline) com NVIDIA Parakeet TDT 0.6B v3, via sherpa-onnx.

Reaproveita exatamente o mesmo modelo e a mesma pasta de cache que o Screvo já usa
(%APPDATA%/VideoRecorder/models/), então quem já tiver o modelo baixado ali (pelo
Screvo ou por esta rota) não baixa de novo. Roda 100% local — nenhum áudio sai da
máquina.

Usado pelo botão de microfone no chat de dúvidas do produto e no campo
"Instruções e dúvidas" do cadastro de produto: grava um áudio curto no navegador,
manda pra cá, volta como texto.
"""

import os
import subprocess
import tempfile
import threading

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from auth import get_current_user
from models import UserInDB

router = APIRouter()

PARAKEET_DIRNAME = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
PARAKEET_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
)

_recognizer = None
_recognizer_lock = threading.Lock()


def _models_dir() -> str:
    """Mesma pasta de cache de modelo usada pelo Screvo — evita baixar duas vezes."""
    d = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "VideoRecorder", "models")
    os.makedirs(d, exist_ok=True)
    return d


def _modelo_disponivel() -> bool:
    model_dir = os.path.join(_models_dir(), PARAKEET_DIRNAME)
    return os.path.isfile(os.path.join(model_dir, "encoder.int8.onnx"))


def _obter_recognizer():
    """Carrega o modelo Parakeet uma única vez e reaproveita entre requisições."""
    global _recognizer

    if _recognizer is not None:
        return _recognizer

    with _recognizer_lock:
        if _recognizer is not None:
            return _recognizer

        if not _modelo_disponivel():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Modelo de transcrição (Parakeet) ainda não foi baixado neste servidor."
            )

        import sherpa_onnx

        model_dir = os.path.join(_models_dir(), PARAKEET_DIRNAME)
        _recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=os.path.join(model_dir, "encoder.int8.onnx"),
            decoder=os.path.join(model_dir, "decoder.int8.onnx"),
            joiner=os.path.join(model_dir, "joiner.int8.onnx"),
            tokens=os.path.join(model_dir, "tokens.txt"),
            num_threads=max(1, (os.cpu_count() or 4) // 2),
            decoding_method="greedy_search",
            model_type="nemo_transducer",
            provider="cpu",
        )
        return _recognizer


def _converter_para_wav(caminho_origem: str, caminho_wav: str):
    """Converte qualquer áudio recebido do navegador para WAV 16kHz mono via ffmpeg."""
    resultado = subprocess.run(
        [
            "ffmpeg", "-y", "-i", caminho_origem,
            "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            caminho_wav
        ],
        capture_output=True,
        timeout=60
    )
    if resultado.returncode != 0 or not os.path.isfile(caminho_wav):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível processar o áudio enviado."
        )


@router.get("/status")
async def status_transcricao(current_user: UserInDB = Depends(get_current_user)):
    """Indica se o modelo de transcrição já está pronto para uso."""
    return {"modelo_disponivel": _modelo_disponivel()}


@router.post("/audio")
async def transcrever_audio(
    audio: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user)
):
    """Recebe um áudio curto (gravado no navegador) e retorna o texto transcrito."""
    if not _modelo_disponivel():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Modelo de transcrição (Parakeet) ainda não foi baixado neste servidor."
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        extensao = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
        caminho_origem = os.path.join(tmp_dir, f"entrada{extensao}")
        caminho_wav = os.path.join(tmp_dir, "convertido.wav")

        with open(caminho_origem, "wb") as f:
            f.write(await audio.read())

        _converter_para_wav(caminho_origem, caminho_wav)

        import numpy as np
        import wave

        with wave.open(caminho_wav) as wf:
            sr = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
        amostras = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

        if len(amostras) < int(0.3 * sr):
            amostras = np.pad(amostras, (0, int(0.3 * sr) - len(amostras)))

        recognizer = _obter_recognizer()
        stream = recognizer.create_stream()
        stream.accept_waveform(sr, amostras)
        recognizer.decode_stream(stream)
        texto = (stream.result.text or "").strip()

    return {"texto": texto}
