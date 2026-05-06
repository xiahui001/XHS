# Supabase 表结构 v1.0

状态：待业务确认。本文只定义数据结构，不执行建表。

## 1. 设计原则

1. 第一版后台账号权限相同，先不做复杂 RBAC。
2. 所有发布相关动作保留人工确认记录。
3. 所有素材保留来源、授权说明和使用记录。
4. 所有 AI 输出都落库，便于复盘和二次编辑。
5. 所有客服回复建议与线索状态变更写入审计日志。

## 2. 枚举设计

| 枚举 | 值 |
| --- | --- |
| `account_status` | `active`, `paused`, `archived` |
| `hotspot_status` | `available`, `needs_review`, `discarded` |
| `material_status` | `available`, `used`, `blocked`, `needs_license_review` |
| `draft_status` | `pending_review`, `selected`, `needs_edit`, `published`, `discarded` |
| `generation_status` | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `conversation_status` | `open`, `waiting_human`, `lead_created`, `closed` |
| `lead_status` | `new`, `contacted`, `quoted`, `proposal`, `won`, `invalid` |
| `audit_object_type` | `account`, `hotspot_ref`, `material`, `generation_job`, `draft`, `conversation`, `lead`, `prompt` |

## 3. 表：`profiles`

后台用户资料。第一版只用于显示操作人。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 对应 Supabase Auth 用户 ID |
| `display_name` | `text` | 是 | 用户名称 |
| `email` | `text` | 是 | 邮箱 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

索引：

- `profiles_email_idx`：`email`

## 4. 表：`xhs_accounts`

5 个小红书矩阵账号。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `name` | `text` | 是 | 后台显示名 |
| `xhs_display_name` | `text` | 否 | 小红书账号昵称 |
| `positioning` | `text` | 是 | 行业定位 |
| `audience_profile` | `text` | 否 | 目标客户画像 |
| `content_angles` | `text[]` | 是 | 常用内容角度 |
| `default_tags` | `text[]` | 是 | 默认标签 |
| `daily_publish_target` | `int` | 是 | 默认 3 |
| `daily_candidate_target` | `int` | 是 | 默认 6 |
| `status` | `account_status` | 是 | 默认 `active` |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

初始数据：

| 账号 | `positioning` |
| --- | --- |
| A1 | 美业大健康微商活动 |
| A2 | 校园活动 |
| A3 | 建筑行业活动 |
| A4 | 商超美陈 |
| A5 | 企业年会团建 |

## 5. 表：`hotspot_refs`

热点参考库。第一版支持人工录入、CSV 导入、授权数据源导入。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `keyword` | `text` | 是 | 关键词 |
| `industry` | `text` | 是 | 行业 |
| `source_type` | `text` | 是 | `manual`, `csv`, `authorized_provider` |
| `source_name` | `text` | 否 | 来源名称 |
| `source_url` | `text` | 否 | 来源链接 |
| `reference_title` | `text` | 是 | 参考标题 |
| `reference_summary` | `text` | 是 | 参考摘要，避免保存大段原文 |
| `hotness_note` | `text` | 否 | 热度备注 |
| `applicable_account_ids` | `uuid[]` | 是 | 适用账号 |
| `status` | `hotspot_status` | 是 | 默认 `available` |
| `created_by` | `uuid` | 否 | 创建人 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

索引：

- `hotspot_refs_keyword_idx`：`keyword`
- `hotspot_refs_industry_idx`：`industry`
- `hotspot_refs_status_idx`：`status`

## 6. 表：`materials`

授权素材库。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `title` | `text` | 是 | 素材标题 |
| `source_platform` | `text` | 是 | 例如 `eventwang.cn` |
| `source_url` | `text` | 否 | 原始来源链接 |
| `storage_path` | `text` | 否 | Supabase Storage 路径 |
| `thumbnail_path` | `text` | 否 | 缩略图路径 |
| `license_note` | `text` | 是 | 授权说明 |
| `allow_derivative` | `boolean` | 是 | 是否允许二创 |
| `allow_commercial_publish` | `boolean` | 是 | 是否允许商业发布 |
| `industry_tags` | `text[]` | 是 | 适用行业 |
| `used_count` | `int` | 是 | 默认 0 |
| `status` | `material_status` | 是 | 默认 `available` |
| `created_by` | `uuid` | 否 | 创建人 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

