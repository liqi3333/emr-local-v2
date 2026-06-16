# 待办：字段 Key 复用问题

> 状态：待讨论
> 发现日期：2026-06-14
> 计划讨论：2026-06-15

## 问题描述

RecordTypeManager.js 中新增字段时，key 的生成规则为 `field_` + 递增编号：

```javascript
let key = 'field_' + (type.fields.length + 1);
```

当删除最后一个字段后再添加新字段，会复用已删除字段的 key，导致历史记录数据混淆。

## 复用场景

1. 有 6 个字段 `field_1` ~ `field_6`
2. 删掉 `field_6`
3. 添加新字段 → 生成 `field_6`（复用）

## 影响

- 旧记录 `content` JSON 中的 `field_6` 值对应旧 label
- 新字段 `field_6` 对应新 label
- 历史数据混淆

## 现有碰撞保护

```javascript
// RecordTypeManager.js:634
let key = 'field_' + (type.fields.length + 1);
if (type.fields.find(f => f.key === key)) {
  key = 'field_' + Date.now();  // 碰撞保护
}
```

能覆盖的场景：删掉 `field_3`（非最后一个）后添加新字段 → 生成 `field_4` → `field_4` 还在 → 碰撞 → 用时间戳 → 安全

不能覆盖的场景：删掉最后一个字段后添加 → 编号正好匹配空缺 → 复用

## 待讨论方案

| 方案 | 描述 | 优缺点 |
|------|------|--------|
| A | 取最大编号 +1，永不回头 | 保留可读性，编号会跳跃 |
| B | 统一用时间戳 `field_` + Date.now() | 永不碰撞，key 不可读 |
| C | 接受现状（碰撞保护已覆盖多数场景） | 最小改动，边界情况可忽略 |

## 决策记录

（待讨论后填写）
