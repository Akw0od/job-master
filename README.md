# Job Master

#### 一个以 Resume Application Agent Skill 为核心的本地求职工作台

中文 · [English](./README.en.md)

![License](https://img.shields.io/badge/license-MIT-blue)
![Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-black)
![Web](https://img.shields.io/badge/Web-React%20%2B%20Vite-149ECA)
![Human Gate](https://img.shields.io/badge/Submit-Human%20Approval%20Required-red)

Job Master 把一个可安装的求职 Skill 和一个本地可视化工作台放在同一仓库里。

- **Skill**：读取岗位 JD，从候选人确认过的事实库中选择证据，生成定制简历重点、申请回答和结构化填表数据。
- **网站**：管理 Master Resume、方向简历、岗位版简历、岗位发现和申请进度，并逐条审核 AI 或手动修改。

它不是自动海投工具。浏览器辅助可以准备材料和填写字段，但最终提交、工作授权、签证赞助和 EEOC 等敏感信息必须由候选人本人确认。

## 30 秒快速开始

### 1. 安装 Skill

推荐保留完整仓库，并把它链接到 Codex 的 Skill 目录。这样 Dashboard、脚本和 Skill 会保持在同一个版本：

```bash
git clone https://github.com/Akw0od/job-master.git
cd job-master
mkdir -p ~/.codex/skills
ln -s "$(pwd)" ~/.codex/skills/resume-application-agent
```

如果不想使用符号链接，也可以复制安装；执行前请确认目标目录不存在：

```bash
cp -R . ~/.codex/skills/resume-application-agent
```

重启 Codex 后，可以直接说：

```text
使用 resume-application-agent，读取这个 JD 并基于我确认过的简历事实生成申请包。
```

也可以在支持仓库安装的 Agent 中直接提供地址：

```text
请安装并使用这个求职 Skill：https://github.com/Akw0od/job-master
```

### 2. 打开 Dashboard

要求 Node.js 20+。只有使用本地 AI 改写时才需要已安装并登录的 Codex CLI。

```bash
npm install
npm run dev
```

命令会同时启动 Dashboard 和 localhost-only Agent 服务。打开终端显示的 Vite 地址，通常是 `http://127.0.0.1:5173/`；若端口被占用，Vite 会自动选择下一个可用端口。本地 Agent 固定监听 `http://127.0.0.1:4317`。

只查看界面、不启用本地 AI 改写：

```bash
npm run dev:web
```

## 当前能力

### 本地网站

- 上传可搜索的 PDF、DOCX 或 TXT，并立即建立只读 Master Resume。
- 派生可复用方向简历和一次性岗位版简历，始终保留来源链路。
- 在简历正文中标红原句，在右侧完整展示绿色改写，并用编号联动定位。
- 手动新增、删除或改写派生简历内容；Master Resume 保持不可变。
- 按美国 / 中国与全职 / 实习独立筛选岗位；没有可验证岗位时显示真实空态。
- 根据 Master Resume 和自定义求职方向重新计算岗位匹配度。
- 追踪收藏、准备中、已投递、面试、Offer、未通过和归档等候选人视角状态。
- 打开具体岗位申请链接，并保留最终人工确认门。
- 通过本地 Node 服务创建 Stripe Checkout 订阅会话；未配置 Stripe 密钥时，界面会明确显示为本地原型状态。

网站目前是 **local-first 原型**：简历正文和操作状态以浏览器本地草稿为主，不声称使用 SQLite 或云端数据库；仓库内岗位池是演示和验证用途，不等同于实时招聘聚合服务。

### Resume Application Agent Skill

- 将 JD 分类为 `sde`、`risk_engineer`、`fde` 或 `ai_agent_engineer` 等岗位 archetype。
- 从 `data/profile_context.md` 中选择与 JD 最相关的已确认经历。
- 生成 `application_packet.md`、`autofill_data.json` 和 `packet_data.json`。
- 遇到履历缺口时明确标记，不编造公司、日期、学历、技能或指标。
- 浏览器填表最多停在 final review screen，未经当前岗位的明确批准不得提交。

## Dashboard 详细说明

`npm run dev` 会同时启动：

- Vite 网站：终端显示的 `http://127.0.0.1:517x/`
- 本地 Agent：`http://127.0.0.1:4317`

只运行前端：

```bash
npm run dev:web
```

### Stripe 订阅配置

本地原型的订阅入口在右上角“订阅 / 账户”面板。真实创建 Checkout Session 需要在本地环境设置：

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_STARTER_MONTHLY=price_...   # 可选；不填时使用服务端 price_data
STRIPE_PRICE_PRO_MONTHLY=price_...       # 可选
STRIPE_PRICE_PRO_YEARLY=price_...        # 可选
STRIPE_WEBHOOK_SECRET=whsec_...          # 可选；生产 webhook 建议设置
STRIPE_AUTOMATIC_TAX=false               # 可选
```

当前版本只把 Checkout 返回的订阅状态保存在浏览器本地。生产 SaaS 还需要接用户账户、远程数据库、生产 webhook 和权限校验。支付宝 / 微信支付是否可用取决于 Stripe Dashboard 对 Job Master 账户和业务网站的审核结果；界面不会把未批准的支付方式显示为已支持。

生产构建检查：

```bash
npm run build
```

## 使用 Skill 生成申请包

公开仓库中的 `data/profile_context.md` 只包含示例资料。实际使用前，请先替换为本人确认过的简历事实。

```bash
python scripts/resume_agent.py \
  --jd examples/amazon_sde_jd.txt \
  --role "Amazon SDE" \
  --out runs/amazon-sde
```

输出：

```text
runs/amazon-sde/
|-- application_packet.md
|-- autofill_data.json
`-- packet_data.json
```

## 仓库结构

```text
.
|-- SKILL.md                    # Agent Skill 入口与安全规则
|-- data/                       # 岗位 archetype 与公开示例事实库
|-- examples/                   # 示例 JD
|-- scripts/
|   |-- resume_agent.py         # 确定性申请包生成器
|   `-- dev.mjs                 # 网站与本地 Agent 联合启动器
|-- local-agent/                # Codex CLI 本地改写服务
|-- src/                        # React 求职工作台
|-- templates/                  # 申请包模板
|-- tests/                      # Python Skill 测试
`-- AGENTS.md                   # 原型的产品与实现约束
```

## 安全与隐私

1. **事实由用户拥有。** 未确认内容不能伪装成简历事实。
2. **Master Resume 不可变。** AI 和手动修改都必须生成派生版本并提供差异审核。
3. **不得自动提交。** 每个具体岗位都需要候选人确认最终申请。
4. **敏感字段不得猜测。** 工作授权、签证、残障、退伍军人、种族和性别等问题必须由本人回答。
5. **本地不等于零风险。** 使用真实简历前应检查设备权限、浏览器存储和所调用模型的隐私政策。

## 测试

```bash
python -m unittest discover -s tests -v
npm run build
```

Python 测试覆盖岗位分类、证据选择、文件输出和人工提交门；前端构建用于验证本地工作台可发布。

## 项目总结

Job Master 目前有两个互补入口：Agent 通过 [SKILL.md](./SKILL.md) 执行确定性的 JD 分析和申请包工作流，用户通过 Dashboard 管理简历版本、岗位发现和投递状态。两者共享同一组事实边界和人工确认规则。

当前版本已经能完整演示“上传 Master Resume -> 准备方向简历 -> 发现岗位 -> 按 JD 定制 -> 打开官方申请 -> 跟踪状态”的核心闭环。它仍是 local-first 原型，适合个人试用、Skill 验证和产品迭代，不应被描述为已经具备生产级账户、实时岗位聚合或云端数据保障的 SaaS。

## TODO

### P0：完成核心闭环

- [ ] 用真实桌面数据库替代浏览器本地草稿，并提供迁移与导出。
- [ ] 接入可验证的实时岗位来源，持续检查具体职位链接是否仍然有效。
- [ ] 提升 PDF / DOCX 原版式解析、分页预览和岗位版简历导出的一致性。
- [ ] 完成“岗位详情 -> 定制简历 -> 官方站申请辅助 -> 状态回填”的端到端验证。
- [ ] 为 Skill 增加可重复的安装、升级、卸载和版本检查流程。

### P1：走向可用 SaaS

- [ ] 增加用户账户、远程数据库、权限隔离和可删除的数据生命周期。
- [ ] 接通 Stripe webhook、订阅权益和服务端权限校验；保持未获批支付方式不可见。
- [ ] 增加敏感字段保护、审计日志、错误恢复和生产级隐私说明。
- [ ] 建立岗位匹配、简历改写和申请辅助的质量评估集。

### P2：发布与生态

- [ ] 提供可复现的演示数据、产品截图和短视频。
- [ ] 增加更多岗位方向，但保持内置方向稳定并允许用户自定义。
- [ ] 完善贡献指南、版本发布和 Skill 分发渠道。

## License

[MIT](./LICENSE)
