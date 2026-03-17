import ignore from 'ignore';
import type { ProviderInfo } from '~/types/model';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from './constants';

const starterTemplateSelectionPrompt = (templates: Template[]) => `
You are an experienced developer who helps people choose the best starter template for their projects.
IMPORTANT: Prefer Vite-based starters for frontend-only projects.
IMPORTANT: Only choose shadcn templates if the user explicitly asks for shadcn.

Available templates:
<template>
  <name>blank</name>
  <description>Empty starter for simple scripts and trivial tasks that don't require a full template setup</description>
  <tags>basic, script</tags>
</template>
${templates
  .map(
    (template) => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>
`,
  )
  .join('\n')}

Response Format:
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>react-basic-starter</templateName>
  <title>Simple React todo application</title>
</selection>
</example>

<example>
User: Write a script to generate numbers from 1 to 100
Response:
<selection>
  <templateName>blank</templateName>
  <title>script to generate numbers from 1 to 100</title>
</selection>
</example>

Instructions:
1. For trivial tasks and simple scripts, always recommend the blank template
2. For backend API/service requests, prioritize backend/full-stack templates that include server scaffolding
3. For full-stack requests, choose templates that include both backend and frontend setup
4. For more complex projects, recommend templates from the provided list
5. Follow the exact XML format
6. Consider both technical requirements and tags
7. If no perfect match exists, recommend the closest option

