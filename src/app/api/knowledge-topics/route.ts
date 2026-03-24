import { getKnowledgeTopics } from "@/lib/knowledge";

export async function GET() {
  return Response.json({ topics: getKnowledgeTopics() });
}
