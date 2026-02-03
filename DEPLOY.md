# 🚀 自动化部署指南 (GitHub Actions -> 阿里云)

本指南将帮助您配置 CI/CD 流水线，实现代码推送到 GitHub `main` 分支时，自动构建 Docker 镜像并部署到您的阿里云服务器 (120.79.42.38)。

## 1. 服务器准备 (阿里云主机)

首先，您需要登录到您的阿里云主机并安装 Docker。

```bash
# SSH 登录
ssh root@120.79.42.38

# 安装 Docker (如果尚未安装)
curl -fsSL https://get.docker.com | bash

# 启动 Docker 并设置开机自启
systemctl start docker
systemctl enable docker
```

## 2. 配置 SSH 免密登录

为了让 GitHub Actions 能登录您的服务器执行部署命令，我们需要配置 SSH 密钥。

### 2.1 生成密钥对 (在您本地电脑执行)
```bash
# 生成 SSH 密钥对 (不要设置密码，一路回车)
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f ./deploy_key
```
这会生成两个文件：
- `deploy_key` (私钥 - 给 GitHub 用)
- `deploy_key.pub` (公钥 - 给服务器用)

### 2.2 将公钥添加到服务器 (在阿里云主机执行)
将 `deploy_key.pub` 的内容追加到服务器的 `~/.ssh/authorized_keys` 文件中。

```bash
# 在服务器上
mkdir -p ~/.ssh
echo "粘贴 deploy_key.pub 的内容在这里" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

## 3. 配置 GitHub Secrets

在您的 GitHub 仓库页面，进入 **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**，添加以下变量：

| Secret Name | Value | 说明 |
|-------------|-------|------|
| `HOST_IP` | `120.79.42.38` | 您的服务器 IP |
| `HOST_USER` | `root` | 登录用户名 |
| `SSH_PRIVATE_KEY` | (粘贴 `deploy_key` 私钥的全部内容) | **注意**：包含 `-----BEGIN...` 和 `-----END...` |
| `SUPABASE_URL` | `https://your-project.supabase.co` | 您的 Supabase URL |
| `SUPABASE_KEY` | `eyJxh...` | 您的 Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJxh...` | 您的 Supabase Service Role Key (后端上传需要) |

## 4. 触发部署

配置完成后：
1. 修改本地代码。
2. `git commit` 并 `git push origin main`。
3. GitHub Actions 将自动触发：
   - 构建 Docker 镜像。
   - 推送到 GitHub Container Registry (ghcr.io)。
   - SSH 登录服务器。
   - 拉取新镜像并重启容器。

## 5. 访问应用

部署成功后，直接访问服务器 IP 即可：
http://120.79.42.38

(应用已映射到服务器的 80 端口)
