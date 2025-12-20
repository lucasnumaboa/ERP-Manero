/**
 * Animação de fundo para todas as páginas do ERP
 * Versão simplificada sem interação com mouse para não interferir na UI
 */

(function() {
    // Verificar se já existe um canvas ou se estamos na página de login
    if (document.querySelector('.login-page')) return;
    
    // Criar canvas se não existir
    let canvas = document.getElementById('bgCanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'bgCanvas';
        document.body.insertBefore(canvas, document.body.firstChild);
    }
    
    const ctx = canvas.getContext('2d');
    
    // Configurações
    const config = {
        particleCount: 50,
        particleSize: 2,
        lineDistance: 120,
        particleSpeed: 0.3,
        lineOpacity: 0.1,
    };
    
    let particles = [];
    let animationId;
    
    // Redimensionar canvas
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    // Criar partícula
    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * config.particleSpeed,
            vy: (Math.random() - 0.5) * config.particleSpeed,
            size: Math.random() * config.particleSize + 1
        };
    }
    
    // Inicializar partículas
    function initParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(createParticle());
        }
    }
    
    // Desenhar gradiente de fundo
    function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0a192f');
        gradient.addColorStop(0.5, '#112240');
        gradient.addColorStop(1, '#0a192f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Adicionar efeito de grid sutil
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.02)';
        ctx.lineWidth = 1;
        const gridSize = 50;
        
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }
    
    // Desenhar partículas e conexões
    function drawParticles() {
        // Desenhar conexões
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < config.lineDistance) {
                    const opacity = (1 - distance / config.lineDistance) * config.lineOpacity;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(100, 255, 218, ${opacity})`;
                    ctx.lineWidth = 1;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        
        // Desenhar partículas
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            
            // Gradiente na partícula
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            gradient.addColorStop(0, 'rgba(100, 255, 218, 0.6)');
            gradient.addColorStop(1, 'rgba(100, 255, 218, 0)');
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    }
    
    // Atualizar posições das partículas
    function updateParticles() {
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            
            // Bounce nas bordas
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
            
            // Manter dentro dos limites
            p.x = Math.max(0, Math.min(canvas.width, p.x));
            p.y = Math.max(0, Math.min(canvas.height, p.y));
        }
    }
    
    // Loop de animação
    function animate() {
        drawBackground();
        updateParticles();
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }
    
    // Event listeners
    window.addEventListener('resize', () => {
        resizeCanvas();
        initParticles();
    });
    
    // Inicialização
    resizeCanvas();
    initParticles();
    animate();
})();
