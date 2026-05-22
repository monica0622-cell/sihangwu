import { brands, categories } from "./data.js";

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeBrand(input, brandList = brands) {
  const value = normalizeText(input);
  if (!value) return null;

  return (
    brandList.find((brand) => normalizeText(brand.nameEn) === value) ||
    brandList.find((brand) => normalizeText(brand.nameCn) === value) ||
    brandList.find((brand) => brand.aliases.some((alias) => normalizeText(alias) === value)) ||
    null
  );
}

export function slugifyBrandId(name, existingIds = []) {
  const base = normalizeText(name)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const taken = new Set(existingIds);
  let id = `custom-${base || "brand"}`;
  let index = 2;
  while (taken.has(id)) {
    id = `custom-${base || "brand"}-${index}`;
    index += 1;
  }
  return id;
}

export function validateBrandInput(input, brandList = brands) {
  const errors = {};
  const nameEn = String(input.nameEn || "").trim();
  if (!nameEn) {
    errors.nameEn = "请输入品牌英文名";
  } else if (normalizeBrand(nameEn, brandList)) {
    errors.nameEn = "品牌库中已存在该品牌";
  }
  return errors;
}

export function createBrand(input, brandList = brands) {
  const errors = validateBrandInput(input, brandList);
  if (Object.keys(errors).length) {
    throw new Error(Object.values(errors)[0]);
  }
  const nameEn = String(input.nameEn || "").trim();
  const nameCn = String(input.nameCn || "").trim();
  const aliases = Array.isArray(input.aliases)
    ? input.aliases.map(String)
    : String(input.aliases || "").split(/[,，]/);
  return {
    id: slugifyBrandId(nameEn, brandList.map((brand) => brand.id)),
    nameEn,
    nameCn,
    aliases: aliases.map((alias) => alias.trim()).filter(Boolean),
    firstLetter: nameEn[0].toUpperCase(),
    isActive: true,
    isCustom: true
  };
}

export function getCategory(code, categoryList = categories) {
  return categoryList.find((category) => category.code === code) || null;
}

export function getSubcategory(categoryCode, subcategoryCode, categoryList = categories) {
  const category = getCategory(categoryCode, categoryList);
  return category?.subs.find((sub) => sub.code === subcategoryCode) || null;
}

export function validateGarment(input, brandList = brands, categoryList = categories) {
  const errors = {};
  if (!input.brandId || !brandList.some((brand) => brand.id === input.brandId)) {
    errors.brandId = "请选择标准品牌";
  }
  if (!input.categoryLevel1 || !getCategory(input.categoryLevel1, categoryList)) {
    errors.categoryLevel1 = "请选择一级品类";
  }
  if (!input.categoryLevel2 || !getSubcategory(input.categoryLevel1, input.categoryLevel2, categoryList)) {
    errors.categoryLevel2 = "请选择对应二级品类";
  }
  if (!input.colors?.length) {
    errors.colors = "至少选择一个颜色";
  }
  if (!input.status) {
    errors.status = "请选择使用状态";
  }
  return errors;
}

export function filterGarments(garments, filters = {}, brandList = brands, categoryList = categories) {
  const query = normalizeText(filters.query);
  return garments.filter((garment) => {
    if (!filters.showArchived && ["Donated", "Discarded"].includes(garment.status)) return false;
    if (filters.brandId && garment.brandId !== filters.brandId) return false;
    if (filters.categoryLevel1 && garment.categoryLevel1 !== filters.categoryLevel1) return false;
    if (filters.categoryLevel2 && garment.categoryLevel2 !== filters.categoryLevel2) return false;
    if (filters.color && !garment.colors.includes(filters.color)) return false;
    if (filters.season && garment.season !== filters.season) return false;
    if (filters.status && garment.status !== filters.status) return false;
    if (filters.tag && !garment.tags.includes(filters.tag)) return false;
    if (filters.minPrice && Number(garment.purchasePrice || 0) < Number(filters.minPrice)) return false;
    if (filters.maxPrice && Number(garment.purchasePrice || 0) > Number(filters.maxPrice)) return false;

    if (!query) return true;
    const brand = brandList.find((item) => item.id === garment.brandId);
    const category = getCategory(garment.categoryLevel1, categoryList);
    const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2, categoryList);
    const searchable = [
      brand?.nameEn,
      brand?.nameCn,
      ...(brand?.aliases || []),
      category?.nameCn,
      category?.nameEn,
      subcategory?.nameCn,
      subcategory?.nameEn,
      ...(garment.tags || []),
      garment.notes
    ]
      .map(normalizeText)
      .join(" ");
    return searchable.includes(query);
  });
}

