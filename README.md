# Personal Portfolio

一个个人资料与作品集网页。网页托管在 GitHub Pages，资料可存储在 Supabase，并通过 `/admin` 后台在公网编辑。

## 本地预览

```bash
python3 -m http.server 5173
```

打开 `http://localhost:5173`。

## 修改个人资料

- 默认资料在 `data/profile.json`
- 页面样式在 `styles.css`
- 头像和作品图在 `assets/`
- 后台页面在 `admin/`

替换头像时，把新图片放到 `assets/profile.png`，或修改 `data/profile.json` 里的 `hero.image`。

## 开启公网后台编辑

这个项目使用 Supabase 作为公网数据库和登录系统。

### 1. 创建 Supabase 项目

1. 打开 `https://supabase.com`
2. 新建 Project
3. 进入 `Project Settings` → `API`
4. 复制 `Project URL` 和 `anon public` key

### 2. 配置网页

编辑 `supabase-config.js`：

```js
window.PORTFOLIO_SUPABASE = {
  url: "你的 Supabase Project URL",
  anonKey: "你的 anon public key",
  profileId: "main"
};
```

### 3. 建表和权限

打开 Supabase 的 `SQL Editor`，复制 `supabase/schema.sql` 内容执行。

执行前把 SQL 里的：

```sql
your-email@example.com
```

替换成你要用来登录后台的邮箱。

### 4. 创建后台登录账号

进入 Supabase `Authentication` → `Users`，创建一个用户：

- Email：和 SQL 中配置的邮箱一致
- Password：你自己的后台密码

### 5. 打开后台

部署后访问：

```text
https://jinkuihuang.github.io/personal-portfolio/admin/
```

登录后可以编辑资料 JSON，点击 `Save to database` 保存。公开页面刷新后会读取 Supabase 中的最新资料。

### 6. 第一次写入数据库

后台第一次打开时，如果数据库还没有资料，会自动载入 `data/profile.json`。点击 `Save to database` 后，数据库会保存第一份资料。

## 部署到互联网

### GitHub Pages

当前仓库已部署到 GitHub Pages。修改代码或配置后执行：

```bash
git add index.html styles.css script.js README.md data admin supabase supabase-config.js
git commit -m "Add online profile editor"
git push
```

### Netlify

1. 登录 Netlify。
2. 选择 `Add new site` → `Deploy manually`。
3. 拖拽整个项目目录上传。

### Vercel

1. 登录 Vercel。
2. 选择 `Add New` → `Project`。
3. 导入 GitHub 仓库。
4. Framework Preset 选择 `Other`，Build Command 留空，Output Directory 留空。

当前公开地址：

```text
https://jinkuihuang.github.io/personal-portfolio/
```
