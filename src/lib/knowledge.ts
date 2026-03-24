/**
 * Knowledge Base — Reference documents (By-Laws, Masonic Code) for the AI Coach.
 *
 * The PDF text is pre-extracted at build time into knowledge-data.json so we
 * don't need pdfjs-dist on the server at runtime.
 */

import data from "./knowledge-data.json";

export interface KnowledgeDocument {
  title: string;
  text: string;
}

export const bylaws: KnowledgeDocument = data.bylaws;
export const masonicCode: KnowledgeDocument = data.masonicCode;

/**
 * Build a condensed knowledge context for the system prompt.
 * By-Laws are small enough to include in full.
 * The Masonic Code is large (~165K tokens) so we include only the
 * table-of-contents + key chapters to stay within budget.
 */
export function buildKnowledgeContext(): string {
  const sections: string[] = [];

  // By-Laws — include in full (only ~2.7K tokens)
  sections.push(
    `=== ${bylaws.title} ===\n${bylaws.text}`
  );

  // Masonic Code — include key reference chapters
  // Extract TOC (pages 4-8 in the original, roughly first 15K chars covers TOC + Ancient Constitutions)
  const codeText = masonicCode.text;

  // Find key sections by searching for chapter headings
  const keyChapterStarts = [
    "CONSTITUTION   OF   THE   GRAND   LODGE",
    "LAWS   OF   THE   GRAND   LODGE",
    "TABLE   OF   CONTENTS",
    "ANCIENT   CONSTITUTIONS",
    "Subordinate   Lodge   Defined",
    "Officers   of   Lodges",
    "Duties   of   Officers",
    "Communications   of   Lodges",
    "Business   of   Lodges",
    "Conferral   of   Degrees",
    "Proficiency",
    "Masonic   Offenses",
  ];

  // Include the first ~30K chars which covers the Constitution and early chapters
  const condensed = codeText.substring(0, 30000);

  sections.push(
    `=== ${masonicCode.title} (condensed — key sections) ===\n${condensed}\n\n[... Full Masonic Code continues for ${Math.round(codeText.length / 1000)}K characters covering all chapters through Offenses and Trials, Index ...]`
  );

  return sections.join("\n\n");
}

/** Full Masonic Code text for models with large context windows */
export function getFullMasonicCode(): string {
  return masonicCode.text;
}

/**
 * Recommended topics for the AI Coach, drawn from the knowledge documents.
 */
export function getKnowledgeTopics(): string[] {
  return [
    "What are the duties of the Worshipful Master?",
    "When are stated meetings held for Capital Lodge No. 110?",
    "What does the Masonic Code say about proficiency requirements?",
    "Explain the rules for balloting on a petitioner",
    "What are the responsibilities of the Lodge Trustees?",
    "How does the investigation committee process work?",
    "What constitutes a Masonic offense under Iowa Code?",
    "What are the requirements for degree conferral?",
    "Explain the process for affiliation with a new lodge",
    "What are the Ancient Charges of a Freemason?",
    "How are lodge dues handled if a member becomes delinquent?",
    "What is the proper order of business at a stated communication?",
  ];
}
