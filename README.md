# Resume Application Agent Skill
#### 一个帮 Agent 按 JD 改简历、生成投递材料、辅助填表，但不擅自提交的求职 Skill

中文 · [English](./README.en.md)

![License](https://img.shields.io/badge/license-MIT-blue)
![Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-black)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB)
![Human Gate](https://img.shields.io/badge/Submit-Human%20Approval%20Required-red)

这个 skill 的目标很简单：给它一个岗位 JD，它会从候选人的结构化经历库里挑最相关的证据，生成一份投递 packet，并准备好可以拿去填表的结构化数据。

它不是“自动海投机器”。它更像一个求职副驾驶：帮你省掉重复改简历、整理 bullet、写申请回答、复制粘贴表单这些机械活，但最后提交必须由本人确认。

---

## 目录

| 名字 | 一句话 | 适合 |
| --- | --- | --- |
| `resume-application-agent` | 按 JD 自动选经历、改重点、生成申请包 | New Grad / SDE / AI Engineer / Risk Engineer / FDE |

---

## 安装方式

在支持 `SKILL.md` 的 Agent 里，可以直接说：

```text
帮我安装这个 skill：https://github.com/Akw0od/resume-application-agent-skill
```

也可以手动复制到 Codex skills 目录：

```powershell
git clone https://github.com/Akw0od/resume-application-agent-skill.git
Copy-Item -Recurse .\resume-application-agent-skill "$env:USERPROFILE\.codex\skills\resume-application-agent"
```

复制后重启 Codex，让 skill registry 重新加载。

---

## ✨ Skill

### resume-application-agent（简历投递代理）

> “简历不是每个岗位重写一遍，而是按岗位类型复用、按 JD 重点微调。”

随口跟 Agent 说：

```text
帮我投这个岗位，先根据 JD 改一版简历
这个是 AI Engineer，帮我从经历里挑最相关的项目
把这个 Greenhouse / Ashby 表单填到提交前
```

它会做几件事：

* 读取 JD，判断岗位更像 `SDE`、`Risk Engineer`、`FDE` 还是 `AI / LLM Agent Engineer`
* 从 `data/profile_context.md` 里挑最相关的经历和项目
* 生成 `application_packet.md`：岗位重点、命中的证据、可复用 bullet、申请回答草稿
* 生成 `autofill_data.json`：姓名、链接、岗位 track、提交安全门等结构化字段
* 帮你保持一页简历思路：相似 JD 复用同一 archetype，只有重点变化很大时才重写
* 遇到 final submit、work authorization、sponsorship、EEOC 等字段时停下来让本人确认

它适合：

* New Grad / Entry Level 投递
* SDE / Full-stack / AI Engineer / Risk Engineer / FDE 这类岗位
* 需要根据 JD 组合不同项目经历的简历
* Greenhouse、Ashby、Lever 这类表单填到最终检查前
* 想把投递记录写进 Notion / 本地 tracker，而不是每次重写一堆 PDF

它不适合：

* 编造经历、学历、公司、日期、指标
* 绕过本人确认自动提交
* 替你回答法律/身份敏感问题
* 无差别海投

---

## 先改你的事实库

公开仓库里的 `data/profile_context.md` 是示例数据，不是真人资料。

真正使用前，先把里面的 JSON 换成你自己的事实：

* 候选人信息：姓名、地点、邮箱、LinkedIn、GitHub
* 教育经历：学校、专业、毕业时间、课程
* 项目/实习 evidence：每个项目的 tags、summary、bullets
* 默认偏好：一页简历、复用规则、tracker 位置

铁律：

* 没确认的事实不要写进去
* 不要编指标
* 不要编公司/岗位/日期
* work authorization、sponsorship、EEOC 一律让本人确认

---

## 怎么跑

生成一个申请包：

```powershell
python .\scripts\resume_agent.py `
  --jd .\examples\amazon_sde_jd.txt `
  --role "Amazon SDE" `
  --out .\runs\amazon-sde
```

输出：

```text
runs/amazon-sde/
|-- application_packet.md
|-- autofill_data.json
`-- packet_data.json
```

---

## 仓库结构

```text
.
|-- SKILL.md                         # Agent 读取的 skill 入口
|-- data/
|   |-- job_archetypes.json          # 岗位类型、关键词、优先证据
|   `-- profile_context.md           # 候选人事实库，公开版为示例
|-- examples/                        # 示例 JD
|-- scripts/
|   `-- resume_agent.py              # 确定性 packet 生成脚本
|-- templates/
|-- tests/
`-- README.en.md
```

---

## 安全边界

这个 skill 的核心不是“自动投”，而是“人类确认后再投”。

两条硬规则：

* **不能自动提交。** 浏览器自动化最多填到 final review screen，看到 submit 就停。
* **敏感字段不能猜。** 工作授权、签证赞助、残障、退伍军人、种族、性别等字段必须让候选人明确回答。

---

## 测试

```powershell
python -m unittest discover -s .\tests -v
```

测试会覆盖：

* JD role classification
* evidence selection
* CLI 输出文件
* human approval gate
* AI New Grad / evals 类岗位不会被误分到 FDE

---

## 跨平台

Claude Code · Codex · OpenCode · OpenClaw

只要 Agent 支持读取 `SKILL.md`，就可以把这个仓库作为 skill 使用。

---

## License

MIT
