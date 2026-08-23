# FileScope (Doc Tool) - Monorepo

> 轻量化文件名比对与统计工具 (FileScope v2.0)
> 现代化 TypeScript Monorepo 架构：**Next.js 15 (App Router)** 网页端 + **NestJS 10** 服务端 + **@doc-tool/shared** 共享协议包。

---

## 架构结构

```text
doc-tool/
├── packages/
│   └── shared/                # 前后端共享协议包 (@doc-tool/shared)
│       ├── models/            # Scan, Compare, Browse, System DTOs
│       └── utils/             # 格式化与智能前缀聚类算法
├── apps/
│   ├── server/                # NestJS 10 服务端 (@doc-tool/server)
│   │   ├── scanner/           # 目录深度扫描与公共前缀归纳
│   │   ├── comparator/        # 双目录比对引擎 (相对路径/仅文件名/剥离前缀)
│   │   ├── browser/           # 跨平台服务器目录树浏览 (Windows 盘符/Linux 根)
│   │   └── system/            # 原生操作系统文件管理器 (Explorer/Finder) 唤起
│   └── web/                   # Next.js 15 网页端 (@doc-tool/web)
│       ├── components/        # Header, StatsView, DiffView, DirectoryBrowserModal 等
│       └── app/               # App Router, 流光暗黑设计系统, 响应式布局
└── package.json               # NPM Workspaces 根配置
```

---

## 核心功能特性

1. **单目录深度统计与智能前缀归纳**：
   - 自动识别并归类具有相同前缀字段的文件（如 `DOC_`、`IMG_RAW_`、`【财务】`、`2024_` 等），支持自定义指定前缀。
   - 前缀统计清单化展示（支持查看数量占比进度条、主要格式分布、样本文件预览与一键导出 CSV）。
   - 最深层（叶子）目录详细汇总与关键 KPI 指标（总文件数、叶子目录数、平均文件数、最多文件目录、耗时）。

2. **系统本地文件夹一键直达**：
   - 点击任意目录或文件相对路径，系统自动规范化路径并调用 Windows 资源管理器 (`explorer.exe`) / macOS Finder (`open`) 直接定位打开。

3. **双目录差异智能比对**：
   - 支持 **相对路径完全匹配**、**仅文件名匹配 (智能识别文件移动/改名)** 与 **剥离前缀比对** 3 种模式。
   - 状态筛选胶囊 (完全匹配 / 仅在 A / 仅在 B / 属性差异 / 位置变动)。
   - 支持一键导出比对报告为 CSV 或 JSON 格式。

4. **服务器目录可视化浏览**：
   - 弹窗内直观浏览磁盘与目录，支持 Windows 多驱动器盘符识别。
   - 自动记忆上次浏览路径，左侧配置返回上一级导航按钮。

---

## 快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 编译共享包
```bash
npm run build:shared
```

### 3. 本地开发运行
启动 NestJS 服务端（默认端口 `8000`）与 Next.js 网页端（默认端口 `3000`）：
```bash
# 启动服务端 (NestJS API)
npm run dev:server

# 启动网页端 (Next.js App)
npm run dev:web
```

- 网页端访问地址：`http://localhost:3000`
- 服务端 API 地址：`http://localhost:8000/api`

### 4. 生产打包构建
```bash
npm run build
```
