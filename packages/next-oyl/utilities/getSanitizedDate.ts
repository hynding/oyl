export default function getSanitizedDate(date?: string): string {
  const parsedDate = date ? new Date(date) : new Date()
  return parsedDate.toISOString().split('T')[0]
}
