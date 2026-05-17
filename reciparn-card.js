class ReciparnCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._recipes = [];
    this._selected = null;
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
    } catch (e) {
      this._status = `Error: ${e.message}`;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _addToShoppingList() {
    if (!this._selected?.ingredients || this._adding) return;
    this._adding = true;
    this._status = "Adding ingredients…";
    this._render();
    try {
      for (const ingredient of this._selected.ingredients) {
        await this._hass.callService("shopping_list", "add_item", { name: ingredient });
      }
      this._status = `✓ Added ${this._selected.ingredients.length} items to shopping list`;
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
        .header-icon { font-size: 18px; }
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
          justify-content: space-between;
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
          flex-shrink: 0;
        }
        .chevron { color: var(--secondary-text-color); font-size: 12px; flex-shrink: 0; }
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
        <div class="header">
          <span class="header-icon">🍳</span> Reciparn
        </div>
        <div class="search-wrap">
          <input id="search" type="text" placeholder="Search recipes…" value="${this._esc(this._search)}">
        </div>
        <div class="list">
          ${this._loading
            ? `<div class="loading">Loading recipes…</div>`
            : filtered.length === 0
              ? `<div class="empty">${this._recipes.length === 0 ? "No recipes found" : "No results for “" + this._esc(this._search) + "”"}</div>`
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
          display: flex;
          align-items: center;
        }
        .recipe-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--primary-text-color);
          flex: 1;
        }
        .ingredient-count {
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        .ingredients { padding: 4px 0; max-height: 340px; overflow-y: auto; }
        .ingredient {
          padding: 10px 16px;
          border-bottom: 1px solid var(--divider-color);
          font-size: 14px;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ingredient:last-child { border-bottom: none; }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--primary-color);
          flex-shrink: 0;
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
          <span class="ingredient-count">${ingredients?.length ?? 0} items</span>
        </div>
        <div class="ingredients">
          ${(ingredients ?? []).map((i) => `
            <div class="ingredient">
              <span class="dot"></span>
              ${this._esc(i)}
            </div>
          `).join("")}
        </div>
        <div class="actions">
          <button class="add-btn" id="add-btn" ${this._adding ? "disabled" : ""}>
            ${this._adding
              ? "Adding…"
              : `Add all ${ingredients?.length ?? 0} ingredients to shopping list`}
          </button>
          ${this._status ? `<div class="status">${this._esc(this._status)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _attachListeners() {
    const root = this.shadowRoot;

    const searchEl = root.getElementById("search");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        this._search = e.target.value;
        this._renderList();
        this._attachListeners();
        root.getElementById("search")?.focus();
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
