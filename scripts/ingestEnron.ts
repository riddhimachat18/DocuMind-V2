import * as fs from "fs";
import { parse } from "csv-parse";
import { simpleParser } from "mailparser";

const PROJECT_KEYWORDS = [
  "requirement", "spec", "deadline", "deliverable", "milestone",
  "must have", "need to", "we agreed", "decision", "approved",
  "schedule", "budget", "stakeholder", "priority", "feature"
];

async function run() {
  const results: any[] = [];
  const parser = fs.createReadStream("./data/emails.csv").pipe(
    parse({ columns: true, skip_empty_lines: true, to: 5000 })
  );

  for await (const row of parser) {
    try {
      const parsed = await simpleParser(row.message);
      const body = parsed.text ?? "";
      const subject = parsed.subject ?? "";
      const content = `${subject} ${body}`.toLowerCase();
      const isRelevant = PROJECT_KEYWORDS.some(kw => content.includes(kw));
      if (!isRelevant) continue;

      results.push({
        source: "gmail",
        author: parsed.from?.text ?? "Unknown",
        authorRole: "Enron Employee",
        rawText: `Subject: ${subject}\n${body.slice(0, 300)}`,
        timestamp: parsed.date?.toISOString() ?? new Date().toISOString(),
        classification: null
      });
    } catch (e) {
      continue;
    }
  }

  fs.writeFileSync("./data/enron-filtered.json",
    JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} relevant emails`);
}

run();