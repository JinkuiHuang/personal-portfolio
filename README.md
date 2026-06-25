# Personal Portfolio

一个静态个人资料与作品集网页，可部署到 GitHub Pages、Netlify、Vercel 或任意静态托管服务。

## 本地预览

```bash
python3 -m http.server 5173
```

打开 `http://localhost:5173`。

## 修改个人资料

- 主要文字内容在 `index.html`
- 页面样式在 `styles.css`
- 头像和作品图在 `assets/`

替换头像时，把新图片放到 `assets/profile.png`，或修改 `index.html` 中的图片路径。

## 部署到互联网

### GitHub Pages

1. 新建一个 GitHub 仓库。
2. 上传本目录所有文件。
3. 进入仓库 `Settings` → `Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main` 和 `/root`。

### Netlify

1. 登录 Netlify。
2. 选择 `Add new site` → `Deploy manually`。
3. 拖拽整个项目目录上传。

### Vercel

1. 登录 Vercel。
2. 选择 `Add New` → `Project`。
3. 导入 GitHub 仓库。
4. Framework Preset 选择 `Other`，Build Command 留空，Output Directory 留空。

部署成功后，你会得到一个公网 URL，可以在任何设备访问。
