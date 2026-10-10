"""
Executa as tarefas demoradas fora da tela (numa thread): postar a fila, tirar do ar, conferir os logins e ler e
excluir os anúncios que estão nos sites.

A tela acompanha por eventos (log, andamento de cada item, pedido de login, contas, listas) que ela busca a cada
segundo. Quando o robô trava (mesmo passo repetido mais de 5 vezes) ou um anúncio falha no site, o que ele tentava
fazer, o passo a passo, a página e a imagem da tela vão para o ERP (Configurações › AutoPost: travamentos).
"""
import base64
import json
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
from plataformas import NOMES, ParadaSolicitada, SkipItemException, Travou, criar
from plataformas.base import normalizar

PASTA_IMAGENS = Path(tempfile.gettempdir()) / "ERP AutoPost" / "imagens"
PASTA_LOGS = PASTA / "logs"
PASTA_DIAGNOSTICOS = PASTA / "diagnosticos"   # cópia local quando o ERP não recebe
TENTATIVAS_LOGIN = 3
LINHAS_NO_DIAGNOSTICO = 120


def preco_do_anuncio(produto: dict, precos: dict) -> str:
    """Preço inteiro, como os apps antigos mandavam (Facebook e OLX não usam centavos)."""
    valor = precos.get(str(produto["id"]), produto.get("preco_venda") or 0)
    return str(valor).replace(",", ".").split(".")[0]


