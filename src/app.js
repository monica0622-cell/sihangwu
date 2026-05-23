import {
  brands,
  careTypes,
  categories,
  colors,
  seasons,
  seedGarments,
  seedOutfits,
  statusLabels
} from "./data.js";
import {
  addCareLog,
  createBrand,
  createOutfit,
  createGarment,
  filterGarments,
  getCategory,
  getCareCount,
  getLastCare,
  getCostPerWear,
  getLastWorn,
  getStats,
  getSubcategory,
  getTimelineEvents,
  getWearCount,
  groupBrandsWithCounts,
  listBrandRegistry,
  normalizeBrand,
  parseWardrobeBackup,
  recordOutfitWear,
  recordWear,
  serializeWardrobe,
  sortGarments,
  topEntries,
  validateCareLog,
  validateOutfit,
  validateGarment
} from "./wardrobe.js";

const storageKey = "smart-wardrobe.garments";
const outfitStorageKey = "smart-wardrobe.outfits";
const customBrandStorageKey = "smart-wardrobe.customBrands";
const deviceStorageKey = "smart-wardrobe.deviceId";
const authTokenStorageKey = "smart-wardrobe.authToken";
const app = document.querySelector("#app");
const androidApkUrl = "https://github.com/monica0622-cell/sihangwu/releases/download/android-debug/WingedWardrobe-debug.apk";
const webAppUrl = "http://106.53.188.85/";
const illustrations = {
  wardrobe: "./assets/illustrations/wardrobe-vignette.png",
  brands: "./assets/illustrations/brand-index.png",
  data: "./assets/illustrations/data-archive.png",
  categories: "./assets/illustrations/category-board.png"
};

const state = {
  garments: loadGarments(),
  outfits: loadOutfits(),
  customBrands: loadCustomBrands(),
  filters: {
    query: "",
    brandId: "",
    categoryLevel1: "",
    categoryLevel2: "",
    color: "",
    season: "",
    status: "",
    minPrice: "",
    maxPrice: "",
    showArchived: false
  },
  sortBy: "recent",
  view: "capture",
  selectedLetter: "",
  brandQuery: "",
  timelineType: "",
  selectedGarmentId: "",
  userId: "",
  currentUser: null,
  authToken: localStorage.getItem(authTokenStorageKey) || "",
  authMode: "register",
  authError: "",
  remoteReady: false,
  editingId: null,
  formDraft: null,
  outfitDraft: emptyOutfit(),
  careDraft: emptyCareLog(),
  brandDraft: emptyBrand(),
  outfitError: "",
  careError: "",
  brandError: "",
  formError: "",
  isUploadingImage: false,
  toast: ""
};

function loadGarments() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadOutfits() {
  try {
    const raw = localStorage.getItem(outfitStorageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGarments() {
  localStorage.setItem(storageKey, JSON.stringify(state.garments));
  syncRemote();
}

function saveOutfits() {
  localStorage.setItem(outfitStorageKey, JSON.stringify(state.outfits));
  syncRemote();
}

function loadCustomBrands() {
  try {
    const raw = localStorage.getItem(customBrandStorageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomBrands() {
  localStorage.setItem(customBrandStorageKey, JSON.stringify(state.customBrands));
  syncRemote();
}

function allBrands() {
  return [...brands, ...state.customBrands].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

function getDeviceId() {
  let id = localStorage.getItem(deviceStorageKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(deviceStorageKey, id);
  }
  return id;
}

async function hydrateRemote() {
  try {
    const response = await fetch(`/api/bootstrap?deviceId=${encodeURIComponent(getDeviceId())}`, authFetchOptions());
    if (!response.ok) throw new Error("remote unavailable");
    const data = await response.json();
    applyRemotePayload(data);
  } catch {
    state.remoteReady = false;
  }
}

async function syncRemote() {
  if (!state.remoteReady || !state.userId) return;
  try {
    await fetch(`/api/users/${encodeURIComponent(state.userId)}/wardrobe`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        garments: state.garments,
        outfits: state.outfits,
        customBrands: state.customBrands
      })
    });
  } catch {
    state.remoteReady = false;
  }
}

async function uploadImage(dataUrl) {
  if (!state.remoteReady) return dataUrl;
  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ dataUrl })
    });
    if (!response.ok) throw new Error("upload failed");
    const data = await response.json();
    return data.url || dataUrl;
  } catch {
    return dataUrl;
  }
}

function authFetchOptions() {
  return state.authToken ? { headers: { authorization: `Bearer ${state.authToken}` } } : {};
}

function jsonHeaders() {
  return {
    "content-type": "application/json",
    ...(state.authToken ? { authorization: `Bearer ${state.authToken}` } : {})
  };
}

function applyRemotePayload(data) {
  if (data.token) {
    state.authToken = data.token;
    localStorage.setItem(authTokenStorageKey, data.token);
  }
  state.userId = data.user.id;
  state.currentUser = data.user;
  state.remoteReady = true;
  state.garments = data.garments || [];
  state.outfits = data.outfits || [];
  state.customBrands = data.customBrands || [];
  localStorage.setItem(storageKey, JSON.stringify(state.garments));
  localStorage.setItem(outfitStorageKey, JSON.stringify(state.outfits));
  localStorage.setItem(customBrandStorageKey, JSON.stringify(state.customBrands));
  render();
}

async function submitAuth(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  const localBeforeRegister = {
    garments: state.garments,
    outfits: state.outfits,
    customBrands: state.customBrands
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "账号操作失败");
    const shouldMigrateLocal =
      state.authMode === "register" &&
      !data.garments?.length &&
      !data.outfits?.length &&
      (localBeforeRegister.garments.length || localBeforeRegister.outfits.length || localBeforeRegister.customBrands.length);
    state.authError = "";
    applyRemotePayload(data);
    state.view = "capture";
    if (shouldMigrateLocal) {
      state.garments = localBeforeRegister.garments;
      state.outfits = localBeforeRegister.outfits;
      state.customBrands = localBeforeRegister.customBrands;
      saveGarments();
      saveOutfits();
      saveCustomBrands();
    }
    showToast(state.authMode === "register" ? "账号已创建，衣橱已绑定" : "登录成功");
  } catch (error) {
    state.authError = error.message;
    render();
  }
}

async function logout() {
  const token = state.authToken;
  state.authToken = "";
  state.currentUser = null;
  state.userId = "";
  localStorage.removeItem(authTokenStorageKey);
  if (token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }
    }).catch(() => {});
  }
  state.garments = [];
  state.outfits = [];
  state.customBrands = [];
  localStorage.setItem(storageKey, JSON.stringify(state.garments));
  localStorage.setItem(outfitStorageKey, JSON.stringify(state.outfits));
  localStorage.setItem(customBrandStorageKey, JSON.stringify(state.customBrands));
  state.view = "account";
  await hydrateRemote();
  showToast("已退出登录");
}

