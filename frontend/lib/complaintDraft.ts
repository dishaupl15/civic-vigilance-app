export type ComplaintDraftInput = {
  reportId?: string;
  category: string;
  description: string;
  address: string;
  observedAt: Date;
  photoReferences: string[];
  authorityName?: string;
};

export function createComplaintDraft(input: ComplaintDraftInput): string {
  const category = input.category.replace(/_/g, ' ');
  const lines = [
    `Subject: Civic issue report — ${category}`,
    '',
    `A ${category} issue was observed at the confirmed location below.`,
    `Visible details: ${input.description.trim()}`,
    `Location: ${input.address.trim()}`,
    `Observed: ${input.observedAt.toISOString()}`,
    `Photo evidence: ${input.photoReferences.length} attachment(s)`,
  ];
  if (input.authorityName) lines.push(`Proposed recipient: ${input.authorityName} (please verify jurisdiction)`);
  if (input.reportId) lines.push(`Report reference: ${input.reportId}`);
  lines.push('', 'Please inspect the site and arrange appropriate action if it is within your jurisdiction.');
  return lines.join('\n');
}