export function getStats(garments, brandList = brands) {
  const activeGarments = garments.filter((garment) => !["Donated", "Discarded"].includes(garment.status));
  const priced = activeGarments.filter(
    (garment) => garment.purchasePrice !== null && garment.purchasePrice !== "" && Number.isFinite(Number(garment.purchasePrice))
  );
  const priceTotal = priced.reduce((sum, garment) => sum + Number(garment.purchasePrice), 0);

  return {
    total: activeGarments.length,
    statusCounts: countBy(activeGarments, "status"),
    categoryCounts: countBy(activeGarments, "categoryLevel1"),
    seasonCounts: countBy(activeGarments, "season"),
    colorCounts: countColors(activeGarments),
    brandCounts: activeGarments.reduce((counts, garment) => {
      const brand = brandList.find((item) => item.id === garment.brandId);
      const label = brand?.nameEn || garment.brandId;
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {}),
    priceTotal,
    averagePrice: priced.length ? priceTotal / priced.length : 0,
    wearCount: activeGarments.reduce((sum, garment) => sum + getWearCount(garment), 0)
  };
}

export function getWearCount(garment) {
  return Array.isArray(garment.wearDates) ? garment.wearDates.length : 0;
}

export function getLastWorn(garment) {
  const dates = Array.isArray(garment.wearDates) ? garment.wearDates : [];
  return dates.length ? [...dates].sort().at(-1) : "";
}

export function getCostPerWear(garment) {
  const wears = getWearCount(garment);
  const price = Number(garment.purchasePrice);
  if (!wears || !Number.isFinite(price) || price <= 0) return null;
  return price / wears;
}

export function getCareCount(garment) {
  return Array.isArray(garment.careLogs) ? garment.careLogs.length : 0;
}

export function getLastCare(garment) {
  const logs = Array.isArray(garment.careLogs) ? garment.careLogs : [];
  return logs.length ? [...logs].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) : null;
}

export function validateCareLog(input, garments) {
  const errors = {};
  if (!garments.some((garment) => garment.id === input.garmentId)) {
    errors.garmentId = "请选择衣物";
  }
  if (!String(input.type || "").trim()) {
    errors.type = "请选择保养类型";
  }
  if (!String(input.date || "").trim()) {
    errors.date = "请选择日期";
  }
  return errors;
}

export function createCareLog(input) {
  return {
    id: crypto.randomUUID(),
    type: String(input.type || "").trim(),
    date: String(input.date || new Date().toISOString().slice(0, 10)),
    notes: String(input.notes || "").trim()
  };
}

export function addCareLog(garment, input) {
  const log = createCareLog(input);
  return {
    ...garment,
    careLogs: [...(Array.isArray(garment.careLogs) ? garment.careLogs : []), log].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    ),
    updatedAt: new Date().toISOString()
  };
}

export function getTimelineEvents(garments, options = {}, brandList = brands, categoryList = categories) {
  const events = [];
  for (const garment of garments) {
    const brand = brandList.find((item) => item.id === garment.brandId);
    const category = getCategory(garment.categoryLevel1, categoryList);
    const subcategory = getSubcategory(garment.categoryLevel1, garment.categoryLevel2, categoryList);
    const garmentLabel = [brand?.nameEn, subcategory?.nameCn].filter(Boolean).join(" · ");

    for (const date of garment.wearDates || []) {
      events.push({
        id: `${garment.id}:wear:${date}`,
        type: "wear",
        date,
        garmentId: garment.id,
        title: "穿着",
        garmentLabel,
        meta: category?.nameCn || "",
        notes: ""
      });
    }

    for (const log of garment.careLogs || []) {
      events.push({
        id: `${garment.id}:care:${log.id}`,
        type: "care",
        careType: log.type,
        date: log.date,
        garmentId: garment.id,
        title: log.type,
        garmentLabel,
        meta: category?.nameCn || "",
        notes: log.notes || ""
      });
    }
  }

  return events
    .filter((event) => !options.type || event.type === options.type)
    .filter((event) => !options.garmentId || event.garmentId === options.garmentId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.garmentLabel.localeCompare(b.garmentLabel));
}

