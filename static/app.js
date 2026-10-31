/**
 * Main Application Controller for Organizador de Disco E:
 * Supports Localhost, Cloudflare Tunnel & Vercel
 */

window.API_BASE = localStorage.getItem('organizador_api_base') || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '' 
    : 'https://ipaq-sections-lifestyle-truck.trycloudflare.com'
);

let cachedSnapshot = null;

async function getSnapshot() {
  if (!cachedSnapshot) {
    try {
      const r = await nativeFetch('/static/data_snapshot.json');
      if (r.ok) cachedSnapshot = await r.json();
    } catch (e) {
      try {
        const r2 = await nativeFetch('/data_snapshot.json');
        if (r2.ok) cachedSnapshot = await r2.json();
      } catch (e2) {}
    }
  }
  return cachedSnapshot;
}

function updateConnectionStatus(isOnline) {
  const statusEl = document.getElementById('remote-conn-status');
  if (statusEl) {
    statusEl.innerHTML = isOnline 
      ? '<span class="text-emerald-400">● PC Conectada (En Vivo)</span>' 
      : '<span class="text-amber-400">● Modo Snapshot (Offline)</span>';
  }
}

// Global Transparent Fetch Proxy
const nativeFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  let finalUrl = url;
  const isApi = (typeof url === 'string' && url.startsWith('/api/'));

  if (isApi && window.API_BASE) {
    finalUrl = window.API_BASE.replace(/\/$/, '') + url;
  }

  try {
    const res = await nativeFetch(finalUrl, options);
    if (res.ok || (res.status && res.status < 500)) {
      if (isApi) updateConnectionStatus(true);
      return res;
    }
  } catch (err) {
    if (isApi) {
      console.warn("Llamada en vivo falló, usando snapshot si está disponible:", finalUrl);
      updateConnectionStatus(false);
    }
  }

  // Fallback to snapshot for GET requests if remote PC is offline
  if (isApi && (!options.method || options.method.toUpperCase() === 'GET')) {
    const snap = await getSnapshot();
    if (snap) {
      if (url.includes('/api/drive/info')) {
        return new Response(JSON.stringify(snap.drive_info), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/tags')) {
        return new Response(JSON.stringify(snap.tags), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/organigram')) {
        return new Response(JSON.stringify(snap.organigram), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/foldersizes/files-analysis')) {
        return new Response(JSON.stringify(snap.files_analysis), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/foldersizes/treemap')) {
        const isFiles = url.includes('view_mode=files');
        const nodeData = isFiles && snap.foldersizes_treemap_files ? snap.foldersizes_treemap_files : snap.foldersizes_treemap;
        return new Response(JSON.stringify(nodeData), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/foldersizes/tag-space')) {
        return new Response(JSON.stringify(snap.tag_space), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/compare/drive-duplicates')) {
        return new Response(JSON.stringify(snap.drive_duplicates), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/recycle-bin')) {
        return new Response(JSON.stringify(snap.recycle_bin || { items: [], total_files: 0, total_bytes: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else if (url.includes('/api/explore')) {
        const u = new URL(url, 'http://localhost');
        const p = u.searchParams.get('path') || 'E:\\';
        const cachedExplored = snap.explore_cache[p] || snap.explore_cache['E:\\'];
        if (cachedExplored) {
          return new Response(JSON.stringify(cachedExplored), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }
  }

  return nativeFetch(finalUrl, options);
};

function saveTunnelUrl() {
  const input = document.getElementById('cfg-tunnel-url');
  if (!input) return;
  const val = input.value.trim();
  if (val) {
    localStorage.setItem('organizador_api_base', val);
    window.API_BASE = val;
    showToast("URL de conexión guardada: " + val, "success");
    fetchDriveInfo();
    loadFolder(state.currentPath);
  } else {
    localStorage.removeItem('organizador_api_base');
    window.API_BASE = '';
    showToast("URL restablecida a local/automático", "info");
  }
}

const state = {
  currentPath: "E:\\",
  currentView: "grid", // "organigram", "grid", "list"
  driveInfo: null,
  tags: {},
  currentFolderData: null,
  selectedItems: new Map(), // path -> { path, name, type: 'folder'|'file', ... }
  lastSelectedIdx: null,
  filters: {
    category: null,
    status: null,
    tagId: null,
    search: '',
    sortBy: 'name',
    sortOrder: 'asc'
  },
  organigramInstance: null
};

// Utilities
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = 1;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-red-600' : 'bg-indigo-600');
  toast.className = `${bg} text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// API Calls
async function fetchDriveInfo() {
  try {
    const res = await fetch('/api/drive/info');
    state.driveInfo = await res.json();
    renderDriveHeader();
    renderSidebarStats();
  } catch (e) {
    console.error("Error fetching drive info", e);
  }
}

async function fetchTags() {
  try {
    const res = await fetch('/api/tags');
    state.tags = await res.json();
    renderSidebarTags();
  } catch (e) {
    console.error("Error fetching tags", e);
  }
}

async function loadFolder(path) {
  state.currentPath = path;
  state.selectedItems.clear();
  state.lastSelectedIdx = null;
  updateSelectionToolbar();

  const loadingSpinner = document.getElementById('view-loading');
  if (loadingSpinner) loadingSpinner.classList.remove('hidden');

  try {
    const params = new URLSearchParams({
      path: path,
      sort_by: state.filters.sortBy,
      sort_order: state.filters.sortOrder
    });
    if (state.filters.category) params.append('category', state.filters.category);
    if (state.filters.status) params.append('status', state.filters.status);
    if (state.filters.tagId) params.append('tag_id', state.filters.tagId);
    if (state.filters.search) params.append('search', state.filters.search);

    const res = await fetch(`/api/explore?${params.toString()}`);
    if (!res.ok) throw new Error("No se pudo cargar la carpeta");
    state.currentFolderData = await res.json();

    renderBreadcrumbs();
    renderFolderHeader();

    if (state.currentView === 'grid') {
      renderGridView();
    } else if (state.currentView === 'list') {
      renderListView();
    }
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
  }
}

async function loadOrganigram() {
  const loading = document.getElementById('view-loading');
  if (loading) loading.classList.remove('hidden');

  try {
    const res = await fetch('/api/organigram?max_depth=4');
    const data = await res.json();
    if (!state.organigramInstance) {
      state.organigramInstance = new FolderOrganigram('organigram-container', {
        onExploreFolder: (p) => {
          setView('grid');
          loadFolder(p);
        },
        onOpenWindows: (p) => openInExplorer(p),
        onNodeClick: (node) => {
          // Open node details or focus
        }
      });
    }
    state.organigramInstance.setData(data.nodes);
  } catch (e) {
    console.error("Error loading organigram", e);
    showToast("Error al cargar organigrama", "error");
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

// UI Rendering
function renderDriveHeader() {
  const info = state.driveInfo;
  if (!info) return;

  const usedBar = document.getElementById('drive-progress-bar');
  const usedText = document.getElementById('drive-used-text');
  const countText = document.getElementById('drive-counts-text');

  if (usedBar) usedBar.style.width = `${info.used_percent}%`;
  if (usedText) usedText.innerText = `${info.used_gb} GB usados de ${info.total_gb} GB (${info.used_percent}%) • ${info.free_gb} GB libres`;
  if (countText) countText.innerText = `${info.folders_count} carpetas indexadas`;
}

function renderSidebarStats() {
  const info = state.driveInfo;
  if (!info) return;

  const catContainer = document.getElementById('sidebar-categories');
  if (catContainer && info.categories) {
    catContainer.innerHTML = info.categories.map(c => `
      <button onclick="filterByCategory('${c.category}')" 
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                state.filters.category === c.category 
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' 
                  : 'text-slate-300 hover:bg-slate-800/80'
              }">
        <span class="truncate pr-1">${c.category}</span>
        <span class="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">${c.count}</span>
      </button>
    `).join('');
  }

  const statContainer = document.getElementById('sidebar-statuses');
  if (statContainer && info.statuses) {
    statContainer.innerHTML = info.statuses.map(s => {
      const isDupe = s.status === 'Duplicado / Posible Basura';
      const isOrg = s.status === 'Organizado';
      const colorClass = isDupe ? 'text-red-400' : (isOrg ? 'text-emerald-400' : 'text-amber-400');
      return `
        <button onclick="filterByStatus('${s.status}')" 
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  state.filters.status === s.status 
                    ? 'bg-slate-800 text-white border border-slate-600' 
                    : 'text-slate-300 hover:bg-slate-800/80'
                }">
          <span class="truncate pr-1 flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${colorClass} bg-current"></span>
            <span>${s.status}</span>
          </span>
          <span class="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">${s.count}</span>
        </button>
      `;
    }).join('');
  }
}

function renderSidebarTags() {
  const container = document.getElementById('sidebar-tags');
  if (!container || !state.tags) return;

  const allTags = [];
  Object.keys(state.tags).forEach(k => {
    allTags.push(...state.tags[k]);
  });

  container.innerHTML = allTags.slice(0, 20).map(t => `
    <button onclick="filterByTag(${t.id})" 
            class="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
              state.filters.tagId === t.id 
                ? 'ring-2 ring-indigo-400 text-white' 
                : 'text-slate-300 hover:border-slate-500'
            }" 
            style="background-color: ${t.color}15; border-color: ${t.color}40; color: ${t.color};">
      <span>${t.name}</span>
      <span class="text-[9px] opacity-75 font-mono">(${t.usage_count})</span>
    </button>
  `).join('');
}

function renderBreadcrumbs() {
  const container = document.getElementById('breadcrumbs-bar');
  if (!container || !state.currentFolderData) return;

  const crumbs = state.currentFolderData.breadcrumbs || [];
  container.innerHTML = crumbs.map((c, idx) => {
    const isLast = idx === crumbs.length - 1;
    return `
      <div class="flex items-center space-x-1">
        ${idx > 0 ? '<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-600"></i>' : ''}
        <button onclick="loadFolder('${c.path.replace(/\\/g, '\\\\')}')" 
                class="px-2 py-1 rounded-md text-xs font-medium transition ${
                  isLast 
                    ? 'bg-slate-800 text-indigo-300 font-bold' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }">
          ${c.name}
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderFolderHeader() {
  const meta = state.currentFolderData.current_folder;
  if (!meta) return;

  const titleEl = document.getElementById('current-folder-title');
  const catEl = document.getElementById('current-folder-category');
  const statusEl = document.getElementById('current-folder-status');

  if (titleEl) titleEl.innerText = meta.name || 'Carpeta';
  if (catEl) catEl.innerText = meta.category || 'Sin Categoría';
  if (statusEl) statusEl.innerText = meta.status || 'Por Revisar';
}

function renderGridView() {
  const container = document.getElementById('explorer-content');
  if (!container || !state.currentFolderData) return;

  const { subfolders, files } = state.currentFolderData;
  let html = '';

  // Subfolders Section
  if (subfolders && subfolders.length > 0) {
    html += `
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <i data-lucide="folder" class="w-4 h-4 text-indigo-400"></i>
            <span>Subcarpetas (${subfolders.length})</span>
          </h3>
          <button onclick="selectAllFolders()" class="text-xs text-indigo-400 hover:text-indigo-300 transition">
            Seleccionar todas
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          ${subfolders.map((f, idx) => renderFolderCard(f, idx)).join('')}
        </div>
      </div>
    `;
  }

  // Files Section
  if (files && files.length > 0) {
    html += `
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <i data-lucide="file" class="w-4 h-4 text-emerald-400"></i>
            <span>Archivos (${files.length})</span>
          </h3>
          <button onclick="selectAllFiles()" class="text-xs text-emerald-400 hover:text-emerald-300 transition">
            Seleccionar todos
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          ${files.map((file, idx) => renderFileCard(file, idx)).join('')}
        </div>
      </div>
    `;
  }

  if ((!subfolders || subfolders.length === 0) && (!files || files.length === 0)) {
    html = `
      <div class="flex flex-col items-center justify-center py-20 text-slate-500">
        <i data-lucide="folder-open" class="w-12 h-12 stroke-[1.5] mb-2 text-slate-600"></i>
        <p class="text-sm">Esta carpeta no contiene elementos con los filtros actuales.</p>
        <button onclick="resetFilters()" class="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700">
          Limpiar Filtros
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function renderFolderCard(folder, idx) {
  const isSelected = state.selectedItems.has(folder.path);
  const isDuplicate = folder.status === 'Duplicado / Posible Basura';
  const tags = folder.tags || [];

  return `
    <div data-path="${folder.path}" data-type="folder" data-idx="${idx}"
         class="glass-card rounded-xl p-3 flex flex-col justify-between group cursor-pointer relative ${isSelected ? 'selected' : ''}"
         onclick="handleItemCardClick(event, '${folder.path.replace(/\\/g, '\\\\')}', 'folder', ${idx})">
      
      <!-- Top Row: Checkbox, Icon, Quick Actions -->
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-2 min-w-0 pr-1">
          <input type="checkbox" ${isSelected ? 'checked' : ''} 
                 onclick="event.stopPropagation(); toggleSelectItem('${folder.path.replace(/\\/g, '\\\\')}', 'folder')"
                 class="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <i data-lucide="folder" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-300 transition" title="${folder.name}">
              ${folder.name}
            </h4>
            <span class="text-[10px] text-slate-400 truncate block">${folder.category || 'General'}</span>
          </div>
        </div>

        <button onclick="event.stopPropagation(); openInExplorer('${folder.path.replace(/\\/g, '\\\\')}')" 
                class="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700/60 rounded text-slate-400 hover:text-white transition"
                title="Abrir en Explorador de Windows">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
        </button>
      </div>

      <!-- Mid tags -->
      <div class="my-2.5 flex flex-wrap gap-1 min-h-[20px]">
        ${isDuplicate ? `<span class="badge-duplicate text-[10px] px-1.5 py-0.5 rounded font-bold">Duplicado</span>` : ''}
        ${tags.slice(0, 3).map(t => `
          <span class="text-[9px] px-1.5 py-0.5 rounded font-medium" style="background-color: ${t.color}20; color: ${t.color}; border: 1px solid ${t.color}35;">
            ${t.name}
          </span>
        `).join('')}
        ${tags.length > 3 ? `<span class="text-[9px] text-slate-500 font-mono">+${tags.length - 3}</span>` : ''}
      </div>

      <!-- Bottom meta -->
      <div class="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
        <span class="font-mono">📁 ${folder.subfolder_count || 0} • 📄 ${folder.file_count || 0}</span>
        <button onclick="event.stopPropagation(); loadFolder('${folder.path.replace(/\\/g, '\\\\')}')" 
                class="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1">
          <span>Abrir</span>
          <i data-lucide="chevron-right" class="w-3 h-3"></i>
        </button>
      </div>
    </div>
  `;
}

function renderFileCard(file, idx) {
  const isSelected = state.selectedItems.has(file.path);
  const ext = file.extension ? file.extension.toLowerCase() : '';
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);
  const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);
  const isPdf = ext === '.pdf';
  const hasThumbnail = isImage || isVideo || isPdf;

  return `
    <div data-path="${file.path}" data-type="file" data-idx="${idx}"
         class="glass-card rounded-xl p-2 flex flex-col justify-between group cursor-pointer relative overflow-hidden ${isSelected ? 'selected' : ''}"
         onclick="handleItemCardClick(event, '${file.path.replace(/\\/g, '\\\\')}', 'file', ${idx})">
      
      <!-- Selection Checkbox overlay -->
      <div class="absolute top-2 left-2 z-10">
        <input type="checkbox" ${isSelected ? 'checked' : ''} 
               onclick="event.stopPropagation(); toggleSelectItem('${file.path.replace(/\\/g, '\\\\')}', 'file')"
               class="w-4 h-4 rounded border-slate-700 bg-slate-900/90 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shadow">
      </div>

      <!-- Preview Image / Icon area -->
      <div class="w-full aspect-square rounded-lg bg-slate-950 flex items-center justify-center overflow-hidden relative mb-2"
           onclick="event.stopPropagation(); previewMedia('${file.path.replace(/\\/g, '\\\\')}', '${ext}')">
        ${hasThumbnail ? `
          <img src="/api/thumbnail?path=${encodeURIComponent(file.path)}" 
               alt="${file.name}" 
               loading="lazy"
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="hidden w-full h-full flex items-center justify-center text-slate-600">
            <i data-lucide="${getFileIcon(ext)}" class="w-8 h-8"></i>
          </div>
        ` : `
          <div class="w-full h-full flex flex-col items-center justify-center text-slate-500">
            <i data-lucide="${getFileIcon(ext)}" class="w-8 h-8 mb-1 text-slate-400"></i>
            <span class="text-[9px] font-mono font-bold uppercase">${ext.replace('.', '')}</span>
          </div>
        `}

        ${isVideo ? `
          <div class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-bold text-white flex items-center space-x-1">
            <i data-lucide="play" class="w-2.5 h-2.5 fill-current"></i>
            <span>VIDEO</span>
          </div>
        ` : ''}

        ${isPdf ? `
          <div class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-red-600/90 text-[9px] font-bold text-white">
            PDF
          </div>
        ` : ''}
      </div>

      <!-- File info -->
      <div>
        <h5 class="text-[11px] font-medium text-slate-200 truncate" title="${file.name}">${file.name}</h5>
        <div class="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
          <span>${formatBytes(file.size_bytes)}</span>
          <span class="text-[9px] uppercase">${ext.replace('.', '')}</span>
        </div>
      </div>
    </div>
  `;
}

function renderListView() {
  const container = document.getElementById('explorer-content');
  if (!container || !state.currentFolderData) return;

  const { subfolders, files } = state.currentFolderData;
  const allItems = [
    ...(subfolders || []).map(s => ({ ...s, isFolder: true })),
    ...(files || []).map(f => ({ ...f, isFolder: false }))
  ];

  if (allItems.length === 0) {
    container.innerHTML = `<div class="p-12 text-center text-slate-500">Carpeta vacía o sin coincidencias.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="glass rounded-xl overflow-hidden border border-slate-800">
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
          <tr>
            <th class="p-3 w-10 text-center">
              <input type="checkbox" onclick="toggleSelectAllTable(this)" class="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600">
            </th>
            <th class="p-3">Nombre</th>
            <th class="p-3">Categoría</th>
            <th class="p-3">Estado</th>
            <th class="p-3">Tamaño</th>
            <th class="p-3">Etiquetas</th>
            <th class="p-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          ${allItems.map((item, idx) => {
            const isSelected = state.selectedItems.has(item.path);
            const type = item.isFolder ? 'folder' : 'file';
            const tags = item.tags || [];
            return `
              <tr class="hover:bg-slate-800/40 transition cursor-pointer ${isSelected ? 'bg-indigo-950/30' : ''}"
                  onclick="handleItemCardClick(event, '${item.path.replace(/\\/g, '\\\\')}', '${type}', ${idx})">
                <td class="p-3 text-center" onclick="event.stopPropagation()">
                  <input type="checkbox" ${isSelected ? 'checked' : ''} 
                         onclick="toggleSelectItem('${item.path.replace(/\\/g, '\\\\')}', '${type}')"
                         class="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600">
                </td>
                <td class="p-3">
                  <div class="flex items-center space-x-2">
                    <i data-lucide="${item.isFolder ? 'folder' : getFileIcon(item.extension)}" class="w-4 h-4 ${item.isFolder ? 'text-indigo-400' : 'text-slate-400'} flex-shrink-0"></i>
                    <span class="font-medium text-slate-200 truncate max-w-md">${item.name}</span>
                  </div>
                </td>
                <td class="p-3 text-slate-300">${item.category || '-'}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${item.status === 'Duplicado / Posible Basura' ? 'badge-duplicate' : (item.status === 'Organizado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}">
                    ${item.status || 'Por Revisar'}
                  </span>
                </td>
                <td class="p-3 font-mono text-slate-400">${item.isFolder ? (item.file_count + ' archivos') : formatBytes(item.size_bytes)}</td>
                <td class="p-3">
                  <div class="flex flex-wrap gap-1">
                    ${tags.slice(0, 2).map(t => `<span class="px-1.5 py-0.5 rounded text-[9px]" style="background-color:${t.color}20; color:${t.color}">${t.name}</span>`).join('')}
                    ${tags.length > 2 ? `<span class="text-[9px] text-slate-500">+${tags.length-2}</span>` : ''}
                  </div>
                </td>
                <td class="p-3 text-right" onclick="event.stopPropagation()">
                  <div class="flex items-center justify-end space-x-1">
                    ${item.isFolder ? `
                      <button onclick="loadFolder('${item.path.replace(/\\/g, '\\\\')}')" class="p-1 hover:bg-slate-700 rounded text-indigo-400" title="Abrir carpeta">
                        <i data-lucide="chevron-right" class="w-4 h-4"></i>
                      </button>
                    ` : `
                      <button onclick="previewMedia('${item.path.replace(/\\/g, '\\\\')}', '${item.extension}')" class="p-1 hover:bg-slate-700 rounded text-slate-300" title="Previsualizar">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                      </button>
                    `}
                    <button onclick="openInExplorer('${item.path.replace(/\\/g, '\\\\')}')" class="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Abrir en Windows">
                      <i data-lucide="external-link" class="w-4 h-4"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function getFileIcon(ext) {
  if (!ext) return 'file';
  ext = ext.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) return 'music';
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'].includes(ext)) return 'archive';
  if (['.exe', '.msi'].includes(ext)) return 'cpu';
  if (['.pdf'].includes(ext)) return 'file-text';
  if (['.doc', '.docx', '.txt', '.rtf'].includes(ext)) return 'file-text';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'sheet';
  if (['.max', '.skp', '.blend', '.obj', '.fbx', '.dwg', '.dxf'].includes(ext)) return 'box';
  return 'file';
}

// Multi-Selection Management
function handleItemCardClick(event, path, type, idx) {
  if (event.shiftKey && state.lastSelectedIdx !== null) {
    // Range selection
    const items = type === 'folder' ? state.currentFolderData.subfolders : state.currentFolderData.files;
    if (items) {
      const start = Math.min(state.lastSelectedIdx, idx);
      const end = Math.max(state.lastSelectedIdx, idx);
      for (let i = start; i <= end; i++) {
        state.selectedItems.set(items[i].path, { path: items[i].path, type });
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    toggleSelectItem(path, type);
  } else {
    // Single select toggle or preview
    toggleSelectItem(path, type);
  }
  state.lastSelectedIdx = idx;
  updateSelectionToolbar();
  updateCardSelectionUI();
}

function toggleSelectItem(path, type) {
  if (state.selectedItems.has(path)) {
    state.selectedItems.delete(path);
  } else {
    state.selectedItems.set(path, { path, type });
  }
  updateSelectionToolbar();
  updateCardSelectionUI();
}

function selectAllFolders() {
  if (!state.currentFolderData || !state.currentFolderData.subfolders) return;
  state.currentFolderData.subfolders.forEach(f => state.selectedItems.set(f.path, { path: f.path, type: 'folder' }));
  updateSelectionToolbar();
  updateCardSelectionUI();
}

function selectAllFiles() {
  if (!state.currentFolderData || !state.currentFolderData.files) return;
  state.currentFolderData.files.forEach(f => state.selectedItems.set(f.path, { path: f.path, type: 'file' }));
  updateSelectionToolbar();
  updateCardSelectionUI();
}

function clearSelection() {
  state.selectedItems.clear();
  updateSelectionToolbar();
  updateCardSelectionUI();
}

function updateCardSelectionUI() {
  document.querySelectorAll('[data-path]').forEach(el => {
    const p = el.getAttribute('data-path');
    const isSelected = state.selectedItems.has(p);
    el.classList.toggle('selected', isSelected);
    const cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = isSelected;
  });
}

function updateSelectionToolbar() {
  const bar = document.getElementById('floating-batch-toolbar');
  const countEl = document.getElementById('selected-count-badge');
  if (!bar) return;

  const count = state.selectedItems.size;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} seleccionado${count > 1 ? 's' : ''}`;
  } else {
    bar.classList.add('hidden');
  }
}

// Batch Actions
async function openBatchTagModal() {
  const modal = document.getElementById('batch-tag-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Populate tag checkboxes
  const tagList = document.getElementById('modal-tag-list');
  if (!tagList) return;

  const allTags = [];
  Object.keys(state.tags).forEach(k => allTags.push(...state.tags[k]));

  tagList.innerHTML = allTags.map(t => `
    <label class="flex items-center space-x-2 p-2 rounded-lg bg-slate-900 hover:bg-slate-800 cursor-pointer border border-slate-800">
      <input type="checkbox" value="${t.id}" class="modal-tag-cb w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700">
      <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color}"></span>
      <span class="text-xs text-slate-200 font-medium">${t.name}</span>
    </label>
  `).join('');
}

function closeBatchTagModal() {
  const modal = document.getElementById('batch-tag-modal');
  if (modal) modal.classList.add('hidden');
}

async function applyBatchTags() {
  const selectedTagIds = Array.from(document.querySelectorAll('.modal-tag-cb:checked')).map(cb => parseInt(cb.value));
  if (selectedTagIds.length === 0) {
    showToast("Selecciona al menos una etiqueta", "error");
    return;
  }

  const paths = Array.from(state.selectedItems.keys());
  const folderPaths = paths.filter(p => state.selectedItems.get(p).type === 'folder');
  const filePaths = paths.filter(p => state.selectedItems.get(p).type === 'file');

  try {
    if (folderPaths.length > 0) {
      await fetch('/api/batch/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: folderPaths,
          item_type: 'folder',
          add_tag_ids: selectedTagIds
        })
      });
    }

    if (filePaths.length > 0) {
      await fetch('/api/batch/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: filePaths,
          item_type: 'file',
          add_tag_ids: selectedTagIds
        })
      });
    }

    showToast(`Etiquetas asignadas a ${paths.length} elementos`, "success");
    closeBatchTagModal();
    loadFolder(state.currentPath);
    fetchDriveInfo();
    fetchTags();
  } catch (e) {
    showToast("Error al asignar etiquetas", "error");
  }
}

async function batchSetCategory(catName) {
  const paths = Array.from(state.selectedItems.keys());
  const folderPaths = paths.filter(p => state.selectedItems.get(p).type === 'folder');
  const filePaths = paths.filter(p => state.selectedItems.get(p).type === 'file');

  try {
    if (folderPaths.length > 0) {
      await fetch('/api/batch/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: folderPaths, item_type: 'folder', field: 'category', value: catName })
      });
    }
    if (filePaths.length > 0) {
      await fetch('/api/batch/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: filePaths, item_type: 'file', field: 'category', value: catName })
      });
    }
    showToast(`Categoría "${catName}" asignada`, 'success');
    loadFolder(state.currentPath);
    fetchDriveInfo();
  } catch (e) {
    showToast("Error al asignar categoría", 'error');
  }
}

async function batchSetStatus(statusName) {
  const paths = Array.from(state.selectedItems.keys());
  const folderPaths = paths.filter(p => state.selectedItems.get(p).type === 'folder');
  const filePaths = paths.filter(p => state.selectedItems.get(p).type === 'file');

  try {
    if (folderPaths.length > 0) {
      await fetch('/api/batch/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: folderPaths, item_type: 'folder', field: 'status', value: statusName })
      });
    }
    if (filePaths.length > 0) {
      await fetch('/api/batch/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: filePaths, item_type: 'file', field: 'status', value: statusName })
      });
    }
    showToast(`Estado "${statusName}" asignado`, 'success');
    loadFolder(state.currentPath);
    fetchDriveInfo();
  } catch (e) {
    showToast("Error al asignar estado", 'error');
  }
}