class Executor:
    def __init__(self, erp, navegador=None, fabrica_plataforma=criar, cfg=None, guardar_cfg=None, versao_app=None):
        self.erp = erp
        self.cfg = cfg if cfg is not None else {}
        self._guardar_cfg = guardar_cfg or (lambda: None)
        self.versao_app = versao_app
        self.navegador = navegador or Navegador(log=self.log, escondido=lambda: self.cfg.get("navegador_escondido", True))
        self._fabrica = fabrica_plataforma
        self._eventos = []
        self._linhas_item = []
        self._trava = threading.Lock()
        self._thread = None
        self._parar = threading.Event()
        self._continuar = threading.Event()
        self.listas = {}   # anúncios lidos dos sites: {"facebook": {"itens": [...], "em": "..."}}
        self.estado = {"rodando": False, "tarefa": None, "total": 0, "feitos": 0, "ok": 0, "falhas": 0,
                       "atual": None, "aguardando_login": None}

    # ---------- eventos para a tela ----------
    def _evento(self, tipo, **dados):
        with self._trava:
            self._eventos.append({"n": len(self._eventos), "tipo": tipo, "hora": datetime.now().strftime("%H:%M:%S"), **dados})

    def log(self, mensagem, nivel="info"):
        self._evento("log", mensagem=str(mensagem), nivel=nivel)
        linha = f"[{datetime.now():%H:%M:%S}] {mensagem}"
        self._linhas_item.append(linha)
        del self._linhas_item[:-LINHAS_NO_DIAGNOSTICO]
        try:
            PASTA_LOGS.mkdir(parents=True, exist_ok=True)
            with open(PASTA_LOGS / f"{datetime.now():%Y-%m-%d}.txt", "a", encoding="utf-8") as f:
                f.write(linha + "\n")
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
        except Travou as t:
            self.log(f"O robô travou ({t.motivo}): {t.acao}", "erro")
            self.diagnosticar("", t.acao, str(t))
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

    def _plataforma(self, nome):
        plataforma = self._fabrica(nome, self.navegador, self.log, self._parar.is_set, self.cfg)
        plataforma.escolher_campos = self.erp.escolher_campos
        plataforma.iniciar_item()
        return plataforma

    # ---------- travamentos -> ERP ----------
    def diagnosticar(self, plataforma, acao, erro, produto=None, titulo=None):
        """Manda ao ERP o que o robô tentava fazer, o passo a passo, a página e a imagem da tela."""
        retrato = self.navegador.retrato()
        dados = {"plataforma": plataforma or "desconhecida", "acao": str(acao)[:500], "erro": str(erro)[:4000],
                 "produto_id": (produto or {}).get("id"), "titulo": (titulo or (produto or {}).get("nome") or "")[:255] or None,
                 "log": "\n".join(self._linhas_item), "url": (retrato["url"] or "")[:1000] or None,
                 "pagina": retrato["pagina"], "html": retrato["html"], "imagem_base64": retrato["imagem_base64"],
                 "versao_app": self.versao_app}
        try:
            r = self.erp.registrar_diagnostico(dados)
            self.log(f"Travamento enviado ao ERP (nº {r.get('id')}) com a imagem da tela, para ajuste.", "aviso")
        except Exception as e:
            pasta = PASTA_DIAGNOSTICOS / f"{datetime.now():%Y%m%d_%H%M%S}_{plataforma or 'app'}"
            try:
                pasta.mkdir(parents=True, exist_ok=True)
                if dados["imagem_base64"]:
                    (pasta / "tela.png").write_bytes(base64.b64decode(dados["imagem_base64"]))
                if dados["html"]:
                    (pasta / "pagina.html").write_text(dados["html"], encoding="utf-8")
                semimagem = {k: v for k, v in dados.items() if k not in ("imagem_base64", "html")}
                (pasta / "diagnostico.json").write_text(json.dumps(semimagem, ensure_ascii=False, indent=1), encoding="utf-8")
                self.log(f"Não consegui mandar o travamento ao ERP ({e}); ficou salvo em {pasta}", "aviso")
            except OSError:
                self.log(f"Não consegui mandar o travamento ao ERP: {e}", "aviso")

    # ---------- login nos sites ----------
    def _guardar_conta(self, nome, logado):
        self.cfg.setdefault("contas", {})[nome] = {"logado": bool(logado), "em": datetime.now().isoformat(timespec="seconds")}
        self._guardar_cfg()
        self._evento("conta", plataforma=nome, **self.cfg["contas"][nome])

    def _garantir_login(self, plataforma):
        for _ in range(TENTATIVAS_LOGIN):
            self.log(f"Conferindo se está logado no {plataforma.rotulo}...")
            plataforma.iniciar_item()
            logado = plataforma.esta_logado()
            self._guardar_conta(plataforma.nome, logado)
            if logado:
                self.log(f"{plataforma.rotulo}: logado.", "ok")
                return
            self.navegador.go_to_page(plataforma.url_login)
            self.navegador.mostrar()
            self.log(f"Faça login no {plataforma.rotulo} na janela do Chrome e clique em Continuar.", "aviso")
            self.estado["aguardando_login"] = plataforma.nome
            self._continuar.clear()
            self._evento("precisa_login", plataforma=plataforma.nome, rotulo=plataforma.rotulo)
            while not self._continuar.wait(0.5):
                pass
            self.estado["aguardando_login"] = None
            self.navegador.esconder()
            self._verificar_parada()
        raise RuntimeError(f"Não foi possível confirmar o login no {plataforma.rotulo}.")

    def abrir_login(self, nome):
        """Abre o Chrome do app, visível, na página de login do site (para a pessoa entrar antes de postar)."""
        def _abrir():
            plataforma = self._plataforma(nome)
            self.navegador.abrir(visivel=True)
            self.navegador.go_to_page(plataforma.url_login)
            self.log(f"Chrome aberto no login do {plataforma.rotulo}. Depois de entrar, clique em \"Conferir login\".")
        self._iniciar("login", _abrir)

    def conferir_contas(self, nomes=("facebook", "olx")):
        """Vê se o Chrome do app está logado em cada site (sem abrir janela se estiver escondido)."""
        def _conferir():
            ja_aberto = self.navegador.aberto()
            try:
                for nome in nomes:
                    self._verificar_parada()
                    plataforma = self._plataforma(nome)
                    self.log(f"Conferindo o login no {plataforma.rotulo}...")
                    logado = plataforma.esta_logado()
                    self._guardar_conta(nome, logado)
                    self.log(f"{plataforma.rotulo}: {'logado' if logado else 'não está logado'}.", "ok" if logado else "aviso")
            finally:
                if ja_aberto:
                    self.navegador.esconder()   # aberto pelo "Abrir para entrar": sai da frente de novo
                else:
                    self.navegador.fechar()
        self._iniciar("contas", _conferir)

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
            "produto_id": produto.get("id"),
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
                plataforma_atual = self._plataforma(nome)
                self._garantir_login(plataforma_atual)
            self.estado["atual"] = {"produto": produto.get("nome"), "plataforma": nome}
            self._evento("item", chave=chave, status="publicando")
            self._linhas_item = []
            self.log(f"[{indice + 1}/{len(tarefas)}] {NOMES[nome]}: {produto.get('nome')}")
            no_site = False
            try:
                if produto["id"] not in imagens_cache:
                    imagens_cache[produto["id"]] = self._baixar_imagens(produto)
                imagens = imagens_cache[produto["id"]]
                if not imagens:
                    raise SkipItemException("produto sem nenhuma foto válida")
                item = self._item(produto, cfg, imagens)
                plataforma_atual.iniciar_item()
                no_site = True
                link = plataforma_atual.publicar(item)
                no_site = False
                self.erp.registrar_anuncio(produto["id"], nome, item["titulo"], float(item["preco"] or 0), link)
                self.estado["ok"] += 1
                self._evento("item", chave=chave, status="ok")
                self.log(f"Publicado no {NOMES[nome]}: {item['titulo']}", "ok")
            except ParadaSolicitada:
                self._evento("item", chave=chave, status="parado")
                raise
            except Travou as t:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=f"travou: {t.acao}")
                self.log(f"O robô travou no {NOMES[nome]} ({t.motivo}): {t.acao}. Pulando este anúncio.", "erro")
                self.diagnosticar(nome, t.acao, str(t), produto=produto)
            except Exception as e:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=str(e))
                self.log(f"Não publicado ({NOMES[nome]} - {produto.get('nome')}): {e}", "erro")
                if no_site:   # falha no site (não "produto sem foto"): vale o diagnóstico
                    ultimo = next((l for l in reversed(self._linhas_item[:-1]) if l), "publicar")
                    self.diagnosticar(nome, ultimo.split("] ", 1)[-1], e, produto=produto)
            finally:
                self.estado["feitos"] += 1
            if indice < len(tarefas) - 1:
                self.estado["atual"] = None
                espera = random.randint(int(cfg.get("delay_min", 20)), max(int(cfg.get("delay_min", 20)), int(cfg.get("delay_max", 60))))
                self.log(f"Aguardando {espera}s antes do próximo (parece menos robô)...")
                self._esperar(espera)
        self.log(f"Fim: {self.estado['ok']} publicado(s), {self.estado['falhas']} com erro.",
                 "ok" if not self.estado["falhas"] else "aviso")

    # ---------- excluir dos sites ----------
    def remover(self, anuncios, cfg):
        """anuncios: registros de /api/anuncios (id, plataforma, titulo, produto_nome)."""
        self._iniciar("remover", self._excluir, [{"plataforma": a["plataforma"], "titulo": a["titulo"],
                                                  "anuncio_id": a["id"], "produto_nome": a.get("produto_nome")}
                                                 for a in anuncios])

    def excluir_do_site(self, itens):
        """itens: [{"plataforma": "olx", "titulo": "..."}] — vindos da lista lida do site."""
        self._iniciar("excluir", self._excluir, itens)

    def _anuncios_erp_ativos(self):
        try:
            return self.erp.anuncios("ativo")
        except Exception as e:
            self.log(f"Não consegui ler os anúncios do ERP ({e}); o registro no ERP não será atualizado.", "aviso")
            return []

    def _excluir(self, itens):
        self.estado["total"] = len(itens)
        self.log(f"{len(itens)} anúncio(s) para tirar do ar.")
        ativos = self._anuncios_erp_ativos()
        plataforma_atual = None
        for item in sorted(itens, key=lambda i: i["plataforma"]):
            self._verificar_parada()
            nome, titulo = item["plataforma"], item["titulo"]
            chave = f"anuncio-{item['anuncio_id']}" if item.get("anuncio_id") else f"site-{nome}-{titulo}"
            if plataforma_atual is None or plataforma_atual.nome != nome:
                plataforma_atual = self._plataforma(nome)
                self._garantir_login(plataforma_atual)
            self.estado["atual"] = {"produto": item.get("produto_nome") or titulo, "plataforma": nome}
            self._evento("item", chave=chave, status="publicando")
            self._linhas_item = []
            try:
                plataforma_atual.iniciar_item()
                achou = plataforma_atual.excluir(titulo)
                observacao = "excluído pelo AutoPost" if achou else "não estava mais no site"
                # registro no ERP: o anúncio indicado ou os que têm o mesmo título neste site
                ids = [item["anuncio_id"]] if item.get("anuncio_id") else [
                    a["id"] for a in ativos if a["plataforma"] == nome and normalizar(a["titulo"]) == normalizar(titulo)]
                for anuncio_id in ids:
                    self.erp.marcar_removido(anuncio_id, observacao)
                lista = self.listas.get(nome)
                if lista:
                    lista["itens"] = [i for i in lista["itens"] if normalizar(i["titulo"]) != normalizar(titulo)]
                self.estado["ok"] += 1
                self._evento("item", chave=chave, status="ok", mensagem=observacao)
            except ParadaSolicitada:
                raise
            except Travou as t:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=f"travou: {t.acao}")
                self.log(f"O robô travou ao excluir no {NOMES.get(nome, nome)}: {t.acao}", "erro")
                self.diagnosticar(nome, f"excluir: {t.acao}", str(t), titulo=titulo)
            except Exception as e:
                self.estado["falhas"] += 1
                self._evento("item", chave=chave, status="erro", mensagem=str(e))
                self.log(f"Não consegui tirar do ar ({NOMES.get(nome, nome)} - {titulo}): {e}", "erro")
                self.diagnosticar(nome, f"excluir o anúncio \"{titulo}\"", e, titulo=titulo)
            finally:
                self.estado["feitos"] += 1
            self._esperar(random.randint(5, 12))
        self.log(f"Fim: {self.estado['ok']} tirado(s) do ar, {self.estado['falhas']} com erro.",
                 "ok" if not self.estado["falhas"] else "aviso")

    # ---------- ler os anúncios dos sites ----------
    def listar_sites(self, nomes):
        self._iniciar("listar", self._listar, [n for n in ("facebook", "olx") if n in nomes])

    def _listar(self, nomes):
        self.estado["total"] = len(nomes)
        ativos = self._anuncios_erp_ativos()
        for nome in nomes:
            self._verificar_parada()
            plataforma = self._plataforma(nome)
            self._garantir_login(plataforma)
            self.estado["atual"] = {"produto": "lendo os anúncios", "plataforma": nome}
            self._linhas_item = []
            try:
                plataforma.iniciar_item()
                itens = plataforma.listar()
                registrados = {normalizar(a["titulo"]): a for a in ativos if a["plataforma"] == nome}
                for i in itens:
                    no_erp = registrados.get(normalizar(i["titulo"]))
                    i["anuncio_id"] = no_erp["id"] if no_erp else None
                    i["produto_id"] = no_erp["produto_id"] if no_erp else None
                self.listas[nome] = {"itens": itens, "em": datetime.now().isoformat(timespec="seconds")}
                self._evento("lista", plataforma=nome, quantidade=len(itens))
                self.estado["ok"] += 1
                if not itens and "R$" in (self.navegador.texto_da_pagina() or ""):
                    # a página tem preços mas nada foi reconhecido: o site mudou o layout
                    self.diagnosticar(nome, "ler a lista de anúncios do site", "nenhum anúncio reconhecido na página")
            except ParadaSolicitada:
                raise
            except Travou as t:
                self.estado["falhas"] += 1
                self.diagnosticar(nome, f"ler a lista: {t.acao}", str(t))
            except Exception as e:
                self.estado["falhas"] += 1
                self.log(f"Não consegui ler os anúncios do {NOMES[nome]}: {e}", "erro")
                self.diagnosticar(nome, "ler a lista de anúncios do site", e)
            finally:
                self.estado["feitos"] += 1
