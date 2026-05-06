# 接口清单 v1.0

状态：待业务确认。本文只定义接口，不实现代码。

## 1. 接口风格

- Next.js Route Handlers：`/api/...`
- 请求和响应统一 JSON。
- 所有接口要求登录。
- 所有写操作写入 `audit_logs`。
- AI 调用只允许服务端发起，前端不暴露模型密钥。

## 2. 通用响应

成功：

```json
{
  "ok": true,
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求字段不完整"
  }
}
```

## 3. 账号矩阵接口

### `GET /api/accounts`

获取 5 个账号列表。

查询参数：

- `status`：可选。

返回：

```json
{
  "ok": true,
  "data": {
    "accounts": []
  }
}
```

### `PATCH /api/accounts/:id`

更新账号定位、标签、每日目标数。

请求：

```json
{
  "positioning": "企业年会团建",
  "content_angles": ["年会", "团建", "会议布置"],
  "daily_publish_target": 3,
  "daily_candidate_target": 6
}
```

## 4. 热点参考库接口

### `GET /api/hotspot-refs`

获取热点参考列表。

查询参数：

- `keyword`
- `industry`
- `status`
- `page`
- `pageSize`

### `POST /api/hotspot-refs`

新增人工参考。

请求：

```json
{
  "keyword": "年会舞台搭建",
  "industry": "企业年会团建",
  "source_type": "manual",
  "source_name": "manual",
  "source_url": "https://example.com",
  "reference_title": "参考标题",
  "reference_summary": "参考摘要",
  "hotness_note": "互动较高",
  "applicable_account_ids": ["uuid"]
}
```

### `POST /api/hotspot-refs/import`

CSV 批量导入参考。

请求：

```json
{
  "storage_path": "imports/hotspot-refs.csv"
}
```

### `PATCH /api/hotspot-refs/:id`

更新参考状态和备注。

## 5. 授权素材库接口

### `GET /api/materials`

获取素材列表。

查询参数：

- `source_platform`
- `industry`
- `status`
- `used`
- `page`
- `pageSize`

### `POST /api/materials`

新增素材。

请求：

```json
{
  "title": "企业年会舞台现场图",
  "source_platform": "eventwang.cn",
  "source_url": "https://eventwang.cn/example",
  "storage_path": "materials/example.jpg",
  "license_note": "账号会员允许二创",
  "allow_derivative": true,
  "allow_commercial_publish": true,
  "industry_tags": ["企业年会团建"]
}
```

### `POST /api/materials/import`

批量导入素材链接或 CSV。

### `PATCH /api/materials/:id`

更新授权备注、行业标签、状态。

## 6. 生成任务接口

### `POST /api/generation-jobs`

创建生成任务。

请求：

```json
{
  "keyword": "年会舞台搭建",
  "target_account_ids": ["uuid"],
  "candidates_per_account": 6,
  "hotspot_ref_ids": ["uuid"]
}
```

处理逻辑：

1. 校验目标账号数量。
2. 校验每个账号有足够授权素材。
3. 创建 `generation_jobs`。
4. 后台执行 AI 生成。
5. 生成 `drafts` 和 `draft_images`。

返回：

```json
{
  "ok": true,
  "data": {
    "job_id": "uuid",
    "status": "queued"
  }
}
```

### `GET /api/generation-jobs/:id`

获取任务进度。

### `POST /api/generation-jobs/:id/cancel`

取消队列中或运行中的任务。

## 7. 草稿接口

### `GET /api/drafts`

获取草稿列表。

查询参数：

- `generation_job_id`
- `account_id`
- `industry`
- `status`
- `min_quality_score`
- `page`
- `pageSize`

### `GET /api/drafts/:id`

获取草稿详情。

### `PATCH /api/drafts/:id`

编辑草稿。

请求：

```json
{
  "title": "年会舞台别只问总价",
  "body": "正文内容",
  "tags": ["年会策划", "舞台搭建"],
  "cover_title_options": ["封面标题 1", "封面标题 2", "封面标题 3"]
}
```

### `POST /api/drafts/:id/quality-check`

运行质量检查。

### `POST /api/drafts/:id/regenerate-title`

重新生成标题。

### `POST /api/drafts/:id/regenerate-body`

重新生成正文。

### `POST /api/drafts/:id/select`

标记已选中。

业务校验：

- 6-9 张图。
- 标题 20 字内。
- 正文 150 字内。
- 标签 8-12 个。
- 图片授权完整。

### `POST /api/drafts/:id/mark-published`

人工回填已发布。

请求：

```json
{
  "published_at": "2026-04-26T10:00:00+08:00",
  "published_url": "https://www.xiaohongshu.com/..."
}
```

### `POST /api/drafts/:id/discard`

弃用草稿。

## 8. 草稿图片接口

### `PATCH /api/drafts/:id/images`

更新图片排序和用途。

请求：

```json
{
  "images": [
    {
      "draft_image_id": "uuid",
      "sort_order": 1,
      "role": "cover",
      "caption_note": "封面"
    }
  ]
}
```

### `POST /api/drafts/:id/images/replace`

替换某张图片。

请求：

```json
{
  "draft_image_id": "uuid",
  "new_material_id": "uuid"
}
```

## 9. 私信助手接口

### `GET /api/conversations`

获取会话列表。

查询参数：

- `account_id`
- `status`
- `needs_human`
- `page`
- `pageSize`

### `POST /api/conversations`

创建会话。

请求：

```json
{
  "account_id": "uuid",
  "xhs_user_nickname": "用户昵称",
  "source_note_url": "https://www.xiaohongshu.com/..."
}
```

### `POST /api/conversations/:id/messages`

新增用户消息或运营消息。

请求：

```json
{
  "sender_type": "customer",
  "content": "你们下周六能搭年会舞台吗？"
}
```

### `POST /api/conversations/:id/detect-intent`

识别最近消息意图。

### `POST /api/conversations/:id/generate-reply`

生成回复建议。

### `POST /api/conversations/:id/handoff`

标记转人工。

## 10. 线索接口

### `GET /api/leads`

获取线索列表。

查询参数：

- `account_id`
- `status`
- `city`
- `event_type`
- `owner_name`
- `page`
- `pageSize`

### `POST /api/leads`

创建线索。

请求：

```json
{
  "conversation_id": "uuid",
  "account_id": "uuid",
  "customer_nickname": "用户昵称",
  "phone": "13800000000",
  "city": "杭州",
  "event_type": "年会",
  "event_date": "2026-05-20",
  "budget_range": "5 万左右",
  "requirement_summary": "300 人年会舞台搭建"
}
```

### `PATCH /api/leads/:id`

更新线索状态和字段。

### `POST /api/leads/:id/followups`

新增跟进记录。

## 11. Prompt 接口

### `GET /api/prompts`

获取 Prompt 模板列表。

### `PATCH /api/prompts/:id`

更新 Prompt。

### `POST /api/prompts/:id/test`

用测试输入运行 Prompt。

## 12. 审计接口

### `GET /api/audit-logs`

获取审计日志。

查询参数：

- `object_type`
- `object_id`
- `actor_id`
- `page`
- `pageSize`

## 13. 非功能要求

- 列表接口默认分页 20 条，最大 100 条。
- 所有写接口需要服务端校验字段长度和状态流转。
- AI 生成接口需要超时控制和失败重试。
- 草稿生成失败不能影响已生成草稿。
- 任何状态变更必须写审计日志。

