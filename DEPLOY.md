# 衣橱相机开放试玩部署说明

这版适合先开放给朋友试用：用户打开 App 后可以拍照上传、确认分类、管理衣橱；你可以从后台查看用户数、上传量、品牌统计和品类统计。

现在已经包含邮箱注册/登录：

- 用户可以用邮箱和密码注册。
- 登录后衣橱数据会绑定到账号。
- 同一账号可在其他设备登录继续同步。
- 未登录时仍可用游客模式试玩。

## 本地运行

```bash
npm start
```

打开：

- App: `http://127.0.0.1:4176/`
- 后台: `http://127.0.0.1:4176/admin`

## 必填环境变量

部署到公网前，至少设置：

```bash
ADMIN_PASSWORD=你的后台密码
HOST=0.0.0.0
PORT=平台分配的端口
DATA_DIR=./data
UPLOAD_DIR=./uploads
UPLOAD_LIMIT_MB=12
```

后台用户名固定为 `admin`，密码使用 `ADMIN_PASSWORD`。

用户账号密码会用 scrypt 哈希后保存，不会明文写入数据库。

## 部署到云平台

通用配置：

- Build Command: 留空或 `npm install`
- Start Command: `npm start`
- Node Version: 18 或更高
- Health Check: `/api/health`

如果平台支持持久化磁盘，请把 `DATA_DIR` 和 `UPLOAD_DIR` 指向持久化目录。否则平台重启后，JSON 数据和上传图片可能丢失。

## Render 快速部署

项目已经包含 `render.yaml`，适合直接连 Git 仓库部署。

1. 把项目推到 GitHub。
2. 在 Render 选择 `New +` -> `Blueprint`。
3. 选择这个仓库，Render 会读取 `render.yaml`。
4. 部署完成后，打开 Render 的 Environment 页面查看自动生成的 `ADMIN_PASSWORD`。
5. 访问公网 App 地址：`https://你的服务名.onrender.com/`
6. 访问后台：`https://你的服务名.onrender.com/admin`

后台登录：

- 用户名：`admin`
- 密码：Render 环境变量里的 `ADMIN_PASSWORD`

Render 配置里已经挂载了 1GB 磁盘：

- 数据库 JSON：`/var/data/data/db.json`
- 上传图片：`/var/data/uploads`

## Docker 部署

```bash
docker build -t smart-wardrobe .
docker run -p 4176:4176 \
  -e ADMIN_PASSWORD=你的后台密码 \
  -e DATA_DIR=/app/data \
  -e UPLOAD_DIR=/app/uploads \
  -v wardrobe-data:/app/data \
  -v wardrobe-uploads:/app/uploads \
  smart-wardrobe
```

打开：

- App: `http://服务器IP:4176/`
- 后台: `http://服务器IP:4176/admin`

## 当前试玩版边界

- 当前支持邮箱注册/登录，但还没有邮箱验证和找回密码。
- 当前数据库是本地 JSON 文件，适合小范围试玩，不适合大量用户并发。
- 当前图片存在本地目录，正式开放时建议迁移到云存储。

## 下一步正式化

1. 账号增强：邮箱验证、找回密码、手机号/微信登录。
2. 数据库：PostgreSQL 或 MySQL。
3. 图片存储：S3、Cloudflare R2、阿里云 OSS 或腾讯云 COS。
4. 后台权限：多管理员、操作日志、用户详情页。
5. 隐私安全：用户协议、隐私政策、数据删除入口。
