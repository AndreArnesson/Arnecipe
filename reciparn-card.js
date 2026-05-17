class ReciparnCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._recipes = [];
    this._selected = null;
    this._checkedIngredients = new Set();
    this._search = "";
    this._loading = false;
    this._status = "";
    this._adding = false;
    this._config = null;
    this._hass = null;
  }

  setConfig(config) {
    if (!config.function_url) throw new Error("reciparn-card: function_url is required");
    if (!config.ha_secret) throw new Error("reciparn-card: ha_secret is required");
    this._config = config;
    this._render();
    this._fetchRecipes();
  }

  set hass(hass) {
    this._hass = hass;
  }

  async _call(body) {
    const res = await fetch(this._config.function_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ha-secret": this._config.ha_secret,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  async _fetchRecipes() {
    this._loading = true;
    this._status = "";
    this._render();
    try {
      const data = await this._call({ action: "list" });
      this._recipes = Array.isArray(data) ? data : [];
    } catch (e) {
      this._status = `Error: ${e.message}`;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _selectRecipe(id) {
    this._loading = true;
    this._status = "";
    this._render();
    try {
      const data = await this._call({ action: "get", recipe_id: id });
      this._selected = data;
      this._checkedIngredients = new Set((data.ingredients ?? []).map((_, i) => i));
    } catch (e) {
      this._status = `Error: ${e.message}`;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _addToShoppingList() {
    if (!this._selected?.ingredients || this._adding) return;
    const toAdd = this._selected.ingredients.filter((_, i) => this._checkedIngredients.has(i));
    if (toAdd.length === 0) return;
    this._adding = true;
    this._status = "Adding ingredients…";
    this._render();
    try {
      for (const ingredient of toAdd) {
        await this._hass.callService("shopping_list", "add_item", { name: ingredient });
      }
      this._status = `✓ Added ${toAdd.length} item${toAdd.length !== 1 ? "s" : ""} to shopping list`;
    } catch (e) {
      this._status = `Error: ${e.message}`;
    } finally {
      this._adding = false;
      this._render();
    }
  }

  _getFiltered() {
    if (!this._search) return this._recipes;
    const q = this._search.toLowerCase();
    return this._recipes.filter((r) => r.title.toLowerCase().includes(q));
  }

  _esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _categoryColor(category) {
    const map = {
      "Förrätt": "#7c9eb2",
      "Huvudrätt": "#c05a2c",
      "Efterrätt": "#a06080",
      "Bakning": "#b8860b",
      "Sallad": "#5a8a5a",
      "Soppa": "#7b6fa0",
      "Frukost": "#e09040",
      "Mellanmål": "#c08050",
      "Dryck": "#4a90a4",
      "Övrigt": "#888",
    };
    return map[category] || "#888";
  }

  _render() {
    if (this._selected && !this._loading) {
      this._renderDetail();
    } else {
      this._renderList();
    }
    this._attachListeners();
  }

  _renderList() {
    const filtered = this._getFiltered();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        * { box-sizing: border-box; }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
        }
        .header {
          background: linear-gradient(135deg, #c05a2c 0%, #e07840 100%);
          padding: 18px 16px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .header-icon { font-size: 24px; }
        .header-title {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.3px;
        }
        .header-count {
          margin-left: auto;
          font-size: 12px;
          color: rgba(255,255,255,0.75);
          background: rgba(0,0,0,0.15);
          padding: 2px 8px;
          border-radius: 10px;
        }
        .search-wrap { padding: 12px 12px 8px; }
        input[type="text"] {
          width: 100%;
          padding: 9px 12px 9px 36px;
          border: 1.5px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          background: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color, #212121);
          font-size: 14px;
          outline: none;
          font-family: inherit;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: 10px center;
        }
        input[type="text"]:focus { border-color: #c05a2c; }
        .list { max-height: 380px; overflow-y: auto; }
        .recipe-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          border-top: 1px solid var(--divider-color, #f0f0f0);
          gap: 10px;
          transition: background 0.15s;
        }
        .recipe-item:hover { background: rgba(192,90,44,0.06); }
        .recipe-item:active { background: rgba(192,90,44,0.12); }
        .recipe-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .recipe-title { font-size: 14px; color: var(--primary-text-color, #212121); flex: 1; font-weight: 500; }
        .recipe-category {
          font-size: 11px;
          color: #fff;
          border-radius: 4px;
          padding: 2px 7px;
          white-space: nowrap;
          font-weight: 500;
        }
        .chevron { color: #bbb; font-size: 14px; }
        .empty, .loading {
          padding: 32px 16px;
          text-align: center;
          color: var(--secondary-text-color, #888);
          font-size: 14px;
        }
        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid #e0e0e0;
          border-top-color: #c05a2c;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          margin-bottom: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .footer-bar {
          padding: 8px 16px;
          border-top: 1px solid var(--divider-color, #f0f0f0);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--secondary-background-color, #fafafa);
        }
        .footer-count { font-size: 12px; color: var(--secondary-text-color, #888); }
        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #c05a2c;
          font-size: 12px;
          padding: 4px 0;
          font-family: inherit;
        }
        .status-bar {
          padding: 10px 16px;
          font-size: 12px;
          color: #c00;
          border-top: 1px solid var(--divider-color, #f0f0f0);
          background: #fff5f5;
        }
      </style>
      <div class="card">
        <div class="header">
          <span class="header-icon">🍳</span>
          <span class="header-title">Reciparn</span>
          ${!this._loading ? `<span class="header-count">${this._recipes.length} recept</span>` : ""}
        </div>
        <div class="search-wrap">
          <input id="search" type="text" placeholder="Sök recept…" value="${this._esc(this._search)}">
        </div>
        <div class="list">
          ${this._loading
            ? `<div class="loading"><div class="loading-spinner"></div><br>Laddar recept…</div>`
            : filtered.length === 0
              ? `<div class="empty">${this._recipes.length === 0 ? "Inga recept hittades" : `Inga resultat för "${this._esc(this._search)}"`}</div>`
              : filtered.map((r) => `
                <div class="recipe-item" data-id="${this._esc(r.id)}">
                  <span class="recipe-dot" style="background:${this._categoryColor(r.category)}"></span>
                  <span class="recipe-title">${this._esc(r.title)}</span>
                  ${r.category ? `<span class="recipe-category" style="background:${this._categoryColor(r.category)}">${this._esc(r.category)}</span>` : ""}
                  <span class="chevron">›</span>
                </div>
              `).join("")
          }
        </div>
        ${this._status
          ? `<div class="status-bar">⚠ ${this._esc(this._status)}</div>`
          : !this._loading
            ? `<div class="footer-bar">
                <span class="footer-count">${filtered.length} recept${this._search ? " matchar" : ""}</span>
                <button class="refresh-btn" id="refresh-btn">↻ Uppdatera</button>
              </div>`
            : ""
        }
      </div>
    `;
  }

  _renderDetail() {
    const { title, ingredients } = this._selected;
    const checkedCount = this._checkedIngredients.size;
    const total = (ingredients ?? []).length;
    const allChecked = checkedCount === total;
    const isError = this._status.startsWith("Error");
    const isSuccess = this._status.startsWith("✓");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        * { box-sizing: border-box; }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
        }
        .header {
          background: linear-gradient(135deg, #c05a2c 0%, #e07840 100%);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .back-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          cursor: pointer;
          color: #fff;
          font-size: 16px;
          padding: 4px 10px;
          border-radius: 6px;
          line-height: 1.4;
          font-family: inherit;
          transition: background 0.15s;
        }
        .back-btn:hover { background: rgba(255,255,255,0.3); }
        .recipe-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          flex: 1;
        }
        .select-bar {
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fdf5f0;
          border-bottom: 1px solid #f0e0d5;
        }
        .select-label { font-size: 12px; color: #c05a2c; font-weight: 500; }
        .select-all-btn {
          background: none;
          border: 1px solid #c05a2c;
          cursor: pointer;
          color: #c05a2c;
          font-size: 12px;
          padding: 3px 10px;
          border-radius: 5px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .select-all-btn:hover { background: #c05a2c; color: #fff; }
        .ingredients { max-height: 320px; overflow-y: auto; }
        .ingredient {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          border-bottom: 1px solid var(--divider-color, #f0f0f0);
          cursor: pointer;
          transition: background 0.1s;
        }
        .ingredient:last-child { border-bottom: none; }
        .ingredient:hover { background: rgba(192,90,44,0.04); }
        .ingredient.unchecked { opacity: 0.45; }
        .ingredient input[type="checkbox"] {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          cursor: pointer;
          accent-color: #c05a2c;
        }
        .ingredient-text {
          font-size: 14px;
          color: var(--primary-text-color, #212121);
          flex: 1;
          line-height: 1.4;
        }
        .ingredient.unchecked .ingredient-text { text-decoration: line-through; }
        .actions {
          padding: 12px 16px;
          border-top: 1px solid var(--divider-color, #f0f0f0);
          background: var(--secondary-background-color, #fafafa);
        }
        .add-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #c05a2c 0%, #e07840 100%);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: 0.2px;
          transition: opacity 0.15s, transform 0.1s;
          box-shadow: 0 2px 6px rgba(192,90,44,0.35);
        }
        .add-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .add-btn:active:not(:disabled) { transform: translateY(0); }
        .add-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
        .status {
          margin-top: 8px;
          font-size: 12px;
          text-align: center;
          padding: 6px 10px;
          border-radius: 6px;
          font-weight: 500;
          ${isError
            ? "color: #c00; background: #fff5f5;"
            : isSuccess
              ? "color: #2e7d32; background: #f0faf0;"
              : "color: #888; background: transparent;"}
        }
      </style>
      <div class="card">
        <div class="header">
          <button class="back-btn" id="back-btn">← Tillbaka</button>
          <span class="recipe-title">${this._esc(title)}</span>
        </div>
        <div class="select-bar">
          <span class="select-label">🛒 ${checkedCount} av ${total} valda</span>
          <button class="select-all-btn" id="select-all-btn">
            ${allChecked ? "Avmarkera alla" : "Markera alla"}
          </button>
        </div>
        <div class="ingredients">
          ${(ingredients ?? []).map((ingredient, i) => `
            <label class="ingredient ${this._checkedIngredients.has(i) ? "" : "unchecked"}">
              <input type="checkbox" class="ingredient-check" data-index="${i}"
                ${this._checkedIngredients.has(i) ? "checked" : ""}>
              <span class="ingredient-text">${this._esc(ingredient)}</span>
            </label>
          `).join("")}
        </div>
        <div class="actions">
          <button class="add-btn" id="add-btn" ${this._adding || checkedCount === 0 ? "disabled" : ""}>
            ${this._adding
              ? "⏳ Lägger till…"
              : checkedCount === 0
                ? "Välj ingredienser ovan"
                : `🛒 Lägg till ${checkedCount} ingrediens${checkedCount !== 1 ? "er" : ""}`}
          </button>
          ${this._status ? `<div class="status">${this._esc(this._status)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _updateListContent() {
    const root = this.shadowRoot;
    const listEl = root.querySelector(".list");
    if (!listEl) return;

    const filtered = this._getFiltered();

    listEl.innerHTML = filtered.length === 0
      ? `<div class="empty">${this._recipes.length === 0 ? "Inga recept hittades" : `Inga resultat för "${this._esc(this._search)}"`}</div>`
      : filtered.map((r) => `
          <div class="recipe-item" data-id="${this._esc(r.id)}">
            <span class="recipe-dot" style="background:${this._categoryColor(r.category)}"></span>
            <span class="recipe-title">${this._esc(r.title)}</span>
            ${r.category ? `<span class="recipe-category" style="background:${this._categoryColor(r.category)}">${this._esc(r.category)}</span>` : ""}
            <span class="chevron">›</span>
          </div>
        `).join("");

    listEl.querySelectorAll(".recipe-item").forEach((el) => {
      el.addEventListener("click", () => this._selectRecipe(el.dataset.id));
    });

    const countEl = root.querySelector(".footer-count");
    if (countEl) countEl.textContent = `${filtered.length} recept${this._search ? " matchar" : ""}`;
  }

  _updateDetailControls() {
    const root = this.shadowRoot;
    const checkedCount = this._checkedIngredients.size;
    const total = (this._selected?.ingredients ?? []).length;
    const allChecked = checkedCount === total;

    const btn = root.getElementById("add-btn");
    if (btn) {
      btn.disabled = this._adding || checkedCount === 0;
      btn.textContent = this._adding
        ? "⏳ Lägger till…"
        : checkedCount === 0
          ? "Välj ingredienser ovan"
          : `🛒 Lägg till ${checkedCount} ingrediens${checkedCount !== 1 ? "er" : ""}`;
    }

    const selectLabel = root.querySelector(".select-label");
    if (selectLabel) selectLabel.textContent = `🛒 ${checkedCount} av ${total} valda`;

    const selectAllBtn = root.getElementById("select-all-btn");
    if (selectAllBtn) selectAllBtn.textContent = allChecked ? "Avmarkera alla" : "Markera alla";

    root.querySelectorAll(".ingredient").forEach((el, i) => {
      if (this._checkedIngredients.has(i)) {
        el.classList.remove("unchecked");
      } else {
        el.classList.add("unchecked");
      }
    });
  }

  _attachListeners() {
    const root = this.shadowRoot;

    const searchEl = root.getElementById("search");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        this._search = e.target.value;
        this._updateListContent();
      });
    }

    root.querySelectorAll(".recipe-item").forEach((el) => {
      el.addEventListener("click", () => this._selectRecipe(el.dataset.id));
    });

    root.getElementById("back-btn")?.addEventListener("click", () => {
      this._selected = null;
      this._status = "";
      this._render();
    });

    root.querySelectorAll(".ingredient-check").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          this._checkedIngredients.add(idx);
        } else {
          this._checkedIngredients.delete(idx);
        }
        this._updateDetailControls();
      });
    });

    root.getElementById("select-all-btn")?.addEventListener("click", () => {
      const total = (this._selected?.ingredients ?? []).length;
      const allChecked = this._checkedIngredients.size === total;
      if (allChecked) {
        this._checkedIngredients.clear();
        root.querySelectorAll(".ingredient-check").forEach((cb) => (cb.checked = false));
      } else {
        for (let i = 0; i < total; i++) this._checkedIngredients.add(i);
        root.querySelectorAll(".ingredient-check").forEach((cb) => (cb.checked = true));
      }
      this._updateDetailControls();
    });

    root.getElementById("add-btn")?.addEventListener("click", () => {
      this._addToShoppingList();
    });

    root.getElementById("refresh-btn")?.addEventListener("click", () => {
      this._search = "";
      this._fetchRecipes();
    });
  }
}

customElements.define("reciparn-card", ReciparnCard);
