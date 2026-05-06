# AI Prompt 输出格式 v1.0

状态：待业务确认。本文只定义 Prompt 和 JSON 输出，不接入模型。

## 1. 总原则

1. 所有 AI 输出必须是结构化 JSON。
2. 内容必须原创表达，不复刻参考文案。
3. 草稿要服务账号定位，不同账号不能输出同质角度。
4. 标题 20 字内，正文 150 字内，标签 8-12 个。
5. 每篇草稿必须包含 6-9 图结构建议。
6. 客服回复必须自然、克制，不承诺最终报价，不硬导微信。
7. 遇到投诉、合同、发票、具体档期、精确报价、负面情绪时转人工。

## 2. Prompt 任务清单

| Prompt | 用途 |
| --- | --- |
| `keyword_expansion` | 根据关键词扩展行业场景、痛点、选题方向 |
| `draft_generation` | 生成小红书图文草稿 |
| `draft_quality_check` | 检查草稿长度、重复、风险表达、素材缺口 |
| `title_regeneration` | 单独重写标题 |
| `body_regeneration` | 单独重写正文 |
| `reply_intent_detection` | 识别私信咨询意图 |
| `reply_generation` | 生成客服回复建议 |
| `lead_extraction` | 从会话中抽取线索字段 |

## 3. 通用 System Prompt

```text
你是一个活动服务行业的小红书矩阵运营助手，负责帮助活动策划、舞美搭建、舞台设备租赁、商超美陈、企业年会团建等账号生成内容草稿和客服回复建议。

你必须遵守：
1. 输出必须是合法 JSON，不要输出 Markdown。
2. 不要复刻参考文案，不要搬运原文，只能提炼结构和创作方向。
3. 不要生成规避平台审核、绕过风控、诱导私下交易的话术。
4. 不要承诺最低价、保效果、包成交、医疗功效、收益结果。
5. 客服回复要自然、简短、有服务感，但不能冒充具体真人身份。
6. 精确报价、合同、发票、档期锁定、投诉、负面情绪必须建议转人工。
```

## 4. `keyword_expansion`

### 输入字段

```json
{
  "keyword": "年会舞台搭建",
  "accounts": [
    {
      "id": "A5",
      "positioning": "企业年会团建",
      "content_angles": ["年会", "团建", "会议布置"]
    }
  ]
}
```

### 输出格式

```json
{
  "keyword": "年会舞台搭建",
  "expanded_topics": [
    {
      "account_id": "A5",
      "industry": "企业年会团建",
      "topic": "年会舞台搭建预算怎么拆",
      "customer_pain": "客户不知道报价差异来自哪里",
      "content_angle": "报价因素科普",
      "recommended_visuals": ["舞台全景", "灯光效果", "LED 屏", "签到区"]
    }
  ]
}
```

## 5. `draft_generation`

### 输入字段

```json
{
  "generation_job_id": "uuid",
  "keyword": "年会舞台搭建",
  "account": {
    "id": "A5",
    "positioning": "企业年会团建",
    "audience_profile": "企业行政、HR、市场部",
    "content_angles": ["年会", "团建", "晚宴", "会议布置"],
    "default_tags": ["年会策划", "舞台搭建", "活动策划"]
  },
  "hotspot_refs": [
    {
      "reference_title": "年会舞台这样搭太有氛围了",
      "reference_summary": "强调舞台氛围、预算拆解、灯光屏幕搭配"
    }
  ],
  "available_materials": [
    {
      "id": "material_uuid",
      "title": "企业年会舞台现场图",
      "industry_tags": ["企业年会团建"],
      "license_note": "eventwang.cn 会员授权，允许二创"
    }
  ],
  "target_count": 6
}
```

### 输出格式

