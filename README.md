# 欢迎使用你的秒哒应用代码包
秒哒应用链接
    URL:https://www.miaoda.cn/projects/app-c6x1q6fsddz5

# Project Overview

This repository is a Taro + React + TypeScript starter project for WeChat Mini-Programs and mobile H5, styled with Tailwind CSS and managed via pnpm.
This document explains how to set up your local environment, develop, test, lint, and build the project.
---

## Repository Structure

The project structure is as follows:

```

├── babel.config.js
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── project.config.json
├── README.md
├── tailwind.config.js
├── tsconfig.check.json
├── tsconfig.json
├── config/
│   ├── dev.ts
│   ├── index.ts
│   └── prod.ts
├── scripts/
├── src/
│   ├── app.config.ts               # Taro app configuration, defining routes and tabBar, Please note that the "pages" must correctly correspond to the routes defined in src/pages.
│   ├── app.scss
│   ├── app.ts
│   ├── index.html
│   ├── client/
│   │   └── supabase.ts             # Supabase client configuration, When you need to use Supabase, import and use it from this file.
│   ├── db/                         # Database operations and Supabase integration, all database calls should be implemented here
│   │   └── README.md
│   ├── pages/                      # each folder corresponds to a route defined in app.config.ts
│   ├── store/                      # Global state management using Zustand for cross-page state sharing
│   │   └── README.md
│   └── types/                      # TypeScript type definitions
│       └── global.d.ts
└── supabase/
    └── migrations/
        └── 00000_complete_supabase_import.sql  # Complete SQL import script for Supabase SQL Editor
```

After you generate any files or update the structure of this project, please update the README.md file to reflect the changes.

## Installation and Setup

```bash
pnpm install # Install dependencies
```

```bash
pnpm run lint  # Lint source (Important: After modifying the code, please execute this command to perform necessary checks.)
```

## 邮箱验证码注册配置

新用户只允许通过 Supabase Auth 的邮箱验证码注册。部署前需要在 Supabase 控制台完成以下配置：

1. 在 `Authentication > Providers > Email` 启用 Email Provider，并开启 `Confirm email`。关闭该选项会导致账户绕过验证码直接确认，客户端将拒绝继续注册。
2. 在 `Authentication > Email Templates > Confirm signup` 中使用 `{{ .Token }}` 输出验证码。当前客户端按 8 位数字验证码校验，小程序不能依赖邮件中的网页跳转链接。
3. 在 SMTP 设置中接入自有邮件服务，并设置产品的 Sender name 和 Sender email；否则收件人会看到 `Supabase Auth` 和 Supabase 默认发件地址。
4. 保持 OTP 有效期和发送频率限制开启；客户端默认 60 秒后才允许重新发送。

用户名注册入口已停用；历史用户名账号仍可登录。新的邮箱和手机号注册密码只要求 6-72 位，不限制字符类型；已有账号的登录密码不受新规则影响。