索引：

- `materials_source_platform_idx`：`source_platform`
- `materials_status_idx`：`status`
- `materials_industry_tags_idx`：`industry_tags`

## 7. 表：`material_usages`

素材使用记录，防止账号之间复用图片。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `material_id` | `uuid` | 是 | 关联 `materials.id` |
| `account_id` | `uuid` | 是 | 关联 `xhs_accounts.id` |
| `draft_id` | `uuid` | 否 | 关联 `drafts.id` |
| `usage_type` | `text` | 是 | `candidate`, `selected`, `published` |
| `created_at` | `timestamptz` | 是 | 创建时间 |

约束：

- 同一素材不应被不同账号发布使用。
- 同一草稿内图片排序由 `draft_images` 控制。

## 8. 表：`generation_jobs`

生成任务。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `keyword` | `text` | 是 | 用户输入关键词 |
| `target_account_ids` | `uuid[]` | 是 | 目标账号 |
| `candidates_per_account` | `int` | 是 | 默认 6 |
| `total_target_count` | `int` | 是 | 默认 30 |
| `hotspot_ref_ids` | `uuid[]` | 否 | 使用的参考 |
| `status` | `generation_status` | 是 | 任务状态 |
| `error_message` | `text` | 否 | 失败原因 |
| `created_by` | `uuid` | 否 | 创建人 |
| `started_at` | `timestamptz` | 否 | 开始时间 |
| `completed_at` | `timestamptz` | 否 | 完成时间 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

## 9. 表：`drafts`

AI 生成草稿。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `generation_job_id` | `uuid` | 否 | 关联生成任务 |
| `account_id` | `uuid` | 是 | 关联账号 |
| `industry` | `text` | 是 | 行业 |
| `topic` | `text` | 是 | 选题 |
| `title` | `text` | 是 | 20 字内标题 |
| `body` | `text` | 是 | 150 字内正文 |
| `tags` | `text[]` | 是 | 8-12 个标签 |
| `cover_title_options` | `text[]` | 是 | 3 个封面标题候选 |
| `image_structure` | `jsonb` | 是 | 6-9 图结构说明 |
| `quality_score` | `int` | 否 | 0-100 |
| `quality_notes` | `jsonb` | 否 | 质量检查详情 |
| `status` | `draft_status` | 是 | 默认 `pending_review` |
| `selected_at` | `timestamptz` | 否 | 标记选中时间 |
| `published_at` | `timestamptz` | 否 | 人工回填发布时间 |
| `published_url` | `text` | 否 | 人工回填发布链接 |
| `created_by` | `uuid` | 否 | 创建人 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

检查规则：

- `title` 目标 20 字内。
- `body` 目标 150 字内。
- `tags` 目标 8-12 个。
- `cover_title_options` 固定 3 个。
- `image_structure` 目标 6-9 项。

## 10. 表：`draft_images`

草稿图片。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `draft_id` | `uuid` | 是 | 关联 `drafts.id` |
| `material_id` | `uuid` | 是 | 关联 `materials.id` |
| `sort_order` | `int` | 是 | 图片顺序 |
| `role` | `text` | 是 | `cover`, `scene`, `detail`, `process`, `cta` |
| `caption_note` | `text` | 否 | 图片用途说明 |
| `created_at` | `timestamptz` | 是 | 创建时间 |

约束：

- 每个草稿 6-9 张图。
- 每个草稿只能有 1 张封面图。

## 11. 表：`reply_intents`

客服意图配置。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `name` | `text` | 是 | 意图名称 |
| `description` | `text` | 是 | 意图说明 |
| `required_fields` | `text[]` | 是 | 需要补充的信息 |
| `reply_strategy` | `text` | 是 | 回复策略 |
| `handoff_required` | `boolean` | 是 | 是否默认转人工 |
| `enabled` | `boolean` | 是 | 是否启用 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

第一版意图：

- 报价
- 档期
- 城市
- 活动类型
- 活动时间
- 搭建周期
- 设备清单
- 舞台尺寸
- 年会
- 发布会
- 展会
- 商超美陈
- 是否包设计
- 是否包运输
- 发票合同
- 预算不足
- 加急需求
- 异地执行
- 现场勘测
- 付款方式
- 人工客服
- 投诉或负面反馈

