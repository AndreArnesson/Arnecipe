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
      // Check all ingredients by default
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
        :host { display: block; }
        .card {
          background: var(--card-background-color);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
          box-shadow: var(--ha-card-box-shadow, none);
          border: 1px solid var(--divider-color, transparent);
        }
        .header {
          padding: 16px 16px 10px;
          font-size: 16px;
          font-weight: 500;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .search-wrap { padding: 0 12px 10px; }
        input[type="text"] {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 12px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font-size: 14px;
          outline: none;
          font-family: inherit;
        }
        input[type="text"]:focus { border-color: var(--primary-color); }
        .list { max-height: 380px; overflow-y: auto; }
        .recipe-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          border-top: 1px solid var(--divider-color);
          gap: 8px;
        }
        .recipe-item:hover { background: var(--secondary-background-color); }
        .recipe-item:active { opacity: 0.7; }
        .recipe-title { font-size: 14px; color: var(--primary-text-color); flex: 1; }
        .recipe-category {
          font-size: 11px;
          color: var(--secondary-text-color);
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          padding: 2px 6px;
          white-space: nowrap;
        }
        .chevron { color: var(--secondary-text-color); font-size: 12px; }
        .empty, .loading {
          padding: 28px 16px;
          text-align: center;
          color: var(--secondary-text-color);
          font-size: 14px;
        }
        .footer-bar {
          padding: 8px 16px;
          border-top: 1px solid var(--divider-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-count { font-size: 12px; color: var(--secondary-text-color); }
        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--primary-color);
          font-size: 13px;
          padding: 4px 0;
        }
        .status-bar {
          padding: 8px 16px;
          font-size: 12px;
          color: var(--error-color, #c00);
          border-top: 1px solid var(--divider-color);
        }
      </style>
      <div class="card">
        <div class="header">🍳 Reciparn</div>
        <div class="search-wrap">
          <input id="search" type="text" placeholder="Search recipes…" value="${this._esc(this._search)}">
        </div>
        <div class="list">
          ${this._loading
            ? `<div class="loading">Loading recipes…</div>`
            : filtered.length === 0
              ? `<div class="empty">${this._recipes.length === 0 ? "No recipes found" : `No results for "${this._esc(this._search)}"`}</div>`
              : filtered.map((r) => `
                <div class="recipe-item" data-id="${this._esc(r.id)}">
                  <span class="recipe-title">${this._esc(r.title)}</span>
                  ${r.category ? `<span class="recipe-category">${this._esc(r.category)}</span>` : ""}
                  <span class="chevron">›</span>
                </div>
              `).join("")
          }
        </div>
        ${this._status
          ? `<div class="status-bar">${this._esc(this._status)}</div>`
          : !this._loading
            ? `<div class="footer-bar">
                <span class="footer-count">${filtered.length} recipe${filtered.length !== 1 ? "s" : ""}</span>
                <button class="refresh-btn" id="refresh-btn">Refresh</button>
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

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: var(--card-background-color);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
          box-shadow: var(--ha-card-box-shadow, none);
          border: 1px solid var(--divider-color, transparent);
        }
        .header {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid var(--divider-color);
        }
        .back-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--primary-color);
          font-size: 22px;
          padding: 0 4px 0 0;
          line-height: 1;
        }
        .recipe-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--primary-text-color);
          flex: 1;
        }
        .select-bar {
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
        }
        .select-label {
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        .select-all-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--primary-color);
          font-size: 12px;
          padding: 0;
          font-family: inherit;
        }
        .ingredients { max-height: 320px; overflow-y: auto; }
        .ingredient {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--divider-color);
          cursor: pointer;
        }
        .ingredient:last-child { border-bottom: none; }
        .ingredient:hover { background: var(--secondary-background-color); }
        .ingredient input[type="checkbox"] {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          cursor: pointer;
          accent-color: var(--primary-color);
        }
        .ingredient-text {
          font-size: 14px;
          color: var(--primary-text-color);
          flex: 1;
        }
        .ingredient.unchecked .ingredient-text {
          color: var(--secondary-text-color);
          text-decoration: line-through;
        }
        .actions { padding: 12px 16px; border-top: 1px solid var(--divider-color); }
        .add-btn {
          width: 100%;
          padding: 11px;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: opacity 0.15s;
        }
        .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .status {
          margin-top: 8px;
          font-size: 12px;
          text-align: center;
          color: ${isError ? "var(--error-color, #c00)" : "var(--primary-color)"};
        }
      </style>
      <div class="card">
        <div class="header">
          <button class="back-btn" id="back-btn">&#8592;</button>
          <span class="recipe-title">${this._esc(title)}</span>
        </div>
        <div class="select-bar">
          <span class="select-label">${checkedCount} of ${total} selected</span>
          <button class="select-all-btn" id="select-all-btn">
            ${allChecked ? "Deselect all" : "Select all"}
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
              ? "Adding…"
              : checkedCount === 0
                ? "No ingredients selected"
                : `Add ${checkedCount} ingredient${checkedCount !== 1 ? "s" : ""} to shopping list`}
          </button>
          ${this._status ? `<div class="status">${this._esc(this._status)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _updateListContent() {
    const root = this.shadowRoot;
    const listEl = root.querySelector(".list");
    const footerEl = root.querySelector(".footer-bar");
    const statusEl = root.querySelector(".status-bar");
    if (!listEl) return;

    const filtered = this._getFiltered();

    listEl.innerHTML = filtered.length === 0
      ? `<div class="empty">${this._recipes.length === 0 ? "No recipes found" : `No results for "${this._esc(this._search)}"`}</div>`
      : filtered.map((r) => `
          <div class="recipe-item" data-id="${this._esc(r.id)}">
            <span class="recipe-title">${this._esc(r.title)}</span>
            ${r.category ? `<span class="recipe-category">${this._esc(r.category)}</span>` : ""}
            <span class="chevron">›</span>
          </div>
        `).join("");

    listEl.querySelectorAll(".recipe-item").forEach((el) => {
      el.addEventListener("click", () => this._selectRecipe(el.dataset.id));
    });

    if (footerEl) {
      footerEl.querySelector(".footer-count").textContent =
        `${filtered.length} recipe${filtered.length !== 1 ? "s" : ""}`;
    }
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
        ? "Adding…"
        : checkedCount === 0
          ? "No ingredients selected"
          : `Add ${checkedCount} ingredient${checkedCount !== 1 ? "s" : ""} to shopping list`;
    }

    const selectLabel = root.querySelector(".select-label");
    if (selectLabel) selectLabel.textContent = `${checkedCount} of ${total} selected`;

    const selectAllBtn = root.getElementById("select-all-btn");
    if (selectAllBtn) selectAllBtn.textContent = allChecked ? "Deselect all" : "Select all";

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

    // Ingredient checkboxes — update state without re-rendering
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

    // Select / deselect all
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
