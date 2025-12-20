/**
 * Animação de fundo estilo Next.js para páginas internas do ERP
 * Versão mais sutil para não distrair do conteúdo
 */

(function() {
    // Não executar na página de login (já tem sua própria animação)
    if (document.body.classList.contains('login-page')) return;
    
    // Criar canvas se não existir
    let canvas = document.getElementById('bgCanvasInternal');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'bgCanvasInternal';
        document.body.insertBefore(canvas, document.body.firstChild);
    }
    
    const ctx = canvas.getContext('2d');
    
    // Configurações (mais sutis que a tela de login)
    const config = {
        particleCount: 40,
        particleSize: 1.5,
        lineDistance: 120,
        particleSpeed: 0.3,
        lineOpacity: 0.08,
        gridOpacity: 0.02
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
            size: Math.random() * config.particleSize + 0.5
        };
    }
    
    // Inicializar partículas
    function initParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(createParticle());
        }
    }
    
    // Desenhar grid sutil
    function drawGrid() {
        ctx.strokeStyle = `rgba(100, 255, 218, ${config.gridOpacity})`;
        ctx.lineWidth = 1;
        const gridSize = 60;
        
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
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        
        // Desenhar partículas
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(100, 255, 218, 0.4)';
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
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
    
    console.log('[Internal Animation] Animação de fundo iniciada');
})();
