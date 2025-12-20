import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from tkinter import scrolledtext
import tkinter as tk
import threading
import os
import sys
import json
import random
import requests
import shutil
import uuid
import subprocess
import winreg
from PIL import Image, ImageTk

from helpers.scraper import Scraper
import time


def get_appdata_path():
    """Retorna o caminho do AppData para salvar configurações"""
    appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
    app_folder = os.path.join(appdata, 'ERPAutoPostFacebook')
    os.makedirs(app_folder, exist_ok=True)
    return app_folder


def get_config_file_path():
    """Retorna o caminho do arquivo de configuração"""
    return os.path.join(get_appdata_path(), 'config.json')


def get_temp_images_path():
    """Retorna o caminho para imagens temporárias"""
    temp_path = os.path.join(get_appdata_path(), 'temp_images')
    os.makedirs(temp_path, exist_ok=True)
    return temp_path


def load_config():
    """Carrega configurações do arquivo JSON"""
    config_path = get_config_file_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {'api_url': '', 'username': '', 'password': '', 'remember': False, 'postar_em_grupos': True, 'adicionar_contato': False, 'numero_contato': '', 'delay_maximo': 30}


def save_config(config):
    """Salva configurações no arquivo JSON"""
    config_path = get_config_file_path()
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)


def cleanup_temp_images():
    """Remove imagens temporárias"""
    temp_path = get_temp_images_path()
    try:
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
            os.makedirs(temp_path, exist_ok=True)
    except Exception as e:
        print(f"Erro ao limpar imagens temporárias: {e}")


