"""
Métodos que a tela (ui/app.js) chama via window.pywebview.api.<nome>(...).

Cada método devolve um dicionário simples; erro vira {"erro": "mensagem"} para a tela mostrar.
"""
import functools
import traceback
import webbrowser

import atualizador
import config
from erp import ErpCliente, ErroErp
from navegador import chrome_instalado
from tarefas import Executor

VERSAO = "1.2.3"

CAMPOS_PRODUTO = ("id", "codigo", "nome", "descricao", "preco_venda", "estoque_atual", "categoria_id",
                  "categoria_nome", "caminho_imagem", "post_facebook", "post_olx", "faturavel", "comissao")


def _seguro(metodo):
    @functools.wraps(metodo)
    def envolto(self, *args, **kwargs):
        try:
            return metodo(self, *args, **kwargs)
        except ErroErp as e:
            return {"erro": str(e)}
        except Exception as e:
            traceback.print_exc()
            return {"erro": str(e) or e.__class__.__name__}
    return envolto


class Api:
    def __init__(self):
        self.cfg = config.carregar()
        self.erp = None
        self.executor = None
        self.usuario = None
        # Privados (com _): o pywebview percorre os atributos públicos da API para expor à tela e, ao ler as
        # propriedades da janela enquanto ela abre, às vezes travava o app (AutoPost 1.2.1)
        self._janela = None           # app.py preenche: a atualização fecha a janela ao abrir a versão nova
        self._publicada = None        # versão nova achada no ERP
        self._atualizacao = None
        atualizador.limpar_sobras()

    def _salvar_cfg(self):
        config.salvar(self.cfg)

    # ---------- início / login ----------
    @_seguro
    def inicio(self):
        senha = config.revelar(self.cfg.get("senha_protegida")) if self.cfg.get("lembrar") else ""
        return {"versao": VERSAO, "api_url": self.cfg["api_url"], "email": self.cfg.get("email", ""),
                "lembrar": self.cfg.get("lembrar", True), "tem_senha_salva": bool(senha),
                "chrome_instalado": chrome_instalado()}

    @_seguro
    def entrar(self, api_url, email, senha, lembrar):
        api_url = (api_url or "").strip().rstrip("/")
        if not senha and self.cfg.get("lembrar") and email == self.cfg.get("email"):
            senha = config.revelar(self.cfg.get("senha_protegida"))
        erp = ErpCliente(api_url)
        self.usuario = erp.entrar(email.strip(), senha)
        self.erp = erp
        if self.executor and self.executor.ocupado():
            self.executor.parar()
        self.executor = Executor(erp, cfg=self.cfg, guardar_cfg=self._salvar_cfg, versao_app=VERSAO)
        self.cfg.update({"api_url": api_url, "email": email.strip(), "lembrar": bool(lembrar),
                         "senha_protegida": config.proteger(senha) if lembrar else ""})
        self._salvar_cfg()
        return {"usuario": {"nome": self.usuario.get("nome"), "email": self.usuario.get("email"),
                            "nivel": self.usuario.get("nivel_acesso")}}

    @_seguro
    def sair(self):
        if self.executor:
            self.executor.parar()
            self.executor.navegador.fechar()
        self.erp = self.executor = self.usuario = None
        self.cfg["senha_protegida"] = ""
        self._salvar_cfg()
        return {"ok": True}

    # ---------- dados ----------
    @_seguro
    def carregar(self):
        produtos = [{c: p.get(c) for c in CAMPOS_PRODUTO} for p in self.erp.produtos()
                    if (p.get("estoque_atual") or 0) > 0 and p.get("faturavel", True)]
        locais = self.cfg.get("escolhas_locais", {})
        for p in produtos:
            local = locais.get(str(p["id"]), {})
            p["facebook"] = local.get("facebook", bool(p.pop("post_facebook")))
            p["olx"] = local.get("olx", bool(p.pop("post_olx")))
            p["preco_anuncio"] = self.cfg.get("precos", {}).get(str(p["id"]))
        categorias = sorted({p["categoria_nome"] for p in produtos if p.get("categoria_nome")})
        return {"produtos": produtos, "categorias": categorias,
                "no_ar": self.erp.ativos_por_produto(),
                "para_remover": len(self.erp.para_remover()),
                "api_url": self.erp.base_url}

    @_seguro
    def escolher(self, produto_id, plataforma, valor):
        """Liga/desliga a plataforma para o produto e grava no ERP (post_facebook / post_olx)."""
        chave = str(produto_id)
        try:
            self.erp.salvar_escolha(produto_id, plataforma, valor)
            locais = self.cfg.get("escolhas_locais", {})
            if chave in locais:
                locais[chave].pop(plataforma, None)
                if not locais[chave]:
                    locais.pop(chave)
                self._salvar_cfg()
            return {"ok": True, "no_erp": True}
        except ErroErp as e:
            # sem permissão de editar produto no ERP: a escolha vale só neste PC
            self.cfg.setdefault("escolhas_locais", {}).setdefault(chave, {})[plataforma] = bool(valor)
            self._salvar_cfg()
            return {"ok": True, "no_erp": False, "aviso": str(e)}

    @_seguro
    def definir_preco(self, produto_id, preco):
        precos = self.cfg.setdefault("precos", {})
        if preco in (None, ""):
            precos.pop(str(produto_id), None)
        else:
            precos[str(produto_id)] = float(str(preco).replace(",", "."))
        self._salvar_cfg()
        return {"ok": True}

    @_seguro
    def anuncios(self, status=None):
        return {"anuncios": self.erp.anuncios(status or None), "para_remover": self.erp.para_remover()}

    @_seguro
    def marcar_removido(self, anuncio_id):
        self.erp.marcar_removido(anuncio_id, "marcado manualmente no AutoPost")
        return {"ok": True}

    # ---------- configurações ----------
    @_seguro
    def configuracoes(self):
        return {"delay_min": self.cfg["delay_min"], "delay_max": self.cfg["delay_max"],
                "navegador_escondido": self.cfg.get("navegador_escondido", True),
                "facebook": self.cfg["facebook"], "categorias_facebook": config.CATEGORIAS_FACEBOOK,
                "pasta_logs": str(config.PASTA / "logs")}

    @_seguro
    def salvar_configuracoes(self, dados):
        dmin = max(5, int(dados.get("delay_min", 20)))
        dmax = max(dmin, int(dados.get("delay_max", 60)))
        self.cfg.update({"delay_min": dmin, "delay_max": dmax,
                         "navegador_escondido": bool(dados.get("navegador_escondido", True))})
        fb = dados.get("facebook") or {}
        self.cfg["facebook"].update({
            "grupos": bool(fb.get("grupos", True)),
            "contato": str(fb.get("contato", "")).strip(),
            "categoria_padrao": fb.get("categoria_padrao") or config.CATEGORIAS_FACEBOOK[0],
            "categorias": {k: v for k, v in (fb.get("categorias") or {}).items() if v},
        })
        self._salvar_cfg()
        return {"ok": True}

    # ---------- tarefas ----------
    @_seguro
    def postar(self, fila):
        """fila: [{"produto_id": 1, "plataformas": ["facebook"]}] — os produtos vêm do ERP de novo (dados frescos)."""
        produtos = {p["id"]: p for p in self.erp.produtos()}
        itens = [{"produto": produtos[f["produto_id"]], "plataformas": f["plataformas"]}
                 for f in fila if f["produto_id"] in produtos and f["plataformas"]]
        if not itens:
            return {"erro": "Nada para postar."}
        self.executor.postar(itens, self.cfg)
        return {"ok": True}

    @_seguro
    def remover_anuncios(self, ids=None):
        """Sem ids: tira do ar todos os de produtos vendidos. Com ids: só esses (vendidos ou não)."""
        if ids:
            lista = [a for a in self.erp.anuncios("ativo") if a["id"] in set(ids)]
        else:
            lista = self.erp.para_remover()
        if not lista:
            return {"erro": "Nenhum anúncio para tirar do ar."}
        self.executor.remover(lista, self.cfg)
        return {"ok": True, "quantidade": len(lista)}

    # ---------- contas ----------
    @_seguro
    def contas(self):
        """Última conferência de login de cada site (feita ao postar ou pelo botão Conferir)."""
        return {"contas": self.cfg.get("contas", {}), "ocupado": bool(self.executor and self.executor.ocupado())}

    @_seguro
    def conferir_contas(self):
        self.executor.conferir_contas()
        return {"ok": True}

    # ---------- anúncios que estão nos sites ----------
    @_seguro
    def listar_sites(self, plataformas):
        self.executor.listar_sites(plataformas or ["facebook", "olx"])
        return {"ok": True}

    @_seguro
    def sites(self):
        return {"listas": self.executor.listas if self.executor else {}}

    @_seguro
    def excluir_do_site(self, itens):
        itens = [{"plataforma": i["plataforma"], "titulo": i["titulo"]} for i in itens or []
                 if i.get("plataforma") in ("facebook", "olx") and i.get("titulo")]
        if not itens:
            return {"erro": "Nenhum anúncio selecionado."}
        self.executor.excluir_do_site(itens)
        return {"ok": True, "quantidade": len(itens)}

    @_seguro
    def mostrar_navegador(self):
        """Traz o Chrome do app para a tela (para acompanhar o robô)."""
        if not (self.executor and self.executor.navegador.aberto()):
            return {"erro": "O Chrome do AutoPost não está aberto."}
        self.executor.navegador.mostrar()
        return {"ok": True}

    @_seguro
    def abrir_login(self, plataforma):
        self.executor.abrir_login(plataforma)
        return {"ok": True}

    @_seguro
    def continuar(self):
        self.executor.continuar()
        return {"ok": True}

    @_seguro
    def parar(self):
        self.executor.parar()
        return {"ok": True}

    @_seguro
    def fechar_navegador(self):
        if self.executor and not self.executor.ocupado():
            self.executor.navegador.fechar()
        return {"ok": True}

    @_seguro
    def acompanhar(self, desde=0):
        if not self.executor:
            return {"eventos": [], "estado": {"rodando": False}}
        return {"eventos": self.executor.eventos(int(desde)), "estado": self.executor.estado}

    # ---------- atualização do próprio AutoPost ----------
    @_seguro
    def verificar_atualizacao(self):
        api_url = self.erp.base_url if self.erp else self.cfg["api_url"]
        self._publicada = atualizador.verificar(api_url, VERSAO)
        if not self._publicada:
            return {"nova": None, "atual": VERSAO}
        return {"atual": VERSAO, "nova": {"versao": self._publicada.get("versao_app") or "",
                                          "alteracoes": self._publicada.get("alteracoes") or "",
                                          "tamanho": self._publicada.get("tamanho")}}

    @_seguro
    def atualizar(self):
        if not self._publicada:
            return {"erro": "Nenhuma versão nova para instalar."}
        if self.executor and self.executor.ocupado():
            return {"erro": "Espere o robô terminar (ou clique em Parar) antes de atualizar."}
        api_url = self.erp.base_url if self.erp else self.cfg["api_url"]
        self._atualizacao = atualizador.Atualizador(api_url)
        self._atualizacao.iniciar(self._publicada)
        return {"ok": True}

    @_seguro
    def progresso_atualizacao(self):
        return dict(self._atualizacao.estado) if self._atualizacao else {"etapa": "parado"}

    @_seguro
    def abrir_versao_nova(self):
        if not (self._atualizacao and self._atualizacao.estado["etapa"] == "pronto"):
            return {"erro": "A versão nova ainda não está pronta."}
        self._atualizacao.abrir_novo()
        if self._janela:
            self._janela.destroy()
        return {"ok": True}

    @_seguro
    def abrir_link(self, url):
        if url and url.startswith(("http://", "https://")):
            webbrowser.open(url)
        return {"ok": True}

    def ao_fechar(self):
        if self.executor:
            self.executor.parar()
            self.executor.navegador.fechar()
