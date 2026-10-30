/**
 * Beyond Compare Web Module - Side-by-side folder & file diff & duplicate resolver
 */

class FolderComparator {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.leftPath = "E:\\WORK\\Leslie Carrillo - Entrega 28 Mayo";
    this.rightPath = "E:\\WORK\\TODO REVISAR DUPLICADOS\\Leslie Carrillo - Entrega 28 Mayo";
    this.compData = null;
    this.driveDuplicatesData = null;
    this.activeFilter = "all";
    this.currentSubTab = "side_by_side"; // "side_by_side" or "drive_scanner"
    
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-950 select-none">
        
        <!-- Header & Subtab Bar -->
        <div class="h-14 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/20">
              ⚖️
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-white tracking-wide">COMPARADOR BEYOND COMPARE</h2>
              <span class="text-[10px] text-slate-400">Detección de duplicados exactos, renombrados y mismo peso con distinto contenido</span>
            </div>
          </div>

          <!-- Subtab toggle -->
          <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button id="cmp-tab-side" class="px-3 py-1 rounded-lg font-semibold bg-indigo-600 text-white transition">
              Comparación Lado a Lado
            </button>
            <button id="cmp-tab-scanner" class="px-3 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition">
              🔍 Escáner Automático de Disco E:
            </button>
          </div>
        </div>

        <!-- 1. SIDE-BY-SIDE VIEW -->
        <div id="cmp-view-side" class="flex-1 flex flex-col overflow-hidden">
          
          <!-- Path Input Bar (Left vs Right) -->
          <div class="p-3 border-b border-slate-800 bg-slate-900/40 grid grid-cols-1 md:grid-cols-2 gap-3 flex-shrink-0">
            <!-- Left Path -->
            <div>
              <label class="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <span>📁 Carpeta Base (Izquierda)</span>
              </label>
              <div class="flex items-center space-x-1.5">
                <input type="text" id="cmp-left-path" value="${this.leftPath}" 
                       class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
                <button onclick="window.comparatorInstance.openLeftExplorer()" class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300" title="Abrir en Windows">
                  <i data-lucide="folder-symlink" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <!-- Right Path -->
            <div>
              <label class="block text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <span>📁 Carpeta a Comparar (Derecha)</span>
              </label>
              <div class="flex items-center space-x-1.5">
                <input type="text" id="cmp-right-path" value="${this.rightPath}" 
                       class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
                <button onclick="window.comparatorInstance.openRightExplorer()" class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300" title="Abrir en Windows">
                  <i data-lucide="folder-symlink" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Controls & Quick Pairs Bar -->
          <div class="h-10 border-b border-slate-800 bg-slate-900/30 px-4 flex items-center justify-between flex-shrink-0 text-xs">
            <div class="flex items-center space-x-3">
              <button id="cmp-btn-run" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center space-x-1.5 shadow-md shadow-indigo-600/30">
                <i data-lucide="git-compare" class="w-3.5 h-3.5"></i>
                <span>Comparar Ahora</span>
              </button>

              <label class="flex items-center space-x-1.5 cursor-pointer text-slate-300 text-[11px]">
                <input type="checkbox" id="cmp-cb-fullhash" class="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-indigo-600">
                <span>Verificación Hash MD5 Bit-a-Bit</span>
              </label>
            </div>

            <!-- Filter Pills -->
            <div class="flex items-center space-x-1" id="cmp-filter-pills">
              <!-- Dynamically populated -->
            </div>
          </div>

          <!-- Summary Metric Banner -->
          <div id="cmp-summary-banner" class="hidden p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between flex-shrink-0">
            <!-- Dynamically populated -->
          </div>

          <!-- Diff Results Table Area (Scrollable) -->
          <div id="cmp-diff-content" class="flex-1 overflow-y-auto p-4">
            <div class="flex flex-col items-center justify-center h-full text-slate-500">
              <i data-lucide="git-compare" class="w-12 h-12 mb-2 stroke-[1.5] text-slate-600"></i>
              <p class="text-sm">Selecciona las carpetas y haz clic en "Comparar Ahora" para ver el análisis de diferencias.</p>
            </div>
          </div>
        </div>

        <!-- 2. DRIVE-WIDE SCANNER VIEW -->
        <div id="cmp-view-scanner" class="hidden flex-1 flex flex-col overflow-hidden p-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold text-white">Carpetas Duplicadas Detectadas en E:\\</h3>
              <p class="text-xs text-slate-400">Escaneo automático de pares de carpetas idénticas o casi idénticas en tu disco duro.</p>
            </div>
            <button id="cmp-btn-rescan-drive" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              <span>Re-escanear Disco E:</span>
            </button>
          </div>