export function recordWear(garment, date = new Date().toISOString().slice(0, 10)) {
  const dates = Array.isArray(garment.wearDates) ? garment.wearDates : [];
  if (dates.includes(date)) return { ...garment, wearDates: dates };
  return {
    ...garment,
    wearDates: [...dates, date].sort(),
    updatedAt: new Date().toISOString()
  };
}

export function recordOutfitWear(garments, outfit, date = new Date().toISOString().slice(0, 10)) {
  const garmentIds = new Set(Array.isArray(outfit?.garmentIds) ? outfit.garmentIds : []);
  return garments.map((garment) => (garmentIds.has(garment.id) ? recordWear(garment, date) : garment));
}

export function countColors(garments) {
  return garments.reduce((counts, garment) => {
    for (const color of garment.colors || []) {
      counts[color] = (counts[color] || 0) + 1;
    }
    return counts;
  }, {});
}

export function topEntries(counts, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

export function sortGarments(garments, sortBy = "recent", brandList = brands) {
  const list = [...garments];
  if (sortBy === "priceDesc") {
    return list.sort((a, b) => Number(b.purchasePrice || 0) - Number(a.purchasePrice || 0));
  }
  if (sortBy === "brandAz") {
    return list.sort((a, b) => {
      const brandA = brandList.find((brand) => brand.id === a.brandId)?.nameEn || "";
      const brandB = brandList.find((brand) => brand.id === b.brandId)?.nameEn || "";
      return brandA.localeCompare(brandB);
    });
  }
  return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "Unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function groupBrandsWithCounts(garments, brandList = brands) {
  const counts = countBy(
    garments.filter((garment) => !["Donated", "Discarded"].includes(garment.status)),
    "brandId"
  );
  return brandList
    .filter((brand) => counts[brand.id])
    .map((brand) => ({ ...brand, count: counts[brand.id] }))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

export function listBrandRegistry(garments, options = {}, brandList = brands) {
  const query = normalizeText(options.query);
  const counts = countBy(
    garments.filter((garment) => !["Donated", "Discarded"].includes(garment.status)),
    "brandId"
  );

  return brandList
    .map((brand) => ({ ...brand, count: counts[brand.id] || 0 }))
    .filter((brand) => !options.letter || brand.firstLetter === options.letter)
    .filter((brand) => {
      if (!query) return true;
      return [brand.nameEn, brand.nameCn, ...(brand.aliases || [])].map(normalizeText).join(" ").includes(query);
    })
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

export function serializeWardrobe(garments, outfits = [], customBrands = []) {
  return JSON.stringify(
    {
      schema: "smart-wardrobe.garments.v1",
      exportedAt: new Date().toISOString(),
      garments,
      outfits,
      customBrands
    },
    null,
    2
  );
}

export function parseWardrobeImport(raw, brandList = brands, categoryList = categories) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("导入文件不是有效的 JSON");
  }

  const garments = Array.isArray(parsed) ? parsed : parsed?.garments;
  if (!Array.isArray(garments)) {
    throw new Error("导入文件缺少 garments 数组");
  }

  return garments.map((garment, index) => {
    const normalized = normalizeGarmentRecord(garment);
    const errors = validateGarment(normalized, brandList, categoryList);
    if (Object.keys(errors).length) {
      throw new Error(`第 ${index + 1} 件衣物无效：${Object.values(errors)[0]}`);
    }
    return normalized;
  });
}

export function parseWardrobeBackup(raw, brandList = brands, categoryList = categories) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("导入文件不是有效的 JSON");
  }
  const customBrands = Array.isArray(parsed?.customBrands)
    ? normalizeCustomBrandRecords(parsed.customBrands, brandList)
    : [];
  const garments = parseWardrobeImport(raw, [...brandList, ...customBrands], categoryList);
  const outfits = Array.isArray(parsed?.outfits)
    ? parsed.outfits.map((outfit, index) => normalizeOutfitRecord(outfit, index, garments))
    : [];
  return { garments, outfits, customBrands };
}

export function normalizeCustomBrandRecords(customBrands, brandList = brands) {
  const merged = [...brandList];
  const normalized = [];
  for (const brand of customBrands) {
    const nameEn = String(brand.nameEn || "").trim();
    if (!nameEn || normalizeBrand(nameEn, merged)) continue;
    const record = {
      id: String(brand.id || slugifyBrandId(nameEn, merged.map((item) => item.id))),
      nameEn,
      nameCn: String(brand.nameCn || "").trim(),
      aliases: Array.isArray(brand.aliases) ? brand.aliases.map(String).filter(Boolean) : [],
      firstLetter: String(brand.firstLetter || nameEn[0]).toUpperCase(),
      isActive: true,
      isCustom: true
    };
    merged.push(record);
    normalized.push(record);
  }
  return normalized;
}

