import { csvTemplate } from "@/lib/csv-import";

export function GET() {
  return new Response(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="products-template.csv"',
    },
  });
}
