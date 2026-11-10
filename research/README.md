# 研究之间 · 私人研究工作台

本目录独立于仓库根目录的宠物洗护网站，原网站文件保持不变。不要为本应用启用GitHub Pages：网页和接口需要经过私有登录服务访问。

## 已实现

- 沿用“研究之间”工作台，提供五本Nature期刊、九个生物医学工程主题、权重调整、收藏及明确反馈。
- 通过Node服务读取官方RSS，DOI去重、近期范围筛选及关键词辅助排序，明确RSS不代表完整检索。
- 所有页面、资源和API均在登录之后访问。未配置密码时拒绝启动；HTTPS部署使用HttpOnly、Secure、SameSite=Strict会话Cookie，提供登录频率限制。
- 配置、采集结果、摘要及微信令牌保存到持久数据目录，不在代码库内。微信令牌不会返回浏览器、写入导出配置或打印到日志。
- pushplus接收配置、测试发送与用户接收确认。服务受理不等于微信送达，发送账本区分拒绝、受理及结果不明，跨天按DOI防止重复发送。

## 首次部署

1. 选择支持Node或Docker、HTTPS及持久磁盘的托管服务。托管账号、域名和可能的费用由用户选择；仓库提交本身不会创建收费资源。
2. 以 `research/` 为应用根目录，使用Node 22以上；启动 `npm start`，或构建本目录的Dockerfile。
3. 在托管平台设置PUBLIC_ORIGIN为真实HTTPS网址，HOST为0.0.0.0，PORT按平台要求设置；将DATA_DIR指向持久目录。只允许服务端访问该目录，不能作为静态文件目录。
4. 将WORKBENCH_PASSWORD（至少16字符）和SESSION_SECRET（至少32字符随机值）作为平台密钥设置。真实值不可写入本仓库。密码或会话密钥改变后，已有会话将失效；服务重启也会清除会话。
5. 打开网址登录，在“我的偏好”底部由用户本人填入pushplus令牌，发送测试消息并确认接收。不从本地项目自动上传现有密钥。

## 自动摘要和调度：尚待部署接入

本版本不伪装成已上线云服务，也没有把本地Codex任务自动迁移到GitHub。`npm run collect`可在部署环境采集；RSS每刊通常只有近期8条，每日完整检查需补查官方最新文章分页，尤其Nature Communications。

中文摘要需要云端智能任务或独立模型服务；本仓库未包含模型API密钥，也未默认开启产生调用费用的服务。当前界面在无已核验摘要时显示空状态，不用虚构文本或旧文填充。正式接入时按用户主题和反馈核读公开摘要，将当天简报写入DATA_DIR/digest.json；然后执行 `npm run send`。每日9:30为北京时间任务开始时间，不承诺秒级送达。

已在用户本地Codex设置的每日任务继续保留。只有云端任务通过真实采集、生成摘要及推送验证后，才迁移或停用旧任务，避免丢失服务或重复发送。

## 数据结构

DATA_DIR内：settings.json（期刊、主题、权重、收藏和反馈）、catalog.json、collection.json、digest.json、deliveries.json、wechat-secret.json、wechat-status.json。文件不随仓库提交。

digest.json包含date（北京时间YYYY-MM-DD）、createdAt、edition和articles。文章字段为id/doi、title、zhTitle、journal、date、type、summary、reason、limitation、topics、url和sourceBasis。摘要明确基于公开摘要还是全文；原创、综述和评论分别标注。

## 验证

运行 `npm test` 检查未登录访问保护、跨站登录拒绝、会话完整性和HTTPS约束；运行 `node --check src/server.mjs` 验证服务入口。