async function openInExplorer(path) {
  try {
    await fetch('/api/open-in-explorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    showToast("Abierto en Explorador de Windows", "info");
  } catch (e) {
    showToast("No se pudo abrir la ruta", "error");
  }
}

// Lightbox Preview
function previewMedia(filePath, ext) {
  ext = (ext || '').toLowerCase();
  const modal = document.getElementById('media-lightbox-modal');
  const mediaContainer = document.getElementById('lightbox-media-container');
  const titleEl = document.getElementById('lightbox-title');
  const pathEl = document.getElementById('lightbox-path');

  if (!modal || !mediaContainer) return;

  const fileName = filePath.split('\\').pop();
  if (titleEl) titleEl.innerText = fileName;
  if (pathEl) pathEl.innerText = filePath;

  const isImg = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);
  const isVid = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);

  if (isImg) {
    mediaContainer.innerHTML = `
      <img src="/api/preview?path=${encodeURIComponent(filePath)}" 
           alt="${fileName}" 
           class="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl">
    `;
  } else if (isVid) {
    mediaContainer.innerHTML = `
      <video controls autoplay class="max-w-full max-h-[75vh] rounded-lg shadow-2xl">
        <source src="/api/preview?path=${encodeURIComponent(filePath)}">
        Tu navegador no soporta reproducción directa de este formato de video.
      </video>
    `;
  } else {
    mediaContainer.innerHTML = `
      <div class="p-8 text-center bg-slate-900 rounded-xl border border-slate-800">
        <i data-lucide="file" class="w-16 h-16 text-slate-500 mx-auto mb-3"></i>
        <h4 class="text-sm font-bold text-slate-200 mb-1">${fileName}</h4>
        <p class="text-xs text-slate-400 mb-4">${filePath}</p>
        <button onclick="openInExplorer('${filePath.replace(/\\/g, '\\\\')}')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold">
          Abrir en Windows
        </button>
      </div>
    `;
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeLightbox() {
  const modal = document.getElementById('media-lightbox-modal');
  const mediaContainer = document.getElementById('lightbox-media-container');
  if (mediaContainer) mediaContainer.innerHTML = '';
  if (modal) modal.classList.add('hidden');
}

// Main Module Switcher (Explorer, Folder Sizes, Beyond Compare, Thumbnails Studio)
let activeModule = 'explorer';

function setMainModule(moduleName) {
  activeModule = moduleName;

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar-drawer');
  if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
  }

  // Update desktop tab buttons
  ['explorer', 'foldersizes', 'comparator', 'thumbnails', 'recycle-bin'].forEach(m => {
    const btn = document.getElementById(`tab-nav-${m}`);
    if (btn) {
      const isTarget = (m === moduleName);
      btn.classList.toggle('bg-indigo-600', isTarget);
      btn.classList.toggle('text-white', isTarget);
      btn.classList.toggle('shadow', isTarget);
      btn.classList.toggle('text-slate-400', !isTarget);
    }

    // Update mobile bottom nav buttons
    const mobBtn = document.getElementById(`mob-nav-${m}`);
    if (mobBtn) {
      const isTarget = (m === moduleName);
      mobBtn.classList.toggle('text-indigo-400', isTarget);
      mobBtn.classList.toggle('text-slate-400', !isTarget);
    }
  });

  // Containers
  const expWrapper = document.getElementById('explorer-view-wrapper');
  const orgWrapper = document.getElementById('organigram-view-wrapper');
  const fsWrapper = document.getElementById('foldersizes-view-wrapper');
  const cmpWrapper = document.getElementById('comparator-view-wrapper');
  const tsWrapper = document.getElementById('thumbnails-view-wrapper');
  const rbWrapper = document.getElementById('recycle-bin-view-wrapper');

  // Hide all
  if (expWrapper) expWrapper.classList.add('hidden');
  if (orgWrapper) orgWrapper.classList.add('hidden');
  if (fsWrapper) fsWrapper.classList.add('hidden');
  if (cmpWrapper) cmpWrapper.classList.add('hidden');
  if (tsWrapper) tsWrapper.classList.add('hidden');
  if (rbWrapper) rbWrapper.classList.add('hidden');

  if (moduleName === 'explorer') {
    if (state.currentView === 'organigram') {
      if (orgWrapper) orgWrapper.classList.remove('hidden');
      loadOrganigram();
    } else {
      if (expWrapper) expWrapper.classList.remove('hidden');
      if (state.currentFolderData) {
        if (state.currentView === 'grid') renderGridView();
        else if (state.currentView === 'list') renderListView();
      } else {
        loadFolder(state.currentPath);
      }
    }
  } else if (moduleName === 'foldersizes') {
    if (fsWrapper) fsWrapper.classList.remove('hidden');
    if (!window.folderSizesInstance) {
      window.folderSizesInstance = new FolderSizesTreemap('foldersizes-container');
    }
    window.folderSizesInstance.loadTreemap(state.currentPath || "E:\\");
  } else if (moduleName === 'comparator') {
    if (cmpWrapper) cmpWrapper.classList.remove('hidden');
    if (!window.comparatorInstance) {
      window.comparatorInstance = new FolderComparator('comparator-container');
    }
  } else if (moduleName === 'thumbnails') {
    if (tsWrapper) tsWrapper.classList.remove('hidden');
    if (!window.thumbnailsStudioInstance) {
      window.thumbnailsStudioInstance = new ThumbnailsStudio('thumbnails-container');
    }
  } else if (moduleName === 'recycle-bin') {
    if (rbWrapper) rbWrapper.classList.remove('hidden');
    loadRecycleBin();
  }

  if (window.lucide) lucide.createIcons();
}

