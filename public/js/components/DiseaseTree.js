/**
 * DiseaseTree — sidebar disease category browser.
 *
 * Renders the disease catalog (from store.diseaseCategories) as collapsible <details> groups with
 * color-coded headers.  Clicking a disease triggers EMR generation
 * via api.generateRecord() and api.getTemplate().
 *
 * Usage:
 *   import { DiseaseTree } from './components/DiseaseTree.js';
 *   const tree = new DiseaseTree(document.getElementById('diseaseTree'));
 *   await tree.render();
 */
import { store } from "../store.js";
import * as api from "../services/api.js";
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

  async _onDiseaseClick(diseaseName) {
    if (store.state.loading) return;
    if (diseaseName === store.state.currentDisease) return;

    const patient = store.state.currentPatient;
    const patientInfo = patient
      ? {
          name: patient.name || "",
          gender: patient.gender || "",
          age: patient.age || "",
          bedNo: patient.bedNo || "",
        }
      : {};

    // 1. Set loading state & select disease
    store.clearAllTypeData();
    store.setState({
      currentDisease: diseaseName,
      loading: true,
      loadingLabel: "生成病历中...",
      error: null,
    });

    // 2. Check if offline mode
    const isOffline = localStorage.getItem('activeModelId') === '__offline__';

    // 3. Create placeholder message (only for online mode)
    if (!isOffline) {
      const aiMsg = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        streaming: true,
      };
      store.setState({
        chatMessages: [...store.state.chatMessages, aiMsg],
      });
    }

    let fullContent = "";

    try {
      if (isOffline) {
        // 4a. Offline mode: use unified generateRecord + getTemplate (A4).
        // Previously called 7 separate generate* functions + 6 get*Template
        // functions; now uses the unified API surface.
        const result = await api.generateRecord('firstCourse', { disease: diseaseName, patientInfo });

        // Parse EMR
        const emr = result.emr;
        const parseError = result.parseError || false;

        // Fetch the 6 dependent templates via unified getTemplate()
        // (attending/chief/preop/discussion/surgery/discharge). These are
        // offline disease templates used to pre-fill those record slots.
        const templateKeys = [
          ['attendingRound', 'attending', 'attendingData'],
          ['chiefRound', 'chief', 'chiefData'],
          ['preop', 'preop', 'preopData'],
          ['discussion', 'discussion', 'discussionData'],
          ['surgery', 'surgery', 'surgeryData'],
          ['discharge', 'discharge', 'dischargeData'],
        ];
        for (const [typeId, templateKey, storeKey] of templateKeys) {
          try {
            const r = await api.getTemplate(templateKey, diseaseName);
            if (r.template) store.setTypeData(typeId, r.template);
          } catch (e) {
            console.warn(`Failed to fetch ${templateKey} template:`, e);
          }
        }

        // Write firstCourse EMR via setTypeData (stamps _patientId for A6)
        store.setTypeData('firstCourse', emr);

        store.setState({
          loading: false,
          loadingLabel: "",
          error: null,
        });

        if (parseError) {
          store.toast("error", "AI 返回格式异常，请重试");
        }
      } else {
        // 4b. Online mode: use streaming API
        await api.generateEMRStream(diseaseName, patientInfo, (chunk) => {
          fullContent += chunk;
          // Update streaming message
          const msgs = [...store.state.chatMessages];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant" && last.streaming) {
            last.content = fullContent;
            store.setState({ chatMessages: msgs });
          }
        });

        // Parse EMR from accumulated content
        let emr = null;
        let parseError = false;

        try {
          const match = fullContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (match) {
            emr = JSON.parse(match[1].trim());
          } else {
            const cleaned = fullContent
              .replace(/```(?:json)?\s*/gi, "")
              .replace(/```\s*$/g, "")
              .trim();
            emr = JSON.parse(cleaned);
          }
        } catch {
          parseError = true;
        }

        // Update EMR data via setTypeData (stamps _patientId for A6)
        store.setTypeData('firstCourse', emr);
        store.setState({
          loading: false,
          loadingLabel: "",
          error: null,
        });

        if (parseError) {
          store.toast("error", "AI 返回格式异常，请重试");
        }

        // Finalize chat message
        const msgs = [...store.state.chatMessages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          delete last.streaming;
          last.content = fullContent || `已为「${diseaseName}」生成病历，请查看右侧预览。`;
          store.setState({ chatMessages: msgs });
        }
      }
    } catch (err) {
      // 5. Error handling
      const msgs = [...store.state.chatMessages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        if (!last.content) {
          msgs.pop();
        } else if (last.streaming) {
          delete last.streaming;
        }
      }
      store.setState({
        chatMessages: msgs,
        error: err.message,
        loading: false,
        loadingLabel: "",
      });
      store.toast("error", err.message);
    }
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
