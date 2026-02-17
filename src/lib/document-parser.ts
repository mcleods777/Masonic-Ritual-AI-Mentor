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

// Speaker role prefixes (W.M., S.W., J.W., S.D., J.D., Sec., Treas., Chap., Marshal, Tyler)
const SPEAKER_PATTERN =
  /^(W\.?\s?M\.?|S\.?\s?W\.?|J\.?\s?W\.?|S\.?\s?D\.?|J\.?\s?D\.?|Sec\.?|Treas\.?|Chap\.?|Marshal|Tyler|Candidate|All|Bros?\.?)\s*[:\-–—]+\s*/i;

/**
 * Extract text from a PDF file using pdf.js
 */
async function extractFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

  function flushSection() {
    if (currentText.length > 0) {
      sections.push({
        id: `section-${order}`,
        degree: currentDegree,
        sectionName: currentSection,
        speaker: currentSpeaker,
        text: currentText.join(" ").trim(),
        order: order++,
      });
      currentText = [];
    }
  }

  for (const line of lines) {
    // Check for degree heading
    const degreeMatch = detectDegree(line);
    if (degreeMatch !== "General" && line.length < 80) {
      flushSection();
      currentDegree = degreeMatch;
      continue;
    }

    // Check for section heading
    const sectionMatch = detectSectionName(line);
    if (sectionMatch && line.length < 80) {
      flushSection();
      currentSection = sectionMatch;
      continue;
    }

    // Check for speaker prefix
    const { speaker, text } = extractSpeaker(line);
    if (speaker) {
      flushSection();
      currentSpeaker = speaker;
      currentText.push(text);
    } else {
      currentText.push(line);
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
