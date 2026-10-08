import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from tkinter import scrolledtext
import tkinter as tk
import threading
import datetime
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

from helpers.scraper_olx import ScraperOLX as Scraper
import time


def get_base_path():
    """Retorna o caminho base do executável ou script"""
    if getattr(sys, 'frozen', False):
        # Executando como .exe (PyInstaller)
        return os.path.dirname(sys.executable)
    else:
        # Executando como script Python
        return os.path.dirname(os.path.abspath(__file__))


def get_olx_log_dir():
    """Pasta `log` ao lado do .exe ou do script; criada na primeira utilização."""
    path = os.path.join(get_base_path(), 'log')
    os.makedirs(path, exist_ok=True)
    return path


def is_chrome_installed():
    """Verifica se o Google Chrome está instalado no sistema"""
    # Verificar nos caminhos comuns do Chrome
    chrome_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    
    for path in chrome_paths:
        if path and os.path.exists(path):
            return True
    
    # Verificar no registro do Windows
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe")
        winreg.CloseKey(key)
        return True
    except WindowsError:
        pass
    
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe")
        winreg.CloseKey(key)
        return True
    except WindowsError:
        pass
    
    return False


def get_chrome_setup_path():
    """Retorna o caminho do ChromeSetup.exe"""
    base_path = get_base_path()
    chrome_setup = os.path.join(base_path, 'ChromeSetup.exe')
    
    if os.path.exists(chrome_setup):
        return chrome_setup
    
    return None


def install_chrome(callback_success=None, callback_error=None):
    """Instala o Chrome usando o ChromeSetup.exe"""
    chrome_setup = get_chrome_setup_path()
    
    if not chrome_setup:
        if callback_error:
            callback_error("ChromeSetup.exe não encontrado!")
        return False
    
    try:
        # Executar o instalador do Chrome
        process = subprocess.Popen([chrome_setup], shell=True)
        process.wait()
        
        # Verificar se foi instalado com sucesso
        if is_chrome_installed():
            if callback_success:
                callback_success()
            return True
        else:
            if callback_error:
                callback_error("Instalação do Chrome não foi concluída. Por favor, tente novamente.")
            return False
    except Exception as e:
        if callback_error:
            callback_error(f"Erro ao instalar Chrome: {str(e)}")
        return False


def get_appdata_path():
    """Retorna o caminho do AppData para salvar configurações"""
    appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
    app_folder = os.path.join(appdata, 'ERPAutoPostOLX')
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
    return {'api_url': '', 'username': '', 'password': '', 'remember': False, 'postar_em_grupos': True, 'adicionar_contato': False, 'numero_contato': '', 'delay_maximo': 30, 'chrome_version': 144}


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


class SkipItemException(Exception):
    """Exceção para pular um item após todas as tentativas falharem"""
    pass