class App:
    """Aplicação principal com login e tela de produtos em uma única janela"""
    
    def __init__(self):
        self.root = ttk.Window(themename="darkly")
        self.root.title("ERP AutoPost Facebook")
        self.root.geometry("450x650")
        self.root.resizable(True, True)
        self.root.minsize(400, 500)
        
        # Centralizar janela
        self.root.eval('tk::PlaceWindow . center')
        
        # Set window icon
        self.set_icon()
        
        # Carregar configurações salvas
        self.config = load_config()
        
        # Variables
        self.api_url = ttk.StringVar(value=self.config.get('api_url', ''))
        self.username = ttk.StringVar(value=self.config.get('username', '') if self.config.get('remember') else '')
        self.password = ttk.StringVar(value=self.config.get('password', '') if self.config.get('remember') else '')
        self.remember = ttk.BooleanVar(value=self.config.get('remember', False))
        self.show_config = ttk.BooleanVar(value=False)
        self.show_password_var = ttk.BooleanVar(value=False)
        self.postar_em_grupos = ttk.BooleanVar(value=self.config.get('postar_em_grupos', True))
        self.adicionar_contato = ttk.BooleanVar(value=self.config.get('adicionar_contato', False))
        self.numero_contato = ttk.StringVar(value=self.config.get('numero_contato', ''))
        self.delay_maximo = ttk.IntVar(value=self.config.get('delay_maximo', 30))
        
        # Token e dados
        self.token = None
        self.usuario_id = None  # ID do usuário logado
        self.categorias = []
        self.categorias_selecionadas = []  # IDs das categorias selecionadas
        self.produtos = []
        self.produtos_selecionados = {}
        self.precos_personalizados = {}  # {produto_id: novo_preco}
        self.scraper = None
        
        # Frames
        self.login_frame = None
        self.main_frame = None
        
        # Mostrar tela de login
        self.show_login()
        
    def set_icon(self):
        try:
            icon_path = os.path.join(os.path.dirname(__file__), "icon.png")
            icon_image = Image.open(icon_path)
            icon_photo = ImageTk.PhotoImage(icon_image)
            self.root.iconphoto(True, icon_photo)
            self.icon_photo = icon_photo
        except Exception as e:
            print(f"Erro ao carregar icone: {e}")
    
    def clear_window(self):
        """Remove todos os widgets da janela"""
        for widget in self.root.winfo_children():
            widget.destroy()
    
    # ==================== TELA DE LOGIN ====================
    
    def show_login(self):
        """Mostra a tela de login"""
        self.clear_window()
        self.root.geometry("450x650")
        self.root.title("ERP AutoPost - Login")
        
        # Canvas com scroll para conteúdo responsivo
        canvas = tk.Canvas(self.root, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.root, orient=VERTICAL, command=canvas.yview)
        
        # Frame scrollável
        scrollable_frame = ttk.Frame(canvas, padding=20)
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Bind mousewheel (com verificação se canvas existe)
        def _on_mousewheel(event):
            try:
                if canvas.winfo_exists():
                    canvas.yview_scroll(int(-1*(event.delta/120)), "units")
            except:
                pass
        canvas.bind_all("<MouseWheel>", _on_mousewheel)
        
        # Ajustar largura do frame ao canvas
        def _configure_canvas(event):
            canvas.itemconfig(canvas.find_all()[0], width=event.width)
        canvas.bind("<Configure>", _configure_canvas)
        
        scrollbar.pack(side=RIGHT, fill=Y)
        canvas.pack(side=LEFT, fill=BOTH, expand=True)
        
        main_frame = scrollable_frame
        
        # Logo
        try:
            icon_path = os.path.join(os.path.dirname(__file__), "icon.png")
            icon_image = Image.open(icon_path)
            icon_image = icon_image.resize((60, 60), Image.LANCZOS)
            self.logo_photo = ImageTk.PhotoImage(icon_image)
            logo_label = ttk.Label(main_frame, image=self.logo_photo)
            logo_label.pack(pady=(0, 5))
        except Exception as e:
            print(f"Erro ao carregar logo: {e}")
        
        # Title
        title_label = ttk.Label(
            main_frame, 
            text="AutoPost Facebook",
            font=("Helvetica", 14, "bold"),
            bootstyle="primary"
        )
        title_label.pack(pady=(0, 10))
        
        # Login Frame
        login_frame = ttk.Labelframe(main_frame, text="Login", padding=10)
        login_frame.pack(fill=X, pady=(0, 5))
        
        # Email/Username
        ttk.Label(login_frame, text="Email:").pack(anchor=W)
        email_entry = ttk.Entry(login_frame, textvariable=self.username)
        email_entry.pack(fill=X, pady=(0, 5))
        
        # Password
        ttk.Label(login_frame, text="Senha:").pack(anchor=W)
        password_frame = ttk.Frame(login_frame)
        password_frame.pack(fill=X, pady=(0, 5))
        
        self.password_entry = ttk.Entry(password_frame, textvariable=self.password, show="*")
        self.password_entry.pack(side=LEFT, fill=X, expand=True)
        
        self.eye_btn = ttk.Button(
            password_frame,
            text="👁",
            width=3,
            bootstyle="secondary-outline",
            command=self.toggle_password_visibility
        )
        self.eye_btn.pack(side=RIGHT, padx=(5, 0))
        
        # Remember checkbox
        remember_check = ttk.Checkbutton(
            login_frame,
            text="Lembrar senha",
            variable=self.remember,
            bootstyle="primary-round-toggle"
        )
        remember_check.pack(anchor=W, pady=(0, 5))
        
        # Config Frame (sempre visível agora)
        self.config_frame = ttk.Labelframe(main_frame, text="⚙ Configurações", padding=10)
        self.config_frame.pack(fill=X, pady=(0, 5))
        
        ttk.Label(self.config_frame, text="URL da API:").pack(anchor=W)
        api_entry = ttk.Entry(self.config_frame, textvariable=self.api_url)
        api_entry.pack(fill=X, pady=(0, 3))
        ttk.Label(
            self.config_frame, 
            text="Ex: http://192.168.1.100:8001",
            font=("Helvetica", 8),
            bootstyle="secondary"
        ).pack(anchor=W)
        
        # Checkbox Postar em Grupos
        self.postar_grupos_check = ttk.Checkbutton(
            self.config_frame,
            text="Postar em grupos (até 20)",
            variable=self.postar_em_grupos,
            bootstyle="primary-round-toggle"
        )
        self.postar_grupos_check.pack(anchor=W, pady=(5, 0))
        
        # Checkbox Adicionar Contato
        self.adicionar_contato_check = ttk.Checkbutton(
            self.config_frame,
            text="Adicionar contato na descrição",
            variable=self.adicionar_contato,
            bootstyle="primary-round-toggle"
        )
        self.adicionar_contato_check.pack(anchor=W, pady=(5, 0))
        
        # Campo Número de Contato
        ttk.Label(self.config_frame, text="Número de contato:").pack(anchor=W, pady=(5, 0))
        contato_entry = ttk.Entry(self.config_frame, textvariable=self.numero_contato)
        contato_entry.pack(fill=X, pady=(0, 3))
        
        # Campo Delay Máximo
        ttk.Label(self.config_frame, text="Delay máximo (seg):").pack(anchor=W, pady=(5, 0))
        delay_frame = ttk.Frame(self.config_frame)
        delay_frame.pack(fill=X, pady=(0, 3))
        delay_entry = ttk.Entry(delay_frame, textvariable=self.delay_maximo, width=8)
        delay_entry.pack(side=LEFT)
        ttk.Label(
            delay_frame, 
            text="  (mín: 15s)",
            font=("Helvetica", 8),
            bootstyle="secondary"
        ).pack(side=LEFT)
        
        # Botão Salvar Configurações
        ttk.Button(
            self.config_frame,
            text="✓ Salvar Configurações",
            bootstyle="success",
            command=self.salvar_config_api
        ).pack(fill=X, pady=(10, 0))
        
        # Login Button
        self.login_btn = ttk.Button(
            main_frame,
            text="Entrar",
            bootstyle="success",
            command=self.do_login
        )
        self.login_btn.pack(fill=X, pady=(10, 5))
        
        # Status label
        self.status_label = ttk.Label(
            main_frame,
            text="",
            font=("Helvetica", 9),
            bootstyle="danger"
        )
        self.status_label.pack(pady=(5, 10))
        
        # Bind Enter key
        self.root.bind('<Return>', lambda e: self.do_login())
    
    def toggle_password_visibility(self):
        """Mostra/oculta a senha"""
        if self.show_password_var.get():
            self.password_entry.config(show="*")
            self.eye_btn.config(text="👁")
            self.show_password_var.set(False)
        else:
            self.password_entry.config(show="")
            self.eye_btn.config(text="🙈")
            self.show_password_var.set(True)
    
    def salvar_config_api(self):
        """Salva a URL da API no arquivo de configuração"""
        api_url = self.api_url.get().strip().rstrip('/')
        if not api_url:
            self.status_label.config(text="Digite a URL da API!", bootstyle="danger")
            return
        
        # Validar delay mínimo
        delay_valor = self.delay_maximo.get()
        if delay_valor < 15:
            delay_valor = 15
            self.delay_maximo.set(15)
        
        config = load_config()
        config['api_url'] = api_url
        config['postar_em_grupos'] = self.postar_em_grupos.get()
        config['adicionar_contato'] = self.adicionar_contato.get()
        config['numero_contato'] = self.numero_contato.get()
        config['delay_maximo'] = delay_valor
        save_config(config)
        
        self.status_label.config(text="✓ Configurações salvas!", bootstyle="success")
    
    def do_login(self):
        api_url = self.api_url.get().strip().rstrip('/')
        username = self.username.get().strip()
        password = self.password.get()
        
        if not api_url:
            self.status_label.config(text="Configure a URL da API primeiro!", bootstyle="danger")
            return
        
        if not username or not password:
            self.status_label.config(text="Preencha email e senha!", bootstyle="danger")
            return
        
        self.login_btn.config(state="disabled")
        self.status_label.config(text="Conectando...", bootstyle="info")
        self.root.update()
        
        thread = threading.Thread(target=self._login_thread, args=(api_url, username, password), daemon=True)
        thread.start()
    
    def _login_thread(self, api_url, username, password):
        try:
            response = requests.post(
                f"{api_url}/token",
                data={'username': username, 'password': password},
                timeout=10
            )
            
            print(f"DEBUG: Status code: {response.status_code}")
            print(f"DEBUG: Response: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('access_token')
                self.usuario_id = data.get('usuario_id')  # Armazena o ID do usuário logado
                
                config = {
                    'api_url': api_url,
                    'username': username if self.remember.get() else '',
                    'password': password if self.remember.get() else '',
                    'remember': self.remember.get()
                }
                save_config(config)
                
                self.root.after(0, self.show_main)
            else:
                error_msg = f"Erro {response.status_code}: "
                try:
                    error_data = response.json()
                    error_msg += error_data.get('detail', 'Email ou senha incorretos')
                except:
                    error_msg += response.text[:100] if response.text else 'Erro desconhecido'
                self.root.after(0, lambda msg=error_msg: self._login_error(msg))
                
        except requests.exceptions.ConnectionError:
            self.root.after(0, lambda: self._login_error("Não foi possível conectar à API"))
        except requests.exceptions.Timeout:
            self.root.after(0, lambda: self._login_error("Timeout ao conectar à API"))
        except Exception as e:
            self.root.after(0, lambda: self._login_error(str(e)))
    
    def _login_error(self, message):
        self.status_label.config(text=message, bootstyle="danger")
        self.login_btn.config(state="normal")
    
    # ==================== TELA PRINCIPAL ====================
    
    def show_main(self):
        """Mostra a tela principal após login"""
        self.clear_window()
        self.root.geometry("950x750")
        self.root.title("ERP AutoPost Facebook")
        self.root.resizable(True, True)
        
        # Unbind Enter key do login
        self.root.unbind('<Return>')
        
        # Variables para tela principal
        self.categoria_facebook = ttk.StringVar()
        
        # Main container
        main_frame = ttk.Frame(self.root, padding=15)
        main_frame.pack(fill=BOTH, expand=True)
        
        # Header with logo and title
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill=X, pady=(0, 10))
        
        try:
            icon_path = os.path.join(os.path.dirname(__file__), "icon.png")
            icon_image = Image.open(icon_path)
            icon_image = icon_image.resize((40, 40), Image.LANCZOS)
            self.logo_photo = ImageTk.PhotoImage(icon_image)
            logo_label = ttk.Label(header_frame, image=self.logo_photo)
            logo_label.pack(side=LEFT, padx=(0, 10))
        except Exception as e:
            print(f"Erro ao carregar logo: {e}")
        
        title_label = ttk.Label(
            header_frame, 
            text="AutoPost Facebook Marketplace",
            font=("Helvetica", 14, "bold"),
            bootstyle="primary"
        )
        title_label.pack(side=LEFT)
        
        # Filters Frame
        filters_frame = ttk.Labelframe(main_frame, text="Filtros", padding=10)
        filters_frame.pack(fill=X, pady=(0, 10))
        
        # Row 1: Categoria do Facebook
        fb_cat_frame = ttk.Frame(filters_frame)
        fb_cat_frame.pack(fill=X)
        
        ttk.Label(fb_cat_frame, text="Categoria Facebook:", width=20).pack(side=LEFT)
        categorias_fb = ["Videogames", "Eletrônicos e informática", "Telefones celulares"]
        self.fb_categoria_combobox = ttk.Combobox(
            fb_cat_frame,
            textvariable=self.categoria_facebook,
            values=categorias_fb,
            state="readonly",
            width=50
        )
        self.fb_categoria_combobox.pack(side=LEFT, padx=(10, 0))
        self.fb_categoria_combobox.current(0)
        
        # Products Frame
        products_frame = ttk.Labelframe(main_frame, text="Produtos Disponíveis (Ativos, Estoque > 0, Faturável)", padding=10)
        products_frame.pack(fill=BOTH, expand=True, pady=(0, 10))
        
        # Loading indicator frame
        self.loading_frame = ttk.Frame(products_frame)
        self.loading_label = ttk.Label(
            self.loading_frame, 
            text="⏳ Carregando produtos...", 
            font=("Helvetica", 12),
            bootstyle="warning"
        )
        self.loading_label.pack(pady=50)
        
        # Treeview for products
        columns = ('selecionar', 'nome', 'preco', 'estoque', 'comissao')
        self.tree = ttk.Treeview(products_frame, columns=columns, show='headings', height=12)
        
        self.tree.heading('selecionar', text='✓')
        self.tree.heading('nome', text='Nome do Produto')
        self.tree.heading('preco', text='Preço')
        self.tree.heading('estoque', text='Estoque')
        self.tree.heading('comissao', text='Comissão R$')
        
        self.tree.column('selecionar', width=40, anchor=CENTER)
        self.tree.column('nome', width=400, anchor=W)
        self.tree.column('preco', width=100, anchor=E)
        self.tree.column('estoque', width=80, anchor=CENTER)
        self.tree.column('comissao', width=100, anchor=CENTER)
        
        # Scrollbar
        scrollbar = ttk.Scrollbar(products_frame, orient=VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        
        self.tree.pack(side=LEFT, fill=BOTH, expand=True)
        scrollbar.pack(side=RIGHT, fill=Y)
        
        # Bind click event
        self.tree.bind('<ButtonRelease-1>', self.on_tree_click)
        
        # Selection info and buttons
        action_frame = ttk.Frame(main_frame)
        action_frame.pack(fill=X, pady=(0, 10))
        
        self.selection_label = ttk.Label(
            action_frame,
            text="0 produto(s) selecionado(s)",
            font=("Helvetica", 10),
            bootstyle="info"
        )
        self.selection_label.pack(side=LEFT)
        
        # Buttons
        btn_frame = ttk.Frame(action_frame)
        btn_frame.pack(side=RIGHT)
        
        ttk.Button(
            btn_frame,
            text="Selecionar Categorias",
            bootstyle="info",
            command=self.abrir_selecao_categorias
        ).pack(side=LEFT, padx=(0, 5))
        
        ttk.Button(
            btn_frame,
            text="Selecionar Todos",
            bootstyle="secondary",
            command=self.selecionar_todos
        ).pack(side=LEFT, padx=(0, 5))
        
        ttk.Button(
            btn_frame,
            text="Limpar Seleção",
            bootstyle="secondary",
            command=self.limpar_selecao
        ).pack(side=LEFT, padx=(0, 5))
        
        self.start_btn = ttk.Button(
            btn_frame,
            text="▶ Executar",
            bootstyle="success",
            width=15,
            command=self.start_process
        )
        self.start_btn.pack(side=LEFT)
        
        # Log Frame
        log_frame = ttk.Labelframe(main_frame, text="Log", padding=10)
        log_frame.pack(fill=BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=10,
            wrap="word",
            font=("Consolas", 9),
            bg="#2b2b2b",
            fg="#ffffff"
        )
        self.log_text.pack(fill=BOTH, expand=True)
        
        # Carregar categorias
        self.carregar_categorias()
    
    def get_headers(self):
        """Retorna headers com token de autenticação"""
        return {'Authorization': f'Bearer {self.token}'}
    
    def carregar_categorias(self):
        """Carrega categorias da API - apenas categorias com produtos (estoque > 0 e faturavel)"""
        try:
            api_url = self.api_url.get().strip().rstrip('/')
            
            # Primeiro buscar todos os produtos ativos com estoque > 0 e faturavel
            response_produtos = requests.get(
                f"{api_url}/api/produtos",
                headers=self.get_headers(),
                params={'ativo': True},
                timeout=10
            )
            
            if response_produtos.status_code != 200:
                self.log(f"Erro ao carregar produtos: {response_produtos.status_code}")
                return
            
            todos_produtos = response_produtos.json()
            produtos_validos = [
                p for p in todos_produtos 
                if p.get('estoque_atual', 0) > 0 and p.get('faturavel', False)
            ]
            
            # Obter IDs únicos das categorias que têm produtos válidos
            categorias_com_produtos = set(p.get('categoria_id') for p in produtos_validos if p.get('categoria_id'))
            
            # Buscar todas as categorias
            response = requests.get(
                f"{api_url}/api/categorias",
                headers=self.get_headers(),
                params={'ativo': True},
                timeout=10
            )
            
            if response.status_code == 200:
                todas_categorias = response.json()
                # Filtrar apenas categorias que têm produtos válidos
                self.categorias = [cat for cat in todas_categorias if cat['id'] in categorias_com_produtos]
                # Selecionar todas as categorias por padrão
                self.categorias_selecionadas = [cat['id'] for cat in self.categorias]
                self.log(f"Carregadas {len(self.categorias)} categorias com produtos disponíveis.")
                self.log(f"Todas as {len(self.categorias_selecionadas)} categorias foram selecionadas automaticamente.")
                # Carregar produtos de TODAS as categorias
                self.carregar_produtos_todas_categorias()
            else:
                self.log(f"Erro ao carregar categorias: {response.status_code}")
        except Exception as e:
            self.log(f"Erro ao carregar categorias: {e}")
    
    def carregar_produtos_todas_categorias(self):
        """Carrega produtos de TODAS as categorias selecionadas (em thread)"""
        # Mostrar loading
        self.tree.pack_forget()
        self.loading_frame.pack(fill=BOTH, expand=True)
        self.root.update_idletasks()
        
        def _carregar():
            try:
                api_url = self.api_url.get().strip().rstrip('/')
                self.produtos = []
                total_categorias = len(self.categorias_selecionadas)
                
                for i, categoria_id in enumerate(self.categorias_selecionadas):
                    # Atualizar texto do loading
                    self.root.after(0, lambda i=i: self.loading_label.config(
                        text=f"⏳ Carregando categoria {i+1} de {total_categorias}..."
                    ))
                    
                    response = requests.get(
                        f"{api_url}/api/produtos",
                        headers=self.get_headers(),
                        params={'ativo': True, 'categoria_id': categoria_id},
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        todos_produtos = response.json()
                        produtos_validos = [
                            p for p in todos_produtos 
                            if p.get('estoque_atual', 0) > 0 and p.get('faturavel', False)
                        ]
                        self.produtos.extend(produtos_validos)
                
                # Atualizar UI na thread principal
                self.root.after(0, self._finalizar_carregamento)
            except Exception as e:
                self.root.after(0, lambda: self._erro_carregamento(str(e)))
        
        thread = threading.Thread(target=_carregar, daemon=True)
        thread.start()
    
    def _finalizar_carregamento(self):
        """Finaliza o carregamento e mostra os produtos"""
        self.loading_frame.pack_forget()
        self.tree.pack(side=LEFT, fill=BOTH, expand=True)
        self.atualizar_lista_produtos()
        self.log(f"Carregados {len(self.produtos)} produtos de {len(self.categorias_selecionadas)} categoria(s).")
    
    def _erro_carregamento(self, erro):
        """Trata erro no carregamento"""
        self.loading_frame.pack_forget()
        self.tree.pack(side=LEFT, fill=BOTH, expand=True)
        self.log(f"Erro ao carregar produtos: {erro}")
    
    def atualizar_lista_produtos(self):
        """Atualiza a lista de produtos na treeview"""
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        for produto in self.produtos:
            produto_id = produto['id']
            selecionado = '✓' if produto_id in self.produtos_selecionados else ''
            
            # Usar preço personalizado se existir
            preco_original = produto.get('preco_venda', 0)
            preco_atual = self.precos_personalizados.get(produto_id, preco_original)
            
            # Mostrar indicador se preço foi alterado
            if produto_id in self.precos_personalizados:
                preco = f"R$ {preco_atual:.2f} ✎"
            else:
                preco = f"R$ {preco_atual:.2f}"
            
            comissao = f"R$ {produto.get('comissao', 0):.2f}"
            
            self.tree.insert('', 'end', iid=produto_id, values=(
                selecionado,
                produto.get('nome', ''),
                preco,
                produto.get('estoque_atual', 0),
                comissao
            ))
        
        self.atualizar_contador_selecao()
    
    def on_tree_click(self, event):
        """Quando clica em um item da treeview"""
        region = self.tree.identify_region(event.x, event.y)
        if region != 'cell':
            return
        
        item = self.tree.identify_row(event.y)
        if not item:
            return
        
        produto_id = int(item)
        
        # Verificar qual coluna foi clicada
        column = self.tree.identify_column(event.x)
        
        # Coluna #3 é a coluna de preço (0-indexed: #1=selecionar, #2=nome, #3=preco)
        if column == '#3':
            self.editar_preco(produto_id)
            return
        
        # Toggle seleção para outras colunas
        if produto_id in self.produtos_selecionados:
            del self.produtos_selecionados[produto_id]
        else:
            produto = next((p for p in self.produtos if p['id'] == produto_id), None)
            if produto:
                self.produtos_selecionados[produto_id] = produto
        
        self.atualizar_lista_produtos()
    
    def editar_preco(self, produto_id):
        """Abre diálogo para editar o preço do produto"""
        produto = next((p for p in self.produtos if p['id'] == produto_id), None)
        if not produto:
            return
        
        preco_original = produto.get('preco_venda', 0)
        preco_atual = self.precos_personalizados.get(produto_id, preco_original)
        
        # Verificar se o produto é do usuário logado (permite preço abaixo do mínimo)
        produto_usuario_id = produto.get('usuario_id')
        eh_meu_produto = produto_usuario_id is not None and self.usuario_id is not None and produto_usuario_id == self.usuario_id
        
        # Criar janela de diálogo
        dialog = tk.Toplevel(self.root)
        dialog.title("Editar Preço")
        dialog.geometry("350x220")
        dialog.resizable(False, False)
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Centralizar
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (175)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (110)
        dialog.geometry(f"+{x}+{y}")
        
        # Conteúdo
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=BOTH, expand=True)
        
        ttk.Label(frame, text=f"Produto: {produto.get('nome', '')}", font=("Helvetica", 10, "bold")).pack(anchor=W)
        ttk.Label(frame, text=f"Preço Original: R$ {preco_original:.2f}", bootstyle="secondary").pack(anchor=W, pady=(5, 0))
        
        if eh_meu_produto:
            ttk.Label(frame, text="(Seu produto - sem limite mínimo)", font=("Helvetica", 8), bootstyle="success").pack(anchor=W)
        else:
            ttk.Label(frame, text="(Mínimo permitido)", font=("Helvetica", 8), bootstyle="secondary").pack(anchor=W)
        
        ttk.Label(frame, text="Novo Preço (R$):", font=("Helvetica", 10)).pack(anchor=W, pady=(15, 5))
        
        preco_var = ttk.StringVar(value=f"{preco_atual:.2f}")
        preco_entry = ttk.Entry(frame, textvariable=preco_var, width=20, font=("Helvetica", 12))
        preco_entry.pack(anchor=W)
        preco_entry.select_range(0, tk.END)
        preco_entry.focus()
        
        erro_label = ttk.Label(frame, text="", bootstyle="danger", font=("Helvetica", 9))
        erro_label.pack(anchor=W, pady=(5, 0))
        
        def salvar():
            try:
                novo_preco = float(preco_var.get().replace(',', '.'))
                
                # Se NÃO é meu produto, validar preço mínimo
                if not eh_meu_produto and novo_preco < preco_original:
                    erro_label.config(text=f"Preço não pode ser menor que R$ {preco_original:.2f}")
                    return
                
                # Validar preço maior que zero
                if novo_preco <= 0:
                    erro_label.config(text="Preço deve ser maior que zero")
                    return
                
                self.precos_personalizados[produto_id] = novo_preco
                self.atualizar_lista_produtos()
                dialog.destroy()
            except ValueError:
                erro_label.config(text="Digite um valor numérico válido")
        
        def cancelar():
            dialog.destroy()
        
        # Botões
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=X, pady=(15, 0))
        
        ttk.Button(btn_frame, text="Cancelar", bootstyle="secondary", command=cancelar).pack(side=RIGHT, padx=(5, 0))
        ttk.Button(btn_frame, text="Salvar", bootstyle="success", command=salvar).pack(side=RIGHT)
        
        # Bind Enter para salvar
        dialog.bind('<Return>', lambda e: salvar())
        dialog.bind('<Escape>', lambda e: cancelar())
    
    def abrir_selecao_categorias(self):
        """Abre modal para selecionar/deselecionar categorias"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Selecionar Categorias")
        dialog.geometry("400x500")
        dialog.resizable(False, True)
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Centralizar
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - 200
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - 250
        dialog.geometry(f"+{x}+{y}")
        
        # Frame principal
        frame = ttk.Frame(dialog, padding=15)
        frame.pack(fill=BOTH, expand=True)
        
        ttk.Label(frame, text="Selecione as categorias que deseja exibir:", font=("Helvetica", 10, "bold")).pack(anchor=W, pady=(0, 10))
        
        # Frame com scroll para checkboxes
        list_frame = ttk.Frame(frame)
        list_frame.pack(fill=BOTH, expand=True)
        
        canvas = tk.Canvas(list_frame, highlightthickness=0)
        scrollbar = ttk.Scrollbar(list_frame, orient=VERTICAL, command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        scrollbar.pack(side=RIGHT, fill=Y)
        canvas.pack(side=LEFT, fill=BOTH, expand=True)
        
        # Dicionário para armazenar as variáveis dos checkboxes
        checkbox_vars = {}
        
        for cat in self.categorias:
            var = ttk.BooleanVar(value=cat['id'] in self.categorias_selecionadas)
            checkbox_vars[cat['id']] = var
            
            cb = ttk.Checkbutton(
                scrollable_frame,
                text=f"{cat['id']} - {cat['nome']}",
                variable=var,
                bootstyle="primary-round-toggle"
            )
            cb.pack(anchor=W, pady=2)
        
        # Botões de ação rápida
        quick_frame = ttk.Frame(frame)
        quick_frame.pack(fill=X, pady=(10, 0))
        
        def marcar_todos():
            for var in checkbox_vars.values():
                var.set(True)
        
        def desmarcar_todos():
            for var in checkbox_vars.values():
                var.set(False)
        
        ttk.Button(quick_frame, text="Marcar Todos", bootstyle="info", command=marcar_todos).pack(side=LEFT, padx=(0, 5))
        ttk.Button(quick_frame, text="Desmarcar Todos", bootstyle="warning", command=desmarcar_todos).pack(side=LEFT)
        
        # Botões de confirmação
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=X, pady=(15, 0))
        
        def aplicar():
            # Atualizar categorias selecionadas
            self.categorias_selecionadas = [cat_id for cat_id, var in checkbox_vars.items() if var.get()]
            
            if self.categorias_selecionadas:
                # Carregar produtos de TODAS as categorias selecionadas
                self.carregar_produtos_todas_categorias()
            else:
                # Limpar produtos se não houver categorias
                for item in self.tree.get_children():
                    self.tree.delete(item)
                self.produtos = []
            
            self.log(f"{len(self.categorias_selecionadas)} categoria(s) selecionada(s).")
            dialog.destroy()
        
        def cancelar():
            dialog.destroy()
        
        ttk.Button(btn_frame, text="Cancelar", bootstyle="secondary", command=cancelar).pack(side=RIGHT, padx=(5, 0))
        ttk.Button(btn_frame, text="Aplicar", bootstyle="success", command=aplicar).pack(side=RIGHT)
        
        # Bind Escape para fechar
        dialog.bind('<Escape>', lambda e: cancelar())
    
    def selecionar_todos(self):
        """Seleciona todos os produtos"""
        for produto in self.produtos:
            self.produtos_selecionados[produto['id']] = produto
        self.atualizar_lista_produtos()
    
    def limpar_selecao(self):
        """Limpa a seleção"""
        self.produtos_selecionados.clear()
        self.atualizar_lista_produtos()
    
    def atualizar_contador_selecao(self):
        """Atualiza o contador de produtos selecionados"""
        count = len(self.produtos_selecionados)
        self.selection_label.config(text=f"{count} produto(s) selecionado(s)")
    
    def log(self, message):
        """Adiciona mensagem ao log"""
        self.log_text.insert("end", f"{message}\n")
        self.log_text.see("end")
        self.root.update_idletasks()
    
    def start_process(self):
        """Inicia o processo de postagem"""
        if not self.produtos_selecionados:
            Messagebox.show_warning("Selecione pelo menos um produto.", "Aviso")
            return
        
        if not self.categoria_facebook.get():
            Messagebox.show_warning("Selecione a categoria do Facebook.", "Aviso")
            return
        
        self.start_btn.config(state="disabled")
        thread = threading.Thread(target=self.run_automation, daemon=True)
        thread.start()
    
    def run_automation(self):
        """Executa a automação"""
        try:
            self.log("Iniciando navegador...")
            self.scraper = Scraper('https://facebook.com')
            self.root.after(0, self.ask_login_confirmation)
        except Exception as e:
            self.log(f"Erro: {e}")
            self.root.after(0, lambda: self.start_btn.config(state="normal"))
    
    def ask_login_confirmation(self):
        """Pergunta se o login foi realizado"""
        result = Messagebox.yesno(
            "Foi realizado o login na página do Facebook?",
            "Confirmação de Login"
        )
        
        if result in ("Yes", "Sim", True) or str(result).lower() in ("yes", "sim", "true"):
            self.log("Login confirmado. Iniciando processo de postagem...")
            thread = threading.Thread(target=self.process_posts, daemon=True)
            thread.start()
        else:
            self.log("Processo cancelado. Faça login e tente novamente.")
            self.start_btn.config(state="normal")
            self.close_scraper()
    
    def process_posts(self):
        """Processa os posts dos produtos selecionados"""
        try:
            try:
                self.scraper.cookies_file_name = 'facebook.pkl'
                self.scraper.cookies_file_path = self.scraper.cookies_folder + self.scraper.cookies_file_name
                self.scraper.save_cookies()
                self.log("Cookies salvos com sucesso.")
            except Exception as e:
                self.log(f"Aviso: Não foi possível salvar cookies: {e}")
            
            produtos_lista = list(self.produtos_selecionados.values())
            total = len(produtos_lista)
            
            self.log(f"\nProcessando {total} produto(s)...")
            
            for index, produto in enumerate(produtos_lista):
                self.log(f"\n{'='*50}")
                self.log(f"Processando produto {index + 1}/{total}: {produto.get('nome', '')}")
                
                try:
                    item = self.preparar_item(produto)
                    
                    if not item:
                        self.log(f"Erro ao preparar produto. Pulando...")
                        continue
                    
                    self.publicar_item(item)
                    self.log(f"Item '{item['titulo']}' publicado com sucesso!")
                    
                    if index < total - 1:
                        self.delay_between_posts()
                    
                except Exception as e:
                    self.log(f"Erro ao processar produto: {e}")
            
            self.log("\n" + "="*50)
            self.log("=== Processo finalizado! ===")
            
        except Exception as e:
            self.log(f"Erro durante o processo: {e}")
        finally:
            cleanup_temp_images()
            self.log("Imagens temporárias removidas.")
            self.root.after(0, lambda: self.start_btn.config(state="normal"))
    
    def preparar_item(self, produto):
        """Prepara os dados do produto para publicação"""
        try:
            imagens_locais = self.baixar_imagens(produto)
            
            if not imagens_locais:
                self.log(f"Nenhuma imagem encontrada para o produto.")
                return None
            
            # Usar preço personalizado se existir
            produto_id = produto.get('id')
            preco_original = produto.get('preco_venda', 0)
            preco_final = self.precos_personalizados.get(produto_id, preco_original)
            
            preco_raw = str(preco_final)
            preco = preco_raw.replace(',', '.').split('.')[0]
            
            return {
                'titulo': produto.get('nome', ''),
                'preco': preco,
                'categoria': self.categoria_facebook.get(),
                'condicao': 'Novo',
                'descricao': produto.get('descricao', '') or '',
                'imagens': imagens_locais,
                'comissao': produto.get('comissao', 0)
            }
        except Exception as e:
            self.log(f"Erro ao preparar item: {e}")
            return None
    
    def baixar_imagens(self, produto):
        """Baixa as imagens do produto para pasta temporária"""
        imagens_locais = []
        caminho_imagem = produto.get('caminho_imagem', '')
        
        if not caminho_imagem:
            return imagens_locais
        
        caminhos = [c.strip() for c in caminho_imagem.split(',') if c.strip()]
        temp_path = get_temp_images_path()
        api_url = self.api_url.get().strip().rstrip('/')
        
        for caminho in caminhos:
            try:
                if caminho.startswith('http'):
                    url = caminho
                else:
                    url = f"{api_url}/{caminho}"
                
                self.log(f"Baixando imagem: {url}")
                response = requests.get(url, timeout=30)
                
                if response.status_code == 200:
                    ext = os.path.splitext(caminho)[1] or '.jpg'
                    filename = f"{uuid.uuid4()}{ext}"
                    filepath = os.path.join(temp_path, filename)
                    
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    
                    imagens_locais.append(filepath)
                    self.log(f"Imagem salva: {filename}")
                else:
                    self.log(f"Erro ao baixar imagem: {response.status_code}")
                    
            except Exception as e:
                self.log(f"Erro ao baixar imagem: {e}")
        
        return imagens_locais
    
    def delay_between_posts(self):
        """Adiciona delay entre posts"""
        delay_maximo = self.delay_maximo.get()
        if delay_maximo < 15:
            delay_maximo = 15
        delay_seconds = random.randint(0, delay_maximo)
        self.log(f"\nAguardando {delay_seconds} segundos antes do próximo post...")
        
        for remaining in range(delay_seconds, 0, -5):
            self.log(f"Timer: {remaining} segundos restantes...")
            time.sleep(5)
        
        # Aguardar segundos restantes que não são múltiplos de 5
        resto = delay_seconds % 5
        if resto > 0 and delay_seconds >= 5:
            time.sleep(resto)
        elif delay_seconds < 5 and delay_seconds > 0:
            time.sleep(delay_seconds)
        
        self.log("Delay concluído! Continuando...")
    
    def publicar_item(self, item):
        """Publica um item no Facebook Marketplace"""
        from selenium.webdriver.common.by import By
        
        self.scraper.go_to_page('https://www.facebook.com/marketplace/create/item')
        time.sleep(10)
        
        imagens_path = '\n'.join(item['imagens'])
        self.scraper.input_file_add_files('input[accept="image/*,image/heif,image/heic"]', imagens_path)
        time.sleep(3)
        
        inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
        
        if len(inputs) > 0:
            inputs[0].click()
            inputs[0].send_keys(item['titulo'])
            self.log(f"Titulo preenchido: {item['titulo']}")
        time.sleep(1)
        
        if len(inputs) > 1:
            inputs[1].click()
            inputs[1].send_keys(item['preco'])
            self.log(f"Preco preenchido: {item['preco']}")
        time.sleep(1)
        
        try:
            categoria_label = self.scraper.driver.find_element(By.XPATH, '//span[text()="Categoria"]')
            categoria_dropdown = categoria_label.find_element(By.XPATH, './ancestor::div[contains(@class, "x")][@role="combobox" or @tabindex]')
            categoria_dropdown.click()
            time.sleep(2)
            self.scraper.element_click_by_xpath('//span[text()="' + item['categoria'] + '"]')
            self.log(f"Categoria selecionada: {item['categoria']}")
        except Exception as e:
            self.log(f"Erro ao selecionar categoria: {e}")
            try:
                self.scraper.driver.find_element(By.XPATH, '//span[text()="Categoria"]/..').click()
                time.sleep(2)
                self.scraper.element_click_by_xpath('//span[text()="' + item['categoria'] + '"]')
                self.log(f"Categoria selecionada (metodo 2): {item['categoria']}")
            except:
                pass
        time.sleep(1)
        
        try:
            condicao_label = self.scraper.driver.find_element(By.XPATH, '//span[text()="Condição"]')
            condicao_dropdown = condicao_label.find_element(By.XPATH, './ancestor::div[contains(@class, "x")][@role="combobox" or @tabindex]')
            condicao_dropdown.click()
            time.sleep(2)
            opcoes = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
            if len(opcoes) > 1:
                opcoes[1].click()
                self.log(f"Condicao selecionada: segundo item da lista")
        except Exception as e:
            self.log(f"Erro ao selecionar condicao: {e}")
            try:
                self.scraper.driver.find_element(By.XPATH, '//span[text()="Condição"]/..').click()
                time.sleep(2)
                opcoes = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
                if len(opcoes) > 1:
                    opcoes[1].click()
                    self.log(f"Condicao selecionada (metodo 2): segundo item da lista")
            except:
                pass
        time.sleep(1)
        
        textareas = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'textarea')
        if len(textareas) > 0 and item['descricao']:
            textareas[0].click()
            time.sleep(0.5)
            import pyperclip
            from selenium.webdriver.common.keys import Keys
            
            # Monta a descrição com contato se configurado
            descricao_final = item['descricao']
            if self.adicionar_contato.get() and self.numero_contato.get():
                descricao_final = f"Meu contato: {self.numero_contato.get()}\n{item['descricao']}"
            
            pyperclip.copy(descricao_final)
            textareas[0].send_keys(Keys.CONTROL, 'v')
            self.log(f"Descricao preenchida: {descricao_final[:50]}...")
        time.sleep(1)
        
        try:
            inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
            if len(inputs) > 2:
                inputs[2].click()
                time.sleep(0.5)
        except:
            pass
        
        self.log("Campos preenchidos!")
        
        time.sleep(2)
        try:
            avancar_btn = self.scraper.driver.find_element(By.XPATH, '//span[text()="Avançar"]')
            avancar_btn.click()
            self.log("Botao Avancar clicado!")
        except Exception as e:
            self.log(f"Erro ao clicar em Avancar: {e}")
        
        time.sleep(3)
        
        if self.postar_em_grupos.get():
            try:
                checkboxes = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[role="checkbox"]')
                count = 0
                for checkbox in checkboxes:
                    if count >= 20:
                        break
                    try:
                        if checkbox.get_attribute('aria-checked') == 'false':
                            checkbox.click()
                            count += 1
                            time.sleep(0.5)
                    except:
                        pass
                self.log(f"Checkboxes selecionados: {count}")
            except Exception as e:
                self.log(f"Erro ao selecionar checkboxes: {e}")
        else:
            self.log("Postagem em grupos desativada - pulando seleção de grupos.")
        
        time.sleep(2)
        
        try:
            publicar_btn = self.scraper.driver.find_element(By.XPATH, '//span[text()="Publicar"]')
            publicar_btn.click()
            self.log("Botao Publicar clicado! Anuncio publicado!")
        except Exception as e:
            self.log(f"Erro ao clicar em Publicar: {e}")
        
        time.sleep(5)
    
    def close_scraper(self):
        """Fecha o scraper"""
        if self.scraper:
            try:
                self.scraper.driver.quit()
            except:
                pass
            self.scraper = None
    
    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = App()
    app.run()