// ==========================================
// SWIPEDRIVE: RECYCLE BIN CONTROLLER
// ==========================================
let cachedRecycleBinItems = [];

async function loadRecycleBin() {
  const loading = document.getElementById('view-loading');
  if (loading) loading.classList.remove('hidden');

  try {
    const res = await fetch('/api/recycle-bin');
    if (!res.ok) throw new Error("No se pudo cargar la papelera");
    const data = await res.json();
    cachedRecycleBinItems = data.items || [];

    const countEl = document.getElementById('rb-total-files');
    if (countEl) countEl.innerText = `${data.total_files || 0} archivos`;

    const bytesEl = document.getElementById('rb-total-bytes');
    if (bytesEl) bytesEl.innerText = formatBytes(data.total_bytes || 0);

    renderRecycleBinTable(cachedRecycleBinItems);
  } catch (e) {
    showToast("Error al cargar papelera: " + e.message, "error");
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function renderRecycleBinTable(items) {
  const tbody = document.getElementById('rb-table-body');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-12 text-center">
          <div class="flex flex-col items-center justify-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center">
              <i data-lucide="trash" class="w-6 h-6"></i>
            </div>
            <p class="text-xs font-semibold text-slate-300">La papelera de SwipeDrive está vacía</p>
            <p class="text-[11px] text-slate-500 max-w-sm">
              Cuando uses el Modo Depuración en SwipeDrive para enviar archivos a la papelera, aparecerán listados aquí.
            </p>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3">
        <div class="flex items-center space-x-2">
          <i data-lucide="${getFileIcon(item.extension)}" class="w-4 h-4 text-slate-400 flex-shrink-0"></i>
          <span class="font-medium text-slate-200 truncate max-w-xs">${item.name}</span>
        </div>
      </td>
      <td class="p-3 text-slate-400 font-mono text-[11px] truncate max-w-xs" title="${item.original_folder || ''}">
        ${item.original_folder || '-'}
      </td>
      <td class="p-3 font-mono text-slate-300">
        ${formatBytes(item.size_bytes)}
      </td>
      <td class="p-3 text-slate-400 text-[11px]">
        ${formatDate(item.deleted_at)}
      </td>
      <td class="p-3 text-right">
        <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <i data-lucide="check" class="w-3 h-3"></i>
          <span>En Papelera Windows</span>
        </span>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function filterRecycleBinTable(query) {
  if (!query) {
    renderRecycleBinTable(cachedRecycleBinItems);
    return;
  }
  const q = query.toLowerCase();
  const filtered = cachedRecycleBinItems.filter(i => 
    (i.name && i.name.toLowerCase().includes(q)) || 
    (i.original_folder && i.original_folder.toLowerCase().includes(q))
  );
  renderRecycleBinTable(filtered);
}

async function confirmClearRecycleBinHistory() {
  if (!confirm("¿Deseas vaciar el historial de registro de SwipeDrive? Nota: Los archivos seguirán seguros en la Papelera de Windows.")) {
    return;
  }

  try {
    const res = await fetch('/api/recycle-bin/clear-history', { method: 'POST' });
    if (res.ok) {
      showToast("Historial de la papelera vaciado", "success");
      loadRecycleBin();
    } else {
      throw new Error("Error en servidor");
    }
  } catch (e) {
    showToast("Error al vaciar historial: " + e.message, "error");
  }
}

// View switcher within Explorer module (Grid, Organigram, List)
function setView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-view') === viewName;
    btn.classList.toggle('bg-indigo-600', isTarget);
    btn.classList.toggle('text-white', isTarget);
    btn.classList.toggle('text-slate-400', !isTarget);
  });

  const orgContainer = document.getElementById('organigram-view-wrapper');
  const expContainer = document.getElementById('explorer-view-wrapper');

  // If we are not currently in explorer module, switch to it
  if (activeModule !== 'explorer') {
    setMainModule('explorer');
    return;
  }

  if (viewName === 'organigram') {
    if (orgContainer) orgContainer.classList.remove('hidden');
    if (expContainer) expContainer.classList.add('hidden');
    loadOrganigram();
  } else {
    if (orgContainer) orgContainer.classList.add('hidden');
    if (expContainer) expContainer.classList.remove('hidden');
    if (state.currentFolderData) {
      if (viewName === 'grid') renderGridView();
      else if (viewName === 'list') renderListView();
    } else {
      loadFolder(state.currentPath);
    }
  }
}

