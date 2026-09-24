"""Produtos 3D: miniatura leve gerada no upload (o card não baixa GIF/foto de vários MB) e apagada junto."""
from PIL import Image

from routers.produtos_3d import caminho_miniatura_3d, gerar_miniatura_3d, remover_arquivo_3d


def test_miniatura_do_gif_e_da_imagem(tmp_path, monkeypatch):
    backend = tmp_path / "backend"
    backend.mkdir()
    monkeypatch.chdir(backend)  # as rotas usam caminhos relativos a backend/ ("../frontend/...")
    for relativo, formato in (("uploads/produtos_3d/gifs/1_x.gif", "GIF"), ("uploads/produtos_3d/imagens/1_y.png", "PNG")):
        original = tmp_path / "frontend" / relativo
        original.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (1600, 900), (200, 30, 30)).save(original, formato)

        assert gerar_miniatura_3d(relativo)
        miniatura = tmp_path / "frontend" / caminho_miniatura_3d(relativo)
        assert miniatura.name.endswith(".jpg") and miniatura.parent.name == "thumbs"
        with Image.open(miniatura) as img:
            assert max(img.size) <= 480 and img.format == "JPEG"

        remover_arquivo_3d(relativo)
        assert not original.exists() and not miniatura.exists()


def test_falha_na_miniatura_nao_derruba_upload(tmp_path, monkeypatch):
    (tmp_path / "backend").mkdir()
    monkeypatch.chdir(tmp_path / "backend")
    arquivo = tmp_path / "frontend" / "uploads/produtos_3d/imagens/quebrado.jpg"
    arquivo.parent.mkdir(parents=True)
    arquivo.write_bytes(b"isso nao e imagem")
    assert gerar_miniatura_3d("uploads/produtos_3d/imagens/quebrado.jpg") is False
