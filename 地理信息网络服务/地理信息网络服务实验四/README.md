# 基于 OpenLayers 的 WebGIS 功能开发

这是一个用于《地理信息网络服务》实验四的 OpenLayers WebGIS 系统。当前版本使用 `EPSG:3857`：公共互联网底图、GeoServer 图层元数据、WFS 专题数据和地图视图坐标系保持一致。

## 功能

- 多源公共底图切换：OSM、CARTO、Sentinel-2、NASA GIBS。
- GeoServer WFS 专题图层叠加显示。
- 图层显隐和透明度控制。
- 地图点选查属性。
- 属性查地图：WFS GetFeature + CQL_FILTER。
- 查询结果列表、地图高亮和定位。

## 运行方式

在本目录启动本地代理服务：

```powershell
node server.js
```

也可以直接双击：

```text
start-webgis.cmd
```

然后访问：

```text
http://127.0.0.1:5500
```

本项目使用 `server.js` 将 `/geoserver` 代理到 `http://localhost:8338/geoserver`，可避免浏览器 CORS 限制。如果 GeoServer 端口不同，可以启动前设置 `GEOSERVER_URL`。

## 文件结构

```text
index.html          页面结构
css/style.css       页面样式
js/config.js        图层、底图和默认参数
js/app.js           地图初始化、图层加载和查询逻辑
server.js           本地静态服务和 GeoServer 代理
start-webgis.cmd    Windows 双击启动入口
start-webgis.ps1    启动检查和自动开页脚本
```

## GeoServer 要求

当前使用重新投影后的图层：

```text
kjw:grass_Project
kjw:jianzhu_Project
kjw:shandi_Project
kjw:shuixi_Project
kjw:station_Project
kjw:yundongchangdi_Project
```

请确保这些图层在 GeoServer 中显示：

```text
Native SRS: EPSG:3857
Declared SRS: EPSG:3857
```

系统连接参数：

```text
服务地址：/geoserver
工作区：kjw
坐标系：EPSG:3857
```

WFS 请求使用：

```text
service=WFS
version=1.1.0
request=GetFeature
outputFormat=application/json
srsName=EPSG:3857
```

代理测试地址：

```text
http://127.0.0.1:5500/geoserver/kjw/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=kjw:jianzhu_Project&outputFormat=application/json&srsName=EPSG:3857&maxFeatures=1
```