          <div id="cmp-drive-dupes-list" class="flex-1 overflow-y-auto space-y-3">
            <div class="text-center py-10 text-slate-500 text-xs">Cargando duplicados del disco...</div>
          </div>
        </div>

      </div>
    `;

    this.attachEvents();
    if (window.lucide) lucide.createIcons();
  }

  attachEvents() {
    const tabSide = document.getElementById('cmp-tab-side');
    const tabScanner = document.getElementById('cmp-tab-scanner');
    const viewSide = document.getElementById('cmp-view-side');
    const viewScanner = document.getElementById('cmp-view-scanner');

    tabSide.onclick = () => {
      this.currentSubTab = "side_by_side";
      tabSide.classList.add('bg-indigo-600', 'text-white');
      tabSide.classList.remove('text-slate-400');
      tabScanner.classList.remove('bg-indigo-600', 'text-white');
      tabScanner.classList.add('text-slate-400');
      viewSide.classList.remove('hidden');
      viewScanner.classList.add('hidden');
    };

    tabScanner.onclick = () => {
      this.currentSubTab = "drive_scanner";
      tabScanner.classList.add('bg-indigo-600', 'text-white');
      tabScanner.classList.remove('text-slate-400');
      tabSide.classList.remove('bg-indigo-600', 'text-white');
      tabSide.classList.add('text-slate-400');
      viewScanner.classList.remove('hidden');
      viewSide.classList.add('hidden');
      this.loadDriveDuplicates();
    };

    document.getElementById('cmp-btn-run').onclick = () => {
      this.leftPath = document.getElementById('cmp-left-path').value.trim();
      this.rightPath = document.getElementById('cmp-right-path').value.trim();
      const verifyFullHash = document.getElementById('cmp-cb-fullhash').checked;
      this.runComparison(this.leftPath, this.rightPath, verifyFullHash);
    };

    document.getElementById('cmp-btn-rescan-drive').onclick = () => {
      this.loadDriveDuplicates(true);
    };
  }

  openLeftExplorer() {
    const p = document.getElementById('cmp-left-path').value.trim();
    if (p) openInExplorer(p);
  }

  openRightExplorer() {
    const p = document.getElementById('cmp-right-path').value.trim();
    if (p) openInExplorer(p);
  }

  async runComparison(leftPath, rightPath, verifyFullHash = false) {
    const content = document.getElementById('cmp-diff-content');
    content.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-slate-400">
        <svg class="animate-spin h-8 w-8 text-indigo-500 mb-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span class="text-sm font-semibold">Comparando archivos e integridad de contenido...</span>
      </div>
    `;

