const WEBGIS_CONFIG = {
  mapProjection: "EPSG:3857",
  initialView: {
    center: [117.14, 34.23],
    zoom: 15,
    minZoom: 2,
    maxZoom: 19
  },
  geoserver: {
    baseUrl: "/geoserver",
    workspace: "kjw",
    layerName: "kjw:jianzhu_Project",
    layerTitle: "建筑",
    queryField: "name",
    dataProjection: "EPSG:3857",
    maxFeatures: 500,
    layers: [
      {
        id: "grass",
        name: "kjw:grass_Project",
        title: "绿地",
        visible: true,
        color: "#4d9f5b",
        fill: "rgba(77, 159, 91, 0.42)",
        stroke: "#2f7d3f",
        queryField: "编码"
      },
      {
        id: "jianzhu",
        name: "kjw:jianzhu_Project",
        title: "建筑",
        visible: true,
        color: "#9b5c35",
        fill: "rgba(155, 92, 53, 0.55)",
        stroke: "#6f3f23",
        queryField: "name"
      },
      {
        id: "shandi",
        name: "kjw:shandi_Project",
        title: "山地",
        visible: true,
        color: "#7f8f3a",
        fill: "rgba(127, 143, 58, 0.45)",
        stroke: "#5c6b25",
        queryField: "name"
      },
      {
        id: "shuixi",
        name: "kjw:shuixi_Project",
        title: "水系",
        visible: true,
        color: "#2888c8",
        fill: "rgba(40, 136, 200, 0.48)",
        stroke: "#176aa3",
        queryField: "OBJECTID"
      },
      {
        id: "station",
        name: "kjw:station_Project",
        title: "站点",
        visible: true,
        color: "#d0346c",
        fill: "rgba(208, 52, 108, 0.82)",
        stroke: "#ffffff",
        queryField: "name"
      },
      {
        id: "yundongchangdi",
        name: "kjw:yundongchangdi_Project",
        title: "运动场地",
        visible: true,
        color: "#df9a25",
        fill: "rgba(223, 154, 37, 0.48)",
        stroke: "#9f6a12",
        queryField: "name"
      }
    ]
  },
  basemaps: [
    {
      id: "cartoLight",
      title: "CARTO 浅色",
      description: "适合叠加专题数据",
      url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      attributions:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20
    },
    {
      id: "osm",
      title: "OSM 标准",
      description: "道路、建筑和地名信息完整",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attributions:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    },
    {
      id: "cartoDark",
      title: "CARTO 深色",
      description: "适合亮色专题图层",
      url: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      attributions:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20
    },
    {
      id: "sentinel2",
      title: "Sentinel-2 卫星影像",
      description: "EOX Sentinel-2 cloudless 2024",
      url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
      attributions:
        'Sentinel-2 cloudless by <a href="https://s2maps.eu/">EOX IT Services GmbH</a>',
      maxZoom: 18
    },
    {
      id: "nasaModis",
      title: "NASA MODIS 真彩色",
      description: "2024-06-01 Terra Corrected Reflectance",
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
      attributions:
        '<a href="https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</a>',
      maxZoom: 9
    }
  ]
};