```json
{
  "drafts": [
    {
      "account_id": "A5",
      "industry": "企业年会团建",
      "topic": "年会舞台预算拆解",
      "title": "年会舞台别只问总价",
      "body": "年会舞台费用通常和尺寸、灯光、LED、音响、搭建时间有关。先确认人数、场地和流程，再做预算会更稳。",
      "tags": [
        "年会策划",
        "舞台搭建",
        "企业年会",
        "活动执行",
        "会议布置",
        "灯光音响",
        "LED大屏",
        "团建活动"
      ],
      "cover_title_options": [
        "年会舞台预算拆解",
        "别只问舞台总价",
        "年会搭建这样省心"
      ],
      "image_structure": [
        {
          "order": 1,
          "role": "cover",
          "visual_brief": "年会舞台全景，突出灯光和 LED 屏",
          "caption_note": "封面强调预算拆解"
        },
        {
          "order": 2,
          "role": "scene",
          "visual_brief": "观众区看向舞台的视角",
          "caption_note": "展示整体氛围"
        },
        {
          "order": 3,
          "role": "detail",
          "visual_brief": "灯光、音响、LED 细节",
          "caption_note": "说明影响报价的设备"
        },
        {
          "order": 4,
          "role": "process",
          "visual_brief": "搭建过程或物料进场",
          "caption_note": "展示执行能力"
        },
        {
          "order": 5,
          "role": "detail",
          "visual_brief": "签到区或背景板",
          "caption_note": "补充配套区域"
        },
        {
          "order": 6,
          "role": "cta",
          "visual_brief": "完整舞台落地效果",
          "caption_note": "引导留资咨询"
        }
      ],
      "material_requirements": {
        "min_images": 6,
        "max_images": 9,
        "must_match_industry": true,
        "avoid_reusing_other_accounts": true
      },
      "risk_flags": [],
      "quality_notes": [
        "正文未承诺最终报价",
        "标签数量符合要求"
      ]
    }
  ]
}
```

## 6. `draft_quality_check`

### 输入字段

```json
{
  "draft": {
    "title": "年会舞台别只问总价",
    "body": "年会舞台费用通常和尺寸、灯光、LED、音响、搭建时间有关。",
    "tags": ["年会策划", "舞台搭建"],
    "image_count": 6,
    "license_complete": true
  }
}
```

### 输出格式

```json
{
  "score": 86,
  "passed": false,
  "checks": [
    {
      "name": "title_length",
      "passed": true,
      "message": "标题 10 字，符合 20 字内要求"
    },
    {
      "name": "tag_count",
      "passed": false,
      "message": "标签不足 8 个"
    }
  ],
  "risk_flags": [],
  "revision_suggestions": [
    "补充至 8-12 个标签"
  ]
}
```

## 7. `reply_intent_detection`

### 输入字段

```json
{
  "message": "你们下周六能搭一个 300 人年会舞台吗，大概多少钱？",
  "account_positioning": "企业年会团建",
  "known_context": {
    "city": null,
    "event_date": null,
    "event_type": null,
    "budget_range": null
  }
}
```

### 输出格式

```json
{
  "primary_intent": "报价",
  "secondary_intents": ["档期", "活动规模"],
  "confidence": 0.92,
  "missing_fields": ["城市", "具体日期", "场地", "预算范围", "舞台尺寸"],
  "needs_human": true,
  "handoff_reason": "涉及具体档期和报价，需要人工确认"
}
```

## 8. `reply_generation`

### 输入字段

```json
{
  "customer_message": "你们下周六能搭一个 300 人年会舞台吗，大概多少钱？",
  "detected_intent": {
    "primary_intent": "报价",
    "missing_fields": ["城市", "具体日期", "场地", "预算范围", "舞台尺寸"],
    "needs_human": true
  },
  "account_positioning": "企业年会团建",
  "lead_plugin_available": true
}
```

### 输出格式

```json
{
  "suggested_reply": "可以先帮你看下方案方向。300 人年会需要结合城市、具体日期、场地、舞台尺寸和灯光屏幕配置来估预算。你可以先通过页面里的留资入口发下需求，我们这边会安排同事确认档期和报价。",
  "tone": "natural_service",
  "needs_human": true,
  "risk_flags": [],
  "fields_to_collect": ["城市", "具体日期", "场地", "预算范围", "舞台尺寸"]
}
```

## 9. `lead_extraction`

### 输入字段

```json
{
  "conversation_messages": [
    "下周六能搭一个 300 人年会舞台吗？",
    "在杭州，预算 5 万左右。"
  ]
}
```

### 输出格式

```json
{
  "lead": {
    "city": "杭州",
    "event_type": "年会",
    "event_date": null,
    "budget_range": "5 万左右",
    "requirement_summary": "客户咨询 300 人年会舞台搭建，地点杭州，预算约 5 万。"
  },
  "missing_fields": ["具体日期", "场地", "舞台尺寸", "联系方式"],
  "confidence": 0.87
}
```

## 10. 输出失败处理

模型输出不合法 JSON 时：

1. 前端显示“生成失败，可重试”。
2. 后端记录原始错误。
3. 不创建草稿。
4. 任务状态标记为 `failed`。

模型输出字段缺失时：

1. 后端按 JSON Schema 校验失败。
2. 记录缺失字段。
3. 允许运营点击“重新生成”。

