// Metas e Premiações - JavaScript
// Sistema de controle de metas de vendedores e premiações

// Variáveis globais
let vendedoresMetas = [];
let faixasPremiacao = [];
let premiacoesRealizadas = [];
let podeEditar = false; // Controla se o usuário pode editar metas

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Inicializando página de Metas...');
    
    // Verificar permissões
    await verificarPermissoes();
    
    // Configurar filtros de data
    configurarFiltrosData();
    
    // Configurar tabs
    configurarTabs();
    
    // Carregar dados iniciais
    await carregarDashboard();
    await carregarFaixas();
    await carregarPremiacoes();
    
    // Controlar visibilidade dos botões de edição
    await controlarBotoesEdicao();
    
    // Mostrar conteúdo
    document.getElementById('permission-loading').style.display = 'none';
    document.querySelector('.app-container').style.display = 'flex';
});

// Verificar permissões do usuário
async function verificarPermissoes() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        
        // Verificar se tem permissão de visualizar metas
        const temPermissaoVisualizar = user.nivel_acesso === 'admin' || 
                            await hasPermission('metas_visualizar');
        
        if (!temPermissaoVisualizar) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = 'homepage.html';
            return;
        }
        
        // Verificar se tem permissão de editar metas
        podeEditar = user.nivel_acesso === 'admin' || await hasPermission('metas_editar');
        console.log('Permissão de edição de metas:', podeEditar);
    } catch (error) {
        console.error('Erro ao verificar permissões:', error);
    }
}

// Controlar visibilidade dos botões de edição baseado na permissão
async function controlarBotoesEdicao() {
    console.log('Controlando botões de edição. podeEditar:', podeEditar);
    
    // Botões que só aparecem com permissão de edição
    const botoesEdicao = [
        '.btn-success',           // Botões de salvar
        '.btn-primary[onclick*="abrirModalFaixa"]',  // Botão Nova Faixa
        '#btnSalvarMetas',        // Botão Salvar Metas (se existir)
    ];
    
    // Botões na área de filtros
    const areaFiltros = document.querySelector('.filtros-metas');
    if (areaFiltros) {
        const botoesNaArea = areaFiltros.querySelectorAll('.btn-success, .btn-primary:not([onclick*="carregarDashboard"])');
        botoesNaArea.forEach(btn => {
            btn.style.display = podeEditar ? 'inline-flex' : 'none';
        });
    }
    
    // Botão Nova Faixa
    const btnNovaFaixa = document.querySelector('button[onclick="abrirModalFaixa()"]');
    if (btnNovaFaixa) {
        btnNovaFaixa.style.display = podeEditar ? 'inline-flex' : 'none';
    }
    
    // Se não pode editar, adiciona classe ao body para CSS
    if (!podeEditar) {
        document.body.classList.add('sem-permissao-editar');
    } else {
        document.body.classList.remove('sem-permissao-editar');
    }
}

// Configurar filtros de data (mês/ano)
function configurarFiltrosData() {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    
    // Selecionar mês atual
    document.getElementById('filtroMes').value = mesAtual;
    
    // Preencher anos (últimos 3 anos + próximo ano)
    const selectAno = document.getElementById('filtroAno');
    for (let ano = anoAtual - 2; ano <= anoAtual + 1; ano++) {
        const option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        if (ano === anoAtual) option.selected = true;
        selectAno.appendChild(option);
    }
}

// Configurar sistema de tabs
function configurarTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remover active de todos
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Adicionar active ao clicado
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Obter mês e ano selecionados
function getMesAnoSelecionado() {
    return {
        mes: parseInt(document.getElementById('filtroMes').value),
        ano: parseInt(document.getElementById('filtroAno').value)
    };
}

// ==================== DASHBOARD DE METAS ====================

