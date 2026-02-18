/**
 * Client-side document parser for ritual texts.
 * Extracts text from PDF, DOCX, and plain text files entirely in the browser.
 * The document never leaves the user's device.
 */

export interface RitualSection {
  id: string;
  degree: string;
  sectionName: string;
  speaker: string | null;
  text: string;
  order: number;
}

export interface ParsedDocument {
  title: string;
  rawText: string;
  sections: RitualSection[];
}

// Known degree names for section detection
const DEGREE_PATTERNS = [
  /entered\s*apprentice/i,
  /fellow\s*craft/i,
  /master\s*mason/i,
  /first\s*degree/i,
  /second\s*degree/i,
  /third\s*degree/i,
  /opening\s+on\s+the\s+first/i,
  /opening\s+on\s+the\s+second/i,
  /opening\s+on\s+the\s+third/i,
];

// Section markers commonly found in ritual texts
const SECTION_PATTERNS = [
  /opening/i,
  /lecture/i,
  /charge/i,
  /closing/i,
  /obligation/i,
  /prayer/i,
  /reception/i,
  /circumambulation/i,
  /examination/i,
  /investiture/i,
  /working\s*tools/i,
  /northeast\s*corner/i,
  /middle\s*chamber/i,
  /legend/i,
  /raising/i,
  /catechism/i,
  /proficiency/i,
];

// Speaker role prefixes — supports both dotted (W.M.:) and abbreviated (WM:) forms,
// as well as markdown bold (**WM**:) format
const SPEAKER_PATTERN =
  /^\*{0,2}(W\.?\s?M\.?|WM|S\.?\s?W\.?|SW|J\.?\s?W\.?|JW|S\.?\s?D\.?|SD|J\.?\s?D\.?|JD|S\/Sec|S\/J\s?D|S\s?\(orJ\)\s?D|Sec\.?|Treas\.?|Tr|Chap\.?|Ch|Marshal|Tyler|Candidate|All|ALL|Bros?\.?|BR|T|SW\/WM)\*{0,2}\s*[:\-–—]+\s*/i;

// Markdown heading pattern for ceremony/section structure
const MARKDOWN_HEADING_PATTERN = /^#{1,4}\s+(.+)$/;

// Role display name mapping
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'WM': 'Worshipful Master',
  'W.M.': 'Worshipful Master',
  'W. M.': 'Worshipful Master',
  'SW': 'Senior Warden',
  'S.W.': 'Senior Warden',
  'S. W.': 'Senior Warden',
  'JW': 'Junior Warden',
  'J.W.': 'Junior Warden',
  'J. W.': 'Junior Warden',
  'SD': 'Senior Deacon',
  'S.D.': 'Senior Deacon',
  'S. D.': 'Senior Deacon',
  'JD': 'Junior Deacon',
  'J.D.': 'Junior Deacon',
  'J. D.': 'Junior Deacon',
  'S/Sec': 'Secretary',
  'Sec': 'Secretary',
  'Sec.': 'Secretary',
  'S': 'Secretary',
  'Tr': 'Treasurer',
  'Treas': 'Treasurer',
  'Treas.': 'Treasurer',
  'T': 'Tiler',
  'Tyler': 'Tiler',
  'Ch': 'Chaplain',
  'Chap': 'Chaplain',
  'Chap.': 'Chaplain',
  'Marshal': 'Marshal',
  'Candidate': 'Candidate',
  'ALL': 'All Brethren',
  'All': 'All Brethren',
  'BR': 'Brother',
  'Bro': 'Brother',
  'Bro.': 'Brother',
  'Bros': 'Brethren',
  'Bros.': 'Brethren',
  'SW/WM': 'SW & WM',
  'S(orJ)D': 'Sr. or Jr. Deacon',
  'S/J D': 'Sr. or Jr. Deacon',
};

/**
 * Extract text from a PDF file using pdf.js
 */
async function extractFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

/**
 * Extract text from a DOCX file using mammoth
 */
async function extractFromDOCX(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Extract text from a plain text file
 */
async function extractFromText(file: File): Promise<string> {
  return await file.text();
}

/**
 * Detect which degree a section belongs to based on surrounding context
 */
function detectDegree(text: string): string {
  for (const pattern of DEGREE_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) return match[0].trim();
    }
  }
  return "General";
}

/**
 * Detect the section name from a heading or text block
 */
function detectSectionName(text: string): string | null {
  for (const pattern of SECTION_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) return match[0].trim();
    }
  }
  return null;
}

/**
 * Extract speaker from a line if it starts with a role prefix
 */
function extractSpeaker(line: string): { speaker: string | null; text: string } {
  const match = line.match(SPEAKER_PATTERN);
  if (match) {
    return {
      speaker: match[1].trim(),
      text: line.slice(match[0].length).trim(),
    };
  }
  return { speaker: null, text: line.trim() };
}

/**
 * Strip markdown formatting from text for clean display/TTS
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')  // **bold** or *italic*
    .replace(/\[Action:\s*[^\]]*\]/gi, '')       // [Action: ...]
    .trim();
}

/**
 * Clean ritual line text for TTS/comparison — removes gavel marks and actions
 */
