/**
 * Animação de fundo estilo ERP/Next.js para a tela de login
 * Cria uma grade de pontos conectados com linhas que se movem suavemente
 */

(function() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Configurações
    const config = {
        particleCount: 80,
        particleSize: 2,
        lineDistance: 150,
        particleSpeed: 0.5,
        lineOpacity: 0.15,
        particleColor: 'rgba(255, 255, 255, 0.8)',
        lineColor: 'rgba(255, 255, 255, ',
        gradientColors: ['#1a1a2e', '#16213e', '#0f3460', '#1a1a2e']
    };
    
    let particles = [];
    let animationId;
    let mouseX = null;
    let mouseY = null;
    
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
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.03)';
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
            
            // Conexão com o mouse
            if (mouseX !== null && mouseY !== null) {
                const dx = particles[i].x - mouseX;
                const dy = particles[i].y - mouseY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < config.lineDistance * 1.5) {
                    const opacity = (1 - distance / (config.lineDistance * 1.5)) * 0.3;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(52, 152, 219, ${opacity})`;
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                }
            }
        }
        
        // Desenhar partículas
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            
            // Gradiente na partícula
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            gradient.addColorStop(0, 'rgba(100, 255, 218, 0.8)');
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
    
    // Desenhar elementos decorativos de ERP
    function drawERPElements() {
        const time = Date.now() * 0.001;
        
        // Círculos pulsantes nos cantos
        const corners = [
            { x: 100, y: 100 },
            { x: canvas.width - 100, y: 100 },
            { x: 100, y: canvas.height - 100 },
            { x: canvas.width - 100, y: canvas.height - 100 }
        ];
        
        corners.forEach((corner, index) => {
            const pulse = Math.sin(time + index) * 0.3 + 0.7;
            const size = 30 * pulse;
            
            ctx.beginPath();
            ctx.arc(corner.x, corner.y, size, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(52, 152, 219, ${0.1 * pulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(corner.x, corner.y, size * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 255, 218, ${0.15 * pulse})`;
            ctx.stroke();
        });
        
        // Linhas diagonais decorativas
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.02)';
        ctx.lineWidth = 1;
        
        for (let i = -canvas.height; i < canvas.width + canvas.height; i += 100) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + canvas.height, canvas.height);
            ctx.stroke();
        }
    }
    
    // Loop de animação
    function animate() {
        drawBackground();
        drawERPElements();
        updateParticles();
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }
    
    // Event listeners
    window.addEventListener('resize', () => {
        resizeCanvas();
        initParticles();
    });
    
    canvas.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    canvas.addEventListener('mouseleave', () => {
        mouseX = null;
        mouseY = null;
    });
    
    // Inicialização
    resizeCanvas();
    initParticles();
    animate();
    
    console.log('[Login Animation] Animação de fundo iniciada');
})();
