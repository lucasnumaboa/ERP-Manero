// Sidebar functionality
document.addEventListener('DOMContentLoaded', function() {
    setupSidebarToggle();
    setupCategorySubmenu();
});

// Function to toggle sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
}

// Function to setup category submenu
function setupCategorySubmenu() {
    // Find the products menu item
    const productMenuItem = document.querySelector('.sidebar-nav a[href="produtos.html"]').parentElement;
    
    // Check if the submenu already exists
    if (!document.querySelector('.category-submenu')) {
        // Create submenu container
        const submenu = document.createElement('div');
        submenu.className = 'category-submenu';
        submenu.style.display = 'none';
        
        // Create submenu items
        const submenuItems = `
            <a href="produtos.html" class="submenu-item"><i class="fas fa-box"></i> Produtos</a>
            <a href="categorias.html" class="submenu-item"><i class="fas fa-tags"></i> Categorias</a>
        `;
        
        submenu.innerHTML = submenuItems;
        
        // Insert submenu after the products menu item
        productMenuItem.appendChild(submenu);
        
        // Add toggle functionality
        const productLink = productMenuItem.querySelector('a');
        
        // Add dropdown indicator to the product menu item
        const dropdownIcon = document.createElement('i');
        dropdownIcon.className = 'fas fa-chevron-down dropdown-icon';
        productLink.appendChild(dropdownIcon);
        
        // Add click event to toggle submenu
        productLink.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent navigation
            const submenu = this.parentElement.querySelector('.category-submenu');
            
            if (submenu.style.display === 'none' || submenu.style.display === '') {
                submenu.style.display = 'block';
                dropdownIcon.className = 'fas fa-chevron-up dropdown-icon';
            } else {
                submenu.style.display = 'none';
                dropdownIcon.className = 'fas fa-chevron-down dropdown-icon';
            }
        });
    }
}

// Function to fix vendas link issue
function fixVendasLink() {
    const vendasLink = document.querySelector('.sidebar-nav a[href="vendas.html"]');
    if (vendasLink) {
        vendasLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'vendas.html';
        });
    }
}
