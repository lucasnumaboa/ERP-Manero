/**
 * Compressor de Imagens - Processa imagens no navegador antes do upload
 * Utiliza Canvas API para redimensionar e comprimir imagens
 */

const ImageCompressor = {
    // Configurações padrão
    defaultOptions: {
        maxWidth: 1920,           // Largura máxima
        maxHeight: 1080,          // Altura máxima
        quality: 0.8,             // Qualidade JPEG (0.0 a 1.0)
        mimeType: 'image/jpeg',   // Tipo de saída
        maxSizeMB: 1,             // Tamanho máximo em MB
        minQuality: 0.5,          // Qualidade mínima para compressão iterativa
        debug: false              // Mostrar logs de debug
    },

    /**
     * Comprime uma imagem File/Blob
     * @param {File|Blob} file - Arquivo de imagem para comprimir
     * @param {Object} options - Opções de compressão
     * @returns {Promise<Blob>} - Imagem comprimida como Blob
     */
    async compress(file, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        
        if (opts.debug) {
            console.log('ImageCompressor: Iniciando compressão', {
                originalSize: this.formatFileSize(file.size),
                originalType: file.type,
                options: opts
            });
        }

        // Verifica se é uma imagem válida
        if (!file.type.startsWith('image/')) {
            throw new Error('O arquivo não é uma imagem válida');
        }

        // Se já está pequeno o suficiente e não precisa redimensionar, retorna original
        const maxSizeBytes = opts.maxSizeMB * 1024 * 1024;
        if (file.size <= maxSizeBytes && !opts.forceResize) {
            if (opts.debug) {
                console.log('ImageCompressor: Imagem já está dentro do tamanho limite');
            }
            // Ainda converte para JPEG para padronizar
            return await this.convertToJpeg(file, opts);
        }

        // Carrega a imagem
        const img = await this.loadImage(file);
        
        // Calcula novas dimensões mantendo proporção
        const { width, height } = this.calculateDimensions(img, opts.maxWidth, opts.maxHeight);
        
        if (opts.debug) {
            console.log('ImageCompressor: Dimensões calculadas', {
                original: { width: img.width, height: img.height },
                novo: { width, height }
            });
        }

        // Comprime com qualidade ajustável até atingir tamanho desejado
        let compressedBlob = await this.compressWithCanvas(img, width, height, opts.quality, opts.mimeType);
        
        // Se ainda está muito grande, reduz qualidade iterativamente
        let currentQuality = opts.quality;
        while (compressedBlob.size > maxSizeBytes && currentQuality > opts.minQuality) {
            currentQuality -= 0.1;
            if (opts.debug) {
                console.log(`ImageCompressor: Reduzindo qualidade para ${currentQuality.toFixed(1)}`);
            }
            compressedBlob = await this.compressWithCanvas(img, width, height, currentQuality, opts.mimeType);
        }

        if (opts.debug) {
            const reduction = ((1 - compressedBlob.size / file.size) * 100).toFixed(1);
            console.log('ImageCompressor: Compressão concluída', {
                originalSize: this.formatFileSize(file.size),
                compressedSize: this.formatFileSize(compressedBlob.size),
                reduction: `${reduction}%`,
                finalQuality: currentQuality.toFixed(1)
            });
        }

        return compressedBlob;
    },

    /**
     * Comprime múltiplas imagens
     * @param {FileList|Array} files - Lista de arquivos
     * @param {Object} options - Opções de compressão
     * @returns {Promise<Blob[]>} - Array de imagens comprimidas
     */
    async compressMultiple(files, options = {}) {
        const results = [];
        for (let i = 0; i < files.length; i++) {
            const compressed = await this.compress(files[i], options);
            results.push(compressed);
        }
        return results;
    },

    /**
     * Converte imagem para JPEG sem redimensionar
     * @param {File|Blob} file - Arquivo de imagem
     * @param {Object} opts - Opções
     * @returns {Promise<Blob>} - Imagem convertida
     */
    async convertToJpeg(file, opts) {
        const img = await this.loadImage(file);
        return await this.compressWithCanvas(img, img.width, img.height, opts.quality, opts.mimeType);
    },

    /**
     * Carrega uma imagem a partir de um File/Blob
     * @param {File|Blob} file - Arquivo de imagem
     * @returns {Promise<HTMLImageElement>} - Elemento de imagem carregado
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Falha ao carregar a imagem'));
            };
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * Calcula novas dimensões mantendo proporção
     * @param {HTMLImageElement} img - Imagem
     * @param {number} maxWidth - Largura máxima
     * @param {number} maxHeight - Altura máxima
     * @returns {Object} - Novas dimensões { width, height }
     */
    calculateDimensions(img, maxWidth, maxHeight) {
        let { width, height } = img;

        // Se a imagem é menor que os limites, mantém tamanho original
        if (width <= maxWidth && height <= maxHeight) {
            return { width, height };
        }

        // Calcula a proporção
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        
        return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        };
    },

    /**
     * Comprime imagem usando Canvas
     * @param {HTMLImageElement} img - Imagem carregada
     * @param {number} width - Largura de saída
     * @param {number} height - Altura de saída
     * @param {number} quality - Qualidade (0.0 a 1.0)
     * @param {string} mimeType - Tipo MIME de saída
     * @returns {Promise<Blob>} - Imagem comprimida
     */
    compressWithCanvas(img, width, height, quality, mimeType) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            
            // Usa interpolação de alta qualidade
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Desenha a imagem no canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Converte para Blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Falha ao converter imagem'));
                    }
                },
                mimeType,
                quality
            );
        });
    },

    /**
     * Converte Blob para File
     * @param {Blob} blob - Blob de imagem
     * @param {string} fileName - Nome do arquivo
     * @returns {File} - Arquivo
     */
    blobToFile(blob, fileName) {
        // Garante extensão .jpg para JPEG
        if (blob.type === 'image/jpeg' && !fileName.toLowerCase().endsWith('.jpg') && !fileName.toLowerCase().endsWith('.jpeg')) {
            fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
        }
        return new File([blob], fileName, { type: blob.type });
    },

    /**
     * Formata tamanho de arquivo para exibição
     * @param {number} bytes - Tamanho em bytes
     * @returns {string} - Tamanho formatado
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Cria preview de imagem comprimida
     * @param {Blob} blob - Blob de imagem
     * @returns {string} - URL de preview (lembre de revogar depois)
     */
    createPreviewUrl(blob) {
        return URL.createObjectURL(blob);
    },

    /**
     * Revoga URL de preview
     * @param {string} url - URL de preview
     */
    revokePreviewUrl(url) {
        URL.revokeObjectURL(url);
    }
};

// Exporta para uso global
window.ImageCompressor = ImageCompressor;