export function cleanRitualText(text: string): string {
  return text
    .replace(/^\*{1,3}\s*/, '')                  // Leading gavel marks (* ** ***)
    .replace(/\s*\*{1,3}$/, '')                  // Trailing gavel marks
    .replace(/\[Action:\s*[^\]]*\]/gi, '')       // [Action: ...]
    .replace(/\s{2,}/g, ' ')                     // Collapse multiple spaces
    .trim();
}

/**
 * Parse raw text into structured ritual sections
 */
function structureText(rawText: string): RitualSection[] {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: RitualSection[] = [];

  let currentDegree = "General";
  let currentSection = "Untitled";
  let currentSpeaker: string | null = null;
  let currentText: string[] = [];
  let order = 0;

  // Track whether we're in a metadata block (## ROLES, ## DOCUMENT header, etc.)
  let inMetadataBlock = false;

  function flushSection() {
    if (currentText.length > 0) {
      const joinedText = currentText.join(" ").trim();
      if (joinedText) {
        sections.push({
          id: `section-${order}`,
          degree: currentDegree,
          sectionName: currentSection,
          speaker: currentSpeaker,
          text: joinedText,
          order: order++,
        });
      }
      currentText = [];
    }
  }

  for (const line of lines) {
    // Check for markdown headings (## or ###)
    const headingMatch = line.match(MARKDOWN_HEADING_PATTERN);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      const headingLevel = (line.match(/^#+/) || [''])[0].length;

      // Skip metadata sections (## ROLES, ## DOCUMENT, etc.)
      if (/^(ROLES|DOCUMENT|IMPORTANT)/i.test(headingText)) {
        inMetadataBlock = true;
        continue;
      }

      // ## CEREMONY: heading → treat as degree/ceremony context
      if (/^CEREMONY/i.test(headingText)) {
        flushSection();
        inMetadataBlock = false;
        const ceremonyName = headingText.replace(/^CEREMONY:\s*/i, '').trim();
        // Check if it contains a degree reference
        const degreeInCeremony = detectDegree(ceremonyName);
        if (degreeInCeremony !== "General") {
          currentDegree = degreeInCeremony;
        }
        currentSection = ceremonyName;
        continue;
      }

      // ### Section heading (e.g., "### I. Purgation and Tiling")
      if (headingLevel >= 3) {
        flushSection();
        inMetadataBlock = false;
        // Strip Roman numeral prefix (I., II., III., IV., V., etc.)
        const sectionName = headingText.replace(/^[IVXLC]+\.\s*/, '').trim();
        currentSection = sectionName || headingText;
        continue;
      }

      // Other ## headings → check for degree or section
      flushSection();
      inMetadataBlock = false;
      const degreeMatch = detectDegree(headingText);
      if (degreeMatch !== "General") {
        currentDegree = degreeMatch;
      }
      const sectionMatch = detectSectionName(headingText);
      if (sectionMatch) {
        currentSection = sectionMatch;
      }
      continue;
    }

    // Skip lines inside metadata blocks (role descriptions, etc.)
    if (inMetadataBlock) {
      // Check if this line starts with a speaker — if so, we've left metadata
      const stripped = stripMarkdown(line);
      const { speaker } = extractSpeaker(stripped);
      if (speaker) {
        inMetadataBlock = false;
        // Fall through to speaker handling below
      } else {
        continue;
      }
    }

    // Strip markdown bold markers before processing
    const stripped = stripMarkdown(line);

    // Check for degree heading (non-markdown)
    const degreeMatch = detectDegree(stripped);
    if (degreeMatch !== "General" && stripped.length < 80) {
      flushSection();
      currentDegree = degreeMatch;
      continue;
    }

    // Check for section heading (non-markdown)
    const sectionMatch = detectSectionName(stripped);
    if (sectionMatch && stripped.length < 80) {
      flushSection();
      currentSection = sectionMatch;
      continue;
    }

    // Check for speaker prefix
    const { speaker, text } = extractSpeaker(stripped);
    if (speaker) {
      flushSection();
      currentSpeaker = speaker;
      if (text) currentText.push(text);
    } else if (stripped) {
      currentText.push(stripped);
    }
  }

  flushSection();

  // If no sections were detected, create one big section
  if (sections.length === 0 && rawText.trim().length > 0) {
    sections.push({
      id: "section-0",
      degree: "General",
      sectionName: "Full Text",
      speaker: null,
      text: rawText.trim(),
      order: 0,
    });
  }

  return sections;
}

/**
 * Main entry point: parse a file into a structured document
 */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  let rawText: string;
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    rawText = await extractFromPDF(file);
  } else if (fileName.endsWith(".docx")) {
    rawText = await extractFromDOCX(file);
  } else if (
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".rtf")
  ) {
    rawText = await extractFromText(file);
  } else {
    // Try as plain text
    rawText = await extractFromText(file);
  }

  const sections = structureText(rawText);

  return {
    title: file.name.replace(/\.[^/.]+$/, ""),
    rawText,
    sections,
  };
}
