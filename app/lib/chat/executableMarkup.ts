const BOLT_ARTIFACT_BLOCK_REGEX = /<boltArtifact\b[^>]*>[\s\S]*?<\/boltArtifact>/gi;
const BOLT_ACTION_BLOCK_REGEX = /<boltAction\b[^>]*>[\s\S]*?<\/boltAction>/gi;
const RENDERED_ARTIFACT_BLOCK_REGEX = /<div\b[^>]*__boltArtifact__[^>]*>[\s\S]*?<\/div>/gi;

export function stripExecutableMarkup(content: string): string {
  if (!content) {
    return content;
  }

  return content
    .replace(BOLT_ARTIFACT_BLOCK_REGEX, '')
    .replace(BOLT_ACTION_BLOCK_REGEX, '')
    .replace(RENDERED_ARTIFACT_BLOCK_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