Important: Provide only the selection tags in your response, no additional text.
MOST IMPORTANT: YOU DONT HAVE TIME TO THINK JUST START RESPONDING BASED ON HUNCH 
`;

const templates: Template[] = STARTER_TEMPLATES.filter((t) => !t.name.includes('shadcn'));

const BUILTIN_TEMPLATE_PREFIX = 'builtin:';

function getBuiltinTemplateFiles(templateId: string) {
  if (templateId === 'express-backend') {
    return [
      {
        name: 'README.md',
        path: 'README.md',
        content: `# Express Backend Service\n\nThis project is an Express starter focused on API-first backend development.\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Endpoints\n\n- \`GET /health\`\n- \`GET /items\`\n- \`POST /items\`\n`,
      },
      {
        name: 'package.json',
        path: 'package.json',
        content: `{
  "name": "express-backend-service",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.1"
  }
}`,
      },
      {
        name: 'server.js',
        path: 'src/server.js',
        content: `import express from 'express';\nimport cors from 'cors';\n\nimport { createItem, listItems } from './services/items.js';\n\nconst app = express();\nconst port = Number(process.env.PORT || 3001);\n\napp.use(cors());\napp.use(express.json());\n\napp.get('/health', (_req, res) => {\n  res.json({ status: 'ok' });\n});\n\napp.get('/items', (_req, res) => {\n  res.json(listItems());\n});\n\napp.post('/items', (req, res) => {\n  const { name = '', description = null } = req.body ?? {};\n\n  if (!String(name).trim()) {\n    return res.status(400).json({ error: 'name is required' });\n  }\n\n  const item = createItem({ name: String(name), description: description ? String(description) : null });\n  res.status(201).json(item);\n});\n\napp.listen(port, () => {\n  console.log(\`Express backend listening on http://localhost:\${port}\`);\n});\n`,
      },
      {
        name: 'items.js',
        path: 'src/services/items.js',
        content: `const items = [];\n\nexport function listItems() {\n  return items;\n}\n\nexport function createItem(payload) {\n  const item = {\n    id: items.length + 1,\n    name: payload.name,\n    description: payload.description ?? null,\n  };\n\n  items.push(item);\n  return item;\n}\n`,
      },
    ];
  }

  if (templateId === 'fastapi-backend') {
    return [
      {
        name: 'README.md',
        path: 'README.md',
        content: `# FastAPI Backend Service\n\nThis project is a FastAPI starter focused on API-first backend development.\n\n## Run\n\n\`\`\`bash\npip install -r requirements.txt\nuvicorn app.main:app --reload\n\`\`\`\n\n## Endpoints\n\n- \`GET /health\`\n- \`GET /items\`\n- \`POST /items\`\n`,
      },
      {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: `fastapi==0.115.0\nuvicorn[standard]==0.30.6\npydantic==2.9.2\n`,
      },
      {
        name: '__init__.py',
        path: 'app/__init__.py',
        content: '',
      },
      {
        name: 'main.py',
        path: 'app/main.py',
        content: `from fastapi import FastAPI\n\nfrom app.schemas import ItemCreate, ItemRead\nfrom app.services.items import create_item, list_items\n\napp = FastAPI(title=\"FastAPI Backend Service\", version=\"0.1.0\")\n\n\n@app.get(\"/health\")\ndef health() -> dict[str, str]:\n    return {\"status\": \"ok\"}\n\n\n@app.get(\"/items\", response_model=list[ItemRead])\ndef get_items() -> list[ItemRead]:\n    return list_items()\n\n\n@app.post(\"/items\", response_model=ItemRead, status_code=201)\ndef post_item(payload: ItemCreate) -> ItemRead:\n    return create_item(payload)\n`,
      },
      {
        name: 'schemas.py',
        path: 'app/schemas.py',
        content: `from pydantic import BaseModel\n\n\nclass ItemCreate(BaseModel):\n    name: str\n    description: str | None = None\n\n\nclass ItemRead(BaseModel):\n    id: int\n    name: str\n    description: str | None = None\n`,
      },
      {
        name: 'items.py',
        path: 'app/services/items.py',
        content: `from app.schemas import ItemCreate, ItemRead\n\n_items: list[ItemRead] = []\n\n\ndef list_items() -> list[ItemRead]:\n    return _items\n\n\ndef create_item(payload: ItemCreate) -> ItemRead:\n    item = ItemRead(id=len(_items) + 1, name=payload.name, description=payload.description)\n    _items.append(item)\n    return item\n`,
      },
    ];
  }

  if (templateId === 'fastapi-react-fullstack') {
    return [
      {
        name: 'README.md',
        path: 'README.md',
        content: `# FastAPI + React Fullstack Starter\n\nThis starter scaffolds:\n\n- \`backend/\` FastAPI API service\n- \`frontend/\` React app entry with API client\n\n## Backend\n\n\`\`\`bash\ncd backend\npip install -r requirements.txt\nuvicorn app.main:app --reload --port 8000\n\`\`\`\n\n## Frontend\n\n\`\`\`bash\ncd frontend\nnpm install\nnpm run dev\n\`\`\`\n`,
      },
      {
        name: 'requirements.txt',
        path: 'backend/requirements.txt',
        content: `fastapi==0.115.0\nuvicorn[standard]==0.30.6\npydantic==2.9.2\n`,
      },
      {
        name: '__init__.py',
        path: 'backend/app/__init__.py',
        content: '',
      },
      {
        name: 'main.py',
        path: 'backend/app/main.py',
        content: `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\n\napp = FastAPI(title=\"FastAPI Fullstack Backend\", version=\"0.1.0\")\n\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=[\"http://localhost:5173\"],\n    allow_credentials=True,\n    allow_methods=[\"*\"],\n    allow_headers=[\"*\"],\n)\n\n\n@app.get(\"/health\")\ndef health() -> dict[str, str]:\n    return {\"status\": \"ok\"}\n`,
      },
      {
        name: 'package.json',
        path: 'frontend/package.json',
        content: `{
  \"name\": \"frontend\",
  \"private\": true,
  \"version\": \"0.1.0\",
  \"type\": \"module\",
  \"scripts\": {
    \"dev\": \"vite\",
    \"build\": \"vite build\",
    \"preview\": \"vite preview\"
  },
  \"dependencies\": {
    \"react\": \"^18.3.1\",
    \"react-dom\": \"^18.3.1\"
  },
  \"devDependencies\": {
    \"@vitejs/plugin-react\": \"^4.3.4\",
    \"typescript\": \"^5.7.2\",
    \"vite\": \"^5.4.11\"
  }
}`,
      },
      {
        name: 'main.tsx',
        path: 'frontend/src/main.tsx',
        content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nasync function checkBackend() {\n  const response = await fetch('http://localhost:8000/health');\n  return response.json();\n}\n\nfunction App() {\n  const [status, setStatus] = React.useState('checking...');\n\n  React.useEffect(() => {\n    checkBackend()\n      .then((payload) => setStatus(payload.status || 'ok'))\n      .catch(() => setStatus('unreachable'));\n  }, []);\n\n  return (\n    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>\n      <h1>FastAPI + React Fullstack</h1>\n      <p>Backend health: {status}</p>\n    </main>\n  );\n}\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n`,
      },
      {
        name: 'index.html',
        path: 'frontend/index.html',
        content: `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>FastAPI + React</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n`,
      },
    ];
  }

  if (templateId === 'express-react-fullstack') {
    return [
      {
        name: 'README.md',
        path: 'README.md',
        content: `# Express + React Fullstack Starter\n\nThis starter scaffolds:\n\n- \`backend/\` Express API service\n- \`frontend/\` React app entry with API client\n\n## Backend\n\n\`\`\`bash\ncd backend\nnpm install\nnpm run dev\n\`\`\`\n\n## Frontend\n\n\`\`\`bash\ncd frontend\nnpm install\nnpm run dev\n\`\`\`\n`,
      },
      {
        name: 'package.json',
        path: 'backend/package.json',
        content: `{
  "name": "backend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.1"
  }
}`,
      },
      {
        name: 'server.js',
        path: 'backend/src/server.js',
        content: `import express from 'express';\nimport cors from 'cors';\n\nconst app = express();\nconst port = Number(process.env.PORT || 3001);\n\napp.use(cors());\n\napp.get('/health', (_req, res) => {\n  res.json({ status: 'ok' });\n});\n\napp.listen(port, () => {\n  console.log(\`Express backend listening on http://localhost:\${port}\`);\n});\n`,
      },
      {
        name: 'package.json',
        path: 'frontend/package.json',
        content: `{
  "name": "frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}`,
      },
      {
        name: 'main.tsx',
        path: 'frontend/src/main.tsx',
        content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nasync function checkBackend() {\n  const response = await fetch('http://localhost:3001/health');\n  return response.json();\n}\n\nfunction App() {\n  const [status, setStatus] = React.useState('checking...');\n\n  React.useEffect(() => {\n    checkBackend()\n      .then((payload) => setStatus(payload.status || 'ok'))\n      .catch(() => setStatus('unreachable'));\n  }, []);\n\n  return (\n    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>\n      <h1>Express + React Fullstack</h1>\n      <p>Backend health: {status}</p>\n    </main>\n  );\n}\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n`,
      },
      {
        name: 'index.html',
        path: 'frontend/index.html',
        content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Express + React</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
      },
    ];
  }

  return null;
}

const parseSelectedTemplate = (llmOutput: string): { template: string; title: string } | null => {
  try {
    // Extract content between <templateName> tags
    const templateNameMatch = llmOutput.match(/<templateName>(.*?)<\/templateName>/);
    const titleMatch = llmOutput.match(/<title>(.*?)<\/title>/);

    if (!templateNameMatch) {
      return null;
    }

    return { template: templateNameMatch[1].trim(), title: titleMatch?.[1].trim() || 'Untitled Project' };
  } catch (error) {
    console.error('Error parsing template selection:', error);
    return null;
  }
};

export const selectStarterTemplate = async (options: { message: string; model: string; provider: ProviderInfo }) => {
  const { message, model, provider } = options;
  const requestBody = {
    message,
    model,
    provider,
    system: starterTemplateSelectionPrompt(templates),
  };
  const response = await fetch('/api/llmcall', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  const respJson: { text: string } = await response.json();
  console.log(respJson);

  const { text } = respJson;
  const selectedTemplate = parseSelectedTemplate(text);

  if (selectedTemplate) {
    return selectedTemplate;
  } else {
    console.log('No template selected, using blank template');

    return {
      template: 'blank',
      title: '',
    };
  }
};

const getGitHubRepoContent = async (repoName: string): Promise<{ name: string; path: string; content: string }[]> => {
  try {
    if (repoName.startsWith(BUILTIN_TEMPLATE_PREFIX)) {
      const builtinId = repoName.slice(BUILTIN_TEMPLATE_PREFIX.length);
      const builtinFiles = getBuiltinTemplateFiles(builtinId);

      if (!builtinFiles) {
        throw new Error(`Unknown built-in template id: ${builtinId}`);
      }

      return builtinFiles;
    }

    // Instead of directly fetching from GitHub, use our own API endpoint as a proxy
    const response = await fetch(`/api/github-template?repo=${encodeURIComponent(repoName)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Our API will return the files in the format we need
    const files = (await response.json()) as any;

    return files;
  } catch (error) {
    console.error('Error fetching release contents:', error);
    throw error;
  }
};

export async function getTemplates(templateName: string, title?: string) {
  const template = STARTER_TEMPLATES.find((t) => t.name == templateName);

  if (!template) {
    return null;
  }

  const githubRepo = template.githubRepo;
  const files = await getGitHubRepoContent(githubRepo);

  let filteredFiles = files;

  /*
   * ignoring common unwanted files
   * exclude    .git
   */
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.git') == false);

  /*
   * exclude    lock files
   * WE NOW INCLUDE LOCK FILES FOR IMPROVED INSTALL TIMES
   */
  {
    /*
     *const comminLockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
     *filteredFiles = filteredFiles.filter((x) => comminLockFiles.includes(x.name) == false);
     */
  }

  // exclude    .bolt
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.bolt') == false);

  // check for ignore file in .bolt folder
  const templateIgnoreFile = files.find((x) => x.path.startsWith('.bolt') && x.name == 'ignore');

  const filesToImport = {
    files: filteredFiles,
    ignoreFile: [] as typeof filteredFiles,
  };

  if (templateIgnoreFile) {
    // redacting files specified in ignore file
    const ignorepatterns = templateIgnoreFile.content.split('\n').map((x) => x.trim());
    const ig = ignore().add(ignorepatterns);

    // filteredFiles = filteredFiles.filter(x => !ig.ignores(x.path))
    const ignoredFiles = filteredFiles.filter((x) => ig.ignores(x.path));

    filesToImport.files = filteredFiles;
    filesToImport.ignoreFile = ignoredFiles;
  }

  const assistantMessage = `
Opurion is initializing your project with the required files using the ${template.name} template.
<boltArtifact id="imported-files" title="${title || 'Create initial files'}" type="bundled">
${filesToImport.files
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${file.content}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>
`;
  let userMessage = ``;
  const templatePromptFile = files.filter((x) => x.path.startsWith('.bolt')).find((x) => x.name == 'prompt');

  if (templatePromptFile) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${templatePromptFile.content}

---
`;
  }

  if (filesToImport.ignoreFile.length > 0) {
    userMessage =
      userMessage +
      `
STRICT FILE ACCESS RULES - READ CAREFULLY:

The following files are READ-ONLY and must never be modified:
${filesToImport.ignoreFile.map((file) => `- ${file.path}`).join('\n')}

Permitted actions:
✓ Import these files as dependencies
✓ Read from these files
✓ Reference these files

Strictly forbidden actions:
❌ Modify any content within these files
❌ Delete these files
❌ Rename these files
❌ Move these files
❌ Create new versions of these files
❌ Suggest changes to these files

Any attempt to modify these protected files will result in immediate termination of the operation.

If you need to make changes to functionality, create new files instead of modifying the protected ones listed above.
---
`;
  }

  userMessage += `
---
template import is done, and you can now use the imported files,
edit only the files that need to be changed, and you can create new files as needed.
NO NOT EDIT/WRITE ANY FILES THAT ALREADY EXIST IN THE PROJECT AND DOES NOT NEED TO BE MODIFIED
---
Now that the Template is imported please continue with my original request

IMPORTANT: Dont Forget to install the dependencies before running the app by using \`npm install && npm run dev\`
`;

  return {
    assistantMessage,
    userMessage,
  };
}