function render() {
  const isRegistered = Boolean(state.currentUser?.isRegistered);
  if (!isRegistered && state.view !== "download") state.view = "account";
  const brandList = allBrands();
  const visible = sortGarments(filterGarments(state.garments, state.filters, brandList), state.sortBy, brandList);
  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Smart Wardrobe</p>
        <h1>衣橱相机</h1>
      </div>
      <nav class="view-tabs" aria-label="主导航">
        ${isRegistered ? `
          ${tabButton("capture", "拍照")}
          ${tabButton("closet", "衣橱")}
          ${tabButton("outfits", "穿搭")}
          ${tabButton("care", "保养")}
          ${tabButton("categories", "品类")}
          ${tabButton("registry", "品牌库")}
          ${tabButton("data", "数据")}
          ${tabButton("download", "下载")}
          ${tabButton("account", "账号")}
        ` : `${tabButton("account", "注册")}${tabButton("download", "下载")}`}
      </nav>
    </header>

    ${state.view === "capture" ? renderCaptureApp() : renderAppView(visible)}
    ${isRegistered ? renderBottomNav() : ""}
    ${renderDetailDrawer()}
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
  `;

  bindEvents();
}

function renderAppView(visible) {
  if (state.view === "closet") {
    return `
      ${renderStats()}
      ${renderInsights()}
      ${renderFilters()}
      ${renderActiveView(visible)}
    `;
  }
  return renderActiveView(visible);
}

function renderBottomNav() {
  const items = [
    ["capture", "拍照", "◎"],
    ["closet", "衣橱", "□"],
    ["outfits", "穿搭", "◇"],
    ["care", "保养", "○"],
    ["registry", "品牌", "A"]
  ];
  return `
    <nav class="bottom-nav" aria-label="底部导航">
      ${items.map(([view, label, icon]) => `
        <button class="${state.view === view ? "active" : ""}" data-view="${view}">
          <span>${icon}</span>
          <b>${label}</b>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderInsights() {
  const brandList = allBrands();
  const stats = getStats(state.garments, brandList);
  const categoryRows = categories.map((category) => [
    category.nameCn,
    stats.categoryCounts[category.code] || 0
  ]);
  const brandRows = topEntries(stats.brandCounts, 5);
  const seasonRows = seasons.map((season) => [season, stats.seasonCounts[season] || 0]);
  const colorRows = topEntries(stats.colorCounts, 8);

  return `
    <section class="insights-grid" aria-label="衣橱洞察">
      ${renderInsightPanel("品类结构", "按标准一级品类统计", categoryRows, stats.total)}
      ${renderInsightPanel("品牌集中度", "拥有单品最多的设计师品牌", brandRows, Math.max(...brandRows.map(([, value]) => value), 0))}
      ${renderInsightPanel("季节分布", "购买季节与全年单品比例", seasonRows, stats.total)}
      <article class="insight-panel color-panel">
        <div class="insight-head">
          <span>颜色谱系</span>
          <small>记录最多的颜色</small>
        </div>
        <div class="swatch-cloud">
          ${
            colorRows.length
              ? colorRows.map(([color, count]) => `
                  <button class="swatch-pill" data-filter-click="color" data-value="${escapeHtml(color)}">
                    <i style="--swatch:${colorValue(color)}"></i>
                    <span>${escapeHtml(color)}</span>
                    <b>${count}</b>
                  </button>
                `).join("")
              : `<p class="muted-note">暂无颜色数据</p>`
          }
        </div>
      </article>
    </section>
  `;
}

function renderInsightPanel(title, subtitle, rows, total) {
  return `
    <article class="insight-panel">
      <div class="insight-head">
        <span>${escapeHtml(title)}</span>
        <small>${escapeHtml(subtitle)}</small>
      </div>
      <div class="bar-list">
        ${
          rows.some(([, value]) => value)
            ? rows.map(([label, value]) => {
                const percent = total ? Math.round((value / total) * 100) : 0;
                return `
                  <button class="bar-row" ${barFilterAttributes(title, label)}>
                    <span>${escapeHtml(label)}</span>
                    <div><i style="width:${Math.max(percent, value ? 7 : 0)}%"></i></div>
                    <b>${value}</b>
                  </button>
                `;
              }).join("")
            : `<p class="muted-note">暂无统计数据</p>`
        }
      </div>
    </article>
  `;
}

function barFilterAttributes(title, label) {
  if (title === "品类结构") {
    const category = categories.find((item) => item.nameCn === label);
    return category ? `data-filter-click="categoryLevel1" data-value="${category.code}"` : "";
  }
  if (title === "品牌集中度") {
    const brand = allBrands().find((item) => item.nameEn === label);
    return brand ? `data-filter-click="brandId" data-value="${brand.id}"` : "";
  }
  if (title === "季节分布") {
    return `data-filter-click="season" data-value="${escapeHtml(label)}"`;
  }
  return "";
}

function renderHero(visibleCount) {
  const stats = getStats(state.garments, allBrands());
  const topBrand = Object.entries(stats.brandCounts).sort((a, b) => b[1] - a[1])[0];
  return `
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Curated Closet</p>
        <h2>用标准品类和官方品牌名，整理每一件值得留下的单品。</h2>
        <div class="hero-actions">
          <button class="primary-button" data-view="add">新增衣物</button>
          <button class="ghost-button" data-view="registry">查看品牌库</button>
        </div>
      </div>
      <div class="hero-visual">
        <img src="${illustrations.wardrobe}" alt="精品衣橱陈列插画" />
      </div>
      <div class="hero-notes" aria-label="衣橱摘要">
        <article>
          <span>当前结果</span>
          <strong>${visibleCount}</strong>
        </article>
        <article>
          <span>品牌数量</span>
          <strong>${Object.keys(stats.brandCounts).length}</strong>
        </article>
        <article>
          <span>最多品牌</span>
          <strong>${escapeHtml(topBrand?.[0] || "暂无")}</strong>
        </article>
      </div>
    </section>
  `;
}

function tabButton(view, label) {
  return `<button class="tab ${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`;
}

function renderStats() {
  const stats = getStats(state.garments, allBrands());
  return `
    <section class="stats-band" aria-label="衣橱概览">
      ${statCard("总单品", stats.total)}
      ${statCard("在库", stats.statusCounts.InCloset || 0)}
      ${statCard("送洗", stats.statusCounts.Laundry || 0)}
      ${statCard("穿着记录", stats.wearCount)}
      ${statCard("总资产", formatCurrency(stats.priceTotal))}
      ${statCard("均价", formatCurrency(stats.averagePrice))}
    </section>
  `;
}

function statCard(label, value) {
  return `
    <article class="stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderFilters() {
  const subcategories = getCategory(state.filters.categoryLevel1)?.subs || [];
  return `
    <section class="filters" aria-label="筛选">
      <label>
        <span>搜索</span>
        <input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="品牌、品类、标签、备注" />
      </label>
      <label>
        <span>品牌</span>
        <select data-filter="brandId">
          ${option("", "全部品牌", state.filters.brandId)}
          ${allBrands().map((brand) => option(brand.id, brand.nameEn, state.filters.brandId)).join("")}
        </select>
      </label>
      <label>
        <span>一级品类</span>
        <select data-filter="categoryLevel1">
          ${option("", "全部品类", state.filters.categoryLevel1)}
          ${categories.map((category) => option(category.code, category.nameCn, state.filters.categoryLevel1)).join("")}
        </select>
      </label>
      <label>
        <span>二级品类</span>
        <select data-filter="categoryLevel2" ${subcategories.length ? "" : "disabled"}>
          ${option("", "全部子类", state.filters.categoryLevel2)}
          ${subcategories.map((sub) => option(sub.code, sub.nameCn, state.filters.categoryLevel2)).join("")}
        </select>
      </label>
      <label>
        <span>颜色</span>
        <select data-filter="color">
          ${option("", "全部颜色", state.filters.color)}
          ${colors.map((color) => option(color, color, state.filters.color)).join("")}
        </select>
      </label>
      <label>
        <span>季节</span>
        <select data-filter="season">
          ${option("", "全部季节", state.filters.season)}
          ${seasons.map((season) => option(season, season, state.filters.season)).join("")}
        </select>
      </label>
      <label>
        <span>状态</span>
        <select data-filter="status">
          ${option("", "全部状态", state.filters.status)}
          ${Object.entries(statusLabels).map(([value, label]) => option(value, label, state.filters.status)).join("")}
        </select>
      </label>
      <label>
        <span>最低价</span>
        <input data-filter="minPrice" type="number" min="0" value="${escapeHtml(state.filters.minPrice)}" placeholder="CNY" />
      </label>
      <label>
        <span>最高价</span>
        <input data-filter="maxPrice" type="number" min="0" value="${escapeHtml(state.filters.maxPrice)}" placeholder="CNY" />
      </label>
      <label>
        <span>排序</span>
        <select data-sort>
          ${option("recent", "最近添加", state.sortBy)}
          ${option("priceDesc", "价格从高到低", state.sortBy)}
          ${option("brandAz", "品牌 A-Z", state.sortBy)}
        </select>
      </label>
      <label class="check-row">
        <input type="checkbox" data-filter="showArchived" ${state.filters.showArchived ? "checked" : ""} />
        <span>显示捐赠/丢弃</span>
      </label>
      <button class="ghost-button" data-action="clear-filters">清空</button>
    </section>
  `;
}

function renderActiveView(visible) {
  if (state.view === "capture") return renderCaptureApp();
  if (state.view === "categories") return renderCategories();
  if (state.view === "outfits") return renderOutfits();
  if (state.view === "care") return renderCareCenter();
  if (state.view === "timeline") return renderTimeline();
  if (state.view === "brands") return renderBrands();
  if (state.view === "registry") return renderBrandRegistry();
  if (state.view === "data") return renderDataTools();
  if (state.view === "account") return renderAccount();
  if (state.view === "download") return renderDownload();
  if (state.view === "add") return renderForm();
  return renderCloset(visible);
}

function renderCaptureApp() {
  const form = state.formDraft || emptyForm();
  const brandList = allBrands();
  const subcategories = getCategory(form.categoryLevel1)?.subs || [];
  const stats = getStats(state.garments);
  const hasPhoto = Boolean(form.imageUrl);
  const selectedCategory = getCategory(form.categoryLevel1);
  const selectedSubcategory = getSubcategory(form.categoryLevel1, form.categoryLevel2);
  const matchedBrand = normalizeBrand(form.brandSearch || brandList.find((brand) => brand.id === form.brandId)?.nameEn || "", brandList);
  const missingFields = getCaptureMissingFields(form, brandList);

  return `
    <main class="capture-app">
      <section class="capture-hero">
        <div>
          <p class="eyebrow">Photo Intake</p>
          <h2>拍一件，确认一次，衣橱自动归档。</h2>
          <div class="capture-metrics">
            <span><b>${stats.total}</b> 件单品</span>
            <span><b>${Object.keys(stats.brandCounts).length}</b> 个品牌</span>
            <span><b>${stats.wearCount}</b> 次穿着</span>
          </div>
        </div>
        <img src="${illustrations.wardrobe}" alt="衣橱相机封面" />
      </section>

      <form class="garment-form capture-form">
        ${state.formError ? `<p class="form-error">${escapeHtml(state.formError)}</p>` : ""}
        <input type="hidden" name="imageUrl" value="${escapeHtml(form.imageUrl)}" />

        <section class="camera-card">
          <div class="camera-preview">
            ${
              hasPhoto
                ? `<img src="${escapeHtml(form.imageUrl)}" alt="衣物照片预览" />`
                : `<div class="camera-empty"><span>◎</span><b>${state.isUploadingImage ? "照片上传中" : "拍照上传衣物"}</b></div>`
            }
          </div>
          <label class="camera-button">
            <input name="imageFile" type="file" accept="image/*" capture="environment" />
            <span>${state.isUploadingImage ? "正在处理照片..." : hasPhoto ? "重新拍照 / 上传" : "拍照 / 上传照片"}</span>
          </label>
        </section>

        <section class="recognition-card">
          <div>
            <p class="eyebrow">Review Card</p>
            <h3>${hasPhoto ? "确认识别结果" : "等待衣物照片"}</h3>
          </div>
          <div class="suggestion-chips">
            <span>${matchedBrand ? matchedBrand.nameEn : "品牌待确认"}</span>
            <span>${selectedCategory ? selectedCategory.nameCn : "一级品类待确认"}</span>
            <span>${selectedSubcategory ? selectedSubcategory.nameCn : "二级品类待确认"}</span>
          </div>
        </section>

        <section class="capture-fields">
          <label>
            <span>品牌</span>
            <input name="brandSearch" value="${escapeHtml(form.brandSearch || brandList.find((brand) => brand.id === form.brandId)?.nameEn || "")}" list="brand-list" placeholder="Prada / YSL / Loewe" />
            <datalist id="brand-list">
              ${brandList.map((brand) => `<option value="${brand.nameEn}"></option>`).join("")}
            </datalist>
            ${renderBrandHint(form)}
          </label>

          <div class="form-grid">
            <label>
              <span>一级品类</span>
              <select name="categoryLevel1">
                ${option("", "请选择", form.categoryLevel1)}
                ${categories.map((category) => option(category.code, category.nameCn, form.categoryLevel1)).join("")}
              </select>
            </label>
            <label>
              <span>二级品类</span>
              <select name="categoryLevel2">
                ${option("", "请选择", form.categoryLevel2)}
                ${subcategories.map((sub) => option(sub.code, sub.nameCn, form.categoryLevel2)).join("")}
              </select>
            </label>
          </div>

          <fieldset>
            <legend>颜色</legend>
            <div class="color-options">
              ${colors.map((color) => `
                <label>
                  <input type="checkbox" name="colors" value="${color}" ${form.colors.includes(color) ? "checked" : ""} />
                  <span>${color}</span>
                </label>
              `).join("")}
            </div>
          </fieldset>

          <div class="form-grid">
            <label>
              <span>购买季节</span>
              <select name="season">${seasons.map((season) => option(season, season, form.season)).join("")}</select>
            </label>
            <label>
              <span>状态</span>
              <select name="status">
                ${Object.entries(statusLabels).map(([value, label]) => option(value, label, form.status)).join("")}
              </select>
            </label>
          </div>

          <div class="form-grid">
            <label>
              <span>价格 CNY</span>
              <input name="purchasePrice" type="number" min="0" step="0.01" value="${form.purchasePrice ?? ""}" />
            </label>
            <label>
              <span>标签</span>
              <input name="tags" value="${escapeHtml(Array.isArray(form.tags) ? form.tags.join(", ") : form.tags)}" placeholder="通勤, 度假" />
            </label>
          </div>

          <label>
            <span>备注</span>
            <textarea name="notes" rows="2">${escapeHtml(form.notes)}</textarea>
          </label>
        </section>

        <div class="capture-submit">
          <div>
            <button class="primary-button" type="submit" ${state.isUploadingImage ? "disabled" : ""}>${state.isUploadingImage ? "照片处理中..." : "确认入库"}</button>
            ${missingFields.length ? `<p class="capture-help">还差：${missingFields.map(escapeHtml).join("、")}</p>` : `<p class="capture-help ready">信息完整，可以入库。</p>`}
          </div>
          <button class="ghost-button" type="button" data-action="clear-capture">清空</button>
        </div>
      </form>

      <section class="inbox-card">
        <div>
          <p class="eyebrow">Inbox</p>
          <h3>待整理收件箱</h3>
        </div>
        ${
          hasPhoto
            ? `<article class="inbox-item"><span>1</span><div><strong>当前照片待确认</strong><small>${matchedBrand?.nameEn || "补充品牌"} · ${selectedCategory?.nameCn || "补充品类"}</small></div></article>`
            : `<p class="muted-note">连续拍照时，未确认的照片会先停在这里。</p>`
        }
      </section>
    </main>
  `;
}

function getCaptureMissingFields(form, brandList) {
  const missing = [];
  const matchedBrand = normalizeBrand(form.brandSearch || brandList.find((brand) => brand.id === form.brandId)?.nameEn || "", brandList);
  if (!form.imageUrl) missing.push("照片");
  if (!matchedBrand) missing.push("标准品牌");
  if (!form.categoryLevel1 || !getCategory(form.categoryLevel1)) missing.push("一级品类");
  if (!form.categoryLevel2 || !getSubcategory(form.categoryLevel1, form.categoryLevel2)) missing.push("二级品类");
  if (!form.colors?.length) missing.push("颜色");
  return missing;
}

function renderDownload() {
  return `
    <main class="download-page">
      <section class="download-hero">
        <div>
          <p class="eyebrow">App Download</p>
          <h2>把衣橱相机装到手机上，拍照后直接整理入库。</h2>
          <p>安卓可以下载 APK 安装；iPhone 先用网页 App 添加到主屏幕，正式 TestFlight / App Store 版本会继续走苹果账号发布流程。</p>
          <div class="hero-actions">
            <a class="primary-button link-button" href="${androidApkUrl}">下载 Android APK</a>
            <a class="ghost-button link-button" href="${webAppUrl}">打开网页版</a>
          </div>
        </div>
        <img src="${illustrations.wardrobe}" alt="衣橱相机 App 封面" />
      </section>

      <section class="download-grid">
        <article class="download-card">
          <div>
            <p class="eyebrow">Android</p>
            <h3>扫码下载 APK</h3>
            <p>用安卓手机扫码，下载后选择允许浏览器或文件管理器安装。</p>
          </div>
          <img class="qr-image" src="./android-app-qr.png" alt="Android APK 下载二维码" />
          <a class="primary-button link-button" href="${androidApkUrl}">直接下载</a>
        </article>

        <article class="download-card">
          <div>
            <p class="eyebrow">iPhone</p>
            <h3>先添加网页 App</h3>
            <p>用 Safari 打开后，点分享按钮，选择“添加到主屏幕”。</p>
          </div>
          <img class="qr-image" src="./iphone-app-qr.png" alt="iPhone 网页 App 二维码" />
          <a class="ghost-button link-button" href="${webAppUrl}">打开网页 App</a>
        </article>
      </section>
    </main>
  `;
}

function renderCloset(garments) {
  if (!garments.length) {
    return `
      <main class="empty-state">
        <h2>没有找到符合条件的单品</h2>
        <p>换一个筛选条件，或新增你的第一件衣物。</p>
        <button class="primary-button" data-view="add">新增衣物</button>
      </main>
    `;
  }

  return `
    <main class="garment-grid">
      ${garments.map(renderGarmentCard).join("")}
    </main>
  `;
}

function renderGarmentCard(garment) {
  const brand = allBrands().find((item) => item.id === garment.brandId);
  const category = getCategory(garment.categoryLevel1);
  const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
  const image = garment.imageUrl
    ? `<img src="${escapeHtml(garment.imageUrl)}" alt="${escapeHtml(brand?.nameEn || "衣物照片")}" />`
    : `<div class="image-placeholder">${escapeHtml(brand?.nameEn?.slice(0, 2) || "SW")}</div>`;

  return `
    <article class="garment-card">
      <button class="image-frame image-button" data-action="detail" data-id="${garment.id}">${image}</button>
      <div class="card-body">
        <div class="card-title">
          <strong>${escapeHtml(brand?.nameEn || "Unknown Brand")}</strong>
          <span>${statusLabels[garment.status]}</span>
        </div>
        <p>${escapeHtml(category?.nameCn || "")} / ${escapeHtml(subcategory?.nameCn || "")}</p>
        <div class="card-meta">
          <span class="mini-swatches">${garment.colors.map((color) => `<i title="${escapeHtml(color)}" style="--swatch:${colorValue(color)}"></i>`).join("")}</span>
          <span>${garment.colors.map(escapeHtml).join(" · ")} · ${escapeHtml(garment.season)}</span>
        </div>
        <div class="tag-row">${garment.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="card-actions">
          <button class="text-button" data-action="detail" data-id="${garment.id}">详情</button>
          <button class="text-button" data-action="wear" data-id="${garment.id}">今日穿着</button>
          <button class="text-button" data-action="add-to-outfit" data-id="${garment.id}">加入穿搭</button>
          <button class="text-button" data-action="edit" data-id="${garment.id}">编辑</button>
          <button class="text-button danger" data-action="delete" data-id="${garment.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderOutfits() {
  const selectedIds = new Set(state.outfitDraft.garmentIds);
  return `
    <main class="outfit-page">
      ${renderIllustrationIntro("Outfit Sets", "穿搭集合", "把单品组合成职场、周末、度假或晚宴场景，之后可以继续扩展成搭配推荐。", illustrations.wardrobe)}
      <section class="outfit-layout">
        <form class="outfit-form">
          <div class="form-head">
            <h2>创建穿搭</h2>
            <p>选择已有衣物，保存为一个可复用的场景集合。</p>
          </div>
          ${state.outfitError ? `<p class="form-error">${escapeHtml(state.outfitError)}</p>` : ""}
          <label>
            <span>穿搭名称</span>
            <input name="name" value="${escapeHtml(state.outfitDraft.name)}" placeholder="例如：周末美术馆" />
          </label>
          <label>
            <span>场景</span>
            <input name="occasion" value="${escapeHtml(state.outfitDraft.occasion)}" placeholder="职场 / 度假 / 晚宴" />
          </label>
          <fieldset>
            <legend>选择衣物</legend>
            <div class="outfit-picker">
              ${state.garments.map((garment) => renderOutfitPickerItem(garment, selectedIds)).join("")}
            </div>
          </fieldset>
          <label>
            <span>备注</span>
            <textarea name="notes" rows="3">${escapeHtml(state.outfitDraft.notes)}</textarea>
          </label>
          <div class="form-actions">
            <button class="primary-button" type="submit">保存穿搭</button>
            <button class="ghost-button" type="button" data-action="clear-outfit-draft">清空</button>
          </div>
        </form>
        <section class="outfit-list">
          ${state.outfits.length ? state.outfits.map(renderOutfitCard).join("") : `<div class="empty-state"><h2>还没有穿搭</h2><p>先从衣橱里挑几件单品组合一下。</p></div>`}
        </section>
      </section>
    </main>
  `;
}

function renderOutfitPickerItem(garment, selectedIds) {
  const brand = allBrands().find((item) => item.id === garment.brandId);
  const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
  return `
    <label class="picker-item">
      <input type="checkbox" name="garmentIds" value="${garment.id}" ${selectedIds.has(garment.id) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(brand?.nameEn || "Unknown Brand")}</strong>
        <small>${escapeHtml(subcategory?.nameCn || "")}</small>
      </span>
    </label>
  `;
}

function renderOutfitCard(outfit) {
  const garments = outfit.garmentIds
    .map((id) => state.garments.find((garment) => garment.id === id))
    .filter(Boolean);
  return `
    <article class="outfit-card">
      <div>
        <p class="eyebrow">${escapeHtml(outfit.occasion || "Outfit")}</p>
        <h3>${escapeHtml(outfit.name)}</h3>
        <p>${escapeHtml(outfit.notes || "暂无备注")}</p>
      </div>
      <div class="outfit-items">
        ${garments.map((garment) => {
          const brand = allBrands().find((item) => item.id === garment.brandId);
          const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
          return `<button data-action="detail" data-id="${garment.id}">${escapeHtml(brand?.nameEn || "")} · ${escapeHtml(subcategory?.nameCn || "")}</button>`;
        }).join("")}
      </div>
      <div class="card-actions">
        <button class="text-button" data-action="wear-outfit" data-id="${outfit.id}">记录整套穿着</button>
        <button class="text-button danger" data-action="delete-outfit" data-id="${outfit.id}">删除穿搭</button>
      </div>
    </article>
  `;
}

function renderCareCenter() {
  const careRows = state.garments
    .map((garment) => ({ garment, lastCare: getLastCare(garment), count: getCareCount(garment) }))
    .sort((a, b) => String(b.lastCare?.date || "").localeCompare(String(a.lastCare?.date || "")));
  return `
    <main class="care-page">
      ${renderIllustrationIntro("Care Ledger", "保养中心", "记录送洗、维修、皮具护理和换季收纳，让高价值单品的维护历史也有迹可循。", illustrations.data)}
      <section class="outfit-layout">
        <form class="care-form">
          <div class="form-head">
            <h2>新增保养记录</h2>
            <p>选择一件衣物，记录一次护理、送洗或维修。</p>
          </div>
          ${state.careError ? `<p class="form-error">${escapeHtml(state.careError)}</p>` : ""}
          <label>
            <span>衣物</span>
            <select name="garmentId">
              ${option("", "请选择衣物", state.careDraft.garmentId)}
              ${state.garments.map((garment) => {
                const brand = allBrands().find((item) => item.id === garment.brandId);
                const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
                return option(garment.id, `${brand?.nameEn || "Unknown"} · ${subcategory?.nameCn || ""}`, state.careDraft.garmentId);
              }).join("")}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select name="type">
              ${option("", "请选择类型", state.careDraft.type)}
              ${Object.entries(careTypes).map(([value, label]) => option(value, label, state.careDraft.type)).join("")}
            </select>
          </label>
          <label>
            <span>日期</span>
            <input name="date" type="date" value="${escapeHtml(state.careDraft.date)}" />
          </label>
          <label>
            <span>备注</span>
            <textarea name="notes" rows="3">${escapeHtml(state.careDraft.notes)}</textarea>
          </label>
          <div class="form-actions">
            <button class="primary-button" type="submit">保存记录</button>
            <button class="ghost-button" type="button" data-action="clear-care-draft">清空</button>
          </div>
        </form>
        <section class="care-list">
          ${careRows.map(({ garment, lastCare, count }) => renderCareRow(garment, lastCare, count)).join("")}
        </section>
      </section>
    </main>
  `;
}

function renderCareRow(garment, lastCare, count) {
  const brand = allBrands().find((item) => item.id === garment.brandId);
  const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
  return `
    <article class="care-row">
      <div>
        <strong>${escapeHtml(brand?.nameEn || "Unknown Brand")}</strong>
        <span>${escapeHtml(subcategory?.nameCn || "")} · ${statusLabels[garment.status]}</span>
      </div>
      <div>
        <small>最近保养</small>
        <b>${lastCare ? `${escapeHtml(careTypes[lastCare.type] || lastCare.type)} · ${escapeHtml(lastCare.date)}` : "未记录"}</b>
      </div>
      <div>
        <small>累计</small>
        <b>${count} 次</b>
      </div>
      <button class="text-button" data-action="detail" data-id="${garment.id}">详情</button>
    </article>
  `;
}

function renderTimeline() {
  const events = getTimelineEvents(state.garments, { type: state.timelineType });
  return `
    <main class="timeline-page">
      ${renderIllustrationIntro("Lifecycle Timeline", "衣橱时间线", "把穿着、送洗、维修和护理记录放在同一条时间线上，回看每件单品的真实使用轨迹。", illustrations.data)}
      <section class="utility-panel">
        <div>
          <h2>事件记录</h2>
          <p>${events.length} 条事件，按日期倒序排列。</p>
        </div>
        <label>
          <span>事件类型</span>
          <select data-timeline-type>
            ${option("", "全部事件", state.timelineType)}
            ${option("wear", "穿着", state.timelineType)}
            ${option("care", "保养", state.timelineType)}
          </select>
        </label>
      </section>
      <section class="timeline-list">
        ${
          events.length
            ? events.map(renderTimelineEvent).join("")
            : `<div class="empty-state"><h2>还没有事件</h2><p>记录一次穿着或保养后，这里会自动生成时间线。</p></div>`
        }
      </section>
    </main>
  `;
}

function renderTimelineEvent(event) {
  const typeLabel = event.type === "wear" ? "穿着" : careTypes[event.careType] || "保养";
  return `
    <article class="timeline-event">
      <time>${escapeHtml(event.date)}</time>
      <div class="timeline-dot ${event.type}"></div>
      <div class="timeline-card">
        <div>
          <span>${escapeHtml(typeLabel)}</span>
          <strong>${escapeHtml(event.garmentLabel || "未知衣物")}</strong>
        </div>
        <p>${escapeHtml(event.notes || event.meta || "暂无备注")}</p>
        <button class="text-button" data-action="detail" data-id="${event.garmentId}">查看衣物</button>
      </div>
    </article>
  `;
}

function renderCategories() {
  return `
    <main class="page-stack">
      ${renderIllustrationIntro("Category Tree", "品类看板", "按标准二级树查看衣橱结构，快速发现重复购买、缺口和闲置。", illustrations.categories)}
      <section class="category-board">
      ${categories.map(renderCategoryPanel).join("")}
      </section>
    </main>
  `;
}

function renderCategoryPanel(category) {
  const garments = state.garments.filter(
    (garment) => garment.categoryLevel1 === category.code && !["Donated", "Discarded"].includes(garment.status)
  );
  return `
    <section class="category-panel">
      <button class="panel-heading" data-filter-click="categoryLevel1" data-value="${category.code}">
        <span>
          <strong>${category.nameCn}</strong>
          <small>${category.nameEn}</small>
        </span>
        <b>${garments.length}</b>
      </button>
      <div class="sub-list">
        ${category.subs.map((sub) => {
          const count = garments.filter((garment) => garment.categoryLevel2 === sub.code).length;
          return `
            <button data-sub-filter="${category.code}|${sub.code}">
              <span>${sub.nameCn}</span>
              <em>${count}</em>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderBrands() {
  const grouped = groupBrandsWithCounts(state.garments, allBrands());
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const visibleBrands = state.selectedLetter
    ? grouped.filter((brand) => brand.firstLetter === state.selectedLetter)
    : grouped;

  return `
    <main class="brand-wall">
      ${renderIllustrationIntro("Owned Brand Wall", "已拥有品牌", "聚合展示衣橱中实际出现的品牌，点击后进入该品牌单品列表。", illustrations.brands)}
      <div class="letters">
        <button class="${state.selectedLetter ? "" : "active"}" data-letter="">All</button>
        ${letters.map((letter) => {
          const disabled = !grouped.some((brand) => brand.firstLetter === letter);
          return `<button class="${state.selectedLetter === letter ? "active" : ""}" data-letter="${letter}" ${disabled ? "disabled" : ""}>${letter}</button>`;
        }).join("")}
      </div>
      <div class="brand-grid">
        ${visibleBrands.map((brand) => renderBrandTile(brand)).join("")}
      </div>
    </main>
  `;
}

function renderBrandTile(brand) {
  return `
    <button class="brand-tile" data-filter-click="brandId" data-value="${brand.id}">
      <strong>${escapeHtml(brand.nameEn)}</strong>
      <span>${escapeHtml(brand.nameCn || "Designer Brand")}</span>
      <b>${brand.count}</b>
    </button>
  `;
}

function renderBrandRegistry() {
  const brandList = allBrands();
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const registry = listBrandRegistry(state.garments, {
    letter: state.selectedLetter,
    query: state.brandQuery
  }, brandList);
  const availableLetters = new Set(brandList.map((brand) => brand.firstLetter));

  return `
    <main class="brand-wall">
      ${renderIllustrationIntro("Brand Registry", "标准品牌库", "基础库已导入核心品牌表，也可以手动补充你自己的品牌。", illustrations.brands)}
      <form class="brand-add-form">
        <div>
          <h2>新增品牌</h2>
          <p>品牌库没有的品牌，可以手动加入并立即用于拍照入库。</p>
        </div>
        ${state.brandError ? `<p class="form-error">${escapeHtml(state.brandError)}</p>` : ""}
        <label>
          <span>英文名</span>
          <input name="nameEn" value="${escapeHtml(state.brandDraft.nameEn)}" placeholder="例如：Studio Nicholson" />
        </label>
        <label>
          <span>中文名</span>
          <input name="nameCn" value="${escapeHtml(state.brandDraft.nameCn)}" placeholder="可选" />
        </label>
        <label>
          <span>别名</span>
          <input name="aliases" value="${escapeHtml(state.brandDraft.aliases)}" placeholder="逗号分隔，可选" />
        </label>
        <button class="primary-button" type="submit">加入品牌库</button>
      </form>
      <section class="utility-panel">
        <div>
          <h2>当前品牌库</h2>
          <p>${brands.length} 个标准品牌，${state.customBrands.length} 个自定义品牌。</p>
        </div>
        <label>
          <span>品牌搜索</span>
          <input data-brand-query value="${escapeHtml(state.brandQuery)}" placeholder="Saint Laurent / YSL / 圣罗兰" />
        </label>
      </section>
      <div class="letters">
        <button class="${state.selectedLetter ? "" : "active"}" data-letter="">All</button>
        ${letters.map((letter) => `
          <button class="${state.selectedLetter === letter ? "active" : ""}" data-letter="${letter}" ${availableLetters.has(letter) ? "" : "disabled"}>${letter}</button>
        `).join("")}
      </div>
      <div class="brand-grid">
        ${registry.map((brand) => `
          <article class="brand-tile registry-tile">
            <strong>${escapeHtml(brand.nameEn)}</strong>
            <span>${escapeHtml(brand.nameCn || "Designer Brand")}</span>
            <small>${brand.isCustom ? "自定义品牌" : "标准品牌库"} · ${brand.aliases.length ? `别名：${escapeHtml(brand.aliases.join(", "))}` : "暂无别名"}</small>
            <button class="text-button" data-filter-click="brandId" data-value="${brand.id}">${brand.count ? `查看 ${brand.count} 件` : "筛选该品牌"}</button>
          </article>
        `).join("")}
      </div>
    </main>
  `;
}

function renderIllustrationIntro(eyebrow, title, copy, imageUrl) {
  return `
    <section class="illustration-intro">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(copy)}</p>
      </div>
      <img src="${imageUrl}" alt="${escapeHtml(title)}插画" />
    </section>
  `;
}

function renderDetailDrawer() {
  if (!state.selectedGarmentId) return "";
  const garment = state.garments.find((item) => item.id === state.selectedGarmentId);
  if (!garment) return "";

  const brand = allBrands().find((item) => item.id === garment.brandId);
  const category = getCategory(garment.categoryLevel1);
  const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2);
  const costPerWear = getCostPerWear(garment);
  const lastCare = getLastCare(garment);
  const image = garment.imageUrl
    ? `<img src="${escapeHtml(garment.imageUrl)}" alt="${escapeHtml(brand?.nameEn || "衣物照片")}" />`
    : `<div class="image-placeholder">${escapeHtml(brand?.nameEn?.slice(0, 2) || "SW")}</div>`;

  return `
    <aside class="drawer-backdrop" data-action="close-detail">
      <section class="detail-drawer" role="dialog" aria-label="衣物详情">
        <button class="drawer-close" data-action="close-detail" aria-label="关闭">×</button>
        <div class="detail-image">${image}</div>
        <div class="detail-content">
          <p class="eyebrow">${escapeHtml(category?.nameEn || "")}</p>
          <h2>${escapeHtml(brand?.nameEn || "Unknown Brand")}</h2>
          <dl>
            ${detailRow("中文品牌", brand?.nameCn || "未设置")}
            ${detailRow("品类", `${category?.nameCn || ""} / ${subcategory?.nameCn || ""}`)}
            ${detailRow("颜色", garment.colors.join(" · "))}
            ${detailRow("购买季节", garment.season)}
            ${detailRow("购买价格", garment.purchasePrice ? formatCurrency(garment.purchasePrice) : "未记录")}
            ${detailRow("穿着次数", `${getWearCount(garment)} 次`)}
            ${detailRow("最近穿着", getLastWorn(garment) || "未记录")}
            ${detailRow("单次成本", costPerWear ? formatCurrency(costPerWear) : "暂无")}
            ${detailRow("保养次数", `${getCareCount(garment)} 次`)}
            ${detailRow("最近保养", lastCare ? `${careTypes[lastCare.type] || lastCare.type} · ${lastCare.date}` : "未记录")}
            ${detailRow("使用状态", statusLabels[garment.status])}
            ${detailRow("标签", garment.tags.length ? garment.tags.join(" · ") : "未设置")}
            ${detailRow("备注", garment.notes || "无")}
          </dl>
          <div class="form-actions">
            <button class="primary-button" data-action="wear" data-id="${garment.id}">记录今日穿着</button>
            <button class="primary-button" data-action="edit" data-id="${garment.id}">编辑</button>
            <button class="ghost-button" data-action="close-detail">关闭</button>
          </div>
        </div>
      </section>
    </aside>
  `;
}

function renderDataTools() {
  return `
    <main class="data-tools">
      ${renderIllustrationIntro("Portable Wardrobe Data", "数据备份", "把衣橱导出为结构化 JSON，之后可以迁移、备份或接入后端服务。", illustrations.data)}
      <section class="utility-panel">
        <div>
          <h2>账号状态</h2>
          <p>${state.currentUser?.isRegistered ? `已登录：${escapeHtml(state.currentUser.email)}` : "当前是游客模式。请先注册账号，之后就可以在其他设备登录同步衣橱。"}</p>
        </div>
        <button class="primary-button" data-view="account">${state.currentUser?.isRegistered ? "管理账号" : "注册账号"}</button>
      </section>
      <section class="utility-panel">
        <div>
          <h2>数据备份</h2>
          <p>导出的 JSON 包含当前所有衣物记录，可用于备份或迁移到另一台设备。</p>
        </div>
        <div class="utility-actions">
          <button class="primary-button" data-action="export-data">导出 JSON</button>
          <label class="file-button">
            <input data-import-file type="file" accept="application/json,.json" />
            <span>导入 JSON</span>
          </label>
        </div>
      </section>
      <section class="utility-panel">
        <div>
          <h2>当前数据</h2>
          <p>${state.garments.length} 件衣物记录，${state.outfits.length} 个穿搭集合，数据保存在浏览器本地存储。</p>
        </div>
        <button class="ghost-button" data-action="restore-seed">恢复示例数据</button>
      </section>
      <textarea class="export-preview" readonly>${escapeHtml(serializeWardrobe(state.garments, state.outfits, state.customBrands))}</textarea>
    </main>
  `;
}

function renderAccount() {
  const user = state.currentUser;
  const isRegistered = Boolean(user?.isRegistered);
  return `
    <main class="account-page">
      <section class="account-hero">
        <div>
          <p class="eyebrow">Account Sync</p>
          <h2>${isRegistered ? "你的衣橱已绑定账号。" : "注册账号后，衣橱就可以跨设备同步。"}</h2>
          <p>${isRegistered ? "你可以在其他设备登录同一邮箱，继续管理同一套衣橱数据。" : "第一次使用请先注册账号；已有账号的用户再切换到登录。"}</p>
        </div>
        <img src="${illustrations.data}" alt="账号同步插画" />
      </section>

      ${
        isRegistered
          ? `
            <section class="auth-card">
              <p class="eyebrow">Signed In</p>
              <h3>${escapeHtml(user.name || user.email)}</h3>
              <dl class="account-meta">
                <div><dt>邮箱</dt><dd>${escapeHtml(user.email)}</dd></div>
                <div><dt>用户 ID</dt><dd>${escapeHtml(user.id.slice(0, 8))}</dd></div>
                <div><dt>当前数据</dt><dd>${state.garments.length} 件衣物 · ${state.outfits.length} 个穿搭</dd></div>
              </dl>
              <div class="form-actions">
                <button class="primary-button" data-view="capture">继续整理衣橱</button>
                <button class="ghost-button" data-action="logout">退出登录</button>
              </div>
            </section>
          `
          : `
            <section class="auth-card">
              <div class="auth-tabs">
                <button class="${state.authMode === "register" ? "active" : ""}" data-auth-mode="register">注册</button>
                <button class="${state.authMode === "login" ? "active" : ""}" data-auth-mode="login">已有账号登录</button>
              </div>
              <p class="auth-hint">${state.authMode === "register" ? "新用户先创建账号，衣橱数据会绑定到这个邮箱。" : "只有已经注册过的邮箱才能登录。"}</p>
              ${state.authError ? `<p class="form-error">${escapeHtml(state.authError)}</p>` : ""}
              <form class="auth-form">
                ${state.authMode === "register" ? `
                  <label>
                    <span>昵称</span>
                    <input name="name" autocomplete="name" placeholder="Samara" />
                  </label>
                ` : ""}
                <label>
                  <span>邮箱</span>
                  <input name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
                </label>
                <label>
                  <span>密码</span>
                  <input name="password" type="password" autocomplete="${state.authMode === "register" ? "new-password" : "current-password"}" required placeholder="至少 8 位" />
                </label>
                <button class="primary-button" type="submit">${state.authMode === "register" ? "创建账号" : "登录"}</button>
              </form>
            </section>
          `
      }
    </main>
  `;
}

function detailRow(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderForm() {
  const editing = state.garments.find((garment) => garment.id === state.editingId);
  const form = state.formDraft || editing || emptyForm();
  const brandList = allBrands();
  const subcategories = getCategory(form.categoryLevel1)?.subs || [];

  return `
    <main class="editor-shell">
      <form class="garment-form">
        <div class="form-head">
          <h2>${editing ? "编辑衣物" : "新增衣物"}</h2>
          <p>品牌会按标准库保存，别名会自动匹配为官方名称。</p>
        </div>
        ${state.formError ? `<p class="form-error">${escapeHtml(state.formError)}</p>` : ""}
        <div class="upload-row">
          <div class="form-preview">
            ${
              form.imageUrl
                ? `<img src="${escapeHtml(form.imageUrl)}" alt="衣物照片预览" />`
                : `<div class="image-placeholder">SW</div>`
            }
          </div>
          <div>
            <label>
              <span>照片 URL</span>
              <input name="imageUrl" value="${escapeHtml(form.imageUrl)}" placeholder="https://..." />
            </label>
            <label>
              <span>本地图片</span>
              <input name="imageFile" type="file" accept="image/*" />
            </label>
          </div>
        </div>
        <label>
          <span>品牌</span>
          <input name="brandSearch" value="${escapeHtml(form.brandSearch || brandList.find((brand) => brand.id === form.brandId)?.nameEn || "")}" list="brand-list" placeholder="Prada / YSL / Loewe" />
          <datalist id="brand-list">
            ${brandList.map((brand) => `<option value="${brand.nameEn}"></option>`).join("")}
          </datalist>
          ${renderBrandHint(form)}
        </label>
        <div class="form-grid">
          <label>
            <span>一级品类</span>
            <select name="categoryLevel1">
              ${option("", "请选择", form.categoryLevel1)}
              ${categories.map((category) => option(category.code, category.nameCn, form.categoryLevel1)).join("")}
            </select>
          </label>
          <label>
            <span>二级品类</span>
            <select name="categoryLevel2">
              ${option("", "请选择", form.categoryLevel2)}
              ${subcategories.map((sub) => option(sub.code, sub.nameCn, form.categoryLevel2)).join("")}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>颜色</legend>
          <div class="color-options">
            ${colors.map((color) => `
              <label>
                <input type="checkbox" name="colors" value="${color}" ${form.colors.includes(color) ? "checked" : ""} />
                <span>${color}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <div class="form-grid">
          <label>
            <span>购买季节</span>
            <select name="season">${seasons.map((season) => option(season, season, form.season)).join("")}</select>
          </label>
          <label>
            <span>价格 CNY</span>
            <input name="purchasePrice" type="number" min="0" step="0.01" value="${form.purchasePrice ?? ""}" />
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              ${Object.entries(statusLabels).map(([value, label]) => option(value, label, form.status)).join("")}
            </select>
          </label>
          <label>
            <span>标签</span>
            <input name="tags" value="${escapeHtml(Array.isArray(form.tags) ? form.tags.join(", ") : form.tags)}" placeholder="职场, 通勤" />
          </label>
        </div>
        <label>
          <span>备注</span>
          <textarea name="notes" rows="3">${escapeHtml(form.notes)}</textarea>
        </label>
        <div class="form-actions">
          <button class="primary-button" type="submit">${editing ? "保存修改" : "保存衣物"}</button>
          <button class="ghost-button" type="button" data-action="cancel-edit">取消</button>
        </div>
      </form>
    </main>
  `;
}

function emptyForm() {
  return {
    imageUrl: "",
    brandSearch: "",
    brandId: "",
    categoryLevel1: "",
    categoryLevel2: "",
    colors: [],
    season: "All-Year",
    purchasePrice: "",
    status: "InCloset",
    tags: [],
    notes: ""
  };
}

function emptyOutfit() {
  return {
    name: "",
    occasion: "",
    garmentIds: [],
    notes: ""
  };
}

function emptyCareLog() {
  return {
    garmentId: "",
    type: "",
    date: new Date().toISOString().slice(0, 10),
    notes: ""
  };
}

function emptyBrand() {
  return {
    nameEn: "",
    nameCn: "",
    aliases: ""
  };
}

function renderBrandHint(form) {
  const rawBrand = form.brandSearch || "";
  const matched = normalizeBrand(rawBrand, allBrands());
  if (!rawBrand.trim()) return "";
  if (!matched) return `<small class="brand-hint warn">未匹配到标准品牌，请使用品牌库中的官方名称或别名。</small>`;
  return `<small class="brand-hint">将保存为 ${escapeHtml(matched.nameEn)}${matched.nameCn ? ` / ${escapeHtml(matched.nameCn)}` : ""}</small>`;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (!["add", "capture"].includes(state.view)) {
        state.editingId = null;
        state.formDraft = null;
        state.formError = "";
      } else if (!state.editingId && !state.formDraft) {
        state.formDraft = emptyForm();
      }
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((field) => {
    field.addEventListener("input", () => {
      const key = field.dataset.filter;
      state.filters[key] = field.type === "checkbox" ? field.checked : field.value;
      if (key === "categoryLevel1") state.filters.categoryLevel2 = "";
      state.view = "closet";
      render();
    });
  });

  document.querySelectorAll("[data-sort]").forEach((field) => {
    field.addEventListener("input", () => {
      state.sortBy = field.value;
      state.view = "closet";
      render();
    });
  });

  document.querySelectorAll("[data-action='clear-filters']").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters = {
        query: "",
        brandId: "",
        categoryLevel1: "",
        categoryLevel2: "",
        color: "",
        season: "",
        status: "",
        minPrice: "",
        maxPrice: "",
        showArchived: false
      };
      state.sortBy = "recent";
      render();
    });
  });

  document.querySelectorAll("[data-filter-click]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters[button.dataset.filterClick] = button.dataset.value;
      state.view = "closet";
      render();
    });
  });

  document.querySelectorAll("[data-sub-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const [category, subcategory] = button.dataset.subFilter.split("|");
      state.filters.categoryLevel1 = category;
      state.filters.categoryLevel2 = subcategory;
      state.view = "closet";
      render();
    });
  });

  document.querySelectorAll("[data-letter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLetter = button.dataset.letter;
      render();
    });
  });

  document.querySelectorAll("[data-brand-query]").forEach((field) => {
    field.addEventListener("input", () => {
      state.brandQuery = field.value;
      render();
    });
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.authError = "";
      render();
    });
  });

  document.querySelector("[data-action='logout']")?.addEventListener("click", () => {
    logout();
  });

  document.querySelector(".auth-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(event.currentTarget);
  });

  const brandForm = document.querySelector(".brand-add-form");
  brandForm?.addEventListener("input", () => {
    state.brandDraft = readBrandForm(brandForm);
  });
  brandForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const brand = createBrand(readBrandForm(brandForm), allBrands());
      state.customBrands = [...state.customBrands, brand];
      state.brandDraft = emptyBrand();
      state.brandError = "";
      saveCustomBrands();
      showToast(`已加入品牌：${brand.nameEn}`);
    } catch (error) {
      state.brandError = error.message;
      render();
    }
  });

  document.querySelectorAll("[data-timeline-type]").forEach((field) => {
    field.addEventListener("input", () => {
      state.timelineType = field.value;
      render();
    });
  });

  document.querySelectorAll("[data-action='export-data']").forEach((button) => {
    button.addEventListener("click", () => {
      downloadTextFile("smart-wardrobe-export.json", serializeWardrobe(state.garments, state.outfits, state.customBrands));
      showToast("已生成 JSON 备份文件");
    });
  });

  document.querySelectorAll("[data-import-file]").forEach((field) => {
    field.addEventListener("change", () => {
      const file = field.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          const backup = parseWardrobeBackup(reader.result);
          state.garments = backup.garments;
          state.outfits = backup.outfits;
          state.customBrands = backup.customBrands || [];
          saveGarments();
          saveOutfits();
          saveCustomBrands();
          state.view = "closet";
          showToast(`已导入 ${state.garments.length} 件衣物和 ${state.outfits.length} 个穿搭`);
        } catch (error) {
          showToast(error.message);
        }
      });
      reader.readAsText(file);
    });
  });

  document.querySelectorAll("[data-action='restore-seed']").forEach((button) => {
    button.addEventListener("click", () => {
      state.garments = seedGarments;
      state.outfits = seedOutfits;
      state.customBrands = [];
      saveGarments();
      saveOutfits();
      saveCustomBrands();
      showToast("已恢复示例数据");
    });
  });

  document.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = button.dataset.id;
      state.formDraft = null;
      state.selectedGarmentId = "";
      state.view = "add";
      render();
    });
  });

  document.querySelectorAll("[data-action='detail']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedGarmentId = button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("[data-action='wear']").forEach((button) => {
    button.addEventListener("click", () => {
      state.garments = state.garments.map((garment) =>
        garment.id === button.dataset.id ? recordWear(garment) : garment
      );
      saveGarments();
      state.selectedGarmentId = button.dataset.id;
      showToast("已记录今日穿着");
    });
  });

  document.querySelectorAll("[data-action='add-to-outfit']").forEach((button) => {
    button.addEventListener("click", () => {
      state.outfitDraft = {
        ...state.outfitDraft,
        garmentIds: [...new Set([...state.outfitDraft.garmentIds, button.dataset.id])]
      };
      state.view = "outfits";
      showToast("已加入穿搭草稿");
    });
  });

  document.querySelectorAll("[data-action='delete-outfit']").forEach((button) => {
    button.addEventListener("click", () => {
      state.outfits = state.outfits.filter((outfit) => outfit.id !== button.dataset.id);
      saveOutfits();
      showToast("已删除穿搭");
    });
  });

  document.querySelectorAll("[data-action='wear-outfit']").forEach((button) => {
    button.addEventListener("click", () => {
      const outfit = state.outfits.find((item) => item.id === button.dataset.id);
      if (!outfit) return;
      state.garments = recordOutfitWear(state.garments, outfit);
      saveGarments();
      state.view = "outfits";
      showToast(`已记录「${outfit.name}」整套穿着`);
    });
  });

  document.querySelectorAll("[data-action='clear-outfit-draft']").forEach((button) => {
    button.addEventListener("click", () => {
      state.outfitDraft = emptyOutfit();
      state.outfitError = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='clear-care-draft']").forEach((button) => {
    button.addEventListener("click", () => {
      state.careDraft = emptyCareLog();
      state.careError = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='clear-capture']").forEach((button) => {
    button.addEventListener("click", () => {
      state.formDraft = emptyForm();
      state.formError = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='close-detail']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element) return;
      state.selectedGarmentId = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", () => {
      state.garments = state.garments.filter((garment) => garment.id !== button.dataset.id);
      saveGarments();
      render();
    });
  });

  document.querySelectorAll("[data-action='cancel-edit']").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = null;
      state.formDraft = null;
      state.view = "closet";
      state.formError = "";
      render();
    });
  });

  const form = document.querySelector(".garment-form");
  form?.addEventListener("change", (event) => {
    if (event.target.name === "categoryLevel1") {
      const draft = readForm(form);
      draft.categoryLevel2 = "";
      draft.colors = Array.from(form.querySelectorAll("input[name='colors']:checked")).map((item) => item.value);
      state.formDraft = draft;
      render();
    }
    if (event.target.name === "brandSearch") {
      const draft = readForm(form);
      draft.colors = Array.from(form.querySelectorAll("input[name='colors']:checked")).map((item) => item.value);
      state.formDraft = draft;
      render();
    }
    if (event.target.name === "imageFile" && event.target.files?.[0]) {
      const reader = new FileReader();
      reader.addEventListener("load", async () => {
        const pendingDraft = readForm(form);
        pendingDraft.colors = Array.from(form.querySelectorAll("input[name='colors']:checked")).map((item) => item.value);
        state.formDraft = pendingDraft;
        state.isUploadingImage = true;
        render();
        const imageUrl = await uploadImage(reader.result);
        const activeForm = document.querySelector(".garment-form");
        const draft = activeForm ? readForm(activeForm) : state.formDraft || emptyForm();
        draft.imageUrl = imageUrl;
        draft.colors = activeForm
          ? Array.from(activeForm.querySelectorAll("input[name='colors']:checked")).map((item) => item.value)
          : draft.colors;
        state.formDraft = draft;
        state.isUploadingImage = false;
        state.formError = "";
        render();
      });
      reader.readAsDataURL(event.target.files[0]);
    }
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.isUploadingImage) {
      state.formError = "照片还在处理中，请稍等几秒再确认入库";
      render();
      return;
    }
    const values = readForm(form);
    const brandList = allBrands();
    const matchedBrand = normalizeBrand(values.brandSearch, brandList);
    const garmentInput = {
      ...values,
      brandId: matchedBrand?.id || "",
      tags: splitList(values.tags),
      colors: Array.from(form.querySelectorAll("input[name='colors']:checked")).map((item) => item.value)
    };
    const missingFields = getCaptureMissingFields({ ...values, colors: garmentInput.colors }, brandList);
    if (state.view === "capture" && missingFields.length) {
      state.formError = `请补充后再入库：${missingFields.join("、")}`;
      render();
      return;
    }
    const errors = validateGarment(garmentInput, brandList);
    if (Object.keys(errors).length) {
      state.formError = Object.values(errors)[0];
      render();
      return;
    }

    if (state.editingId) {
      state.garments = state.garments.map((garment) =>
        garment.id === state.editingId
          ? { ...garment, ...garmentInput, purchasePrice: garmentInput.purchasePrice ? Number(garmentInput.purchasePrice) : null, updatedAt: new Date().toISOString() }
          : garment
      );
    } else {
      state.garments = [createGarment(garmentInput), ...state.garments];
    }

    saveGarments();
    state.editingId = null;
    state.formDraft = state.view === "capture" ? emptyForm() : null;
    state.formError = "";
    if (state.view !== "capture") state.view = "closet";
    showToast(state.view === "capture" ? "已确认入库，可以继续拍下一件" : "已保存衣物");
  });

  const outfitForm = document.querySelector(".outfit-form");
  outfitForm?.addEventListener("input", () => {
    state.outfitDraft = readOutfitForm(outfitForm);
  });
  outfitForm?.addEventListener("change", () => {
    state.outfitDraft = readOutfitForm(outfitForm);
  });
  outfitForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = readOutfitForm(outfitForm);
    const errors = validateOutfit(values, state.garments);
    if (Object.keys(errors).length) {
      state.outfitError = Object.values(errors)[0];
      render();
      return;
    }
    state.outfits = [createOutfit(values), ...state.outfits];
    saveOutfits();
    state.outfitDraft = emptyOutfit();
    state.outfitError = "";
    showToast("已保存穿搭");
  });

  const careForm = document.querySelector(".care-form");
  careForm?.addEventListener("input", () => {
    state.careDraft = readCareForm(careForm);
  });
  careForm?.addEventListener("change", () => {
    state.careDraft = readCareForm(careForm);
  });
  careForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = readCareForm(careForm);
    const errors = validateCareLog(values, state.garments);
    if (Object.keys(errors).length) {
      state.careError = Object.values(errors)[0];
      render();
      return;
    }
    state.garments = state.garments.map((garment) =>
      garment.id === values.garmentId ? addCareLog(garment, values) : garment
    );
    saveGarments();
    state.careDraft = emptyCareLog();
    state.careError = "";
    showToast("已保存保养记录");
  });
}

function readForm(form) {
  const data = new FormData(form);
  const values = Object.fromEntries(data.entries());
  delete values.imageFile;
  return values;
}

function readOutfitForm(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || ""),
    occasion: String(data.get("occasion") || ""),
    garmentIds: data.getAll("garmentIds").map(String),
    notes: String(data.get("notes") || "")
  };
}

function readCareForm(form) {
  const data = new FormData(form);
  return {
    garmentId: String(data.get("garmentId") || ""),
    type: String(data.get("type") || ""),
    date: String(data.get("date") || ""),
    notes: String(data.get("notes") || "")
  };
}

function readBrandForm(form) {
  const data = new FormData(form);
  return {
    nameEn: String(data.get("nameEn") || ""),
    nameCn: String(data.get("nameCn") || ""),
    aliases: String(data.get("aliases") || "")
  };
}

function splitList(value) {
  return String(value || "")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function colorValue(color) {
  const palette = {
    Black: "#171717",
    White: "#ffffff",
    Grey: "#8e8a84",
    Navy: "#1f2a44",
    Brown: "#6b4a36",
    Tan: "#c7a77a",
    Red: "#9d2633",
    Pink: "#dca3b6",
    Green: "#657668",
    Blue: "#4c6f93",
    Beige: "#d8ccb9",
    Gold: "#b79b63",
    Silver: "#c4c7c9"
  };
  return palette[color] || "#ded8cf";
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
hydrateRemote();
