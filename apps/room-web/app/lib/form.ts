/** A text field from a submitted form; missing fields and file uploads read as `fallback`. */
export function formText(form: FormData, name: string, fallback = ''): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : fallback;
}
