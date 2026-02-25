# Claude Instructions

When you complete a task, send me a push notification:

```bash
curl -X POST https://api.getmoshi.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"token": "uSHsgGPKtnpGWoMmeF0P3tXplQmcZmXS", "title": "Done", "message": "Brief summary", "image": "optional http url"}'
```