export function normalizeGarmentRecord(garment) {
  return {
    id: String(garment.id || crypto.randomUUID()),
    imageUrl: String(garment.imageUrl || garment.image_url || ""),
    brandId: String(garment.brandId || garment.brand_id || ""),
    categoryLevel1: String(garment.categoryLevel1 || garment.category_level_1 || ""),
    categoryLevel2: String(garment.categoryLevel2 || garment.category_level_2 || ""),
    colors: Array.isArray(garment.colors) ? garment.colors.map(String).filter(Boolean) : [],
    season: String(garment.season || "All-Year"),
    purchasePrice:
      garment.purchasePrice === null || garment.purchasePrice === "" || garment.purchase_price === null || garment.purchase_price === ""
        ? null
        : Number(garment.purchasePrice ?? garment.purchase_price ?? 0),
    currency: String(garment.currency || "CNY"),
    status: String(garment.status || "InCloset"),
    tags: Array.isArray(garment.tags) ? garment.tags.map(String).filter(Boolean) : [],
    wearDates: Array.isArray(garment.wearDates) ? garment.wearDates.map(String).filter(Boolean).sort() : [],
    careLogs: Array.isArray(garment.careLogs)
      ? garment.careLogs.map((log) => ({
          id: String(log.id || crypto.randomUUID()),
          type: String(log.type || ""),
          date: String(log.date || ""),
          notes: String(log.notes || "")
        }))
      : [],
    notes: String(garment.notes || ""),
    createdAt: String(garment.createdAt || garment.created_at || new Date().toISOString()),
    updatedAt: String(garment.updatedAt || garment.updated_at || new Date().toISOString())
  };
}

export function normalizeOutfitRecord(outfit, index, garments) {
  const normalized = {
    id: String(outfit.id || crypto.randomUUID()),
    name: String(outfit.name || "").trim(),
    occasion: String(outfit.occasion || "").trim(),
    garmentIds: Array.isArray(outfit.garmentIds) ? [...new Set(outfit.garmentIds.map(String))] : [],
    notes: String(outfit.notes || "").trim(),
    createdAt: String(outfit.createdAt || new Date().toISOString()),
    updatedAt: String(outfit.updatedAt || new Date().toISOString())
  };
  const errors = validateOutfit(normalized, garments);
  if (Object.keys(errors).length) {
    throw new Error(`第 ${index + 1} 个穿搭无效：${Object.values(errors)[0]}`);
  }
  return normalized;
}

export function createGarment(input) {
  return {
    id: crypto.randomUUID(),
    imageUrl: input.imageUrl || "",
    brandId: input.brandId,
    categoryLevel1: input.categoryLevel1,
    categoryLevel2: input.categoryLevel2,
    colors: input.colors,
    season: input.season || "All-Year",
    purchasePrice: input.purchasePrice ? Number(input.purchasePrice) : null,
    currency: "CNY",
    status: input.status || "InCloset",
    tags: input.tags || [],
    wearDates: input.wearDates || [],
    careLogs: input.careLogs || [],
    notes: input.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function validateOutfit(input, garments) {
  const errors = {};
  if (!String(input.name || "").trim()) {
    errors.name = "请输入穿搭名称";
  }
  const garmentIds = Array.isArray(input.garmentIds) ? input.garmentIds : [];
  if (!garmentIds.length) {
    errors.garmentIds = "至少选择一件衣物";
  }
  const validIds = new Set(garments.map((garment) => garment.id));
  if (garmentIds.some((id) => !validIds.has(id))) {
    errors.garmentIds = "穿搭中包含不存在的衣物";
  }
  return errors;
}

export function createOutfit(input) {
  return {
    id: crypto.randomUUID(),
    name: String(input.name || "").trim(),
    occasion: String(input.occasion || "").trim(),
    garmentIds: [...new Set(input.garmentIds || [])],
    notes: String(input.notes || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function getOutfitStats(outfits) {
  return {
    total: outfits.length,
    occasionCounts: countBy(outfits, "occasion")
  };
}
