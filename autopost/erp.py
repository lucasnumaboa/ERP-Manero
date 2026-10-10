"""Conversa com a API do ERP: login, produtos, categorias e o registro dos anúncios (/api/anuncios)."""
import time

import requests


class ErroErp(Exception):
    pass


class ErpCliente:
    RENOVAR_APOS = 20 * 60   # o token do ERP vence em 30 min; renova antes

    def __init__(self, base_url: str, sessao=None):
        self.base_url = base_url.strip().rstrip("/")
        self.sessao = sessao or requests.Session()
        self.token = None
        self.token_em = 0.0
        self._credenciais = None

    # ---------- sessão ----------
    def entrar(self, email: str, senha: str) -> dict:
        r = self.sessao.post(f"{self.base_url}/token", data={"username": email, "password": senha}, timeout=20)
        if r.status_code != 200:
            raise ErroErp(self._detalhe(r, "E-mail ou senha incorretos"))
        self.token = r.json()["access_token"]
        self.token_em = time.monotonic()
        self._credenciais = (email, senha)
        return self.get("/api/usuarios/me")

    def sair(self):
        self.token = None
        self._credenciais = None

    def _renovar_se_preciso(self):
        if not self.token or time.monotonic() - self.token_em < self.RENOVAR_APOS:
            return
        r = self.sessao.post(f"{self.base_url}/token/renovar", headers=self._cabecalhos(), timeout=20)
        if r.status_code == 200:
            self.token = r.json()["access_token"]
            self.token_em = time.monotonic()
        elif self._credenciais:
            self.entrar(*self._credenciais)

    def _cabecalhos(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @staticmethod
    def _detalhe(r, padrao):
        try:
            detalhe = r.json().get("detail")
            return detalhe if isinstance(detalhe, str) else padrao
        except ValueError:
            return f"{padrao} (HTTP {r.status_code})"

    def _pedir(self, metodo, caminho, **kwargs):
        self._renovar_se_preciso()
        url = f"{self.base_url}{caminho}"
        r = self.sessao.request(metodo, url, headers=self._cabecalhos(), timeout=kwargs.pop("timeout", 30), **kwargs)
        if r.status_code == 401 and self._credenciais:
            # sessão caiu por inatividade no ERP: entra de novo e repete uma vez
            self.entrar(*self._credenciais)
            r = self.sessao.request(metodo, url, headers=self._cabecalhos(), timeout=30, **kwargs)
        if r.status_code >= 400:
            raise ErroErp(self._detalhe(r, f"Erro {r.status_code} em {caminho}"))
        return r.json() if r.content else None

    def get(self, caminho, **params):
        return self._pedir("GET", caminho, params=params or None)

    # ---------- dados ----------
    def produtos(self):
        return self.get("/api/produtos/", ativo=True)

    def categorias(self):
        return self.get("/api/categorias/")

    def anuncios(self, status=None):
        return self.get("/api/anuncios/", **({"status": status} if status else {}))

    def ativos_por_produto(self):
        return self.get("/api/anuncios/ativos-por-produto")

    def para_remover(self):
        return self.get("/api/anuncios/para-remover")

    def registrar_anuncio(self, produto_id, plataforma, titulo, preco=None, link=None, observacao=None):
        return self._pedir("POST", "/api/anuncios/", json={
            "produto_id": produto_id, "plataforma": plataforma, "titulo": titulo,
            "preco": preco, "link": link, "observacao": observacao})

    def marcar_removido(self, anuncio_id, observacao=None):
        return self._pedir("PUT", f"/api/anuncios/{anuncio_id}/removido", json={"observacao": observacao})

    def salvar_escolha(self, produto_id, plataforma, valor: bool):
        campo = {"facebook": "post_facebook", "olx": "post_olx"}[plataforma]
        return self._pedir("PUT", f"/api/produtos/{produto_id}", json={campo: bool(valor)})

    def escolher_campos(self, dados: dict) -> dict:
        """Campos de seleção do site (com as opções) -> {"escolhas": {id_do_campo: opção}}, pela IA do ERP."""
        return self._pedir("POST", "/api/autopost/ia/campos", json=dados, timeout=90)

    def registrar_diagnostico(self, dados: dict):
        """Travamento do robô para o admin ver no ERP (Configurações › AutoPost: travamentos)."""
        return self._pedir("POST", "/api/autopost/diagnosticos/", json=dados, timeout=120)

    def baixar(self, caminho: str) -> bytes:
        url = caminho if caminho.startswith("http") else f"{self.base_url}/{caminho.lstrip('/')}"
        r = self.sessao.get(url, timeout=60)
        if r.status_code != 200:
            raise ErroErp(f"Imagem não encontrada ({r.status_code}): {caminho}")
        return r.content