class App:
    """Aplicação principal com login e tela de produtos em uma única janela"""
    
    def __init__(self):
        self.root = ttk.Window(themename="superhero")
        self.root.title("ERP AutoPost OLX")
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
        self.chrome_version = ttk.IntVar(value=self.config.get('chrome_version', 144))
        
        # Token e dados
        self.token = None
        self.usuario_id = None  # ID do usuário logado
        self.categorias = []
        self.categorias_selecionadas = []  # IDs das categorias selecionadas
        self.produtos = []
        self.produtos_selecionados = {}
        self.precos_personalizados = {}  # {produto_id: novo_preco}
        self.scraper = None
        get_olx_log_dir()

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
            text="AutoPost OLX",
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
        
        # Campo Versão do Chrome
        ttk.Label(self.config_frame, text="Versão do Chrome:").pack(anchor=W, pady=(5, 0))
        chrome_frame = ttk.Frame(self.config_frame)
        chrome_frame.pack(fill=X, pady=(0, 3))
        chrome_entry = ttk.Entry(chrome_frame, textvariable=self.chrome_version, width=8)
        chrome_entry.pack(side=LEFT)
        ttk.Label(
            chrome_frame, 
            text="  (ex: 144, 145...)",
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
        
        # Botão Excluir Anúncios
        self.delete_login_btn = ttk.Button(
            main_frame,
            text="🗑 Excluir Anúncios da OLX",
            bootstyle="danger",
            command=self.start_delete_from_login
        )
        self.delete_login_btn.pack(fill=X, pady=(5, 5))
        
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
        config['chrome_version'] = self.chrome_version.get()
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
        
        # Verificar se o Chrome está instalado
        if not is_chrome_installed():
            self.status_label.config(text="⚠️ Chrome não encontrado! Instalando...", bootstyle="warning")
            self.login_btn.config(state="disabled")
            self.root.update()
            
            # Perguntar se deseja instalar
            resposta = Messagebox.yesno(
                title="Chrome Necessário",
                message="O Google Chrome é necessário para o funcionamento do sistema.\n\nDeseja instalar o Chrome agora?",
                parent=self.root
            )
            
            if resposta == "Yes":
                self._instalar_chrome_e_login(api_url, username, password)
            else:
                self.status_label.config(text="❌ Chrome é necessário para continuar!", bootstyle="danger")
                self.login_btn.config(state="normal")
            return
        
        self.login_btn.config(state="disabled")
        self.status_label.config(text="Conectando...", bootstyle="info")
        self.root.update()
        
        thread = threading.Thread(target=self._login_thread, args=(api_url, username, password), daemon=True)
        thread.start()
    
    def _instalar_chrome_e_login(self, api_url, username, password):
        """Instala o Chrome e depois faz login"""
        self.status_label.config(text="⏳ Instalando Chrome... Aguarde...", bootstyle="info")
        self.root.update()
        
        def _instalar():
            chrome_setup = get_chrome_setup_path()
            
            if not chrome_setup:
                self.root.after(0, lambda: self._chrome_install_error("ChromeSetup.exe não encontrado!"))
                return
            
            try:
                # Executar o instalador do Chrome
                process = subprocess.Popen([chrome_setup], shell=True)
                process.wait()
                
                # Verificar se foi instalado com sucesso
                if is_chrome_installed():
                    self.root.after(0, lambda: self._chrome_install_success(api_url, username, password))
                else:
                    self.root.after(0, lambda: self._chrome_install_error("Instalação não concluída. Tente novamente."))
            except Exception as e:
                self.root.after(0, lambda: self._chrome_install_error(str(e)))
        
        thread = threading.Thread(target=_instalar, daemon=True)
        thread.start()
    
    def _chrome_install_success(self, api_url, username, password):
        """Callback quando Chrome é instalado com sucesso"""
        self.status_label.config(text="✓ Chrome instalado! Conectando...", bootstyle="success")
        self.root.update()
        
        # Continuar com o login
        thread = threading.Thread(target=self._login_thread, args=(api_url, username, password), daemon=True)
        thread.start()
    
    def _chrome_install_error(self, erro):
        """Callback quando há erro na instalação do Chrome"""
        self.status_label.config(text=f"❌ Erro: {erro}", bootstyle="danger")
        self.login_btn.config(state="normal")
    
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
                
                config = load_config()
                config['api_url'] = api_url
                config['username'] = username if self.remember.get() else ''
                config['password'] = password if self.remember.get() else ''
                config['remember'] = self.remember.get()
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
        self.root.title("ERP AutoPost OLX")
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
            text="AutoPost OLX",
            font=("Helvetica", 14, "bold"),
            bootstyle="primary"
        )
        title_label.pack(side=LEFT)
        
        # (Facebook category filter removed - not needed for OLX)
        
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
                if p.get('estoque_atual', 0) > 0 and p.get('faturavel', False) and p.get('post_olx', False)
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
                            if p.get('estoque_atual', 0) > 0 and p.get('faturavel', False) and p.get('post_olx', False)
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
        
        try:
            data_hoje = datetime.datetime.now().strftime("%Y-%m-%d")
            log_filename = f"{data_hoje}-log-olx.txt"
            log_path = os.path.join(get_olx_log_dir(), log_filename)
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] {message}\n")
        except Exception as e:
            print(f"Erro ao salvar log: {e}")

    def _normalize_olx_body_text(self):
        from selenium.webdriver.common.by import By
        raw = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
        return ' '.join(raw.split())

    def _olx_raw_visible_text_com_iframes(self):
        """Texto visível do documento + iframes (ex.: olx-pay.olx.com.br renderiza no frame)."""
        from selenium.webdriver.common.by import By

        parts = []
        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass

        def _grab_body():
            try:
                t = self.scraper.driver.find_element(By.TAG_NAME, "body").text
                if t and t.strip():
                    parts.append(t.strip())
            except Exception:
                pass

        _grab_body()
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            frames = []
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                _grab_body()
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return "\n".join(parts)

    def _normalize_olx_snapshot(self):
        """Snapshot para comparar mudança de tela (inclui texto dentro de iframes)."""
        try:
            raw = self._olx_raw_visible_text_com_iframes()
            return " ".join(raw.lower().split())
        except Exception:
            return ""

    def _olx_try_click_continuar_finalizar_em_iframes(self):
        """Clica Continuar / Finalizar no documento principal ou dentro de iframes."""
        from selenium.webdriver.common.by import By

        def _click_no_contexto():
            xpaths = (
                '//span[text()="Continuar"]/ancestor::button',
                '//button[contains(.,"Continuar")]',
                '//button[contains(.,"Finalizar anúncio")]',
                '//button[contains(.,"Finalizar anuncio")]',
                '//button[contains(.,"Finalizar")]',
            )
            for xp in xpaths:
                try:
                    for el in self.scraper.driver.find_elements(By.XPATH, xp):
                        try:
                            if el.is_displayed():
                                el.click()
                                return True
                        except Exception:
                            try:
                                self.scraper.driver.execute_script("arguments[0].click();", el)
                                return True
                            except Exception:
                                pass
                except Exception:
                    pass
            return False

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        if _click_no_contexto():
            return True
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            frames = []
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                if _click_no_contexto():
                    self.scraper.driver.switch_to.default_content()
                    return True
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return False

    def _retry_continuar_com_iframe(self):
        if self._perform_continuar_click():
            return
        self._olx_try_click_continuar_finalizar_em_iframes()

    def wait_for_olx_body_min_length(self, min_len=50, context="", max_wait=120):
        """Após navegação: verifica a cada 1s se o corpo da página tem conteúdo suficiente."""
        t0 = time.monotonic()
        stall = t0
        while time.monotonic() - t0 < max_wait:
            time.sleep(1)
            try:
                cur = self._normalize_olx_body_text()
            except Exception:
                continue
            if len(cur) >= min_len:
                return True
            if time.monotonic() - stall >= 10:
                self.log(f"Página ainda carregando ({context})...")
                stall = time.monotonic()
        self.log(f"AVISO: tempo máximo de carregamento ({context}).")
        return False

    def _olx_na_etapa_titulo(self):
        """Detecta a tela de título do anúncio (evita falso 'sem mudança' se o texto do body for parecido)."""
        from selenium.webdriver.common.by import By

        try:
            low = self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
        except Exception:
            low = ""
        if "título do anúncio" in low or "como vai ser o título" in low:
            return True
        for el in self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input#subject'):
            try:
                if el.is_displayed():
                    return True
            except Exception:
                continue
        return False

    def olx_wait_page_changed_from(self, baseline, context, retry_fn=None, max_stall_cycles=15, success_if=None):
        """A cada 1s compara o texto da página com baseline; se 10s sem mudança, chama retry_fn e atualiza baseline.
        baseline deve ser o texto ANTES da ação que dispara a transição. success_if, se definido, encerra a espera quando verdadeiro."""
        stall_start = time.monotonic()
        stall_cycles = 0
        while True:
            time.sleep(1)
            try:
                if success_if and success_if():
                    return
                cur = self._normalize_olx_snapshot()
            except Exception:
                continue
            if cur != baseline:
                return
            if time.monotonic() - stall_start < 10:
                continue
            stall_cycles += 1
            if stall_cycles > max_stall_cycles:
                self.log(f"AVISO: parei de esperar mudança de tela ({context}) após várias repetições.")
                return
            self.log(f"Página sem mudança por 10s ({context}). Relendo e repetindo ação...")
            if retry_fn:
                try:
                    retry_fn()
                except Exception as e:
                    self.log(f"Erro ao repetir ação ({context}): {e}")
            try:
                baseline = self._normalize_olx_snapshot()
            except Exception:
                pass
            stall_start = time.monotonic()

    def _olx_poll_find_first(self, find_fn, context, retry_fn=None, max_seconds=90, stall_seconds=10):
        """Procura elemento a cada 1s; a cada stall_seconds sem sucesso chama retry_fn."""
        t0 = time.monotonic()
        last_stall = t0
        while time.monotonic() - t0 < max_seconds:
            time.sleep(1)
            try:
                el = find_fn()
                if el is not None:
                    return el
            except Exception:
                pass
            if retry_fn and time.monotonic() - last_stall >= stall_seconds:
                self.log(f"Ainda aguardando elemento ({context}), tentando ação auxiliar...")
                try:
                    retry_fn()
                except Exception as e:
                    self.log(f"Erro no retry ({context}): {e}")
                last_stall = time.monotonic()
        return None

    def _perform_continuar_click(self):
        """Executa um clique em Continuar (vários métodos). Não registra log de início."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        try:
            btns = self.scraper.driver.find_elements(
                By.XPATH, '//span[text()="Continuar"]/ancestor::button'
            )
            if btns:
                btns[0].click()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Continuar")]')
            if btns:
                ActionChains(self.scraper.driver).move_to_element(btns[0]).click().perform()
                return True
        except Exception:
            pass
        try:
            self.scraper.element_click_by_xpath('//button[contains(.,"Continuar")]')
            return True
        except Exception:
            pass
        return False

    def _perform_comecar_anuncio_click(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        try:
            btns = self.scraper.driver.find_elements(
                By.XPATH, '//span[contains(text(),"Começar meu anúncio")]/ancestor::button'
            )
            if btns:
                btns[0].click()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Começar meu anúncio")]')
            if btns:
                ActionChains(self.scraper.driver).move_to_element(btns[0]).click().perform()
                return True
        except Exception:
            pass
        try:
            btns = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Começar meu anúncio")]')
            if btns:
                self.scraper.driver.execute_script("arguments[0].click();", btns[0])
                return True
        except Exception:
            pass
        return False

    def _retry_click_produtos_categoria(self):
        from selenium.webdriver.common.by import By
        try:
            produtos_btn2 = self.scraper.driver.find_elements(By.CSS_SELECTOR, '[aria-label*="Produtos"]')
            if produtos_btn2:
                self.scraper.driver.execute_script("arguments[0].click();", produtos_btn2[0])
                return
        except Exception:
            pass
        try:
            self.scraper.element_click_by_xpath('//span[contains(text(),"Produtos")]/ancestor::button')
        except Exception:
            pass

    def _olx_body_text_lower(self):
        from selenium.webdriver.common.by import By

        try:
            return self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
        except Exception:
            return ""

    def _log_corpo_pagina_olx(self, motivo, max_total=20000, chunk_size=1800):
        """Grava no log o texto visível do body (em blocos), para depuração quando a tela não é reconhecida."""
        from selenium.webdriver.common.by import By

        try:
            url = self.scraper.driver.current_url
        except Exception:
            url = "(url indisponível)"
        try:
            raw = self._olx_raw_visible_text_com_iframes()
            if not raw.strip():
                raw = self.scraper.driver.find_element(By.TAG_NAME, "body").text
        except Exception as e:
            self.log(f"{motivo} — não foi possível ler o corpo da página: {e} | URL: {url}")
            return
        raw = raw.strip()
        if not raw:
            self.log(f"{motivo} — corpo da página vazio. URL: {url}")
            return
        total = len(raw)
        limite = min(total, max_total)
        if total > max_total:
            self.log(
                f"{motivo} — texto da página ({total} caracteres; "
                f"primeiros {max_total} no log). URL: {url}"
            )
        else:
            self.log(f"{motivo} — texto da página ({total} caracteres). URL: {url}")
        trecho = raw[:limite]
        parte = 1
        for i in range(0, len(trecho), chunk_size):
            bloco = trecho[i : i + chunk_size]
            self.log(f"  <<< página parte {parte} >>>\n{bloco}")
            parte += 1

    def _olx_esta_na_etapa_fotos(self, low=None):
        """Textos da tela de upload (inclui cópias novas da OLX)."""
        if low is None:
            low = self._olx_body_text_lower()
        return (
            "adicione algumas fotos" in low
            or "arraste as fotos" in low
            or "clique para adicionar fotos" in low
            or "adicione algumas fotos do seu anúncio" in low
            or ("perfeito" in low and "adicione" in low and "fotos" in low and "anúncio" in low)
            or "até 6 fotos nos formatos" in low
            or "ate 6 fotos nos formatos" in low
            or ("até 6 fotos" in low and "formatos" in low)
        )

    def _olx_precisa_reenviar_fotos(self, low=None):
        """OLX indica que nenhuma foto válida foi anexada — é preciso enviar de novo."""
        if low is None:
            low = self._olx_body_text_lower()
        return (
            "você precisa adicionar pelo menos uma foto de qualidade" in low
            or "voce precisa adicionar pelo menos uma foto de qualidade" in low
            or "pelo menos uma foto de qualidade para publicar" in low
        )

    def olx_reenviar_fotos_se_aviso_qualidade(self, upload_fn, max_tentativas=8):
        """Após upload, se a página mostrar o aviso de falta de foto de qualidade, chama upload_fn novamente."""
        for t in range(max_tentativas):
            time.sleep(1)
            low = self._olx_body_text_lower()
            if not self._olx_precisa_reenviar_fotos(low):
                return True
            self.log(
                "AVISO: OLX indica que as fotos não foram anexadas "
                "(falta foto de qualidade). Reenviando imagens…"
            )
            try:
                upload_fn()
            except Exception as e:
                self.log(f"Erro ao reanexar fotos ({t + 1}/{max_tentativas}): {e}")
        if self._olx_precisa_reenviar_fotos():
            self.log("AVISO: mensagem de falta de foto persiste após várias tentativas de reenvio.")
            return False
        return True

    def olx_wait_left_photo_step(self, context="processamento pós-fotos", retry_upload_fn=None, max_cycles=20):
        """A cada 1s verifica se saiu da tela de fotos; aviso de qualidade dispara reenvio na hora;
        a cada 10s ainda na etapa, repete retry_upload_fn."""
        stall_start = time.monotonic()
        cycles = 0
        while cycles < max_cycles:
            time.sleep(1)
            low = self._olx_body_text_lower()
            if self._olx_precisa_reenviar_fotos(low) and retry_upload_fn:
                self.log("Tela de fotos: aviso de qualidade — reenviando anexos agora.")
                try:
                    retry_upload_fn()
                except Exception as e:
                    self.log(f"Erro no retry de fotos: {e}")
                stall_start = time.monotonic()
                continue
            if not self._olx_esta_na_etapa_fotos(low):
                return True
            if time.monotonic() - stall_start < 10:
                continue
            cycles += 1
            self.log(f"Ainda na etapa de fotos por 10s ({context}). Repetindo ação...")
            if retry_upload_fn:
                try:
                    retry_upload_fn()
                except Exception as e:
                    self.log(f"Erro no retry de fotos: {e}")
            stall_start = time.monotonic()
        return False
    
    def start_process(self):
        """Inicia o processo de postagem"""
        if not self.produtos_selecionados:
            Messagebox.show_warning("Selecione pelo menos um produto.", "Aviso")
            return
        
        self.start_btn.config(state="disabled")
        thread = threading.Thread(target=self.run_automation, daemon=True)
        thread.start()
    
    def run_automation(self):
        """Executa a automação"""
        try:
            self.log("Iniciando navegador...")
            olx_login_url = "https://conta.olx.com.br/acesso?returnToToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJodHRwczovL2NvbnRhLm9seC5jb20uYnIvYW51bmNpb3MiLCJpYXQiOjE3Njg2OTI5MzQzODh9.eidbYw_tNrPWOKJEDyMfz2_PPY-xxlvD-kmxcwUgDzQ"
            self.scraper = Scraper(olx_login_url)
            self.root.after(0, self.ask_login_confirmation)
        except Exception as e:
            self.log(f"Erro: {e}")
            self.root.after(0, lambda: self.start_btn.config(state="normal"))
    
    def ask_login_confirmation(self):
        """Pergunta se o login foi realizado"""
        result = Messagebox.yesno(
            "Foi realizado o login na página da OLX?",
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
                self.scraper.cookies_file_name = 'olx.pkl'
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
                    
                except SkipItemException as e:
                    self.log(f"[ITEM PULADO] {e}")
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
                self.log(f"AVISO: Nenhuma imagem válida para o produto. PULANDO...")
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
        from PIL import Image
        
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
                    
                    # Verificar se a imagem é válida
                    try:
                        with Image.open(filepath) as img:
                            img.verify()  # Verifica integridade
                        # Reabrir para garantir que está ok
                        with Image.open(filepath) as img:
                            img.load()  # Carrega completamente
                        imagens_locais.append(filepath)
                        self.log(f"Imagem salva: {filename}")
                    except Exception as img_error:
                        self.log(f"AVISO: Imagem corrompida ou inválida: {filename} - {img_error}")
                        # Remover arquivo corrompido
                        try:
                            os.remove(filepath)
                        except:
                            pass
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
    
    def _tentar_com_retry(self, func, contexto, max_tentativas=3):
        """Tenta executar uma ação com retry, relendo o site a cada tentativa.
        Após todas as tentativas falharem, registra o conteúdo da página no log
        e levanta SkipItemException para pular o item atual."""
        from selenium.webdriver.common.by import By

        ultima_excecao = None
        for tentativa in range(1, max_tentativas + 1):
            try:
                if tentativa > 1:
                    self.log(f"[Retry {tentativa}/{max_tentativas}] Aguardando e retentando '{contexto}'...")
                    time.sleep(4)
                return func()
            except Exception as e:
                ultima_excecao = e
                self.log(f"[Tentativa {tentativa}/{max_tentativas}] Falhou em '{contexto}': {e}")
                if tentativa < max_tentativas:
                    time.sleep(2)

        self.log(f"[FALHA CRÍTICA] '{contexto}' falhou após {max_tentativas} tentativas.")
        try:
            page_content = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
            self.log(f"[CONTEÚDO DA PÁGINA]:\n{page_content[:1000]}")
        except Exception:
            self.log("[CONTEÚDO DA PÁGINA]: Não foi possível obter o conteúdo.")
        raise SkipItemException(f"'{contexto}' falhou após {max_tentativas} tentativas") from ultima_excecao

    def publicar_item(self, item):
        """Publica um item na OLX"""
        from selenium.webdriver.common.by import By

        # 1. Navegar para página de criação de anúncio
        self.log("Navegando para página de criação de anúncio...")
        self.scraper.go_to_page('https://www2.olx.com.br/desapega?lis=cta_header_home')
        self.wait_for_olx_body_min_length(50, "desapega / criar anúncio")

        # 1.1. Verificar tela de boas-vindas "Anuncie de graça"
        try:
            page_text_inicial = self.scraper.driver.find_element(By.TAG_NAME, 'body').text.lower()
            if "anuncie de gra" in page_text_inicial:
                self.log("Tela 'Anuncie de graça' detectada! Clicando em Continuar...")
                snap = self._normalize_olx_body_text()
                if self._perform_comecar_anuncio_click():
                    self.log("Botão 'Começar meu anúncio' clicado!")
                else:
                    self.log("Botão 'Começar meu anúncio' não encontrado na tela inicial.")
                self.olx_wait_page_changed_from(
                    snap, "após Começar meu anúncio", retry_fn=self._perform_comecar_anuncio_click
                )
        except Exception as e:
            self.log(f"Erro ao verificar tela inicial: {e}")

        # 2. Clicar em "Produtos"
        self.log("Aguardando página carregar...")
        self.wait_for_olx_body_min_length(40, "grade de categorias", max_wait=90)
        self.log("Selecionando categoria Produtos...")

        def _find_prod_btn():
            els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'button[aria-label*="Produtos"]')
            for el in els:
                try:
                    if el.is_displayed():
                        return el
                except Exception:
                    continue
            return None

        produtos_btn = self._olx_poll_find_first(
            _find_prod_btn, "botão Produtos", retry_fn=self._retry_click_produtos_categoria, max_seconds=90
        )
        # Snapshot ANTES do clique: se capturarmos depois, a SPA pode já estar na tela do título e a espera nunca vê "mudança".
        try:
            snap_antes_produtos = self._normalize_olx_body_text()
        except Exception:
            snap_antes_produtos = ""
        if produtos_btn:
            try:
                produtos_btn.click()
                self.log("Categoria Produtos selecionada!")
            except Exception:
                try:
                    self.scraper.driver.execute_script("arguments[0].click();", produtos_btn)
                    self.log("Categoria Produtos selecionada!")
                except Exception as e:
                    self.log(f"Erro ao clicar Produtos: {e}")
        else:
            self.log("Tentando método alternativo para selecionar categoria...")
            try:
                self.scraper.element_click_by_xpath('//span[contains(text(),"Produtos")]/ancestor::button')
                self.log("Categoria Produtos selecionada (método alternativo)!")
            except Exception as e2:
                self.log(f"Erro ao selecionar categoria: {e2}")
        try:
            if self._olx_na_etapa_titulo():
                self.log("Tela de título já detectada após Produtos.")
            else:
                self.olx_wait_page_changed_from(
                    snap_antes_produtos,
                    "após selecionar Produtos",
                    retry_fn=self._retry_click_produtos_categoria,
                    success_if=self._olx_na_etapa_titulo,
                )
        except Exception as e:
            self.log(f"Espera pós-Produtos: {e}")

        # 3. Preencher título (com retry de categoria se falhar)
        self.log(f"Preenchendo título: {item['titulo']}")
        titulo_preenchido = False

        def _find_subject():
            els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input#subject')
            for el in els:
                try:
                    if el.is_displayed():
                        return el
                except Exception:
                    continue
            return None

        for tentativa in range(3):
            try:
                titulo_input = _find_subject()
                if not titulo_input:
                    titulo_input = self._olx_poll_find_first(
                        _find_subject,
                        "campo título #subject",
                        retry_fn=self._retry_click_produtos_categoria,
                        max_seconds=45,
                    )
                if not titulo_input:
                    raise RuntimeError("input#subject não encontrado")
                titulo_input.clear()
                time.sleep(0.3)
                titulo_input.send_keys(item['titulo'])
                time.sleep(0.5)
                valor_atual = titulo_input.get_attribute('value')
                if valor_atual and len(valor_atual.strip()) > 0:
                    self.log(f"Título preenchido e verificado: {valor_atual}")
                    titulo_preenchido = True
                    break
                self.log("AVISO: Título não foi inserido corretamente (valor vazio), tentando novamente...")
                self.scraper.driver.execute_script("arguments[0].value = '';", titulo_input)
                self.scraper.driver.execute_script(
                    "arguments[0].value = arguments[1];", titulo_input, item['titulo']
                )
                self.scraper.driver.execute_script(
                    "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", titulo_input
                )
                time.sleep(0.5)
                valor_atual = titulo_input.get_attribute('value')
                if valor_atual and len(valor_atual.strip()) > 0:
                    self.log(f"Título preenchido via JS: {valor_atual}")
                    titulo_preenchido = True
                    break
                self.log("AVISO: Falha ao preencher via JS também...")
            except Exception as e:
                if tentativa < 2:
                    self.log(
                        f"Título não encontrado, tentando clicar em Produtos novamente... (tentativa {tentativa + 1})"
                    )
                    try:
                        produtos_elem = self.scraper.driver.find_elements(
                            By.XPATH,
                            '//*[contains(text(),"Produtos") and (self::button or self::a or self::div or self::span)]',
                        )
                        if produtos_elem:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", produtos_elem[0])
                            self.log("Categoria Produtos clicada (JS)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                        produtos_btn2 = self.scraper.driver.find_elements(
                            By.CSS_SELECTOR, '[aria-label*="Produtos"]'
                        )
                        if produtos_btn2:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", produtos_btn2[0])
                            self.log("Categoria Produtos clicada (aria-label + JS)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                        card = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Celulares")]/..')
                        if card:
                            snap_r = self._normalize_olx_body_text()
                            self.scraper.driver.execute_script("arguments[0].click();", card[0])
                            self.log("Categoria Produtos clicada (card)!")
                            self.olx_wait_page_changed_from(
                                snap_r,
                                "re-clique Produtos (título)",
                                retry_fn=self._retry_click_produtos_categoria,
                            )
                            continue
                    except Exception as click_error:
                        self.log(f"Erro no clique: {click_error}")
                else:
                    self.log(f"Erro ao preencher título: {e}")

        if not titulo_preenchido:
            try:
                inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
                if inputs:
                    inputs[0].clear()
                    time.sleep(0.3)
                    inputs[0].send_keys(item['titulo'])
                    time.sleep(0.5)
                    valor_atual = inputs[0].get_attribute('value')
                    if valor_atual and len(valor_atual.strip()) > 0:
                        self.log(f"Título preenchido (fallback) e verificado: {valor_atual}")
                        titulo_preenchido = True
                    else:
                        self.scraper.driver.execute_script(
                            "arguments[0].value = arguments[1];", inputs[0], item['titulo']
                        )
                        self.scraper.driver.execute_script(
                            "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", inputs[0]
                        )
                        self.log("Título preenchido via JS (fallback)!")
            except Exception as e:
                self.log(f"Erro no fallback de título: {e}")

        # 4. Clicar em Continuar (espera mudança de tela a cada 1s; a cada 10s repete clique)
        self.clicar_continuar("após título")

        # 5. Upload de imagens
        self.log("Fazendo upload das imagens...")
        imagens_path = '\n'.join(item['imagens'])

        def _upload_imagens():
            def _inp():
                els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
                return els[0] if els else None

            inp = self._olx_poll_find_first(_inp, "input upload imagens", max_seconds=90)
            if not inp:
                raise RuntimeError("input file não encontrado")
            inp.send_keys(imagens_path)
            self.log(f"Imagens enviadas: {len(item['imagens'])} arquivo(s)")

        try:
            snap_antes_upload = self._normalize_olx_body_text()
        except Exception:
            snap_antes_upload = ""
        self._tentar_com_retry(_upload_imagens, "upload de imagens")
        try:
            self.olx_wait_page_changed_from(
                snap_antes_upload, "após selecionar arquivos (upload)", retry_fn=_upload_imagens
            )
        except Exception as e:
            self.log(f"Espera pós-upload: {e}")

        self.olx_reenviar_fotos_se_aviso_qualidade(_upload_imagens)

        self.log("Aguardando resposta do site após envio das imagens...")
        # 6. Continuar após imagens + 7. sair da etapa de fotos / IA
        self.clicar_continuar("após imagens")
        self.log("Aguardando OLX processar dados com IA...")

        def _retry_fotos():
            try:
                file_inputs = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
                if file_inputs and item.get('imagens'):
                    file_inputs[0].send_keys(imagens_path)
                    self.log("Imagens reenviadas (retry)!")
            except Exception as ex:
                self.log(f"Retry fotos: {ex}")
            self._perform_continuar_click()

        if not self.olx_wait_left_photo_step("sair da etapa de fotos / IA", retry_upload_fn=_retry_fotos):
            self.log("AVISO: possível permanência na etapa de fotos; seguindo fluxo.")

        # 8. Preencher campos obrigatórios (listbox/select)
        self.log("Preenchendo campos obrigatórios...")
        self.preencher_campos_obrigatorios()

        # 9. Clicar em Continuar após listbox
        self.clicar_continuar("após campos")

        # 10. Preencher descrição
        self.log("Preenchendo descrição...")
        self.preencher_descricao(item.get('descricao', ''))

        # 11. Clicar em Continuar após descrição
        self.clicar_continuar("após descrição")

        # 12. Preencher preço
        self.log("Preenchendo preço: R$ " + str(item['preco']))
        self._current_preco = item['preco']
        self.preencher_preco(item['preco'])

        # 13. Clicar em Continuar após preço
        self.clicar_continuar("após preço")

        self.processar_telas_dinamicas()

        self.log("Anúncio publicado com sucesso!")
    
    def processar_telas_dinamicas(self):
        """Telas após o preço: ordem típica OLX (informativa → envio → endereço → peso → destaque → Finalizar anúncio).
        O fluxo só encerra de forma concluída ao publicar via botão Finalizar anúncio (texto na página)."""
        from selenium.webdriver.common.by import By

        max_tentativas = 25
        tentativas = 0
        price_retry_count = 0

        while tentativas < max_tentativas:
            tentativas += 1

            if self.fechar_modal_saida():
                continue

            try:
                current_url = self.scraper.driver.current_url.lower()
            except Exception:
                current_url = ""
            try:
                page_text = self._normalize_olx_snapshot()
            except Exception:
                page_text = ""
            if not page_text.strip() and (
                "olx-pay.olx.com.br" in current_url
                or "olx-pay" in current_url
                or ("aderir" in current_url and "olx" in current_url)
            ):
                self.log("Conteúdo vazio no body principal; aguardando iframe (OLX Pay)…")
                time.sleep(2)
                page_text = self._normalize_olx_snapshot()

            self.log(f"Processando tela {tentativas}...")

            # Modal OLX Pay: "Qual foi o motivo para não oferecer Frete grátis?" (antes do modal genérico)
            if (
                ("qual foi o motivo" in page_text and "frete" in page_text and "não oferecer" in page_text)
                or "não oferecer frete grátis" in page_text
                or ("motivo" in page_text and "não oferecer" in page_text and "frete grátis" in page_text)
            ):
                self.log("Modal OLX Pay: motivo para não oferecer frete grátis.")
                self._olx_modal_motivo_frete_gratis_caro()
                continue

            if "qual foi o motivo" in page_text or "não ter escolhido" in page_text:
                self.log("Modal de Motivo detectado!")
                self.tratar_modal_motivo()
                continue

            # 1) Escolha do endereço de envio (só Continuar — antes de qualquer regra genérica com "entrega")
            elif (
                ("escolha o endereço" in page_text and "envio" in page_text)
                or "endereço de envio" in page_text
                or ("usaremos o endereço" in page_text and "entrega" in page_text)
            ):
                self.log("Tela: escolha do endereço de envio.")
                self.clicar_continuar("após endereço de envio")
                continue

            # 2) Envie com segurança pela OLX
            elif "envie com segurança" in page_text:
                self.log("Tela: Envie com segurança pela OLX.")
                self.clicar_continuar("após envie com segurança")
                continue

            # 2b) OLX Pay — "Ofereça frete grátis ao comprador": Não obrigado → modal → "R$ 27,90 é caro" → Continuar
            elif (
                ("olx-pay" in current_url and "aderir" in current_url)
                or "olx-pay.olx.com.br" in current_url
            ) and (
                "ofereça frete grátis" in page_text
                or "frete grátis ao comprador" in page_text
                or ("frete grátis" in page_text and "comprador" in page_text)
                or "sim, quero oferecer" in page_text
            ):
                self.log("OLX Pay: oferta de frete grátis ao comprador.")
                self._olx_aceitar_cookies_se_existir()
                self.processar_tela_olx_pay_frete_gratis()
                time.sleep(1)
                self._olx_aceitar_cookies_se_existir()
                if not self._olx_try_click_continuar_finalizar_em_iframes():
                    self.clicar_continuar("após OLX Pay frete grátis")
                else:
                    time.sleep(1)
                continue

            # 3) Informativa pagamento / evolução ("Evoluímos o jeito de vender", etc.)
            elif (
                "evoluímos" in page_text
                or "protegemos a sua venda" in page_text
                or "recebe online" in page_text
                or "pagamento pela olx" in page_text
                or "milhões de compradores" in page_text
                or ("grátis pra você" in page_text and "sem taxas" in page_text)
                or ("é grátis" in page_text and "pra você" in page_text)
            ):
                self.log("Tela informativa (pagamento / evolução OLX).")
                self.clicar_continuar("tela informativa pagamento")
                continue

            # 3b) OLX Pay (URL aderir) — fallback (exceto tela de frete grátis já tratada em 2b)
            elif ("olx-pay.olx.com.br" in current_url or (
                "olx-pay" in current_url and "aderir" in current_url
            )) and not (
                "ofereça frete grátis" in page_text
                or "frete grátis ao comprador" in page_text
                or ("frete grátis" in page_text and "comprador" in page_text)
            ):
                self.log("Tela OLX Pay (aderir) — clicando Continuar no frame se necessário.")
                self._olx_aceitar_cookies_se_existir()
                if not self._olx_try_click_continuar_finalizar_em_iframes():
                    self.clicar_continuar("OLX Pay aderir")
                else:
                    time.sleep(1)
                continue

            # 4) Preço (retry)
            elif "hora de definir o preço" in page_text or "você precisa definir um preço" in page_text:
                price_retry_count += 1
                if price_retry_count > 3:
                    self.log("AVISO: Preço não aceito após 3 tentativas no loop, ignorando tela...")
                    price_retry_count = 0
                    break
                self.log(f"Tela de Preço detectada! Tentando preencher novamente ({price_retry_count}/3)...")
                preco = getattr(self, '_current_preco', None)
                if preco is not None:
                    self.preencher_preco(preco)
                    time.sleep(1)
                self.clicar_continuar("após preço retry")
                continue

            # 5) Peso (listbox → preferir 1 kg)
            elif "peso do produto" in page_text or "informe o peso" in page_text:
                self.log("Tela de Peso detectada!")
                preencheu = self.preencher_peso_se_existir()
                if preencheu:
                    self.clicar_continuar("após peso")
                else:
                    self.log("Peso não encontrado, tentando continuar...")
                    self.clicar_continuar("tela peso")
                continue

            # 6) Frete / parcelamento / “Não, obrigado” (sem confundir com endereço de envio)
            elif (
                "frete" in page_text
                or "parcelamento" in page_text
                or "não, obrigado" in page_text
                or ("ofereça" in page_text and "envio" in page_text)
            ) and "escolha o endereço" not in page_text and "endereço de envio" not in page_text:
                self.log("Tela de Frete / opções de envio detectada!")
                self.processar_tela_frete()
                self.clicar_continuar("após frete")
                continue

            # 7) Tela final: só trata como conclusão com texto "finalizar anúncio" (não usa "finalizar" solto)
            elif "finalizar anúncio" in page_text:
                self.log("Tela final: Finalizar anúncio.")
                self.selecionar_sem_destacar()
                time.sleep(1)
                self.finalizar_anuncio()
                return

            # 8) Destaque / planos (ex.: "Aumente as suas chances de vender mais rápido!")
            elif (
                "aumente" in page_text
                or "chances de vender" in page_text
                or "anunciar sem destacar" in page_text
            ):
                self.log("Tela de Destaque / planos detectada!")
                self.selecionar_sem_destacar()
                time.sleep(1)
                self.finalizar_anuncio()
                return

            # 9) CEP / localização (sem "endereço" genérico para não colidir com endereço de envio)
            elif "cep" in page_text or "localização" in page_text:
                self.log("Tela de Localização detectada - apenas continuar")
                self.clicar_continuar("após localização")
                continue

            # 10) Outras informativas
            elif (
                "dica" in page_text
                or "informação" in page_text
                or "garantia da olx" in page_text
            ):
                self.log("Tela informativa detectada - apenas continuar")
                self.clicar_continuar("tela informativa")
                continue

            # 11) Voltou para fotos
            elif (
                "adicione algumas fotos" in page_text
                or "clique para adicionar fotos" in page_text
                or "arraste as fotos" in page_text
            ):
                self.log("ERRO: Voltou para tela de fotos! Tentando continuar...")
                self.clicar_continuar("após fotos")
                continue

            else:
                self.log("Tela não identificada - tentando Continuar ou Finalizar anúncio...")
                self._log_corpo_pagina_olx("[DEBUG] Conteúdo encontrado na página (tela não reconhecida)")
                if not self.clicar_continuar_ou_finalizar():
                    try:
                        url_saida = self.scraper.driver.current_url
                    except Exception:
                        url_saida = "?"
                    self.log(
                        "Não encontrou botão Continuar nem Finalizar anúncio; saindo do loop. "
                        f"URL: {url_saida}"
                    )
                    break

        self.log(f"Loop finalizado após {tentativas} tentativas")

    def _olx_for_each_frame(self, fn):
        """Executa fn() no documento principal e em cada iframe; retorna True se fn retornar True."""
        from selenium.webdriver.common.by import By

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        try:
            if fn():
                return True
        except Exception:
            pass
        frames = []
        try:
            frames = self.scraper.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        except Exception:
            pass
        for fr in frames:
            try:
                self.scraper.driver.switch_to.default_content()
                self.scraper.driver.switch_to.frame(fr)
                if fn():
                    self.scraper.driver.switch_to.default_content()
                    return True
            except Exception:
                pass
            finally:
                try:
                    self.scraper.driver.switch_to.default_content()
                except Exception:
                    pass
        return False

    def _olx_aceitar_cookies_se_existir(self):
        """Fecha banner de privacidade/cookies se estiver cobrindo botões (ex.: Continuar)."""
        from selenium.webdriver.common.by import By

        try:
            self.scraper.driver.switch_to.default_content()
        except Exception:
            pass
        try:
            for el in self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Aceitar")] | //a[contains(.,"Aceitar")]'
            ):
                try:
                    if el.is_displayed():
                        self.scraper.driver.execute_script("arguments[0].click();", el)
                        self.log("Cookies/privacidade: Aceitar clicado.")
                        time.sleep(0.6)
                        return
                except Exception:
                    pass
        except Exception:
            pass

    def _olx_modal_motivo_frete_gratis_caro(self):
        """Modal 'motivo para não oferecer frete grátis': opção R$ 27,90 caro + Confirmar."""
        from selenium.webdriver.common.by import By

        def _clicar_opcao_caro():
            xpaths = (
                '//*[contains(text(),"27,90") and contains(text(),"caro")]',
                '//*[contains(text(),"R$ 27")]',
                '//*[contains(text(),"é caro para mim")]',
                '//*[contains(text(),"e caro para mim")]',
                '//label[contains(.,"27,90")]',
            )
            for xp in xpaths:
                for el in self.scraper.driver.find_elements(By.XPATH, xp):
                    try:
                        if not el.is_displayed():
                            continue
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.15)
                        el.click()
                        self.log("Motivo selecionado: preço do frete grátis é caro.")
                        return True
                    except Exception:
                        try:
                            self.scraper.driver.execute_script("arguments[0].click();", el)
                            self.log("Motivo selecionado (JS): preço do frete grátis é caro.")
                            return True
                        except Exception:
                            pass
            return False

        def _clicar_confirmar():
            for btn in self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Confirmar")]'
            ):
                try:
                    if btn.is_displayed():
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", btn
                        )
                        time.sleep(0.1)
                        btn.click()
                        self.log("Modal frete grátis: Confirmar clicado.")
                        return True
                except Exception:
                    try:
                        self.scraper.driver.execute_script("arguments[0].click();", btn)
                        self.log("Modal frete grátis: Confirmar clicado (JS).")
                        return True
                    except Exception:
                        pass
            return False

        self._olx_for_each_frame(_clicar_opcao_caro)
        time.sleep(0.4)
        self._olx_for_each_frame(_clicar_confirmar)
        time.sleep(0.8)

    def processar_tela_olx_pay_frete_gratis(self):
        """Tela OLX Pay 'Ofereça frete grátis': Não obrigado → modal motivo (caro) → confirmar."""
        from selenium.webdriver.common.by import By

        def _clicar_nao_obrigado():
            for xp in (
                '//*[contains(text(),"Não, obrigado")]',
                '//*[contains(text(),"Nao, obrigado")]',
                '//label[contains(.,"Não, obrigado")]',
                '//span[contains(text(),"Não, obrigado")]/ancestor::label',
            ):
                for el in self.scraper.driver.find_elements(By.XPATH, xp):
                    try:
                        if not el.is_displayed():
                            continue
                        self.scraper.driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.15)
                        el.click()
                        return True
                    except Exception:
                        try:
                            self.scraper.driver.execute_script("arguments[0].click();", el)
                            return True
                        except Exception:
                            pass
            return False

        if self._olx_for_each_frame(_clicar_nao_obrigado):
            self.log("'Não, obrigado' clicado (frete grátis OLX Pay).")
        else:
            self.log("AVISO: não encontrei 'Não, obrigado' na tela de frete grátis OLX Pay.")
        time.sleep(1.2)
        self._olx_modal_motivo_frete_gratis_caro()
    
    def processar_tela_frete(self):
        """Processa a tela de frete - seleciona entrega em mãos ou desmarca frete grátis"""
        from selenium.webdriver.common.by import By
        
        try:
            # Opção 1: Tentar selecionar "Não, obrigado" (tela de frete grátis e parcelamento)
            nao_obrigado = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não, obrigado")]')
            if nao_obrigado:
                nao_obrigado[0].click()
                self.log("'Não, obrigado' selecionado!")
                time.sleep(2)
                
                # Tratar modal "Qual foi o motivo..." - selecionar última opção
                try:
                    # Selecionar "Não tenho interesse"
                    nao_interesse = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não tenho interesse")]')
                    if nao_interesse:
                        nao_interesse[0].click()
                        self.log("'Não tenho interesse' selecionado!")
                        time.sleep(1)
                        
                        # Clicar em Confirmar
                        confirmar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Confirmar")]')
                        if confirmar:
                            confirmar[0].click()
                            self.log("Modal confirmado!")
                            time.sleep(2)
                    else:
                        self._olx_modal_motivo_frete_gratis_caro()
                except Exception:
                    self._olx_modal_motivo_frete_gratis_caro()
                return
            
            # Opção 2: Tentar selecionar "Entrega em mãos"
            entrega_maos = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Entrega em mãos")]')
            if entrega_maos:
                entrega_maos[0].click()
                self.log("Entrega em mãos selecionada!")
                return
            
            self.log("Tela de frete sem ação necessária")
        except:
            self.log("Erro ao processar tela de frete")
    
    def tratar_modal_motivo(self):
        """Trata o modal 'Qual foi o motivo para não ter escolhido...'"""
        from selenium.webdriver.common.by import By
        
        try:
            time.sleep(2)  # Aguardar modal carregar completamente
            
            # Buscar elemento com texto "Não tenho interesse" - mesmo método usado em outros lugares
            nao_interesse = self.scraper.driver.find_elements(By.XPATH, '//*[contains(text(),"Não tenho interesse")]')
            self.log(f"Encontrados {len(nao_interesse)} elementos 'Não tenho interesse'")
            
            if nao_interesse:
                # Clicar no primeiro elemento encontrado (como funciona nos outros modais)
                nao_interesse[0].click()
                self.log("'Não tenho interesse' selecionado!")
                time.sleep(1)
                
                # Clicar em Confirmar
                confirmar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Confirmar")]')
                if confirmar:
                    confirmar[0].click()
                    self.log("Modal confirmado!")
                    time.sleep(2)
        except Exception as e:
            self.log(f"Erro ao tratar modal: {e}")
    
    def clicar_continuar_ou_finalizar(self):
        """Tenta Continuar; se houver botão explícito Finalizar anúncio, clica nele (fim do fluxo)."""
        from selenium.webdriver.common.by import By

        try:
            final_anuncio = self.scraper.driver.find_elements(
                By.XPATH, '//button[contains(.,"Finalizar anúncio") or contains(.,"Finalizar anuncio")]'
            )
            if final_anuncio:
                try:
                    final_anuncio[0].click()
                    self.log("Finalizar anúncio clicado!")
                    return True
                except Exception:
                    self.scraper.driver.execute_script("arguments[0].click();", final_anuncio[0])
                    self.log("Finalizar anúncio clicado (JS)!")
                    return True

            finalizar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Finalizar")]')
            if finalizar:
                finalizar[0].click()
                self.log("Finalizar clicado!")
                return True

            continuar = self.scraper.driver.find_elements(By.XPATH, '//button[contains(.,"Continuar")]')
            if continuar:
                continuar[0].click()
                self.log("Continuar clicado!")
                return True

            if self._olx_try_click_continuar_finalizar_em_iframes():
                self.log("Continuar/Finalizar clicado (iframe ou contexto alternativo)!")
                return True

            return False
        except Exception:
            return False
    
    def fechar_modal_saida(self):
        """Fecha o modal de confirmação de saída se aparecer"""
        from selenium.webdriver.common.by import By
        
        try:
            # Verificar se há modal de saída
            modal_text = ["Tem certeza que deseja sair", "deseja sair", "quero sair"]
            page_text = self.scraper.driver.find_element(By.TAG_NAME, 'body').text
            
            for text in modal_text:
                if text.lower() in page_text.lower():
                    self.log("Modal de saída detectado! Clicando em 'Não, vou continuar'...")
                    
                    # Tentar clicar em "Não, vou continuar"
                    try:
                        nao_btn = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Não, vou continuar")]')
                        nao_btn.click()
                        self.log("Modal fechado!")
                        time.sleep(2)
                        return True
                    except:
                        # Tentar botão com texto similar
                        try:
                            nao_btn = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Não")]')
                            nao_btn.click()
                            self.log("Modal fechado (alternativo)!")
                            time.sleep(2)
                            return True
                        except:
                            pass
                    break
            return False
        except:
            return False
    
    def clicar_continuar(self, contexto=""):
        self.log("Clicando em Continuar " + contexto + "...")
        url_antes = self.scraper.driver.current_url
        try:
            snap = self._normalize_olx_snapshot()
        except Exception:
            snap = ""
        ok = self._perform_continuar_click()
        if not ok:
            ok = self._olx_try_click_continuar_finalizar_em_iframes()
        if ok:
            self.log("Continuar clicado!")
        else:
            self.log("Botão Continuar não encontrado ou clique não confirmado; aguardando mudança mesmo assim...")
        self.olx_wait_page_changed_from(
            snap, f"Continuar {contexto}", retry_fn=self._retry_continuar_com_iframe
        )
        url_depois = self.scraper.driver.current_url
        if "desapega" in url_depois and url_antes != url_depois:
            self.log("AVISO: Navegou de volta para página inicial!")
    
    def preencher_descricao(self, descricao):
        from selenium.webdriver.common.by import By

        try:
            def _ta():
                els = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'textarea')
                for el in els:
                    try:
                        if el.is_displayed():
                            return el
                    except Exception:
                        continue
                return None

            textarea = self._olx_poll_find_first(_ta, "textarea descrição", max_seconds=60)
            if not textarea:
                textareas = self.scraper.driver.find_elements(By.CSS_SELECTOR, 'textarea')
            else:
                textareas = [textarea]
            
            if textareas:
                textarea = textareas[0]
                textarea.click()
                time.sleep(0.5)
                textarea.clear()
                
                # Sanitizar a descrição
                texto = descricao if descricao else "Produto em excelente estado."
                
                # Remover emojis e caracteres unicode especiais
                import re
                # Remove emojis e símbolos unicode
                texto = re.sub(r'[\U0001F600-\U0001F64F]', '', texto)  # Emoticons
                texto = re.sub(r'[\U0001F300-\U0001F5FF]', '', texto)  # Símbolos e pictogramas
                texto = re.sub(r'[\U0001F680-\U0001F6FF]', '', texto)  # Transporte e mapa
                texto = re.sub(r'[\U0001F1E0-\U0001F1FF]', '', texto)  # Bandeiras
                texto = re.sub(r'[\U00002702-\U000027B0]', '', texto)  # Dingbats
                texto = re.sub(r'[\U0001F900-\U0001F9FF]', '', texto)  # Suplemento
                texto = re.sub(r'[\U0001FA00-\U0001FA6F]', '', texto)  # Xadrez
                texto = re.sub(r'[\U0001FA70-\U0001FAFF]', '', texto)  # Símbolos extras
                texto = re.sub(r'[\U00002600-\U000026FF]', '', texto)  # Misc símbolos
                
                # Remover tabs
                texto = texto.replace('\t', ' ')
                # Remover quebras de linha - substituir por espaço
                texto = texto.replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ')
                # Remover espaços múltiplos
                texto = re.sub(r' +', ' ', texto)
                # Remover caracteres especiais problemáticos - manter apenas ASCII básico
                texto = re.sub(r'[^\x20-\x7EáéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]', '', texto)
                texto = texto.strip()
                
                # Limitar tamanho se muito grande
                if len(texto) > 2000:
                    texto = texto[:2000]
                
                # Usar send_keys com texto limpo
                textarea.send_keys(texto)
                
                self.log(f"Descrição preenchida: {texto[:50]}...")
            else:
                self.log("Textarea não encontrado!")
        except Exception as e:
            self.log(f"Erro descrição: {e}")
    
    def preencher_preco(self, preco):
        from selenium.webdriver.common.by import By

        try:
            def _find_preco_inp():
                els = self.scraper.driver.find_elements(
                    By.CSS_SELECTOR,
                    'input[type="text"], input[type="number"], input[inputmode="numeric"]',
                )
                for el in els:
                    try:
                        if el.is_displayed():
                            return el
                    except Exception:
                        continue
                return None

            inp = self._olx_poll_find_first(_find_preco_inp, "campo preço", max_seconds=60)
            if inp:
                inputs = [inp]
            else:
                inputs = []

            if inputs:
                inp = inputs[0]
                preenchido = False
                # Método 1: interação direta com TAB para disparar validação React
                try:
                    from selenium.webdriver.common.keys import Keys
                    inp.click()
                    time.sleep(0.5)
                    inp.send_keys(Keys.CONTROL + 'a')
                    inp.send_keys(str(preco))
                    time.sleep(0.3)
                    inp.send_keys(Keys.TAB)
                    self.log(f"Preço preenchido: {preco}")
                    preenchido = True
                except Exception:
                    pass
                # Método 2: JavaScript com React native setter
                if not preenchido:
                    try:
                        self.scraper.driver.execute_script("""
                            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                            nativeInputValueSetter.call(arguments[0], arguments[1]);
                            arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
                            arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                            arguments[0].dispatchEvent(new Event('blur', { bubbles: true }));
                        """, inp, str(preco))
                        self.log(f"Preço preenchido via JS: {preco}")
                        preenchido = True
                    except Exception as e2:
                        self.log(f"Erro preço JS: {e2}")
                if not preenchido:
                    self.log("Falha ao preencher preço em todos os métodos.")
            else:
                self.log("Input de preço não encontrado!")
        except Exception as e:
            self.log(f"Erro preço: {e}")
    
    def desmarcar_frete_gratis(self):
        from selenium.webdriver.common.by import By
        try:
            entrega = self.scraper.driver.find_element(By.XPATH, '//*[contains(text(),"Entrega em mãos")]')
            entrega.click()
            self.log("Entrega em mãos selecionada!")
        except:
            pass
    
    def preencher_peso_se_existir(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import Select
        
        try:
            # Buscar QUALQUER select na página de peso
            selects = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            self.log(f"Peso: encontrados {len(selects)} selects")
            
            for select_elem in selects:
                try:
                    select = Select(select_elem)
                    current_value = select.first_selected_option.text.lower()
                    
                    # Se está com placeholder, preencher
                    if 'selecione' in current_value or current_value == '':
                        opcoes = select.options
                        self.log(f"Opções de peso: {[o.text for o in opcoes[:5]]}...")
                        
                        # Preferir 1 kg conforme fluxo OLX
                        peso_encontrado = False
                        for peso in ['1 kg', '1kg', 'até 1 kg', 'ate 1 kg', '2 kg', '2kg', 'até 2', '500']:
                            for opt in opcoes:
                                if peso.lower() in opt.text.lower() and 'selecione' not in opt.text.lower():
                                    select.select_by_visible_text(opt.text)
                                    self.log(f"Peso selecionado: {opt.text}")
                                    peso_encontrado = True
                                    break
                            if peso_encontrado:
                                break
                        
                        # Se não encontrou, selecionar segunda opção
                        if not peso_encontrado and len(opcoes) > 1:
                            select.select_by_index(1)
                            self.log(f"Peso por índice: {opcoes[1].text}")
                        
                        time.sleep(0.5)
                        return True  # Peso preenchido com sucesso
                        
                except Exception as e:
                    self.log(f"Erro select peso: {e}")
                    continue
            
            return False  # Nenhum select encontrado ou preenchido
            
        except Exception as e:
            self.log(f"Erro geral peso: {e}")
            return False
    
    def selecionar_sem_destacar(self):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        
        try:
            # Tentar múltiplos seletores
            selectors = [
                '//*[contains(text(),"Anunciar sem destacar")]',
                '//*[contains(text(),"sem destacar")]',
                '//*[contains(text(),"R$ 0,00")]',
                '//div[contains(.,"Grátis")]',
                '//input[@type="radio"][1]'  # Primeiro radio button
            ]
            
            for selector in selectors:
                try:
                    elementos = self.scraper.driver.find_elements(By.XPATH, selector)
                    if elementos:
                        # Usar ActionChains para clicar
                        actions = ActionChains(self.scraper.driver)
                        actions.move_to_element(elementos[0]).click().perform()
                        self.log(f"'Sem destacar' selecionado via: {selector[:30]}...")
                        time.sleep(1)
                        return
                except:
                    continue
            
            self.log("Opção 'sem destacar' não encontrada!")
        except Exception as e:
            self.log(f"Erro ao selecionar sem destacar: {e}")
    
    def finalizar_anuncio(self):
        from selenium.webdriver.common.by import By

        def _btn_finalizar():
            for xpath in (
                '//button[contains(.,"Finalizar anúncio")]',
                '//button[contains(.,"Finalizar anuncio")]',
                '//button[contains(.,"Finalizar")]',
            ):
                for el in self.scraper.driver.find_elements(By.XPATH, xpath):
                    try:
                        if el.is_displayed() and el.is_enabled():
                            return el
                    except Exception:
                        continue
            return None

        try:
            btn = self._olx_poll_find_first(_btn_finalizar, "botão Finalizar", max_seconds=90)
            if btn:
                btn.click()
                self.log("Finalizado!")
            else:
                self.log("Erro finalizar: botão não encontrado")
        except Exception as e:
            self.log("Erro finalizar: " + str(e))
    
    def preencher_campos_obrigatorios(self):
        """Preenche campos obrigatórios que estão vazios"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import Select

        def _primeiro_select():
            els = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            return els[0] if els else None

        self._olx_poll_find_first(_primeiro_select, "selects obrigatórios", max_seconds=45)

        try:
            # Método 1: Buscar por elementos SELECT nativos
            selects = self.scraper.driver.find_elements(By.TAG_NAME, 'select')
            self.log(f"Encontrados {len(selects)} selects nativos")
            
            for select_elem in selects:
                try:
                    # Verificar se precisa preencher (valor vazio ou "Selecione")
                    select = Select(select_elem)
                    current_value = select.first_selected_option.text
                    
                    if current_value.lower() in ['selecione', 'select', '']:
                        # Tentar encontrar opções com "Usado"
                        opcoes_texto = [opt.text for opt in select.options]
                        self.log(f"Opções disponíveis: {opcoes_texto[:5]}...")
                        
                        # Prioridade: Usado > Usado - Excelente > Usado - Bom > Outros
                        opcoes_prioridade = ['Usado', 'Usado - Excelente', 'Usado - Bom', 'Outros']
                        
                        selecionado = False
                        for opcao in opcoes_prioridade:
                            for opt in select.options:
                                if opcao.lower() in opt.text.lower():
                                    select.select_by_visible_text(opt.text)
                                    self.log(f"Selecionado: {opt.text}")
                                    selecionado = True
                                    break
                            if selecionado:
                                break
                        
                        if not selecionado:
                            # Para selects numéricos (ex: memória, GB), selecionar última opção
                            # Para outros, selecionar segunda opção (pular "Selecione")
                            if len(select.options) > 1:
                                ultimo_idx = len(select.options) - 1
                                select.select_by_index(ultimo_idx)
                                self.log(f"Selecionado por índice (último): {select.options[ultimo_idx].text}")
                        
                        time.sleep(0.5)
                        
                except Exception as e:
                    self.log(f"Erro em select: {e}")
                    continue
            
            # Método 2: Buscar por dropdowns customizados (divs clicáveis)
            self.preencher_dropdowns_customizados()
            
        except Exception as e:
            self.log(f"Erro geral: {e}")
    
    def preencher_dropdowns_customizados(self):
        """Preenche dropdowns customizados (não nativos)"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        
        try:
            # Buscar divs/spans com texto "Selecione"
            selecione_elements = self.scraper.driver.find_elements(By.XPATH, 
                '//div[text()="Selecione"] | //span[text()="Selecione"]')
            
            for elem in selecione_elements:
                try:
                    actions = ActionChains(self.scraper.driver)
                    actions.move_to_element(elem).click().perform()
                    time.sleep(1)
                    
                    # Tentar selecionar opções
                    for opcao in ['Usado', 'Usado - Excelente', 'Outros']:
                        opcao_elem = self.scraper.driver.find_elements(By.XPATH, f'//*[text()="{opcao}"]')
                        if opcao_elem:
                            opcao_elem[0].click()
                            self.log(f"Dropdown: {opcao}")
                            break
                    
                    time.sleep(0.5)
                except:
                    continue
        except:
            pass
    
    def preencher_dropdown_por_label(self, label_text, valor):
        """Preenche um dropdown encontrando-o pelo label próximo"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        
        try:
            # Encontrar o label
            labels = self.scraper.driver.find_elements(By.XPATH, f'//*[contains(text(),"{label_text}")]')
            
            for label in labels:
                try:
                    # Encontrar o container pai que contém o dropdown
                    parent = label.find_element(By.XPATH, './ancestor::div[1] | ./parent::div')
                    
                    # Buscar elementos clicáveis dentro do parent
                    clickables = parent.find_elements(By.CSS_SELECTOR, 'div, span, button')
                    
                    for clickable in clickables:
                        if "Selecione" in clickable.text:
                            # Clicar para abrir dropdown
                            actions = ActionChains(self.scraper.driver)
                            actions.move_to_element(clickable).click().perform()
                            time.sleep(1)
                            
                            # Selecionar valor
                            opcoes = self.scraper.driver.find_elements(By.XPATH, f'//*[text()="{valor}"]')
                            if opcoes:
                                opcoes[0].click()
                                self.log(f"{label_text}: {valor} selecionado!")
                                return
                            break
                except:
                    continue
        except:
            pass
    
    def start_delete_from_login(self):
        """Inicia o processo de exclusão de anúncios diretamente da tela de login"""
        self.delete_login_btn.config(state="disabled")
        self.login_btn.config(state="disabled")
        self.status_label.config(text="Iniciando navegador...", bootstyle="info")
        self.root.update()
        
        # Criar janela de log para a exclusão
        self.delete_window = tk.Toplevel(self.root)
        self.delete_window.title("Excluindo Anúncios OLX")
        self.delete_window.geometry("600x400")
        self.delete_window.transient(self.root)
        
        # Frame principal
        frame = ttk.Frame(self.delete_window, padding=15)
        frame.pack(fill="both", expand=True)
        
        ttk.Label(frame, text="Log de Exclusão", font=("Helvetica", 12, "bold")).pack(anchor="w")
        
        self.delete_log_text = scrolledtext.ScrolledText(
            frame,
            height=15,
            wrap="word",
            font=("Consolas", 9),
            bg="#2b2b2b",
            fg="#ffffff"
        )
        self.delete_log_text.pack(fill="both", expand=True, pady=(10, 0))
        
        thread = threading.Thread(target=self.run_delete_from_login, daemon=True)
        thread.start()
    
    def log_delete(self, message):
        """Adiciona mensagem ao log de exclusão"""
        if hasattr(self, 'delete_log_text') and self.delete_log_text.winfo_exists():
            self.delete_log_text.insert("end", f"{message}\n")
            self.delete_log_text.see("end")
        self.root.update_idletasks()
    
    def run_delete_from_login(self):
        """Executa a automação de exclusão a partir da tela de login"""
        try:
            self.log_delete("Iniciando navegador para exclusão de anúncios...")
            olx_login_url = "https://conta.olx.com.br/acesso?returnToToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJodHRwczovL2NvbnRhLm9seC5jb20uYnIvYW51bmNpb3MiLCJpYXQiOjE3Njg2OTI5MzQzODh9.eidbYw_tNrPWOKJEDyMfz2_PPY-xxlvD-kmxcwUgDzQ"
            self.scraper = Scraper(olx_login_url)
            self.root.after(0, self.ask_login_confirmation_delete_from_login)
        except Exception as e:
            self.log_delete(f"Erro: {e}")
            self.root.after(0, lambda: self.delete_login_btn.config(state="normal"))
            self.root.after(0, lambda: self.login_btn.config(state="normal"))
            self.root.after(0, lambda: self.status_label.config(text="Erro ao iniciar navegador", bootstyle="danger"))
    
    def ask_login_confirmation_delete_from_login(self):
        """Pergunta se o login foi realizado para exclusão (a partir da tela de login)"""
        result = Messagebox.yesno(
            "Foi realizado o login na página da OLX?\n\nClique em 'Sim' para iniciar a exclusão dos anúncios.",
            "Confirmação de Login"
        )
        
        if result in ("Yes", "Sim", True) or str(result).lower() in ("yes", "sim", "true"):
            self.log_delete("Login confirmado. Iniciando processo de exclusão...")
            self.status_label.config(text="Excluindo anúncios...", bootstyle="warning")
            thread = threading.Thread(target=self.process_delete_ads_from_login, daemon=True)
            thread.start()
        else:
            self.log_delete("Processo de exclusão cancelado.")
            self.delete_login_btn.config(state="normal")
            self.login_btn.config(state="normal")
            self.status_label.config(text="Processo cancelado", bootstyle="secondary")
            self.close_scraper()
    
    def process_delete_ads_from_login(self):
        """Processa a exclusão de anúncios da OLX"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        
        try:
            self.log_delete("Abrindo página de anúncios publicados...")
            self.scraper.go_to_page('https://conta.olx.com.br/anuncios/publicados')
            time.sleep(5)
            
            anuncios_excluidos = 0
            max_tentativas_sem_anuncio = 3
            tentativas_sem_anuncio = 0
            
            while tentativas_sem_anuncio < max_tentativas_sem_anuncio:
                self.log_delete(f"\n{'='*50}")
                self.log_delete(f"Buscando anúncios para excluir...")
                
                try:
                    # Buscar botões "Excluir" na página
                    excluir_buttons = self.scraper.driver.find_elements(
                        By.XPATH, 
                        '//button[contains(text(), "Excluir")] | //span[contains(text(), "Excluir")]/ancestor::button | //a[contains(text(), "Excluir")]'
                    )
                    
                    # Filtrar apenas botões visíveis
                    excluir_buttons_visiveis = []
                    for btn in excluir_buttons:
                        try:
                            if btn.is_displayed() and btn.is_enabled():
                                excluir_buttons_visiveis.append(btn)
                        except:
                            pass
                    
                    self.log_delete(f"Encontrados {len(excluir_buttons_visiveis)} botões de excluir")
                    
                    if not excluir_buttons_visiveis:
                        tentativas_sem_anuncio += 1
                        self.log_delete(f"Nenhum anúncio encontrado. Tentativa {tentativas_sem_anuncio}/{max_tentativas_sem_anuncio}")
                        time.sleep(2)
                        continue
                    
                    # Clicar no primeiro botão "Excluir"
                    self.log_delete("Clicando em 'Excluir'...")
                    try:
                        excluir_buttons_visiveis[0].click()
                    except:
                        self.scraper.driver.execute_script("arguments[0].click();", excluir_buttons_visiveis[0])
                    
                    self.log_delete("Aguardando 5 segundos para o modal abrir...")
                    time.sleep(5)
                    
                    # Selecionar "Vendi por outro meio"
                    self.log_delete("Selecionando 'Vendi por outro meio'...")
                    try:
                        vendi_outro_meio = WebDriverWait(self.scraper.driver, 10).until(
                            EC.element_to_be_clickable((By.XPATH, 
                                '//span[contains(text(), "Vendi por outro meio")] | //label[contains(text(), "Vendi por outro meio")] | //*[contains(text(), "Vendi por outro meio")]'))
                        )
                        vendi_outro_meio.click()
                        self.log_delete("Selecionou 'Vendi por outro meio'")
                    except Exception as e:
                        self.log_delete(f"Tentando método alternativo para selecionar opção: {e}")
                        try:
                            # Tentar clicar em qualquer radio/checkbox com esse texto
                            opcoes = self.scraper.driver.find_elements(By.XPATH, 
                                '//*[contains(text(), "Vendi por outro meio")]')
                            for opcao in opcoes:
                                try:
                                    opcao.click()
                                    self.log_delete("Selecionou via método alternativo")
                                    break
                                except:
                                    continue
                        except:
                            pass
                    
                    time.sleep(2)
                    
                    # Clicar no botão "Excluir" do modal
                    self.log_delete("Clicando no botão 'Excluir' do modal...")
                    try:
                        # Buscar botão Excluir dentro do modal (geralmente é vermelho/primary)
                        excluir_modal_btn = WebDriverWait(self.scraper.driver, 10).until(
                            EC.element_to_be_clickable((By.XPATH, 
                                '//div[@role="dialog"]//button[contains(text(), "Excluir")] | //div[contains(@class, "modal")]//button[contains(text(), "Excluir")] | //button[contains(@class, "primary") and contains(text(), "Excluir")]'))
                        )
                        excluir_modal_btn.click()
                        self.log_delete("Clicou no botão 'Excluir' do modal")
                    except Exception as e:
                        self.log_delete(f"Tentando método alternativo para clicar Excluir: {e}")
                        try:
                            # Buscar todos os botões com texto Excluir e clicar no último (geralmente é o do modal)
                            excluir_btns = self.scraper.driver.find_elements(By.XPATH, 
                                '//button[contains(text(), "Excluir")]')
                            if len(excluir_btns) > 1:
                                self.scraper.driver.execute_script("arguments[0].click();", excluir_btns[-1])
                                self.log_delete("Clicou via método alternativo")
                        except:
                            pass
                    
                    time.sleep(3)
                    
                    # Clicar em "Entendi" no modal de confirmação
                    self.log_delete("Procurando botão 'Entendi'...")
                    try:
                        entendi_btn = WebDriverWait(self.scraper.driver, 10).until(
                            EC.element_to_be_clickable((By.XPATH, 
                                '//button[contains(text(), "Entendi")] | //span[contains(text(), "Entendi")]/ancestor::button | //*[contains(text(), "Entendi")][@role="button"]'))
                        )
                        entendi_btn.click()
                        self.log_delete("Clicou em 'Entendi'")
                    except Exception as e:
                        self.log_delete(f"Botão 'Entendi' não encontrado: {e}")
                        try:
                            entendi_elements = self.scraper.driver.find_elements(By.XPATH, 
                                '//*[contains(text(), "Entendi")]')
                            for elem in entendi_elements:
                                try:
                                    elem.click()
                                    self.log_delete("Clicou em 'Entendi' via método alternativo")
                                    break
                                except:
                                    continue
                        except:
                            pass
                    
                    time.sleep(2)
                    
                    # Atualizar a página para evitar tentar excluir o mesmo produto
                    self.log_delete("Atualizando página...")
                    self.scraper.go_to_page('https://conta.olx.com.br/anuncios/publicados')
                    time.sleep(5)
                    
                    anuncios_excluidos += 1
                    self.log_delete(f"✓ Anúncio excluído com sucesso! Total: {anuncios_excluidos}")
                    tentativas_sem_anuncio = 0
                    
                except Exception as e:
                    self.log_delete(f"Erro ao processar anúncio: {e}")
                    tentativas_sem_anuncio += 1
                    # Atualizar página em caso de erro
                    try:
                        self.scraper.go_to_page('https://conta.olx.com.br/anuncios/publicados')
                        time.sleep(5)
                    except:
                        pass
            
            self.log_delete("\n" + "="*50)
            self.log_delete(f"=== Processo de exclusão finalizado! ===")
            self.log_delete(f"Total de anúncios excluídos: {anuncios_excluidos}")
            
            self.root.after(0, lambda: self.status_label.config(
                text=f"✓ {anuncios_excluidos} anúncios excluídos!", 
                bootstyle="success"
            ))
            
        except Exception as e:
            self.log_delete(f"Erro durante o processo de exclusão: {e}")
            self.root.after(0, lambda: self.status_label.config(text="Erro na exclusão", bootstyle="danger"))
        finally:
            self.root.after(0, lambda: self.delete_login_btn.config(state="normal"))
            self.root.after(0, lambda: self.login_btn.config(state="normal"))
    
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
