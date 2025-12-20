// Theme Switcher - Gerenciador de Temas Claro/Escuro

(function() {
    'use strict';

    const THEME_KEY = 'erp-maneiro-theme';
    const LIGHT_THEME = 'theme-light';
    const DARK_THEME = 'theme-dark';

    // Aplica o tema imediatamente para evitar flash (antes do DOM carregar)
    (function applyThemeImmediately() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === LIGHT_THEME) {
            document.body.classList.add(LIGHT_THEME);
        }
    })();

    // Inicializa o tema ao carregar a página
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        
        if (savedTheme === LIGHT_THEME) {
            document.body.classList.add(LIGHT_THEME);
            updateSwitchState(true);
        } else {
            document.body.classList.remove(LIGHT_THEME);
            updateSwitchState(false);
        }
    }

    // Atualiza o estado visual do switch
    function updateSwitchState(isLight) {
        const themeSwitch = document.getElementById('themeSwitch');
        if (themeSwitch) {
            themeSwitch.checked = isLight;
        }
    }

    // Alterna entre os temas
    function toggleTheme() {
        const isLight = document.body.classList.toggle(LIGHT_THEME);
        
        if (isLight) {
            localStorage.setItem(THEME_KEY, LIGHT_THEME);
        } else {
            localStorage.setItem(THEME_KEY, DARK_THEME);
        }

        updateSwitchState(isLight);

        // Dispara evento customizado para outros scripts que precisem saber da mudança
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: isLight ? LIGHT_THEME : DARK_THEME } 
        }));
    }

    // Configura os event listeners
    function setupEventListeners() {
        const themeSwitch = document.getElementById('themeSwitch');
        if (themeSwitch && !themeSwitch.hasAttribute('data-theme-listener')) {
            themeSwitch.setAttribute('data-theme-listener', 'true');
            themeSwitch.addEventListener('change', toggleTheme);
        }
    }

    // Observa mudanças no DOM para detectar quando o switch é adicionado dinamicamente
    function observeForSwitch() {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    const themeSwitch = document.getElementById('themeSwitch');
                    if (themeSwitch && !themeSwitch.hasAttribute('data-theme-listener')) {
                        setupEventListeners();
                        updateSwitchState(document.body.classList.contains(LIGHT_THEME));
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Para o observer após 5 segundos para não consumir recursos
        setTimeout(function() {
            observer.disconnect();
        }, 5000);
    }

    // Executa quando o DOM estiver pronto
    function init() {
        initTheme();
        setupEventListeners();
        observeForSwitch();
        
        // Tenta configurar novamente após um pequeno delay (para switches injetados)
        setTimeout(function() {
            setupEventListeners();
            updateSwitchState(document.body.classList.contains(LIGHT_THEME));
        }, 100);
        
        setTimeout(function() {
            setupEventListeners();
            updateSwitchState(document.body.classList.contains(LIGHT_THEME));
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exporta funções para uso global se necessário
    window.ThemeSwitcher = {
        toggle: toggleTheme,
        setLight: function() {
            document.body.classList.add(LIGHT_THEME);
            localStorage.setItem(THEME_KEY, LIGHT_THEME);
            updateSwitchState(true);
        },
        setDark: function() {
            document.body.classList.remove(LIGHT_THEME);
            localStorage.setItem(THEME_KEY, DARK_THEME);
            updateSwitchState(false);
        },
        getCurrentTheme: function() {
            return document.body.classList.contains(LIGHT_THEME) ? LIGHT_THEME : DARK_THEME;
        },
        init: init
    };
})();