async function carregarDashboard() {
    try {
        const { mes, ano } = getMesAnoSelecionado();
        console.log(`Carregando dashboard para ${mes}/${ano}...`);
        
        const dados = await apiGet(`/api/metas/dashboard?mes=${mes}&ano=${ano}`);
        vendedoresMetas = dados || [];
        
        renderizarVendedores();
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        document.getElementById('metasTableBody').innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    Erro ao carregar dados. Verifique se o backend está rodando.
                </td>
            </tr>
        `;
    }
}

function renderizarVendedores() {
    const tbody = document.getElementById('metasTableBody');
    
    if (!vendedoresMetas || vendedoresMetas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-users" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    Nenhum vendedor encontrado. Cadastre vendedores primeiro.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = vendedoresMetas.map(v => {
        const progressoValor = Math.min(v.percentual_valor, 100);
        const progressoQtd = Math.min(v.percentual_quantidade, 100);
        const corValor = progressoValor >= 100 ? 'green' : progressoValor >= 50 ? 'yellow' : 'red';
        const corQtd = progressoQtd >= 100 ? 'green' : progressoQtd >= 50 ? 'yellow' : 'red';
        const faixaClass = getFaixaClass(v.faixa_atingida);
        
        return `
            <tr data-vendedor-id="${v.vendedor_id}">
                <td><strong>${v.vendedor_nome}</strong></td>
                <td>${formatarMoeda(v.meta_valor)}</td>
                <td>${formatarMoeda(v.valor_vendido)}</td>
                <td class="progress-cell">
                    <span>${v.percentual_valor.toFixed(1)}%</span>
                    <div class="progress-bar-mini">
                        <div class="fill ${corValor}" style="width: ${progressoValor}%"></div>
                    </div>
                </td>
                <td>${v.meta_quantidade}</td>
                <td>${v.quantidade_vendida}</td>
                <td class="progress-cell">
                    <span>${v.percentual_quantidade.toFixed(1)}%</span>
                    <div class="progress-bar-mini">
                        <div class="fill ${corQtd}" style="width: ${progressoQtd}%"></div>
                    </div>
                </td>
                <td>
                    ${v.faixa_atingida ? `<span class="faixa-badge ${faixaClass}">${v.faixa_atingida}</span>` : '-'}
                </td>
                <td>
                    ${v.bonus_estimado > 0 ? `<span class="bonus-value">${formatarMoeda(v.bonus_estimado)}</span>` : '-'}
                </td>
                <td>
                    ${podeEditar ? `
                        <button class="btn btn-primary btn-sm" onclick="abrirModalMeta(${v.vendedor_id})" title="Definir Meta">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function getFaixaClass(faixa) {
    if (!faixa) return '';
    const faixaLower = faixa.toLowerCase();
    if (faixaLower.includes('bronze')) return 'faixa-bronze';
    if (faixaLower.includes('prata')) return 'faixa-prata';
    if (faixaLower.includes('ouro')) return 'faixa-ouro';
    if (faixaLower.includes('platina')) return 'faixa-platina';
    if (faixaLower.includes('diamante')) return 'faixa-diamante';
    if (faixaLower.includes('meta')) return 'faixa-meta';
    return '';
}

// ==================== MODAL DE META INDIVIDUAL ====================

function abrirModalMeta(vendedorId) {
    const vendedor = vendedoresMetas.find(v => v.vendedor_id === vendedorId);
    if (!vendedor) {
        alert('Vendedor não encontrado.');
        return;
    }
    
    const { mes, ano } = getMesAnoSelecionado();
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    document.getElementById('metaVendedorId').value = vendedorId;
    document.getElementById('metaVendedorNome').value = vendedor.vendedor_nome;
    document.getElementById('metaPeriodo').value = `${meses[mes]} / ${ano}`;
    document.getElementById('metaValor').value = vendedor.meta_valor || 0;
    document.getElementById('metaQuantidade').value = vendedor.meta_quantidade || 0;
    document.getElementById('metaInfoValorVendido').textContent = formatarMoeda(vendedor.valor_vendido);
    document.getElementById('metaInfoQtdVendida').textContent = vendedor.quantidade_vendida;
    
    document.getElementById('modalMeta').classList.add('active');
}

function fecharModalMeta() {
    document.getElementById('modalMeta').classList.remove('active');
}

async function salvarMeta(event) {
    event.preventDefault();
    
    try {
        const { mes, ano } = getMesAnoSelecionado();
        const vendedorId = parseInt(document.getElementById('metaVendedorId').value);
        const metaValor = parseFloat(document.getElementById('metaValor').value) || 0;
        const metaQuantidade = parseInt(document.getElementById('metaQuantidade').value) || 0;
        
        const metas = [{
            vendedor_id: vendedorId,
            meta_valor: metaValor,
            meta_quantidade: metaQuantidade
        }];
        
        const resultado = await apiPost(`/api/metas/lote?mes=${mes}&ano=${ano}`, metas);
        
        fecharModalMeta();
        await carregarDashboard();
        alert('Meta salva com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar meta:', error);
        alert('Erro ao salvar meta: ' + (error.message || 'Erro desconhecido'));
    }
}

// Salvar todas as metas (mantido para compatibilidade)
async function salvarTodasMetas() {
    try {
        const { mes, ano } = getMesAnoSelecionado();
        const metas = [];
        
        // Coletar dados de todos os vendedores
        vendedoresMetas.forEach(v => {
            metas.push({
                vendedor_id: v.vendedor_id,
                meta_valor: v.meta_valor || 0,
                meta_quantidade: v.meta_quantidade || 0
            });
        });
        
        if (metas.length === 0) {
            alert('Nenhum vendedor encontrado para salvar metas.');
            return;
        }
        
        console.log('Salvando metas:', metas);
        
        const resultado = await apiPost(`/api/metas/lote?mes=${mes}&ano=${ano}`, metas);
        
        alert(resultado.message || 'Metas salvas com sucesso!');
        await carregarDashboard();
    } catch (error) {
        console.error('Erro ao salvar metas:', error);
        alert('Erro ao salvar metas: ' + (error.message || 'Erro desconhecido'));
    }
}

// ==================== FAIXAS DE PREMIAÇÃO ====================

async function carregarFaixas() {
    try {
        const dados = await apiGet('/api/metas/faixas/');
        faixasPremiacao = dados || [];
        renderizarFaixas();
    } catch (error) {
        console.error('Erro ao carregar faixas:', error);
    }
}

function renderizarFaixas() {
    const tbody = document.getElementById('faixasTableBody');
    
    if (!faixasPremiacao || faixasPremiacao.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px; color: #666;">
                    Nenhuma faixa de premiação cadastrada.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = faixasPremiacao.map(f => {
        const tipoLabel = {
            'valor': 'Por Valor (R$)',
            'quantidade': 'Por Quantidade',
            'percentual': 'Por % da Meta'
        };
        
        return `
            <tr>
                <td>${f.ordem}</td>
                <td><strong>${f.nome}</strong></td>
                <td>${tipoLabel[f.tipo_meta] || f.tipo_meta}</td>
                <td>${f.tipo_meta === 'valor' ? formatarMoeda(f.valor_minimo) : f.valor_minimo}</td>
                <td>${f.valor_maximo ? (f.tipo_meta === 'valor' ? formatarMoeda(f.valor_maximo) : f.valor_maximo) : 'Sem limite'}</td>
                <td>${f.bonus_percentual}%</td>
                <td>${formatarMoeda(f.bonus_fixo)}</td>
                <td>
                    <span class="status-badge ${f.ativo ? 'status-pago' : 'status-cancelado'}">
                        ${f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td class="table-actions">
                    ${podeEditar ? `
                        <button class="action-edit" onclick="editarFaixa(${f.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-delete" onclick="deletarFaixa(${f.id})" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function abrirModalFaixa() {
    document.getElementById('modalFaixaTitulo').textContent = 'Nova Faixa de Premiação';
    document.getElementById('formFaixa').reset();
    document.getElementById('faixaId').value = '';
    document.getElementById('faixaAtivo').checked = true;
    document.getElementById('modalFaixa').classList.add('active');
}

function fecharModalFaixa() {
    document.getElementById('modalFaixa').classList.remove('active');
}

async function editarFaixa(id) {
    try {
        const faixa = await apiGet(`/api/metas/faixas/${id}`);
        
        document.getElementById('modalFaixaTitulo').textContent = 'Editar Faixa de Premiação';
        document.getElementById('faixaId').value = faixa.id;
        document.getElementById('faixaNome').value = faixa.nome;
        document.getElementById('faixaTipo').value = faixa.tipo_meta;
        document.getElementById('faixaOrdem').value = faixa.ordem;
        document.getElementById('faixaValorMin').value = faixa.valor_minimo;
        document.getElementById('faixaValorMax').value = faixa.valor_maximo || '';
        document.getElementById('faixaBonusPct').value = faixa.bonus_percentual;
        document.getElementById('faixaBonusFixo').value = faixa.bonus_fixo;
        document.getElementById('faixaDescricao').value = faixa.descricao || '';
        document.getElementById('faixaAtivo').checked = faixa.ativo;
        
        document.getElementById('modalFaixa').classList.add('active');
    } catch (error) {
        console.error('Erro ao carregar faixa:', error);
        alert('Erro ao carregar dados da faixa.');
    }
}

async function salvarFaixa(event) {
    event.preventDefault();
    
    try {
        const id = document.getElementById('faixaId').value;
        const dados = {
            nome: document.getElementById('faixaNome').value,
            tipo_meta: document.getElementById('faixaTipo').value,
            ordem: parseInt(document.getElementById('faixaOrdem').value) || 0,
            valor_minimo: parseFloat(document.getElementById('faixaValorMin').value),
            valor_maximo: document.getElementById('faixaValorMax').value ? parseFloat(document.getElementById('faixaValorMax').value) : null,
            bonus_percentual: parseFloat(document.getElementById('faixaBonusPct').value) || 0,
            bonus_fixo: parseFloat(document.getElementById('faixaBonusFixo').value) || 0,
            descricao: document.getElementById('faixaDescricao').value,
            ativo: document.getElementById('faixaAtivo').checked
        };
        
        if (id) {
            await apiPut(`/api/metas/faixas/${id}`, dados);
        } else {
            await apiPost('/api/metas/faixas/', dados);
        }
        
        fecharModalFaixa();
        await carregarFaixas();
        alert('Faixa salva com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar faixa:', error);
        alert('Erro ao salvar faixa: ' + (error.message || 'Erro desconhecido'));
    }
}

async function deletarFaixa(id) {
    if (!confirm('Tem certeza que deseja excluir esta faixa de premiação?')) return;
    
    try {
        await apiDelete(`/api/metas/faixas/${id}`);
        await carregarFaixas();
        alert('Faixa excluída com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir faixa:', error);
        alert('Erro ao excluir faixa: ' + (error.detail || error.message || 'Erro desconhecido'));
    }
}

// ==================== PREMIAÇÕES REALIZADAS ====================

async function carregarPremiacoes() {
    try {
        const { mes, ano } = getMesAnoSelecionado();
        const dados = await apiGet(`/api/metas/premiacoes/?mes=${mes}&ano=${ano}`);
        premiacoesRealizadas = dados || [];
        renderizarPremiacoes();
    } catch (error) {
        console.error('Erro ao carregar premiações:', error);
    }
}

function renderizarPremiacoes() {
    // Resumo
    const resumoContainer = document.getElementById('premiacoesResumo');
    const totalPremiacoes = premiacoesRealizadas.length;
    const totalBonus = premiacoesRealizadas.reduce((sum, p) => sum + parseFloat(p.valor_bonus || 0), 0);
    const pendentes = premiacoesRealizadas.filter(p => p.status === 'pendente').length;
    const pagas = premiacoesRealizadas.filter(p => p.status === 'pago').length;
    
    resumoContainer.innerHTML = `
        <div class="premiacao-card">
            <div class="valor">${totalPremiacoes}</div>
            <div class="label">Total de Premiações</div>
        </div>
        <div class="premiacao-card">
            <div class="valor">${formatarMoeda(totalBonus)}</div>
            <div class="label">Valor Total em Bônus</div>
        </div>
        <div class="premiacao-card">
            <div class="valor" style="color: #f39c12;">${pendentes}</div>
            <div class="label">Pendentes</div>
        </div>
        <div class="premiacao-card">
            <div class="valor" style="color: #27ae60;">${pagas}</div>
            <div class="label">Pagas</div>
        </div>
    `;
    
    // Tabela
    const tbody = document.getElementById('premiacoesTableBody');
    
    if (!premiacoesRealizadas || premiacoesRealizadas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px; color: #666;">
                    Nenhuma premiação registrada para este período.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = premiacoesRealizadas.map(p => {
        const meses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        return `
            <tr>
                <td><strong>${p.vendedor_nome}</strong></td>
                <td>${meses[p.mes]}/${p.ano}</td>
                <td>${p.faixa_nome}</td>
                <td>${formatarMoeda(p.valor_vendido)}</td>
                <td>${p.quantidade_vendida}</td>
                <td><strong>${formatarMoeda(p.valor_bonus)}</strong></td>
                <td>
                    <span class="status-badge status-${p.status}">
                        ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                </td>
                <td class="table-actions">
                    ${podeEditar ? `
                        ${p.status === 'pendente' ? `
                            <button class="action-pay" onclick="pagarPremiacao(${p.id})" title="Marcar como Pago">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        <button class="action-delete" onclick="deletarPremiacao(${p.id})" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

async function pagarPremiacao(id) {
    if (!confirm('Confirmar pagamento desta premiação?')) return;
    
    try {
        const hoje = new Date().toISOString().split('T')[0];
        await apiPut(`/api/metas/premiacoes/${id}`, {
            status: 'pago',
            data_pagamento: hoje
        });
        
        await carregarPremiacoes();
        alert('Premiação marcada como paga!');
    } catch (error) {
        console.error('Erro ao pagar premiação:', error);
        alert('Erro ao atualizar premiação.');
    }
}

async function deletarPremiacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta premiação?')) return;
    
    try {
        await apiDelete(`/api/metas/premiacoes/${id}`);
        await carregarPremiacoes();
        alert('Premiação excluída com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir premiação:', error);
        alert('Erro ao excluir premiação.');
    }
}

// ==================== CALCULAR PREMIAÇÕES ====================

async function calcularPremiacoes(registrar = false) {
    try {
        const { mes, ano } = getMesAnoSelecionado();
        
        const resultado = await apiPost(`/api/metas/calcular-premiacoes?mes=${mes}&ano=${ano}&registrar=${registrar}`);
        
        if (registrar) {
            alert(`Premiações registradas!\n\nTotal: ${resultado.total_premiacoes}\nValor Total: ${formatarMoeda(resultado.valor_total_bonus)}`);
            await carregarPremiacoes();
            // Mudar para aba de premiações
            document.querySelector('[data-tab="premiacoes"]').click();
        } else {
            // Mostrar modal de simulação
            mostrarSimulacao(resultado);
        }
    } catch (error) {
        console.error('Erro ao calcular premiações:', error);
        alert('Erro ao calcular premiações: ' + (error.message || 'Erro desconhecido'));
    }
}

function mostrarSimulacao(resultado) {
    const container = document.getElementById('simulacaoContent');
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    if (!resultado.premiacoes || resultado.premiacoes.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #666;">
                <i class="fas fa-info-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>Nenhum vendedor atingiu faixa de premiação neste período.</p>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h3>Período: ${meses[resultado.mes]}/${resultado.ano}</h3>
                <p><strong>Total de Premiações:</strong> ${resultado.total_premiacoes}</p>
                <p><strong>Valor Total em Bônus:</strong> ${formatarMoeda(resultado.valor_total_bonus)}</p>
            </div>
            <table class="faixas-table">
                <thead>
                    <tr>
                        <th>Vendedor</th>
                        <th>Faixa</th>
                        <th>Valor Vendido</th>
                        <th>% Meta</th>
                        <th>Bônus</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultado.premiacoes.map(p => `
                        <tr>
                            <td><strong>${p.vendedor_nome}</strong></td>
                            <td>${p.faixa_nome}</td>
                            <td>${formatarMoeda(p.valor_vendido)}</td>
                            <td>${p.percentual_meta.toFixed(1)}%</td>
                            <td><strong style="color: #27ae60;">${formatarMoeda(p.valor_bonus)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('modalSimulacao').classList.add('active');
}

function fecharModalSimulacao() {
    document.getElementById('modalSimulacao').classList.remove('active');
}

// ==================== UTILITÁRIOS ====================

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor || 0);
}

// Funções de API (caso não existam no api.js)
async function apiGet(url) {
    const apiUrl = await getApiUrl();
    const token = localStorage.getItem('erp_token');
    
    const response = await fetch(`${apiUrl}${url}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Erro ${response.status}`);
    }
    
    return response.json();
}

async function apiPost(url, data) {
    const apiUrl = await getApiUrl();
    const token = localStorage.getItem('erp_token');
    
    const response = await fetch(`${apiUrl}${url}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Erro ${response.status}`);
    }
    
    return response.json();
}

async function apiPut(url, data) {
    const apiUrl = await getApiUrl();
    const token = localStorage.getItem('erp_token');
    
    const response = await fetch(`${apiUrl}${url}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Erro ${response.status}`);
    }
    
    return response.json();
}

async function apiDelete(url) {
    const apiUrl = await getApiUrl();
    const token = localStorage.getItem('erp_token');
    
    const response = await fetch(`${apiUrl}${url}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw error;
    }
    
    return response.json();
}
