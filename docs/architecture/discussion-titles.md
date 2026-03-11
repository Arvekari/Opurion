# Discussion Titles

Discussion titles are generated from the first stored user prompt.

Rules:

- prefer the first persisted user message over artifact metadata
- strip prompt markup and collapse whitespace before saving the title
- keep manual rename as the source of truth after the user edits the title
- fall back to the first artifact title only when no usable user prompt exists

Persistence:

- local chat history continues to use IndexedDB for normal chat sessions
- collaborative conversations already persist titles in the shared server persistence layer
- SQLite fallback and PostgREST already share the same persistence abstraction, so a second SQLite database is not introduced here
- vector storage already exists in the same backend abstraction and can be reused for discussion search instead of creating a parallel vector database path