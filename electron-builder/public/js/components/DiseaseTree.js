/**
 * DiseaseTree — sidebar disease category browser.
 *
 * Renders the disease catalog (from store.diseaseCategories) as collapsible <details> groups with
 * color-coded headers.  Clicking a disease selects it in the store; generation is triggered
 * manually via the "🔄 重新生成" button in EmrPreview.
 *
 * Usage:
 *   import { DiseaseTree } from './components/DiseaseTree.js';
 *   const tree = new DiseaseTree(document.getElementById('diseaseTree'));
 *   await tree.render();
 */
import { store } from "../store.js";
import { db } from "../db.js";

export class DiseaseTree {
  constructor(containerEl) {
    this.el = containerEl;
    this._unsub = [];
    this._searchHandler = null;
    this._subscriptionsBound = false;
  }

  /**
   * Full render — rebuilds the tree from store.diseaseCategories.
   * Call once on app boot.
   */
  async render() {
    this.el.innerHTML = "";

    const categories = store.state.diseaseCategories || [];
    const currentDisease = store.state.currentDisease;
    const query = (store.state.searchQuery || "").toLowerCase();

    for (const cat of categories) {
      const filtered = query
        ? cat.diseases.filter((d) => d.name.toLowerCase().includes(query))
        : cat.diseases;

      // Skip empty categories when searching
      if (query && filtered.length === 0) continue;

      const details = document.createElement("details");
      details.className = "disease-category";

      // Keep open if active or searching
      if (query || filtered.some((d) => d.name === currentDisease)) {
        details.open = true;
      }

      // ── Summary ──
      const summary = document.createElement("summary");
      summary.style.backgroundColor = cat.color || "#f5f5f5";
      summary.style.color = cat.textColor || "#333";
      summary.style.borderLeft = `4px solid ${cat.textColor || "#999"}`;
      summary.textContent = `${cat.icon || ""} ${cat.name}`.trim();
      details.appendChild(summary);

      // ── Disease list ──
      const ul = document.createElement("ul");
      ul.className = "disease-list";

      for (const disease of filtered) {
        const li = document.createElement("li");
        li.className = "disease-item";
        li.dataset.diseaseName = disease.name;
        if (disease.name === currentDisease) {
          li.classList.add("active");
        }

        // Highlight matching portion when searching
        if (query) {
          const idx = disease.name.toLowerCase().indexOf(query);
          if (idx !== -1) {
            const before = disease.name.slice(0, idx);
            const match = disease.name.slice(idx, idx + query.length);
            const after = disease.name.slice(idx + query.length);
            li.innerHTML = `${before}<mark>${match}</mark>${after}`;
          } else {
            li.textContent = disease.name;
          }
        } else {
          li.textContent = disease.name;
        }

        li.addEventListener("click", () => this._onDiseaseClick(disease.name));
        ul.appendChild(li);
      }

      details.appendChild(ul);
      this.el.appendChild(details);
    }

    // ── Subscriptions ──
    // render() may run repeatedly during search; bind store subscriptions once.
    if (!this._subscriptionsBound) {
      this._unsub.push(
        store.subscribe("currentDisease", () => this._updateActiveClass()),
      );

      this._unsub.push(
        store.subscribe("searchQuery", () => {
          // Re-render when search changes (the tree structure changes)
          this.render();
        }),
      );

      this._unsub.push(
        store.subscribe("diseaseCategories", () => {
          // Re-render when the catalog is loaded or updated externally
          this.render();
        }),
      );

      this._subscriptionsBound = true;
    }

    // ── Search input listener ──
    const searchInput = document.getElementById("diseaseSearch");
    if (searchInput) {
      // Remove previous handler if re-rendering
      if (this._searchHandler) {
        searchInput.removeEventListener("input", this._searchHandler);
      }
      this._searchHandler = (e) => {
        store.setState({ searchQuery: e.target.value });
      };
      searchInput.addEventListener("input", this._searchHandler);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Disease click handler
  // ────────────────────────────────────────────────────────────────

  _onDiseaseClick(diseaseName) {
    if (store.state.loading) return;
    if (diseaseName === store.state.currentDisease) return;

    store.clearAllTypeData();
    store.setState({
      currentDisease: diseaseName,
      error: null,
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  Active class management
  // ────────────────────────────────────────────────────────────────

  _updateActiveClass() {
    const current = store.state.currentDisease;
    const items = this.el.querySelectorAll(".disease-item");
    for (const item of items) {
      item.classList.toggle("active", item.dataset.diseaseName === current);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Cleanup
  // ────────────────────────────────────────────────────────────────

  destroy() {
    this._unsub.forEach((fn) => fn());
    this._unsub = [];
    this._subscriptionsBound = false;

    const searchInput = document.getElementById("diseaseSearch");
    if (searchInput && this._searchHandler) {
      searchInput.removeEventListener("input", this._searchHandler);
      this._searchHandler = null;
    }

    this.el.innerHTML = "";
  }
}
