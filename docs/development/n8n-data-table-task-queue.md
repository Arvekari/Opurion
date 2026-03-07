# n8n Data Table Task Queue (one task = one row)

This flow implements a persistent orchestration queue using n8n Data Tables.

## Data Table

Create a Data Table in n8n named `orchestration_tasks` with these columns:

- `taskId` (string, unique external key)
- `title` (string)
- `description` (string)
- `priority` (number)
- `status` (string: `open` | `in_progress` | `completed`)
- `agent` (string, optional)
- `createdAt` (datetime, optional)
- `updatedAt` (datetime, optional)

## Webhook payload

```json
{
  "task": {
    "taskId": "bolt2-ui-17",
    "title": "refactor UI sidebar",
    "description": "normalize spacing tokens",
    "priority": 5,
    "status": "open",
    "agent": "ui-agent"
  },
  "completedTaskId": "bolt2-ui-16"
}
```

## Behavior

1. If `completedTaskId` exists, mark matching task row as `completed`.
2. Upsert incoming `task` by `taskId`.
3. Query rows where `status = open`.
4. Sort by `priority` descending.
5. Return highest-priority task as `nextTask`.

## Response shape

```json
{
  "status": "ok",
  "nextTask": {
    "taskId": "bolt2-ui-17",
    "title": "refactor UI sidebar",
    "priority": 5,
    "status": "open"
  }
}
```

Empty queue:

```json
{
  "status": "empty",
  "message": "no open tasks",
  "nextTask": null
}
```

## Example workflow JSON

This matches the managed workflow `Project-bolt2-task-orchestrator-queue`.

```json
{
  "name": "Project-bolt2-task-orchestrator-queue",
  "nodes": [
    {
      "name": "Task Queue Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "bolt2-task-orchestrator",
        "httpMethod": "POST",
        "responseMode": "lastNode"
      }
    },
    {
      "name": "Completed Task?",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.completedTaskId }}",
              "operation": "notEmpty"
            }
          ]
        }
      }
    },
    {
      "name": "Mark Completed Task Row",
      "type": "n8n-nodes-base.dataTable",
      "parameters": {
        "operation": "update",
        "dataTableId": "orchestration_tasks",
        "filters": {
          "conditions": [
            {
              "key": "taskId",
              "condition": "eq",
              "value": "={{ $json.completedTaskId }}"
            }
          ]
        },
        "updateFields": {
          "status": "completed"
        }
      }
    },
    {
      "name": "Upsert Incoming Task Row",
      "type": "n8n-nodes-base.dataTable",
      "parameters": {
        "operation": "upsert",
        "dataTableId": "orchestration_tasks",
        "keyField": "taskId",
        "fields": {
          "taskId": "={{ $json.task.taskId }}",
          "title": "={{ $json.task.title }}",
          "description": "={{ $json.task.description }}",
          "priority": "={{ $json.task.priority }}",
          "status": "={{ $json.task.status || \"open\" }}",
          "agent": "={{ $json.task.agent || \"\" }}"
        }
      }
    },
    {
      "name": "Get Open Task Rows",
      "type": "n8n-nodes-base.dataTable",
      "parameters": {
        "operation": "get",
        "dataTableId": "orchestration_tasks",
        "filters": {
          "conditions": [
            {
              "key": "status",
              "condition": "eq",
              "value": "open"
            }
          ]
        }
      }
    },
    {
      "name": "Sort by Priority",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const tasks = items.map((item) => item.json);\n\ntasks.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));\n\nreturn tasks.map((task) => ({ json: task }));"
      }
    },
    {
      "name": "Return Next Task",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const nextTask = items[0]?.json || null;\n\nif (!nextTask) {\n  return [{ json: { status: \"empty\", message: \"no open tasks\", nextTask: null } }];\n}\n\nreturn [{ json: { status: \"ok\", nextTask } }];"
      }
    }
  ]
}
```

## Deploy

```bash
pnpm run n8n:orchestrator -- deploy
pnpm run n8n:orchestrator -- list
```

Managed key:

- `task-orchestrator-queue`
