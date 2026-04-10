# Numentrix Audio UI

Static HTML/CSS/JS UI for:
- Record or upload audio
- Request transcription from a backend
- Generate content from voice/text

## Open it

You can open `index.html` directly, but **microphone recording usually requires**:
- `https://` **or**
- `http://localhost`

If you want recording to work reliably, serve the folder locally (any static server is fine).

## Backend expectations

The UI calls these endpoints (base URL defaults to `http://localhost:3000`):

### `POST /api/transcribe`

Multipart form-data:
- `audio`: the uploaded/recorded audio file

Response JSON (either field is accepted):
- `{ "transcription": "..." }` or `{ "text": "..." }`

### `POST /api/generate`

JSON:
- `{ "input": "...", "source": "voice" | "text" }`

Response JSON (any field is accepted):
- `{ "content": "..." }` or `{ "output": "..." }` or `{ "text": "..." }`
