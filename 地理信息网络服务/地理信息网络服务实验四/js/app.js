(function () {
  const storageKeys = {
    basemap: "webgis:selected-basemap",
    geoserver: "webgis:geoserver-config:v15",
    layerOffset: "webgis:layer-offset"
  };

  const els = {
    basemapList: document.getElementById("basemap-list"),
    overlayList: document.getElementById("overlay-list"),
    status: document.getElementById("system-status"),
    geoserverForm: document.getElementById("geoserver-form"),
    baseUrl: document.getElementById("geoserver-base-url"),
    workspace: document.getElementById("geoserver-workspace"),
    layerName: document.getElementById("geoserver-layer"),
    layerTitle: document.getElementById("geoserver-layer-title"),
    queryField: document.getElementById("geoserver-query-field"),
    queryLayerSelect: document.getElementById("query-layer-select"),
    overlayOpacity: document.getElementById("overlay-opacity"),
    overlayOpacityValue: document.getElementById("overlay-opacity-value"),
    clickQueryEnabled: document.getElementById("click-query-enabled"),
    attributeKeyword: document.getElementById("attribute-keyword"),
    attributeQuery: document.getElementById("attribute-query"),
    zoomToResults: document.getElementById("zoom-to-results"),
    clearResults: document.getElementById("clear-results"),
    resultCount: document.getElementById("result-count"),
    resultList: document.getElementById("result-list"),
    popup: document.getElementById("popup"),
    popupContent: document.getElementById("popup-content"),
    popupCloser: document.getElementById("popup-closer"),
    clearPopup: document.getElementById("clear-popup"),
    homeView: document.getElementById("home-view"),
    mapStage: document.querySelector(".map-stage"),
    toggleLayerDrag: document.getElementById("toggle-layer-drag"),
    resetLayerOffset: document.getElementById("reset-layer-offset"),
    layerOffsetValue: document.getElementById("layer-offset-value")
  };

  const projection = WEBGIS_CONFIG.mapProjection || "EPSG:3857";
  const defaultGeoserver = WEBGIS_CONFIG.geoserver;
  const savedGeoserver = readJson(storageKeys.geoserver, {});
  const geoserverConfig = {
    ...defaultGeoserver,
    ...pick(savedGeoserver, ["baseUrl", "workspace", "layerName", "layerTitle", "queryField", "maxFeatures"]),
    dataProjection: projection,
    layers: defaultGeoserver.layers
  };
  const mapProjection = ol.proj.get(projection) || projection;

  const baseLayers = new Map();
  const overlayLayers = new Map();
  const layerOffset = readLayerOffset();
  let activeFeatures = [];
  let lastQueryCoordinate = null;
  let layerDragEnabled = false;
  let layerDragState = null;

  const view = new ol.View({
    projection: mapProjection,
    center: ol.proj.transform(WEBGIS_CONFIG.initialView.center, "EPSG:4326", projection),
    zoom: WEBGIS_CONFIG.initialView.zoom,
    minZoom: WEBGIS_CONFIG.initialView.minZoom,
    maxZoom: WEBGIS_CONFIG.initialView.maxZoom
  });

  const popupOverlay = new ol.Overlay({
    element: els.popup,
    autoPan: {
      animation: {
        duration: 220
      }
    },
    positioning: "bottom-center",
    stopEvent: true
  });

  const highlightSource = new ol.source.Vector();
  const highlightLayer = new ol.layer.Vector({
    source: highlightSource,
    zIndex: 90,
    style: createHighlightStyle
  });

  const map = new ol.Map({
    target: "map",
    layers: [],
    overlays: [popupOverlay],
    view,
    controls: createDefaultControls({
      attributionOptions: {
        collapsible: true
      }
    }).extend([
      new ol.control.ScaleLine(),
      new ol.control.FullScreen(),
      new ol.control.MousePosition({
        target: document.getElementById("mouse-position"),
        projection: "EPSG:4326",
        coordinateFormat: (coord) => {
          if (!coord) return "";
          return `经度 ${coord[0].toFixed(6)}，纬度 ${coord[1].toFixed(6)}`;
        }
      })
    ])
  });

  initialize();

  function initialize() {
    fillGeoserverForm();
    if (window.location.protocol === "file:") {
      renderError("当前是 file:// 打开方式，无法连接 GeoServer。请在本目录运行 node server.js，然后访问 http://127.0.0.1:5500。");
      setStatus("请使用本地服务打开", "error");
      return;
    }
    createBaseLayers();
    renderBasemapSwitcher();
    renderOverlayControls();
    renderQueryLayerOptions();
    selectBasemap(readStoredBasemap());
    map.addLayer(highlightLayer);
    renderEmptyResults();
    bindEvents();
    updateOpacityLabel();
    updateLayerOffsetLabel();
    loadConfiguredLayers();
  }

  function createDefaultControls(options) {
    if (typeof ol.control.defaults === "function") {
      return ol.control.defaults(options);
    }
    if (ol.control.defaults && typeof ol.control.defaults.defaults === "function") {
      return ol.control.defaults.defaults(options);
    }
    return new ol.Collection();
  }

  function fillGeoserverForm() {
    els.baseUrl.value = geoserverConfig.baseUrl;
    els.workspace.value = geoserverConfig.workspace;
    els.layerName.value = geoserverConfig.layerName;
    els.layerTitle.value = geoserverConfig.layerTitle;
    els.queryField.value = geoserverConfig.queryField;
  }

  function createBaseLayers() {
    WEBGIS_CONFIG.basemaps.forEach((item, index) => {
      const layer = new ol.layer.Tile({
        visible: false,
        zIndex: index,
        properties: {
          basemapId: item.id,
          title: item.title
        },
        source: createBaseLayerSource(item)
      });
      baseLayers.set(item.id, layer);
      map.addLayer(layer);
    });
  }

  function createBaseLayerSource(item) {
    return new ol.source.XYZ({
      projection: "EPSG:3857",
      url: item.url,
      crossOrigin: "anonymous",
      attributions: item.attributions,
      maxZoom: item.maxZoom,
      transition: 160
    });
  }

  function renderBasemapSwitcher() {
    els.basemapList.innerHTML = "";
    WEBGIS_CONFIG.basemaps.forEach((item) => {
      const label = document.createElement("label");
      label.className = "basemap-option";
      label.innerHTML = `
        <input type="radio" name="basemap" value="${escapeHtml(item.id)}" />
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.description)}</span>
        </span>
      `;
      els.basemapList.appendChild(label);
    });
  }

  function renderOverlayControls() {
    els.overlayList.innerHTML = "";
    geoserverConfig.layers.forEach((item) => {
      const label = document.createElement("label");
      label.className = "overlay-item";
      label.innerHTML = `
        <input type="checkbox" data-layer-id="${escapeHtml(item.id)}" ${item.visible ? "checked" : ""} />
        <span>${escapeHtml(item.title)}</span>
        <i class="overlay-swatch" style="background:${escapeHtml(item.fill || item.color)}"></i>
      `;
      els.overlayList.appendChild(label);
    });
  }

  function renderQueryLayerOptions() {
    els.queryLayerSelect.innerHTML = "";
    geoserverConfig.layers.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.title;
      option.dataset.queryField = item.queryField || "name";
      els.queryLayerSelect.appendChild(option);
    });

    const selected = geoserverConfig.layers.find((item) => item.name === geoserverConfig.layerName);
    els.queryLayerSelect.value = selected ? selected.name : geoserverConfig.layers[0].name;
    syncQueryLayerFields();
  }

  function bindEvents() {
    els.basemapList.addEventListener("change", (event) => {
      const id = event.target.value;
      if (id) selectBasemap(id);
    });

    els.overlayList.addEventListener("change", (event) => {
      const id = event.target.dataset.layerId;
      if (!id) return;
      const entry = overlayLayers.get(id);
      if (entry) entry.layer.setVisible(event.target.checked);
    });

    els.geoserverForm.addEventListener("submit", (event) => {
      event.preventDefault();
      updateGeoserverConfigFromForm();
      persistGeoserverConfig();
      loadConfiguredLayers();
      closePopup();
      clearResults(false);
    });

    els.queryLayerSelect.addEventListener("change", () => {
      syncQueryLayerFields();
      persistGeoserverConfig();
    });

    els.overlayOpacity.addEventListener("input", () => {
      updateOpacityLabel();
      overlayLayers.forEach((entry) => entry.layer.setOpacity(Number(els.overlayOpacity.value)));
    });

    els.toggleLayerDrag.addEventListener("click", () => {
      setLayerDragEnabled(!layerDragEnabled);
    });

    els.resetLayerOffset.addEventListener("click", resetLayerOffset);

    els.attributeQuery.addEventListener("click", () => runAttributeQuery());

    els.attributeKeyword.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runAttributeQuery();
    });

    els.zoomToResults.addEventListener("click", zoomToHighlightedFeatures);
    els.clearResults.addEventListener("click", () => clearResults());
    els.popupCloser.addEventListener("click", closePopup);
    els.clearPopup.addEventListener("click", closePopup);
    els.homeView.addEventListener("click", resetHomeView);

    map.on("pointerdown", startLayerDrag);
    map.on("pointerdrag", dragLayer);
    map.on("pointerup", endLayerDrag);

    map.on("singleclick", (event) => {
      if (layerDragEnabled || !els.clickQueryEnabled.checked) return;
      runMapClickQuery(event.pixel, event.coordinate);
    });
  }

  function readStoredBasemap() {
    const stored = localStorage.getItem(storageKeys.basemap);
    const exists = WEBGIS_CONFIG.basemaps.some((item) => item.id === stored);
    return exists ? stored : WEBGIS_CONFIG.basemaps[0].id;
  }

  function selectBasemap(id) {
    baseLayers.forEach((layer, layerId) => {
      layer.setVisible(layerId === id);
    });
    const radios = [...els.basemapList.querySelectorAll('input[name="basemap"]')];
    const radio = radios.find((item) => item.value === id);
    if (radio) radio.checked = true;
    localStorage.setItem(storageKeys.basemap, id);
  }

  function loadConfiguredLayers(options = {}) {
    clearOverlayLayers();
    setStatus("正在连接 GeoServer 图层", "warn");

    const loads = geoserverConfig.layers.map((config, index) => {
      const source = new ol.source.Vector();
      const layer = new ol.layer.Vector({
        source,
        visible: config.visible,
        opacity: Number(els.overlayOpacity.value),
        zIndex: 20 + index,
        style: createLayerStyle(config)
      });

      overlayLayers.set(config.id, {
        config,
        layer,
        source
      });
      map.addLayer(layer);

      return loadVectorFeatures(config, source);
    });

    Promise.allSettled(loads).then((results) => {
      const failed = results.filter((item) => item.status === "rejected");
      const loadedCount = geoserverConfig.layers.length - failed.length;
      const featureCount = results
        .filter((item) => item.status === "fulfilled")
        .reduce((total, item) => total + item.value, 0);
      if (loadedCount > 0) {
        if (options.fit !== false) fitAllOverlayFeatures();
        setStatus(`已加载 ${loadedCount} 个图层 / ${featureCount} 个要素`, "ready");
      } else {
        setStatus("GeoServer 图层连接失败", "error");
      }
      if (failed.length > 0) {
        renderError("部分图层加载失败，请检查 GeoServer WFS 权限、图层名和跨域设置。");
      }
    });
  }

  function clearOverlayLayers() {
    overlayLayers.forEach((entry) => map.removeLayer(entry.layer));
    overlayLayers.clear();
  }

  async function loadVectorFeatures(config, source) {
    const url = buildWfsQueryUrl({
      layerName: config.name,
      field: "",
      keyword: "",
      maxFeatures: geoserverConfig.maxFeatures
    });
    const json = await fetchJson(url);
    const features = readGeoJsonFeatures(json, config);
    features.forEach((feature) => {
      feature.set("_layerName", config.name, true);
      feature.set("_layerTitle", config.title, true);
    });
    source.addFeatures(features);
    return features.length;
  }

  function updateGeoserverConfigFromForm() {
    geoserverConfig.baseUrl = normalizeBaseUrl(els.baseUrl.value);
    geoserverConfig.workspace = els.workspace.value.trim();
    geoserverConfig.layerName = els.layerName.value.trim();
    geoserverConfig.layerTitle = els.layerTitle.value.trim() || geoserverConfig.layerName;
    geoserverConfig.queryField = els.queryField.value.trim();
    geoserverConfig.dataProjection = projection;
  }

  function persistGeoserverConfig() {
    geoserverConfig.layerName = els.queryLayerSelect.value || geoserverConfig.layerName;
    geoserverConfig.queryField = els.queryField.value.trim() || geoserverConfig.queryField;
    localStorage.setItem(
      storageKeys.geoserver,
      JSON.stringify({
        baseUrl: geoserverConfig.baseUrl,
        workspace: geoserverConfig.workspace,
        layerName: geoserverConfig.layerName,
        layerTitle: geoserverConfig.layerTitle,
        queryField: geoserverConfig.queryField,
        maxFeatures: geoserverConfig.maxFeatures
      })
    );
  }

  function syncQueryLayerFields() {
    const selected = geoserverConfig.layers.find((item) => item.name === els.queryLayerSelect.value);
    if (!selected) return;
    geoserverConfig.layerName = selected.name;
    geoserverConfig.layerTitle = selected.title;
    geoserverConfig.queryField = selected.queryField || "name";
    els.layerName.value = geoserverConfig.layerName;
    els.layerTitle.value = geoserverConfig.layerTitle;
    els.queryField.value = geoserverConfig.queryField;
  }

  function getWfsUrl() {
    const base = normalizeBaseUrl(geoserverConfig.baseUrl);
    return geoserverConfig.workspace ? `${base}/${geoserverConfig.workspace}/ows` : `${base}/ows`;
  }

  function runMapClickQuery(pixel, coordinate) {
    const hits = [];
    map.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => {
        if (layer === highlightLayer) return undefined;
        const entry = findOverlayEntryByLayer(layer);
        if (!entry) return undefined;
        hits.push({ feature, config: entry.config });
        return undefined;
      },
      {
        hitTolerance: 6
      }
    );

    lastQueryCoordinate = coordinate;
    activeFeatures = hits.map((hit) => hit.feature);
    setHighlightFeatures(activeFeatures);
    renderResults(activeFeatures, hits.map((hit) => hit.config));

    if (hits.length > 0) {
      showPopup(coordinate, hits[0].feature, hits[0].config.title);
      setStatus(`查询到 ${hits.length} 个要素`, "ready");
    } else {
      showMessagePopup(coordinate, "未查询到要素");
      setStatus("未查询到要素", "warn");
    }
  }

  async function runAttributeQuery() {
    syncQueryLayerFields();

    const keyword = els.attributeKeyword.value.trim();
    const field = geoserverConfig.queryField.trim();

    if (keyword && !field) {
      renderError("属性关键字查询需要填写查询字段。");
      return;
    }

    const config = geoserverConfig.layers.find((item) => item.name === geoserverConfig.layerName) || {
      name: geoserverConfig.layerName,
      title: geoserverConfig.layerTitle,
      queryField: field
    };

    setStatus("正在执行属性查询", "warn");
    closePopup();

    try {
      const url = buildWfsQueryUrl({
        layerName: config.name,
        field,
        keyword,
        maxFeatures: geoserverConfig.maxFeatures
      });
      const json = await fetchJson(url);
      const features = readGeoJsonFeatures(json, config);
      features.forEach((feature) => {
        feature.set("_layerName", config.name, true);
        feature.set("_layerTitle", config.title, true);
      });

      activeFeatures = features;
      setHighlightFeatures(features);
      renderResults(features, features.map(() => config));

      if (features.length > 0) {
        zoomToHighlightedFeatures();
        setStatus(`查询到 ${features.length} 个要素`, "ready");
      } else {
        renderEmptyResults();
        setStatus("未查询到要素", "warn");
      }
    } catch (error) {
      handleQueryError(error);
    }
  }

  function buildWfsQueryUrl(options) {
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.1.0",
      request: "GetFeature",
      typeName: options.layerName,
      outputFormat: "application/json",
      srsName: projection,
      maxFeatures: String(options.maxFeatures || geoserverConfig.maxFeatures)
    });

    if (options.field && options.keyword) {
      params.set("CQL_FILTER", `${options.field} ILIKE '%${escapeCqlLike(options.keyword)}%'`);
    }

    return `${getWfsUrl()}?${params.toString()}`;
  }

  async function fetchJson(url) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        mode: "same-origin"
      });
    } catch (error) {
      throw new Error(`无法请求 ${url}`);
    }

    if (!response.ok) {
      throw new Error(`${url} 返回 ${response.status}`);
    }

    return response.json();
  }

  function readGeoJsonFeatures(json, config) {
    if (!json || !Array.isArray(json.features)) return [];
    const featureDataProjection = config.dataProjection || geoserverConfig.dataProjection || projection;
    const rawJson = {
      ...json,
      crs: undefined
    };
    const features = new ol.format.GeoJSON().readFeatures(rawJson, {
      dataProjection: featureDataProjection,
      featureProjection: projection
    });
    applyLayerOffset(features);
    return features;
  }

  function setLayerDragEnabled(enabled) {
    layerDragEnabled = enabled;
    layerDragState = null;
    els.toggleLayerDrag.classList.toggle("active", enabled);
    els.toggleLayerDrag.setAttribute("aria-pressed", String(enabled));
    els.mapStage.classList.toggle("drag-mode", enabled);
    els.mapStage.classList.remove("dragging");
    setMapDragPanActive(!enabled);
    setStatus(enabled ? "拖动模式已开启：按住专题要素可整体移动图层" : "拖动模式已关闭", enabled ? "warn" : "ready");
  }

  function startLayerDrag(event) {
    if (!layerDragEnabled || !isOverlayFeatureAtPixel(event.pixel)) return;
    closePopup();
    layerDragState = {
      coordinate: event.coordinate
    };
    els.mapStage.classList.add("dragging");
    event.preventDefault();
  }

  function dragLayer(event) {
    if (!layerDragState) return;
    const dx = event.coordinate[0] - layerDragState.coordinate[0];
    const dy = event.coordinate[1] - layerDragState.coordinate[1];
    if (dx === 0 && dy === 0) return;
    translateLayerFeatures(dx, dy);
    layerOffset.x += dx;
    layerOffset.y += dy;
    layerDragState.coordinate = event.coordinate;
    updateLayerOffsetLabel();
    event.preventDefault();
  }

  function endLayerDrag() {
    if (!layerDragState) return;
    layerDragState = null;
    els.mapStage.classList.remove("dragging");
    persistLayerOffset();
    setStatus(`图层偏移已保存：X ${formatMeter(layerOffset.x)} / Y ${formatMeter(layerOffset.y)}`, "ready");
  }

  function resetLayerOffset() {
    if (layerOffset.x === 0 && layerOffset.y === 0) return;
    translateLayerFeatures(-layerOffset.x, -layerOffset.y);
    layerOffset.x = 0;
    layerOffset.y = 0;
    persistLayerOffset();
    updateLayerOffsetLabel();
    closePopup();
    setStatus("图层偏移已复位", "ready");
  }

  function translateLayerFeatures(dx, dy) {
    const translated = new Set();
    overlayLayers.forEach((entry) => translateFeatures(entry.source.getFeatures(), dx, dy, translated));
    translateFeatures(highlightSource.getFeatures(), dx, dy, translated);
    translateFeatures(activeFeatures, dx, dy, translated);
  }

  function translateFeatures(features, dx, dy, translated) {
    features.forEach((feature) => {
      const geometry = feature.getGeometry();
      if (!geometry || translated.has(geometry)) return;
      geometry.translate(dx, dy);
      translated.add(geometry);
    });
  }

  function applyLayerOffset(features) {
    if (layerOffset.x === 0 && layerOffset.y === 0) return;
    translateFeatures(features, layerOffset.x, layerOffset.y, new Set());
  }

  function updateLayerOffsetLabel() {
    els.layerOffsetValue.textContent = `X ${formatMeter(layerOffset.x)} / Y ${formatMeter(layerOffset.y)}`;
  }

  function persistLayerOffset() {
    localStorage.setItem(storageKeys.layerOffset, JSON.stringify(layerOffset));
  }

  function readLayerOffset() {
    const saved = readJson(storageKeys.layerOffset, {});
    return {
      x: Number(saved.x) || 0,
      y: Number(saved.y) || 0
    };
  }

  function isOverlayFeatureAtPixel(pixel) {
    let found = false;
    map.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => {
        if (layer !== highlightLayer && findOverlayEntryByLayer(layer)) found = true;
        return found;
      },
      {
        hitTolerance: 8
      }
    );
    return found;
  }

  function setMapDragPanActive(active) {
    map.getInteractions().forEach((interaction) => {
      if (interaction instanceof ol.interaction.DragPan || interaction.constructor.name === "DragPan") {
        interaction.setActive(active);
      }
    });
  }

  function setHighlightFeatures(features) {
    highlightSource.clear();
    if (features.length > 0) {
      highlightSource.addFeatures(features.map((feature) => feature.clone()));
    }
  }

  function renderResults(features, configs) {
    els.resultCount.textContent = String(features.length);
    els.resultList.innerHTML = "";

    if (features.length === 0) {
      renderEmptyResults();
      return;
    }

    features.forEach((feature, index) => {
      const properties = normalizeProperties(feature.getProperties());
      const config = configs[index] || {};
      const title = getFeatureTitle(properties, index);
      const summary = getFeatureSummary(properties, config.title || feature.get("_layerTitle"));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      button.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(summary)}</span>
      `;
      button.addEventListener("click", () => {
        focusFeature(feature);
        showPopup(getFeatureCenter(feature) || lastQueryCoordinate || view.getCenter(), feature, title);
      });
      els.resultList.appendChild(button);
    });
  }

  function renderEmptyResults() {
    els.resultCount.textContent = "0";
    els.resultList.innerHTML = '<div class="result-empty">暂无查询结果</div>';
  }

  function renderError(message) {
    els.resultCount.textContent = "0";
    els.resultList.innerHTML = `<div class="result-error">${escapeHtml(message)}</div>`;
  }

  function clearResults(updateStatus = true) {
    activeFeatures = [];
    lastQueryCoordinate = null;
    highlightSource.clear();
    renderEmptyResults();
    closePopup();
    if (updateStatus) setStatus("已连接 GeoServer 图层", "ready");
  }

  function showPopup(coordinate, feature, title) {
    const properties = normalizeProperties(feature.getProperties());
    els.popupContent.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      ${createPropertyTable(properties)}
    `;
    popupOverlay.setPosition(coordinate);
  }

  function showMessagePopup(coordinate, message) {
    els.popupContent.innerHTML = `<h3>${escapeHtml(message)}</h3>`;
    popupOverlay.setPosition(coordinate);
  }

  function closePopup() {
    popupOverlay.setPosition(undefined);
  }

  function createPropertyTable(properties) {
    const rows = Object.entries(properties)
      .filter(([key]) => !key.startsWith("_") && key !== "geometry")
      .slice(0, 16)
      .map(([key, value]) => {
        return `
          <tr>
            <th>${escapeHtml(key)}</th>
            <td>${escapeHtml(formatValue(value))}</td>
          </tr>
        `;
      })
      .join("");

    if (!rows) return '<div class="result-empty">无属性字段</div>';
    return `<table class="property-table">${rows}</table>`;
  }

  function getFeatureTitle(properties, index) {
    const candidates = [
      geoserverConfig.queryField,
      "name",
      "Name",
      "NAME",
      "编码",
      "OBJECTID",
      "id",
      "ID"
    ].filter(Boolean);

    for (const key of candidates) {
      if (properties[key] !== undefined && properties[key] !== null && properties[key] !== "") {
        return String(properties[key]);
      }
    }

    return `查询结果 ${index + 1}`;
  }

  function getFeatureSummary(properties, layerTitle) {
    const pairs = Object.entries(properties)
      .filter(([key, value]) => !key.startsWith("_") && key !== "geometry" && value !== null && value !== undefined && value !== "")
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${formatValue(value)}`);

    const prefix = layerTitle ? `图层: ${layerTitle}` : "";
    return [prefix, ...pairs].filter(Boolean).join("；") || "无属性摘要";
  }

  function normalizeProperties(properties) {
    const normalized = {};
    Object.entries(properties || {}).forEach(([key, value]) => {
      if (key !== "geometry") normalized[key] = value;
    });
    return normalized;
  }

  function fitAllOverlayFeatures() {
    const extent = ol.extent.createEmpty();
    overlayLayers.forEach((entry) => {
      if (!entry.source.isEmpty()) {
        ol.extent.extend(extent, entry.source.getExtent());
      }
    });
    if (!ol.extent.isEmpty(extent)) {
      view.fit(extent, {
        padding: [48, 48, 48, 48],
        maxZoom: 17,
        duration: 420
      });
    }
  }

  function zoomToHighlightedFeatures() {
    if (activeFeatures.length === 0 || highlightSource.isEmpty()) return;
    const extent = highlightSource.getExtent();
    if (ol.extent.isEmpty(extent)) return;
    view.fit(extent, {
      padding: [60, 60, 60, 60],
      maxZoom: 17,
      duration: 360
    });
  }

  function focusFeature(feature) {
    const geometry = feature.getGeometry();
    if (!geometry) return;
    const extent = geometry.getExtent();
    view.fit(extent, {
      padding: [80, 80, 80, 80],
      maxZoom: 18,
      duration: 260
    });
  }

  function resetHomeView() {
    if (!overlayLayers.size) {
      view.animate({
        center: ol.proj.transform(WEBGIS_CONFIG.initialView.center, "EPSG:4326", projection),
        zoom: WEBGIS_CONFIG.initialView.zoom,
        duration: 260
      });
      return;
    }
    fitAllOverlayFeatures();
  }

  function getFeatureCenter(feature) {
    const geometry = feature.getGeometry();
    if (!geometry) return null;
    return ol.extent.getCenter(geometry.getExtent());
  }

  function findOverlayEntryByLayer(layer) {
    for (const entry of overlayLayers.values()) {
      if (entry.layer === layer) return entry;
    }
    return null;
  }

  function createLayerStyle(config) {
    return (feature) => {
      const geometry = feature.getGeometry();
      const type = geometry ? geometry.getType() : "";
      if (type.includes("Point")) {
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: config.fill || config.color }),
            stroke: new ol.style.Stroke({ color: config.stroke || "#ffffff", width: 2 })
          })
        });
      }
      if (type.includes("Line")) {
        return new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: config.stroke || config.color,
            width: 3
          })
        });
      }
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: config.fill || "rgba(15, 118, 110, 0.35)" }),
        stroke: new ol.style.Stroke({
          color: config.stroke || config.color,
          width: 1.6
        })
      });
    };
  }

  function createHighlightStyle(feature) {
    const geometry = feature.getGeometry();
    const type = geometry ? geometry.getType() : "";
    if (type.includes("Point")) {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 9,
          fill: new ol.style.Fill({ color: "#f59e0b" }),
          stroke: new ol.style.Stroke({ color: "#ffffff", width: 2 })
        })
      });
    }
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: "#06b6d4",
        width: 3
      }),
      fill: new ol.style.Fill({
        color: "rgba(245, 158, 11, 0.28)"
      })
    });
  }

  function updateOpacityLabel() {
    els.overlayOpacityValue.textContent = `${Math.round(Number(els.overlayOpacity.value) * 100)}%`;
  }

  function formatMeter(value) {
    return `${Math.round(value)} m`;
  }

  function setStatus(text, state) {
    els.status.textContent = text;
    els.status.classList.toggle("ready", state === "ready");
    els.status.classList.toggle("error", state === "error");
  }

  function handleQueryError(error) {
    const message = `${error.message || "查询失败"}。请确认使用 node server.js 启动，并访问 http://127.0.0.1:5500。`;
    renderError(message);
    setStatus("查询失败", "error");
  }

  function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function pick(source, keys) {
    return keys.reduce((result, key) => {
      if (source && source[key] !== undefined) result[key] = source[key];
      return result;
    }, {});
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeCqlLike(value) {
    return String(value).replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  function formatValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
})();
