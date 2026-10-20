# UIU Routine Frontend

Next.js App Router interface for the UIU Fall 2026 Smart Routine Generator.

See the repository [README](../README.md) for the full setup, API contract, and data pipeline.

## Local run

```powershell
npm install
```

Create `.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```powershell
npm run dev
```

Open `http://localhost:3000`. The FastAPI backend must be running separately.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