    try {
      const res = await fetch('/api/compare/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_path: leftPath,
          right_path: rightPath,
          verify_full_hash: verifyFullHash
        })
      });
      this.compData = await res.json();
      this.renderComparisonResults();
    } catch (e) {
      showToast("Error en comparación: " + e.message, "error");
      content.innerHTML = `<div class="p-6 text-red-400 text-center">Error al comparar carpetas.</div>`;
    }
  }

  renderComparisonResults() {
    const data = this.compData;
    if (!data || data.error) {
      document.getElementById('cmp-diff-content').innerHTML = `
        <div class="p-8 text-center text-red-400 bg-red-950/20 border border-red-500/30 rounded-xl">
          ${data ? data.error : 'Error desconocido'}
        </div>
      `;
      return;
    }

    // Render Summary Banner
    const banner = document.getElementById('cmp-summary-banner');
    banner.classList.remove('hidden');

    const sim = data.similarity_percent;
    const isExact = data.is_exact_folder_duplicate;
    const counts = data.counts;

    banner.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
          isExact ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : (sim >= 80 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-300')
        }">
          ${sim}%
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">
            ${isExact ? '✅ Carpetas 100% Idénticas (Duplicado Exacto)' : (data.is_near_duplicate ? '⚠️ Carpetas Casi Idénticas (Casi Duplicado)' : 'Carpetas Parcialmente Similares')}
          </h4>
          <span class="text-[11px] text-slate-400">
            ${counts.identical} idénticos • ${counts.same_name_size_diff_content} colisiones mismo peso/distinto contenido • ${counts.modified} modificados • ${counts.left_only} solo izq • ${counts.right_only} solo der
          </span>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button onclick="window.comparatorInstance.markRightAsDuplicate()" class="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold flex items-center space-x-1">
          <i data-lucide="tag" class="w-3.5 h-3.5"></i>
          <span>Marcar Derecha como Duplicado</span>
        </button>
      </div>
    `;

    // Render Filter Pills
    const pillsContainer = document.getElementById('cmp-filter-pills');
    pillsContainer.innerHTML = `
      <button onclick="window.comparatorInstance.setFilter('all')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}">
        Todos (${counts.total_files})
      </button>
      <button onclick="window.comparatorInstance.setFilter('identical')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'identical' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-white'}">
        Idénticos (${counts.identical})
      </button>
      <button onclick="window.comparatorInstance.setFilter('same_name_size_diff_content')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'same_name_size_diff_content' ? 'bg-amber-600 text-white' : 'text-amber-400 hover:text-white'}">
        Mismo Peso / Distinto Hash (${counts.same_name_size_diff_content})
      </button>
      <button onclick="window.comparatorInstance.setFilter('modified')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'modified' ? 'bg-red-600 text-white' : 'text-red-400 hover:text-white'}">
        Modificados (${counts.modified})
      </button>
      <button onclick="window.comparatorInstance.setFilter('diff_name')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'diff_name' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:text-white'}">
        Renombrados (${counts.same_content_diff_name})
      </button>
      <button onclick="window.comparatorInstance.setFilter('sides')" class="px-2 py-0.5 rounded text-[11px] font-semibold ${this.activeFilter === 'sides' ? 'bg-sky-600 text-white' : 'text-sky-400 hover:text-white'}">
        Únicos (${counts.left_only + counts.right_only})
      </button>
    `;

    // Combine list according to filter
    let rows = [];
    const res = data.results;
    if (this.activeFilter === 'all') {
      rows = [
        ...res.same_name_size_diff_content,
        ...res.modified,
        ...res.same_content_diff_name,
        ...res.left_only,
        ...res.right_only,
        ...res.identical
      ];
    } else if (this.activeFilter === 'identical') {
      rows = res.identical;
    } else if (this.activeFilter === 'same_name_size_diff_content') {
      rows = res.same_name_size_diff_content;
    } else if (this.activeFilter === 'modified') {
      rows = res.modified;
    } else if (this.activeFilter === 'diff_name') {
      rows = res.same_content_diff_name;
    } else if (this.activeFilter === 'sides') {
      rows = [...res.left_only, ...res.right_only];
    }

    const content = document.getElementById('cmp-diff-content');
    if (rows.length === 0) {
      content.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">No hay elementos en esta categoría.</div>`;
      return;
    }

    content.innerHTML = `
      <div class="glass rounded-xl overflow-hidden border border-slate-800">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-900/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-2.5 w-5/12">Izquierda (Base)</th>
              <th class="p-2.5 w-2/12 text-center">Estado / Comparación</th>
              <th class="p-2.5 w-5/12">Derecha (Copia)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 font-mono text-[11px]">
            ${rows.map(item => this.renderDiffRow(item)).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  }

  renderDiffRow(item) {
    const st = item.status;
    let badgeClass = 'bg-slate-800 text-slate-300';
    let icon = '===';
    let label = item.status_label;

    if (st === 'identical') {
      badgeClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      icon = '===';
    } else if (st === 'same_name_size_diff_content') {
      badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      icon = '⚠️ ≠';
    } else if (st === 'modified') {
      badgeClass = 'bg-red-500/20 text-red-400 border border-red-500/30';
      icon = '≠';
    } else if (st === 'left_only') {
      badgeClass = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
      icon = '←';
    } else if (st === 'right_only') {
      badgeClass = 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
      icon = '→';
    } else if (st === 'same_content_diff_name') {
      badgeClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      icon = '⇄';
    }

    const lf = item.left;
    const rf = item.right;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <!-- Left Side -->
        <td class="p-2.5 ${lf ? 'text-slate-200' : 'text-slate-600 italic'}">
          ${lf ? `
            <div class="flex items-center space-x-1.5 min-w-0">
              <i data-lucide="file" class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"></i>
              <span class="truncate font-sans font-medium" title="${lf.rel_path}">${lf.rel_path}</span>
            </div>
            <div class="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span>${formatBytes(lf.size)}</span>
              <span>•</span>
              <span>${formatDate(lf.mtime)}</span>
            </div>
          ` : '<span class="text-slate-600">— No existe en izquierda —</span>'}
        </td>

        <!-- Center Match Badge -->
        <td class="p-2.5 text-center">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">
            <span class="mr-1">${icon}</span>
            <span>${label}</span>
          </span>
        </td>

        <!-- Right Side -->
        <td class="p-2.5 ${rf ? 'text-slate-200' : 'text-slate-600 italic'}">
          ${rf ? `
            <div class="flex items-center space-x-1.5 min-w-0">
              <i data-lucide="file" class="w-3.5 h-3.5 text-sky-400 flex-shrink-0"></i>
              <span class="truncate font-sans font-medium" title="${rf.rel_path}">${rf.rel_path}</span>
            </div>
            <div class="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span>${formatBytes(rf.size)}</span>
              <span>•</span>
              <span>${formatDate(rf.mtime)}</span>
            </div>
          ` : '<span class="text-slate-600">— No existe en derecha —</span>'}
        </td>
      </tr>
    `;
  }

  setFilter(f) {
    this.activeFilter = f;
    this.renderComparisonResults();
  }

  async markRightAsDuplicate() {
    const rightP = document.getElementById('cmp-right-path').value.trim();
    if (!rightP) return;

    try {
      const res = await fetch('/api/compare/mark-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: rightP, item_type: 'folder' })
      });
      const data = await res.json();
      showToast(`Marcada como Duplicado: ${rightP}`, "success");
      fetchDriveInfo();
    } catch (e) {
      showToast("Error al marcar duplicado: " + e.message, "error");
    }
  }

  async loadDriveDuplicates(force = false) {
    const container = document.getElementById('cmp-drive-dupes-list');
    if (!container) return;
    container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs font-mono">Buscando duplicados en el disco...</div>`;

    try {
      const res = await fetch('/api/compare/drive-duplicates?root=E:\\');
      this.driveDuplicatesData = await res.json();
      this.renderDriveDuplicates();
    } catch (e) {
      container.innerHTML = `<div class="p-6 text-red-400 text-center text-xs">Error al cargar duplicados de disco.</div>`;
    }
  }

  renderDriveDuplicates() {
    const container = document.getElementById('cmp-drive-dupes-list');
    const data = this.driveDuplicatesData;
    if (!data || !container) return;

    const exacts = data.exact_duplicate_folders || [];
    const nears = data.near_duplicate_folders || [];

    if (exacts.length === 0 && nears.length === 0) {
      container.innerHTML = `
        <div class="p-10 text-center text-slate-500 text-xs">
          No se encontraron duplicados evidentes en el disco.
        </div>
      `;
      return;
    }

    let html = '';

    // Exact Duplicates
    if (exacts.length > 0) {
      html += `
        <div class="mb-5">
          <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Carpetas 100% Idénticas (${exacts.length})</span>
          </h4>
          <div class="space-y-2">
            ${exacts.map(item => `
              <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                <div class="min-w-0 pr-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">100% Match</span>
                    <h5 class="text-xs font-bold text-white truncate">${item.name}</h5>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-1 space-y-0.5">
                    <div>Original: <span class="text-slate-300">${item.folder_a}</span></div>
                    <div>Copia Duplicada: <span class="text-red-300">${item.folder_b}</span></div>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  <button onclick="window.comparatorInstance.setPairAndCompare('${item.folder_a.replace(/\\/g, '\\\\')}', '${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1">
                    <i data-lucide="git-compare" class="w-3.5 h-3.5"></i>
                    <span>Comparar</span>
                  </button>
                  <button onclick="window.comparatorInstance.markDuplicate('${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold">
                    Etiquetar Duplicado
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Near Duplicates
    if (nears.length > 0) {
      html += `
        <div>
          <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
            <span>Carpetas Casi Idénticas / Variantes (${nears.length})</span>
          </h4>
          <div class="space-y-2">
            ${nears.map(item => `
              <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                <div class="min-w-0 pr-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">${item.similarity}% Similar</span>
                    <h5 class="text-xs font-bold text-white truncate">${item.name}</h5>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-1 space-y-0.5">
                    <div>Original: <span class="text-slate-300">${item.folder_a}</span></div>
                    <div>Variante: <span class="text-amber-300">${item.folder_b}</span></div>
                    <div class="text-[9px] text-slate-500">${item.identical_count} archivos iguales • ${item.diff_count} con cambios</div>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  <button onclick="window.comparatorInstance.setPairAndCompare('${item.folder_a.replace(/\\/g, '\\\\')}', '${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1">
                    <i data-lucide="git-compare" class="w-3.5 h-3.5"></i>
                    <span>Ver Diferencias</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  setPairAndCompare(left, right) {
    document.getElementById('cmp-left-path').value = left;
    document.getElementById('cmp-right-path').value = right;
    document.getElementById('cmp-tab-side').click();
    this.runComparison(left, right);
  }

  async markDuplicate(path) {
    try {
      await fetch('/api/compare/mark-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, item_type: 'folder' })
      });
      showToast(`Marcado como Duplicado`, 'success');
      fetchDriveInfo();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }
}

window.FolderComparator = FolderComparator;
