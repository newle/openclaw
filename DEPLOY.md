# 🚀 自动化部署指南 (GitHub Actions -> 阿里云)

本指南将帮助您配置 CI/CD 流水线，实现代码推送到 GitHub `main` 分支时，自动构建 Docker 镜像并部署到您的阿里云服务器 (120.79.42.38)。

## 1. 服务器准备 (阿里云主机)

首先，您需要登录到您的阿里云主机并安装 Docker。

**原理解释**：阿里云 ECS 相当于一台裸机（或虚拟机），而 Docker 是运行在操作系统上的应用容器引擎。在 ECS 上安装 Docker 是业界的标准做法，它能让您的应用环境与宿主机解耦，方便部署和管理。

### 1.1 安装 Docker
推荐使用阿里云官方镜像源进行安装，速度更快。

```bash
# SSH 登录
ssh root@120.79.42.38

# 使用官方脚本自动安装 (会自动选择国内镜像源)
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun

# 启动 Docker 并设置开机自启
systemctl start docker
systemctl enable docker
```

### 1.2 配置 Docker 镜像加速 (强烈推荐)
由于国内网络原因，直接拉取 Docker 镜像可能会很慢。建议配置阿里云镜像加速器。

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://docker.m.daocloud.io", "https://dockerproxy.com"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
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

## 5. Nginx 反向代理配置 (推荐)

由于您的服务器 80 端口已被 Nginx 占用，我们需要修改部署策略：
1. **Docker 容器**：运行在 `3000` 端口 (已在 `deploy.yml` 中自动修改)。
2. **Nginx**：作为反向代理，将 80 端口的流量转发给本地的 3000 端口。

### 5.1 修改 Nginx 配置
登录服务器，编辑 Nginx 配置文件 (通常在 `/etc/nginx/nginx.conf` 或 `/etc/nginx/conf.d/default.conf`)。

添加或修改 `server` 块：

```nginx
server {
    listen 80;
    server_name _;  # 或者填写您的域名，如 example.com

    location / {
        proxy_pass http://120.79.42.38:3000; # 转发到 Docker 容器端口
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 获取真实 IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 5.2 重载 Nginx
配置修改完成后，检查语法并重载：
```bash
nginx -t
nginx -s reload
```

现在，访问 http://120.79.42.38 (80端口) 就会自动转发到您的寻宝游戏应用了。

## 6. 访问应用

