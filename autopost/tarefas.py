"""
Executa as tarefas demoradas fora da tela (numa thread): postar a fila e remover anúncios de produtos vendidos.

A tela acompanha por eventos (log, andamento de cada item, pedido de login) que ela busca a cada segundo.
"""
import os
import random
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from config import PASTA
from navegador import Navegador
from plataformas import NOMES, ParadaSolicitada, SkipItemException, criar

PASTA_IMAGENS = Path(tempfile.gettempdir()) / "ERP AutoPost" / "imagens"
PASTA_LOGS = PASTA / "logs"
TENTATIVAS_LOGIN = 3


def preco_do_anuncio(produto: dict, precos: dict) -> str:
    """Preço inteiro, como os apps antigos mandavam (Facebook e OLX não usam centavos)."""
    valor = precos.get(str(produto["id"]), produto.get("preco_venda") or 0)
    return str(valor).replace(",", ".").split(".")[0]


class Executor:
    def __init__(self, erp, navegador=None, fabrica_plataforma=criar):
        self.erp = erp
        self.navegador = navegador or Navegador(log=self.log)
        self._fabrica = fabrica_plataforma
        self._eventos = []
        self._trava = threading.Lock()
        self._thread = None
        self._parar = threading.Event()
        self._continuar = threading.Event()
        self.estado = {"rodando": False, "tarefa": None, "total": 0, "feitos": 0, "ok": 0, "falhas": 0,
                       "atual": None, "aguardando_login": None}

    # ---------- eventos para a tela ----------
    def _evento(self, tipo, **dados):
        with self._trava:
            self._eventos.append({"n": len(self._eventos), "tipo": tipo, "hora": datetime.now().strftime("%H:%M:%S"), **dados})

    def log(self, mensagem, nivel="info"):
        self._evento("log", mensagem=str(mensagem), nivel=nivel)
        try:
            PASTA_LOGS.mkdir(parents=True, exist_ok=True)
            with open(PASTA_LOGS / f"{datetime.now():%Y-%m-%d}.txt", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now():%H:%M:%S}] {mensagem}\n")
        except OSError:
            pass

    def eventos(self, desde=0):
        with self._trava:
            return self._eventos[desde:]

    # ---------- controle ----------
    def ocupado(self):
        return bool(self._thread and self._thread.is_alive())

    def parar(self):
        self._parar.set()
        self._continuar.set()   # se estava esperando login, destrava para sair

    def continuar(self):
        self._continuar.set()

    def _iniciar(self, nome, alvo, *args):
        if self.ocupado():
            raise RuntimeError("Já tem uma tarefa rodando. Espere terminar ou clique em Parar.")
        self._parar.clear()
        self._continuar.clear()
        self.estado.update({"rodando": True, "tarefa": nome, "total": 0, "feitos": 0, "ok": 0, "falhas": 0,
                            "atual": None, "aguardando_login": None})
        self._thread = threading.Thread(target=self._rodar, args=(nome, alvo, *args), daemon=True)
        self._thread.start()

    def _rodar(self, nome, alvo, *args):
        try:
            alvo(*args)
        except ParadaSolicitada:
            self.log("Parado a pedido.", "aviso")
        except Exception as e:
            self.log(f"Erro inesperado: {e}", "erro")
        finally:
            shutil.rmtree(PASTA_IMAGENS, ignore_errors=True)
            self.estado.update({"rodando": False, "atual": None, "aguardando_login": None})
            self._evento("fim", tarefa=nome, ok=self.estado["ok"], falhas=self.estado["falhas"],
                         parado=self._parar.is_set())

    def _verificar_parada(self):
        if self._parar.is_set():
            raise ParadaSolicitada()

    def _esperar(self, segundos):
        fim = time.monotonic() + segundos
        while time.monotonic() < fim:
            self._verificar_parada()
            time.sleep(min(0.5, max(0, fim - time.monotonic())))

    # ---------- login nos sites ----------
    def _garantir_login(self, plataforma):
        for _ in range(TENTATIVAS_LOGIN):
            self.log(f"Conferindo se está logado no {plataforma.rotulo}...")
            if plataforma.esta_logado():
                self.log(f"{plataforma.rotulo}: logado.", "ok")
                return
            self.navegador.go_to_page(plataforma.url_login)
            self.log(f"Faça login no {plataforma.rotulo} na janela do Chrome e clique em Continuar.", "aviso")
            self.estado["aguardando_login"] = plataforma.nome
            self._continuar.clear()
            self._evento("precisa_login", plataforma=plataforma.nome, rotulo=plataforma.rotulo)
            while not self._continuar.wait(0.5):
                pass
            self.estado["aguardando_login"] = None
            self._verificar_parada()
        raise RuntimeError(f"Não foi possível confirmar o login no {plataforma.rotulo}.")

    def abrir_login(self, nome):
        """Abre o Chrome do app na página de login do site (para a pessoa entrar antes de postar)."""
        def _abrir():
            plataforma = self._fabrica(nome, self.navegador, self.log, self._parar.is_set, {})
            self.navegador.go_to_page(plataforma.url_login)
            self.log(f"Chrome aberto no login do {plataforma.rotulo}. Depois de entrar, pode fechar a janela.")
        self._iniciar("login", _abrir)

    # ---------- postar ----------
    def postar(self, fila, cfg):
        """fila: [{"produto": {...}, "plataformas": ["facebook", "olx"]}]"""
        self._iniciar("postar", self._postar, fila, cfg)

    def _baixar_imagens(self, produto):
        from PIL import Image
        PASTA_IMAGENS.mkdir(parents=True, exist_ok=True)
        arquivos = []
        for caminho in [c.strip() for c in (produto.get("caminho_imagem") or "").split(",") if c.strip()]:
            try:
                dados = self.erp.baixar(caminho)
                destino = PASTA_IMAGENS / f"{uuid.uuid4().hex}{os.path.splitext(caminho)[1] or '.jpg'}"
                destino.write_bytes(dados)
                with Image.open(destino) as img:
                    img.verify()   # imagem corrompida faz a OLX recusar o anúncio inteiro
                arquivos.append(str(destino))
            except Exception as e:
                self.log(f"Imagem ignorada ({caminho}): {e}", "aviso")
        return arquivos

    def _item(self, produto, cfg, imagens):
        mapa = cfg.get("facebook", {}).get("categorias", {})
        return {
            "titulo": produto.get("nome", "").strip(),
            "preco": preco_do_anuncio(produto, cfg.get("precos", {})),
            "descricao": produto.get("descricao") or "",
            "imagens": imagens,
            "categoria_facebook": mapa.get(produto.get("categoria_nome") or "", "")
            or cfg.get("facebook", {}).get("categoria_padrao", ""),
        }

    def _postar(self, fila, cfg):
        # agrupa por site: faz login uma vez e posta tudo daquele site
        ordem = [nome for nome in ("facebook", "olx") if any(nome in f["plataformas"] for f in fila)]
        tarefas = [(nome, f["produto"]) for nome in ordem for f in fila if nome in f["plataformas"]]
        self.estado["total"] = len(tarefas)
        self.log(f"{len(tarefas)} anúncio(s) para publicar: " +
                 ", ".join(f"{sum(1 for n, _ in tarefas if n == nome)} no {NOMES[nome]}" for nome in ordem))
        imagens_cache = {}
        plataforma_atual = None
        for indice, (nome, produto) in enumerate(tarefas):
            self._verificar_parada()
            chave = f"{produto['id']}-{nome}"
            if plataforma_atual is None or plataforma_atual.nome != nome:
                plataforma_atual = self._fabrica(nome, self.navegador, self.log, self._parar.is_set, cfg)
                self._garantir_login(plataforma_atual)
            self.estado["atual"] = {"produto": produto.get("nome"), "plataforma": nome}
            self._evento("item", chave=chave, status="publicando")
            self.log(f"[{indice + 1}/{len(tarefas)}] {NOMES[nome]}: {produto.get('nome')}")
            try:
                if produto["id"] not in imagens_cache:
                    imagens_cache[produto["id"]] = self._baixar_imagens(produto)
                imagens = imagens_cache[produto["id"]]
                if not imagens:
                    raise SkipItemException("produto sem nenhuma foto válida")
                item = self._item(produto, cfg, imagens)
                link = plataforma_atual.publicar(item)
                self.erp.registrar_anuncio(produto["id"], nome, item["titulo"], float(item["preco"] or 0), link)
                self.estado["ok"] += 1
                self._evento("item", chave=chave, status="ok")
                self.log(f"Publicado no {NOMES[nome]}: {item['titulo']}", "ok")
            except ParadaSolicitada:
                self._evento("item", chave=chave, status="parado")
                raise
            except Exception as e:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=str(e))
                self.log(f"Não publicado ({NOMES[nome]} - {produto.get('nome')}): {e}", "erro")
            finally:
                self.estado["feitos"] += 1
            if indice < len(tarefas) - 1:
                self.estado["atual"] = None
                espera = random.randint(int(cfg.get("delay_min", 20)), max(int(cfg.get("delay_min", 20)), int(cfg.get("delay_max", 60))))
                self.log(f"Aguardando {espera}s antes do próximo (parece menos robô)...")
                self._esperar(espera)
        self.log(f"Fim: {self.estado['ok']} publicado(s), {self.estado['falhas']} com erro.",
                 "ok" if not self.estado["falhas"] else "aviso")

    # ---------- remover vendidos ----------
    def remover(self, anuncios, cfg):
        """anuncios: registros de /api/anuncios (id, plataforma, titulo, produto_nome)."""
        self._iniciar("remover", self._remover, anuncios, cfg)

    def _remover(self, anuncios, cfg):
        self.estado["total"] = len(anuncios)
        self.log(f"{len(anuncios)} anúncio(s) para tirar do ar.")
        ordenados = sorted(anuncios, key=lambda a: a["plataforma"])
        plataforma_atual = None
        for anuncio in ordenados:
            self._verificar_parada()
            nome = anuncio["plataforma"]
            chave = f"anuncio-{anuncio['id']}"
            if plataforma_atual is None or plataforma_atual.nome != nome:
                plataforma_atual = self._fabrica(nome, self.navegador, self.log, self._parar.is_set, cfg)
                self._garantir_login(plataforma_atual)
            self.estado["atual"] = {"produto": anuncio.get("produto_nome"), "plataforma": nome}
            self._evento("item", chave=chave, status="publicando")
            try:
                achou = plataforma_atual.excluir(anuncio["titulo"])
                observacao = "excluído pelo AutoPost" if achou else "não estava mais no site"
                self.erp.marcar_removido(anuncio["id"], observacao)
                self.estado["ok"] += 1
                self._evento("item", chave=chave, status="ok", mensagem=observacao)
            except ParadaSolicitada:
                raise
            except Exception as e:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=str(e))
                self.log(f"Não consegui tirar do ar ({NOMES.get(nome, nome)} - {anuncio['titulo']}): {e}", "erro")
            finally:
                self.estado["feitos"] += 1
            self._esperar(random.randint(5, 12))
        self.log(f"Fim: {self.estado['ok']} tirado(s) do ar, {self.estado['falhas']} com erro.",
                 "ok" if not self.estado["falhas"] else "aviso")
