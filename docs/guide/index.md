---
title: Guides
nav_order: 3
has_children: true
---

Conceptual explanations of how the framework's pieces fit together. For exact signatures, see the [API reference](../api/index.md).

| Guide | Covers |
|---|---|
| [Architecture](architecture.md) | `Wrap`, controller/service/repository layers, feature slices, parent → children composition |
| [Auth](auth.md) | `AuthController`, presets, `guard()`, `combine()`, registry-typed identity |
| [Offline-first sync](sync.md) | `findChangedSince`/`applyBatch`, cursors, conflict resolution |
| [Swagger / OpenAPI](swagger.md) | Spec generation, security schemes, tags, path params |
