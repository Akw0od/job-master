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

网站目前是 **local-first 原型**：简历正文和操作状态以浏览器本地草稿为主，不声称使用 SQLite 或云端数据库；仓库内岗位池是演示和验证用途，不等同于实时招聘聚合服务。

### Resume Application Agent Skill

- 将 JD 分类为 `sde`、`risk_engineer`、`fde` 或 `ai_agent_engineer` 等岗位 archetype。
- 从 `data/profile_context.md` 中选择与 JD 最相关的已确认经历。
- 生成 `application_packet.md`、`autofill_data.json` 和 `packet_data.json`。
- 遇到履历缺口时明确标记，不编造公司、日期、学历、技能或指标。
- 浏览器填表最多停在 final review screen，未经当前岗位的明确批准不得提交。

## 运行网站

要求：Node.js 20+。若需要本地 AI 改写，还需要已安装并登录的 Codex CLI。

```bash
git clone https://github.com/Akw0od/job-master.git
cd job-master
npm install
npm run dev
```

`npm run dev` 会同时启动：

- Vite 网站：终端显示的 `http://127.0.0.1:517x/`
- 本地 Agent：`http://127.0.0.1:4317`

只运行前端：

```bash
npm run dev:web
```

生产构建检查：

```bash
npm run build
```

## 安装 Skill

在支持 `SKILL.md` 的 Agent 中，可以直接提供仓库地址：

```text
请安装并使用这个求职 Skill：https://github.com/Akw0od/job-master
```

也可以手动安装到 Codex：

```bash
git clone https://github.com/Akw0od/job-master.git
cp -R job-master ~/.codex/skills/resume-application-agent
```

重启 Codex 后即可让 Agent 读取 [SKILL.md](./SKILL.md)。

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

## 状态

这是一个持续迭代的 Skill + 产品原型，当前更适合本地试用、工作流验证和贡献开发。云端账户、支付、托管数据库、实时岗位连接器和生产级隐私控制仍属于后续 SaaS 工作。

## License

[MIT](./LICENSE)
