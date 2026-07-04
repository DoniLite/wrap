/**
 * Generate a slug for an update
 * @param title - The title of the update
 * @returns The slug for the update
 */
export function generateUpdateSlug(title: string) {
  return title.toLowerCase().split(" ").join("-");
}
