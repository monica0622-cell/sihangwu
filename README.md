# 衣橱相机 Smart Wardrobe

一个面向奢侈品 / 设计师品牌的电子衣橱 App。用户可以拍照上传衣物，确认品牌和标准品类，把单品整理成可筛选、可统计、可备份的数字衣橱。

## 功能

- 拍照 / 上传衣物照片
- 邮箱注册、登录、退出
- 游客模式试玩
- 衣物按账号隔离和同步
- 品牌库和手动新增品牌
- 标准二级品类树
- 衣橱筛选、品牌墙、品类看板
- 穿搭、保养、穿着记录
- JSON 数据导入 / 导出
- 管理后台统计用户数、注册用户、上传量、品牌和品类
- 本地图片存储，可迁移到云存储
- Docker 和 Render 部署配置

## 本地运行

```bash
npm start
```

默认地址：

- App: `http://127.0.0.1:4176/`
- 后台: `http://127.0.0.1:4176/admin`

建议启动时设置后台密码：

```bash
ADMIN_PASSWORD=your-password npm start
```

后台用户名固定为 `admin`，密码为 `ADMIN_PASSWORD`。

## 环境变量

参考 [.env.example](./.env.example)。

```bash
PORT=4176
HOST=0.0.0.0
ADMIN_PASSWORD=change-this-password
DATA_DIR=./data
UPLOAD_DIR=./uploads
UPLOAD_LIMIT_MB=12
```

## 测试

```bash
npm test
```

## 部署

部署说明见 [DEPLOY.md](./DEPLOY.md)。

项目已经包含：

- `Dockerfile`
- `render.yaml`
- `.dockerignore`

可以直接推送到 GitHub 后，在 Render 使用 Blueprint 部署。

## 数据说明

- 用户、衣物、穿搭、自定义品牌保存在 `DATA_DIR/db.json`
- 上传图片保存在 `UPLOAD_DIR`
- `data/db.json` 和真实上传图片不会提交到 Git

当前数据库是 JSON 文件，适合小范围试玩；正式大规模开放建议迁移到 PostgreSQL / MySQL，并把图片迁移到 S3、Cloudflare R2、阿里云 OSS 或腾讯云 COS。
