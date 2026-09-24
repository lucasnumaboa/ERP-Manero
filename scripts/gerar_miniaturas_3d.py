"""
Gera as miniaturas que faltam para imagens e GIFs de Produtos 3D já cadastrados (os novos já ganham
miniatura no upload). Pode rodar de novo quando quiser: só cria o que não existe.

Uso: python scripts/gerar_miniaturas_3d.py
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
os.chdir(BACKEND)  # os caminhos das rotas são relativos a backend/ ("../frontend/...")
sys.path.insert(0, str(BACKEND))

from routers.produtos_3d import TIPOS_COM_MINIATURA, caminho_miniatura_3d, gerar_miniatura_3d  # noqa: E402

criadas = falhas = existentes = 0
for tipo in TIPOS_COM_MINIATURA:
    pasta = Path("../frontend/uploads/produtos_3d") / tipo
    if not pasta.exists():
        continue
    for arquivo in pasta.iterdir():
        if not arquivo.is_file():
            continue
        relativo = f"uploads/produtos_3d/{tipo}/{arquivo.name}"
        if Path("../frontend", caminho_miniatura_3d(relativo)).exists():
            existentes += 1
        elif gerar_miniatura_3d(relativo):
            criadas += 1
        else:
            falhas += 1
            print(f"Não foi possível gerar a miniatura de {relativo}")

print(f"Miniaturas criadas: {criadas} | já existiam: {existentes} | falharam: {falhas}")