// Filtering
function filterByCategory(cat) {
  state.filters.category = (state.filters.category === cat) ? null : cat;
  loadFolder(state.currentPath);
  renderSidebarStats();
}

function filterByStatus(st) {
  state.filters.status = (state.filters.status === st) ? null : st;
  loadFolder(state.currentPath);
  renderSidebarStats();
}

function filterByTag(tagId) {
  state.filters.tagId = (state.filters.tagId === tagId) ? null : tagId;
  loadFolder(state.currentPath);
  renderSidebarTags();
}

function resetFilters() {
  state.filters.category = null;
  state.filters.status = null;
  state.filters.tagId = null;
  state.filters.search = '';
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.value = '';
  loadFolder(state.currentPath);
  renderSidebarStats();
  renderSidebarTags();
}

// Quick Auto-Categorize trigger
async function triggerAutoCategorize() {
  showToast("Ejecutando auto-categorización inteligente...", "info");
  try {
    const res = await fetch('/api/auto-categorize', { method: 'POST' });
    const data = await res.json();
    showToast(`Categorizadas ${data.updated_folders} carpetas`, "success");
    fetchDriveInfo();
    loadFolder(state.currentPath);
  } catch (e) {
    showToast("Error en auto-categorización", "error");
  }
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
    closeBatchTagModal();
    clearSelection();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    if (state.currentFolderData) {
      selectAllFolders();
      selectAllFiles();
    }
  }
});

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  fetchDriveInfo();
  fetchTags();
  loadFolder("E:\\");

  // Search input binding
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.oninput = (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.filters.search = e.target.value.trim();
        loadFolder(state.currentPath);
      }, 250);
    };
  }

  // Sort binding
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      const [by, order] = e.target.value.split('-');
      state.filters.sortBy = by;
      state.filters.sortOrder = order;
      loadFolder(state.currentPath);
    };
  }

  if (window.lucide) lucide.createIcons();
});

