// Sidebar functionality
//
// A lógica de exibir/ocultar itens de menu por permissão e de carregar o nome/cargo
// do usuário já é feita por sidebar-template.js (que substitui todo o conteúdo de
// .sidebar-nav) e pelo loadUserData() de cada página. Este arquivo cuida só do
// botão de colapsar/expandir a sidebar, que várias páginas não configuram por conta própria.
document.addEventListener('DOMContentLoaded', function () {
    setupSidebarToggle();
});

// Function to toggle sidebar
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
}