## 12. 表：`conversations`

私信会话。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `account_id` | `uuid` | 是 | 来源账号 |
| `xhs_user_nickname` | `text` | 是 | 用户昵称 |
| `source_note_url` | `text` | 否 | 来源笔记 |
| `latest_intent_id` | `uuid` | 否 | 最近意图 |
| `status` | `conversation_status` | 是 | 会话状态 |
| `needs_human` | `boolean` | 是 | 是否需人工 |
| `summary` | `text` | 否 | 会话摘要 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

## 13. 表：`messages`

会话消息与 AI 回复建议。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `conversation_id` | `uuid` | 是 | 关联会话 |
| `sender_type` | `text` | 是 | `customer`, `operator`, `assistant` |
| `content` | `text` | 是 | 消息内容 |
| `detected_intent_id` | `uuid` | 否 | 识别意图 |
| `missing_fields` | `text[]` | 否 | 缺失字段 |
| `suggested_reply` | `text` | 否 | AI 回复建议 |
| `risk_flags` | `text[]` | 否 | 风险标记 |
| `created_at` | `timestamptz` | 是 | 创建时间 |

## 14. 表：`leads`

线索列表。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `conversation_id` | `uuid` | 否 | 来源会话 |
| `account_id` | `uuid` | 是 | 来源账号 |
| `source_note_url` | `text` | 否 | 来源笔记 |
| `customer_nickname` | `text` | 是 | 用户昵称 |
| `phone` | `text` | 否 | 手机号 |
| `city` | `text` | 否 | 城市 |
| `event_type` | `text` | 否 | 活动类型 |
| `event_date` | `date` | 否 | 活动时间 |
| `budget_range` | `text` | 否 | 预算 |
| `requirement_summary` | `text` | 否 | 需求摘要 |
| `status` | `lead_status` | 是 | 默认 `new` |
| `owner_name` | `text` | 否 | 负责人 |
| `next_action` | `text` | 否 | 下一步动作 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

## 15. 表：`lead_followups`

线索跟进记录。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `lead_id` | `uuid` | 是 | 关联线索 |
| `content` | `text` | 是 | 跟进内容 |
| `next_followup_at` | `timestamptz` | 否 | 下次跟进时间 |
| `created_by` | `uuid` | 否 | 创建人 |
| `created_at` | `timestamptz` | 是 | 创建时间 |

## 16. 表：`prompt_templates`

Prompt 配置。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `name` | `text` | 是 | 名称 |
| `purpose` | `text` | 是 | 用途 |
| `version` | `int` | 是 | 版本 |
| `system_prompt` | `text` | 是 | System Prompt |
| `user_prompt_template` | `text` | 是 | User Prompt 模板 |
| `json_schema` | `jsonb` | 是 | 输出约束 |
| `enabled` | `boolean` | 是 | 是否启用 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |

## 17. 表：`audit_logs`

审计日志。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | 是 | 主键 |
| `actor_id` | `uuid` | 否 | 操作人 |
| `object_type` | `audit_object_type` | 是 | 对象类型 |
| `object_id` | `uuid` | 是 | 对象 ID |
| `action` | `text` | 是 | 动作 |
| `summary` | `text` | 是 | 摘要 |
| `before_snapshot` | `jsonb` | 否 | 变更前 |
| `after_snapshot` | `jsonb` | 否 | 变更后 |
| `created_at` | `timestamptz` | 是 | 创建时间 |

## 18. Storage Bucket

| Bucket | 用途 | 访问策略 |
| --- | --- | --- |
| `materials` | 授权素材原图和缩略图 | 登录后读取，服务端写入 |
| `draft-renders` | 后续成品图或封面图 | 登录后读取，服务端写入 |
| `imports` | CSV 导入文件 | 登录后读取，服务端写入 |

## 19. RLS 策略

第一版规则：

- 登录用户可读写全部业务表。
- 未登录用户不可访问。
- 所有写操作由服务端校验业务规则。
- 后续若进入多团队或多客户模式，再增加 `organization_id` 和角色权限。