// Mobile Sidebar Drawer Toggle
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar-drawer');
  if (!sidebar) return;
  sidebar.classList.toggle('-translate-x-full');
}

// Remote Mobile Actions Modal
function openRemoteControlModal() {
  const modal = document.getElementById('remote-control-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeRemoteControlModal() {
  const modal = document.getElementById('remote-control-modal');
  if (modal) modal.classList.add('hidden');
}

// 1. Trigger Remote Folder Sizes
async function triggerRemoteFolderSizes() {
  closeRemoteControlModal();
  setMainModule('foldersizes');
  showToast("Ejecutando re-análisis de Folder Sizes...", "info");
  if (window.folderSizesInstance) {
    await window.folderSizesInstance.loadTreemap(state.currentPath || "E:\\");
    await window.folderSizesInstance.loadTagSpace();
  }
  showToast("Folder Sizes actualizado", "success");
}

// 2. Trigger Remote Beyond Compare
async function triggerRemoteBeyondCompare() {
  closeRemoteControlModal();
  setMainModule('comparator');
  showToast("Iniciando escaneo de duplicados Beyond Compare...", "info");
  if (window.comparatorInstance) {
    document.getElementById('cmp-tab-scanner').click();
    await window.comparatorInstance.loadDriveDuplicates(true);
  }
  showToast("Escaneo de duplicados finalizado", "success");
}

// 3. Trigger Remote Thumbnails Generator
async function triggerRemoteThumbnails() {
  closeRemoteControlModal();
  setMainModule('thumbnails');
  showToast("Iniciando generador de miniaturas en la PC...", "info");
  if (window.thumbnailsStudioInstance) {
    await window.thumbnailsStudioInstance.startGeneration();
  }
}

// 4. Trigger Remote Auto Categorize
async function triggerRemoteAutoCategorize() {
  closeRemoteControlModal();
  await triggerAutoCategorize();
}

// 5. Trigger Remote File Analysis (Deep Scan & Classification)
async function triggerRemoteFileAnalysis() {
  showToast("Iniciando análisis profundo de archivos en la PC...", "info");
  try {
    const res = await fetch('/api/foldersizes/analyze-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root_dir: 'E:\\' })
    });
    const data = await res.json();
    if (data.status === 'already_running') {
      showToast("El escáner de archivos ya está corriendo en la PC", "info");
    } else {
      showToast("Escaneo de archivos iniciado en tu PC local", "success");
    }

    let pollInterval = setInterval(async () => {
      try {
        const sRes = await fetch('/api/foldersizes/analysis-status');
        const st = await sRes.json();
        if (st.is_running) {
          showToast(`PC analizando: ${st.files_scanned.toLocaleString()} archivos...`, "info");
        } else {
          clearInterval(pollInterval);
          showToast("¡Análisis de archivos completado en la PC!", "success");
          if (window.folderSizesInstance) {
            if (window.folderSizesInstance.currentMode === 'reports') {
              window.folderSizesInstance.loadFilesAnalysis();
            } else {
              window.folderSizesInstance.loadTreemap(window.folderSizesInstance.currentPath, window.folderSizesInstance.currentMode);
            }
          }
        }
      } catch (err) {
        clearInterval(pollInterval);
      }
    }, 3000);

  } catch (e) {
    showToast("No se pudo contactar a la PC: " + e.message, "error");
  }
}
